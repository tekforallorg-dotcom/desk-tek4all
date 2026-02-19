import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyEvidenceApproved, notifyEvidenceRejected } from "@/lib/notifications";

/**
 * POST /api/tasks/[id]/review
 * 
 * Approve or reject submitted evidence.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();

    // 1. Get current user with profile
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("id, full_name, username, role")
      .eq("id", user.id)
      .single();

    if (!reviewerProfile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { action, review_notes } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (action === "reject" && (!review_notes || !review_notes.trim())) {
      return NextResponse.json(
        { error: "Review notes are required when rejecting" },
        { status: 400 }
      );
    }

    // 3. Fetch task with evidence submitter info
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, status, evidence_required, evidence_link, created_by, evidence_submitted_by")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // 4. Validate task is pending review
    if (task.status !== "pending_review") {
      return NextResponse.json(
        { error: `Cannot review a task with status '${task.status}'. Task must be 'pending_review'.` },
        { status: 400 }
      );
    }

    // 5. Check if reviewer has permission
    const permissionResult = await checkReviewPermission(
      supabase,
      user.id,
      reviewerProfile.role,
      task.created_by,
      task.evidence_submitted_by
    );

    if (!permissionResult.allowed) {
      return NextResponse.json(
        { error: permissionResult.reason },
        { status: 403 }
      );
    }

    // 6. Update task based on action
    const now = new Date().toISOString();
    
    if (action === "approve") {
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "done",
          reviewed_by: user.id,
          reviewed_at: now,
          review_notes: review_notes?.trim() || null,
        })
        .eq("id", taskId);

      if (updateError) {
        console.error("Error approving task:", updateError);
        return NextResponse.json(
          { error: "Failed to approve task" },
          { status: 500 }
        );
      }

      // Log to task_updates
      await supabase.from("task_updates").insert({
        task_id: taskId,
        user_id: user.id,
        content: "Approved evidence and marked task as complete",
        update_type: "evidence_approved",
      });

      // Log to audit_logs
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "evidence_approved",
        entity_type: "task",
        entity_id: taskId,
        details: {
          title: task.title,
          reviewer: reviewerProfile.full_name || reviewerProfile.username,
        },
      });

      // Notify evidence submitter
      if (task.evidence_submitted_by && task.evidence_submitted_by !== user.id) {
        await notifyEvidenceApproved(
          taskId,
          task.title,
          task.evidence_submitted_by,
          user.id
        );
      }

    } else {
      // Reject - return to in_progress, clear evidence
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "in_progress",
          evidence_link: null,
          evidence_notes: null,
          evidence_submitted_at: null,
          evidence_submitted_by: null,
          reviewed_by: user.id,
          reviewed_at: now,
          review_notes: review_notes.trim(),
        })
        .eq("id", taskId);

      if (updateError) {
        console.error("Error rejecting task:", updateError);
        return NextResponse.json(
          { error: "Failed to reject task" },
          { status: 500 }
        );
      }

      // Log to task_updates
      await supabase.from("task_updates").insert({
        task_id: taskId,
        user_id: user.id,
        content: `Rejected evidence: ${review_notes.trim()}`,
        update_type: "evidence_rejected",
      });

      // Log to audit_logs
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "evidence_rejected",
        entity_type: "task",
        entity_id: taskId,
        details: {
          title: task.title,
          reviewer: reviewerProfile.full_name || reviewerProfile.username,
          reason: review_notes.trim(),
        },
      });

      // Notify evidence submitter (store submitter before clearing)
      if (task.evidence_submitted_by && task.evidence_submitted_by !== user.id) {
        await notifyEvidenceRejected(
          taskId,
          task.title,
          task.evidence_submitted_by,
          user.id,
          review_notes.trim()
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: action === "approve" 
        ? "Evidence approved. Task marked as complete." 
        : "Evidence rejected. Task returned to In Progress.",
      task_id: taskId,
      status: action === "approve" ? "done" : "in_progress",
      action,
    });

  } catch (error) {
    console.error("Review error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Check if a user has permission to review/approve evidence.
 */
async function checkReviewPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewerId: string,
  reviewerRole: string,
  taskCreatorId: string | null,
  evidenceSubmitterId: string | null
): Promise<{ allowed: boolean; reason: string }> {
  
  // RULE 1: Evidence submitter CANNOT approve their own evidence
  if (evidenceSubmitterId && reviewerId === evidenceSubmitterId) {
    return {
      allowed: false,
      reason: "You cannot approve your own evidence. Another team member must review it."
    };
  }

  // RULE 2: Admins and super_admins can always approve (if they didn't submit)
  if (reviewerRole === "admin" || reviewerRole === "super_admin") {
    return { allowed: true, reason: "Admin approval" };
  }

  // RULE 3: Task creator can approve if they're a manager+
  if (
    taskCreatorId === reviewerId &&
    (reviewerRole === "manager" || reviewerRole === "admin" || reviewerRole === "super_admin")
  ) {
    return { allowed: true, reason: "Task creator approval" };
  }

  // RULE 4: Check if reviewer is the direct manager of the evidence submitter
  if (evidenceSubmitterId) {
    const { data: hierarchyMatch } = await supabase
      .from("hierarchy")
      .select("id")
      .eq("manager_id", reviewerId)
      .eq("report_id", evidenceSubmitterId)
      .single();

    if (hierarchyMatch) {
      return { allowed: true, reason: "Direct manager approval" };
    }
  }

  // No permission found
  return {
    allowed: false,
    reason: "You don't have permission to approve this evidence. Only the task creator, the submitter's direct manager, or an admin can approve."
  };
}