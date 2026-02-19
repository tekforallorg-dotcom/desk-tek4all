import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/tasks/[id]/dependencies
 * 
 * Returns:
 * - dependencies: Tasks this task depends on (must complete first)
 * - dependents: Tasks that depend on this task (blocked by this task)
 * - isBlocked: Whether this task is blocked by incomplete dependencies
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch dependencies (tasks this task depends on)
    const { data: dependencyRows, error: depError } = await supabase
      .from("task_dependencies")
      .select("id, depends_on_id, created_at")
      .eq("task_id", taskId);

    if (depError) {
      console.error("Error fetching dependencies:", depError);
      return NextResponse.json({ error: "Failed to fetch dependencies" }, { status: 500 });
    }

    // Fetch the actual task details for dependencies
    let dependencies: Array<{
      dependency_id: string;
      task: { id: string; title: string; status: string };
      created_at: string;
    }> = [];

    if (dependencyRows && dependencyRows.length > 0) {
      const dependsOnIds = dependencyRows.map((d) => d.depends_on_id);
      
      const { data: dependentTasks } = await supabase
        .from("tasks")
        .select("id, title, status")
        .in("id", dependsOnIds);

      dependencies = dependencyRows.map((dep) => ({
        dependency_id: dep.id,
        task: dependentTasks?.find((t) => t.id === dep.depends_on_id) || {
          id: dep.depends_on_id,
          title: "Unknown",
          status: "unknown",
        },
        created_at: dep.created_at,
      }));
    }

    // Fetch dependents (tasks that depend on this task)
    const { data: dependentRows, error: deptError } = await supabase
      .from("task_dependencies")
      .select("id, task_id, created_at")
      .eq("depends_on_id", taskId);

    if (deptError) {
      console.error("Error fetching dependents:", deptError);
    }

    let dependents: Array<{
      dependency_id: string;
      task: { id: string; title: string; status: string };
      created_at: string;
    }> = [];

    if (dependentRows && dependentRows.length > 0) {
      const dependentTaskIds = dependentRows.map((d) => d.task_id);
      
      const { data: dependentTasksData } = await supabase
        .from("tasks")
        .select("id, title, status")
        .in("id", dependentTaskIds);

      dependents = dependentRows.map((dep) => ({
        dependency_id: dep.id,
        task: dependentTasksData?.find((t) => t.id === dep.task_id) || {
          id: dep.task_id,
          title: "Unknown",
          status: "unknown",
        },
        created_at: dep.created_at,
      }));
    }

    // Check if task is blocked (has incomplete dependencies)
    const incompleteDependencies = dependencies.filter(
      (d) => d.task.status !== "done"
    );
    const isBlocked = incompleteDependencies.length > 0;

    return NextResponse.json({
      task_id: taskId,
      dependencies,
      dependents,
      isBlocked,
      incompleteCount: incompleteDependencies.length,
    });

  } catch (error) {
    console.error("Dependencies GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/tasks/[id]/dependencies
 * 
 * Add a dependency: "This task depends on [depends_on_id]"
 * Body: { depends_on_id: string }
 * 
 * Validates:
 * - Task exists
 * - Dependency task exists
 * - No self-reference
 * - No circular dependencies
 * - No duplicate dependencies
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { depends_on_id } = body;

    if (!depends_on_id) {
      return NextResponse.json(
        { error: "depends_on_id is required" },
        { status: 400 }
      );
    }

    // Prevent self-reference
    if (taskId === depends_on_id) {
      return NextResponse.json(
        { error: "A task cannot depend on itself" },
        { status: 400 }
      );
    }

    // Check both tasks exist
    const { data: task } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("id", taskId)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { data: dependsOnTask } = await supabase
      .from("tasks")
      .select("id, title, status")
      .eq("id", depends_on_id)
      .single();

    if (!dependsOnTask) {
      return NextResponse.json(
        { error: "Dependency task not found" },
        { status: 404 }
      );
    }

    // Check for circular dependency
    const hasCircular = await checkCircularDependency(
      supabase,
      depends_on_id,
      taskId
    );

    if (hasCircular) {
      return NextResponse.json(
        { error: "Cannot create circular dependency. This would create a loop." },
        { status: 400 }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from("task_dependencies")
      .select("id")
      .eq("task_id", taskId)
      .eq("depends_on_id", depends_on_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "This dependency already exists" },
        { status: 400 }
      );
    }

    // Create dependency
    const { data: dependency, error: insertError } = await supabase
      .from("task_dependencies")
      .insert({
        task_id: taskId,
        depends_on_id: depends_on_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating dependency:", insertError);
      return NextResponse.json(
        { error: "Failed to create dependency" },
        { status: 500 }
      );
    }

    // Log to task_updates
    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: `Added dependency: This task now depends on "${dependsOnTask.title}"`,
      update_type: "dependency_added",
    });

    // Log to audit_logs
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "dependency_added",
      entity_type: "task",
      entity_id: taskId,
      details: {
        task_title: task.title,
        depends_on_title: dependsOnTask.title,
        depends_on_id: depends_on_id,
      },
    });

    return NextResponse.json({
      success: true,
      dependency: {
        dependency_id: dependency.id,
        task: dependsOnTask,
        created_at: dependency.created_at,
      },
      message: `Task now depends on "${dependsOnTask.title}"`,
    });

  } catch (error) {
    console.error("Dependencies POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id]/dependencies
 * 
 * Remove a dependency
 * Body: { dependency_id: string } OR { depends_on_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { dependency_id, depends_on_id } = body;

    if (!dependency_id && !depends_on_id) {
      return NextResponse.json(
        { error: "Either dependency_id or depends_on_id is required" },
        { status: 400 }
      );
    }

    // Find the dependency
    let query = supabase
      .from("task_dependencies")
      .select("id, depends_on_id")
      .eq("task_id", taskId);

    if (dependency_id) {
      query = query.eq("id", dependency_id);
    } else {
      query = query.eq("depends_on_id", depends_on_id);
    }

    const { data: dependency, error: findError } = await query.single();

    if (findError || !dependency) {
      return NextResponse.json(
        { error: "Dependency not found" },
        { status: 404 }
      );
    }

    // Get task titles for logging
    const { data: task } = await supabase
      .from("tasks")
      .select("title")
      .eq("id", taskId)
      .single();

    const { data: dependsOnTask } = await supabase
      .from("tasks")
      .select("title")
      .eq("id", dependency.depends_on_id)
      .single();

    // Delete the dependency
    const { error: deleteError } = await supabase
      .from("task_dependencies")
      .delete()
      .eq("id", dependency.id);

    if (deleteError) {
      console.error("Error deleting dependency:", deleteError);
      return NextResponse.json(
        { error: "Failed to remove dependency" },
        { status: 500 }
      );
    }

    // Log to task_updates
    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: `Removed dependency: No longer depends on "${dependsOnTask?.title || "Unknown"}"`,
      update_type: "dependency_removed",
    });

    // Log to audit_logs
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "dependency_removed",
      entity_type: "task",
      entity_id: taskId,
      details: {
        task_title: task?.title || "",
        depends_on_title: dependsOnTask?.title || "",
        depends_on_id: dependency.depends_on_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Dependency removed`,
    });

  } catch (error) {
    console.error("Dependencies DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Check for circular dependencies using BFS
 * 
 * If we're adding: taskId depends on depends_on_id
 * We need to check: does depends_on_id (directly or indirectly) depend on taskId?
 * 
 * @param supabase - Supabase client
 * @param startTaskId - The task we're checking from (depends_on_id)
 * @param targetTaskId - The task we're looking for (taskId)
 * @returns true if circular dependency would be created
 */
async function checkCircularDependency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  startTaskId: string,
  targetTaskId: string
): Promise<boolean> {
  const visited = new Set<string>();
  const queue: string[] = [startTaskId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (currentId === targetTaskId) {
      return true; // Found circular dependency
    }

    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    // Get all tasks that currentId depends on
    const { data: deps } = await supabase
      .from("task_dependencies")
      .select("depends_on_id")
      .eq("task_id", currentId);

    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep.depends_on_id)) {
          queue.push(dep.depends_on_id);
        }
      }
    }
  }

  return false;
}