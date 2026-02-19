import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyEvidenceSubmitted } from "@/lib/notifications";

/**
 * POST /api/tasks/[id]/submit-evidence
 * 
 * Assignee submits evidence for a task that requires it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();

    // 1. Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { evidence_link, evidence_notes } = body;

    if (!evidence_link || typeof evidence_link !== "string" || !evidence_link.trim()) {
      return NextResponse.json(
        { error: "Evidence link is required" },
        { status: 400 }
      );
    }

    // 3. Fetch task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, status, evidence_required, created_by")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // 4. Validate task requires evidence
    if (!task.evidence_required) {
      return NextResponse.json(
        { error: "This task does not require evidence. You can mark it complete directly." },
        { status: 400 }
      );
    }

    // 5. Validate task is in correct status
    if (task.status !== "in_progress") {
      return NextResponse.json(
        { error: `Cannot submit evidence for a task with status '${task.status}'. Task must be 'in_progress'.` },
        { status: 400 }
      );
    }

    // 6. Validate user is an assignee
    const { data: assignment } = await supabase
      .from("task_assignees")
      .select("id")
      .eq("task_id", taskId)
      .eq("user_id", user.id)
      .single();

    if (!assignment) {
      return NextResponse.json(
        { error: "You must be assigned to this task to submit evidence" },
        { status: 403 }
      );
    }

    // 7. Update task with evidence and change status
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        evidence_link: evidence_link.trim(),
        evidence_notes: evidence_notes?.trim() || null,
        evidence_submitted_at: new Date().toISOString(),
        evidence_submitted_by: user.id,
        status: "pending_review",
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
      })
      .eq("id", taskId);

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json(
        { error: "Failed to submit evidence" },
        { status: 500 }
      );
    }

    // 8. Log to task_updates
    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: "Submitted evidence for review",
      update_type: "evidence_submitted",
      metadata: { evidence_link: evidence_link.trim() },
    });

    // 9. Log to audit_logs
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "evidence_submitted",
      entity_type: "task",
      entity_id: taskId,
      details: {
        title: task.title,
        evidence_link: evidence_link.trim(),
      },
    });

    // 10. Notify task creator (reviewer) if they're not the submitter
    if (task.created_by && task.created_by !== user.id) {
      await notifyEvidenceSubmitted(
        taskId,
        task.title,
        task.created_by,
        user.id
      );
    }

    return NextResponse.json({
      success: true,
      message: "Evidence submitted. Awaiting approval.",
      task_id: taskId,
      status: "pending_review",
    });

  } catch (error) {
    console.error("Submit evidence error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}