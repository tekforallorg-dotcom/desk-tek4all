import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/tasks/[id]/subtasks - List subtasks for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: subtasks, error } = await supabase
    .from("subtasks")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[Subtasks] Fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch subtasks" }, { status: 500 });
  }

  return NextResponse.json(subtasks);
}

// POST /api/tasks/[id]/subtasks - Create a new subtask
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Get the next position
  const { data: existing } = await supabase
    .from("subtasks")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data: subtask, error } = await supabase
    .from("subtasks")
    .insert({
      task_id: taskId,
      title: title.trim(),
      position: nextPosition,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[Subtasks] Create error:", error);
    return NextResponse.json({ error: "Failed to create subtask" }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "subtask_created",
    entity_type: "subtask",
    entity_id: subtask.id,
    details: { task_id: taskId, title: title.trim() },
  });

  return NextResponse.json(subtask, { status: 201 });
}

// PATCH /api/tasks/[id]/subtasks - Update subtask (toggle complete, reorder, rename)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { subtask_id, title, is_completed, position } = body;

  if (!subtask_id) {
    return NextResponse.json({ error: "subtask_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (title !== undefined) updates.title = title.trim();
  if (is_completed !== undefined) {
    updates.is_completed = is_completed;
    updates.completed_at = is_completed ? new Date().toISOString() : null;
  }
  if (position !== undefined) updates.position = position;

  const { data: subtask, error } = await supabase
    .from("subtasks")
    .update(updates)
    .eq("id", subtask_id)
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) {
    console.error("[Subtasks] Update error:", error);
    return NextResponse.json({ error: "Failed to update subtask" }, { status: 500 });
  }

  // Audit log for completion toggle
  if (is_completed !== undefined) {
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: is_completed ? "subtask_completed" : "subtask_uncompleted",
      entity_type: "subtask",
      entity_id: subtask_id,
      details: { task_id: taskId, title: subtask.title },
    });
  }

  return NextResponse.json(subtask);
}

// DELETE /api/tasks/[id]/subtasks - Delete a subtask
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const subtaskId = searchParams.get("subtask_id");

  if (!subtaskId) {
    return NextResponse.json({ error: "subtask_id is required" }, { status: 400 });
  }

  // Get subtask title for audit log
  const { data: subtask } = await supabase
    .from("subtasks")
    .select("title")
    .eq("id", subtaskId)
    .single();

  const { error } = await supabase
    .from("subtasks")
    .delete()
    .eq("id", subtaskId)
    .eq("task_id", taskId);

  if (error) {
    console.error("[Subtasks] Delete error:", error);
    return NextResponse.json({ error: "Failed to delete subtask" }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "subtask_deleted",
    entity_type: "subtask",
    entity_id: subtaskId,
    details: { task_id: taskId, title: subtask?.title },
  });

  return NextResponse.json({ success: true });
}