import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyTaskAssigned, notifyTaskComment, notifyTaskStatusChanged } from "@/lib/notifications";

/**
 * POST /api/tasks/[id]/notify
 * 
 * Trigger notifications for task events from client-side code.
 * 
 * Body:
 *   - type: "assigned" | "comment" | "status_changed"
 *   - For "assigned": { assignee_id: string }
 *   - For "comment": { comment: string }
 *   - For "status_changed": { new_status: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type } = body;

    // Fetch task for title
    const { data: task } = await supabase
      .from("tasks")
      .select("id, title, created_by")
      .eq("id", taskId)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    switch (type) {
      case "assigned": {
        const { assignee_id } = body;
        if (!assignee_id) {
          return NextResponse.json({ error: "assignee_id required" }, { status: 400 });
        }
        
        // Don't notify if assigning to self
        if (assignee_id !== user.id) {
          await notifyTaskAssigned(taskId, task.title, assignee_id, user.id);
        }
        break;
      }

      case "assigned_batch": {
        const { assignee_ids } = body;
        if (!assignee_ids || !Array.isArray(assignee_ids)) {
          return NextResponse.json({ error: "assignee_ids array required" }, { status: 400 });
        }
        
        // Notify each assignee (except self)
        for (const assigneeId of assignee_ids) {
          if (assigneeId !== user.id) {
            await notifyTaskAssigned(taskId, task.title, assigneeId, user.id);
          }
        }
        break;
      }

      case "comment": {
        const { comment } = body;
        if (!comment) {
          return NextResponse.json({ error: "comment required" }, { status: 400 });
        }

        // Get all assignees + creator
        const { data: assignees } = await supabase
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", taskId);

        const recipientIds = new Set<string>();
        
        // Add assignees
        for (const a of assignees || []) {
          if (a.user_id !== user.id) {
            recipientIds.add(a.user_id);
          }
        }
        
        // Add creator if not already included and not the commenter
        if (task.created_by && task.created_by !== user.id) {
          recipientIds.add(task.created_by);
        }

        const preview = comment.length > 50 ? comment.slice(0, 50) + "..." : comment;
        
        for (const recipientId of recipientIds) {
          await notifyTaskComment(taskId, task.title, preview, recipientId, user.id);
        }
        break;
      }

      case "status_changed": {
        const { new_status } = body;
        if (!new_status) {
          return NextResponse.json({ error: "new_status required" }, { status: 400 });
        }

        // Get all assignees
        const { data: assignees } = await supabase
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", taskId);

        // Notify assignees (except the person who changed it)
        for (const a of assignees || []) {
          if (a.user_id !== user.id) {
            await notifyTaskStatusChanged(taskId, task.title, new_status, a.user_id, user.id);
          }
        }

        // Also notify creator if they're not an assignee and not the changer
        if (task.created_by && task.created_by !== user.id) {
          const isAssignee = assignees?.some((a) => a.user_id === task.created_by);
          if (!isAssignee) {
            await notifyTaskStatusChanged(taskId, task.title, new_status, task.created_by, user.id);
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Task notify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}