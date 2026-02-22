/**
 * POST /api/luna/action/confirm
 *
 * Executes a confirmed write action.
 * Payload was previewed in the chat response — now the user clicked Confirm.
 *
 * Supported actions:
 * - create_task: Insert into tasks + task_assignees + audit_logs
 * - update_task_status: Update tasks.status + audit_logs
 * - create_programme: Insert into programmes + audit_logs (manager+ only)
 * - update_programme_status: Update programmes.status + audit_logs (manager+ only)
 *
 * Uses user-session Supabase client (RLS enforced).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emit } from "@/lib/luna/telemetry";
import { getActivePending, completePending } from "@/lib/luna/pending";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const actionType = String(body.actionType || "");
    const payload = body.payload as Record<string, unknown>;

    if (!actionType || !payload) {
      return NextResponse.json({ error: "Missing actionType or payload" }, { status: 400 });
    }

    let result: NextResponse;

    switch (actionType) {
      case "create_task":
        result = await handleCreateTask(supabase, user.id, payload);
        break;

      case "update_task_status":
        result = await handleUpdateTaskStatus(supabase, user.id, payload);
        break;

      case "create_programme":
        result = await handleCreateProgramme(supabase, user.id, payload);
        break;

      case "update_programme_status":
        result = await handleUpdateProgrammeStatus(supabase, user.id, payload);
        break;

      case "update_programme_fields":
        result = await handleUpdateProgrammeFields(supabase, user.id, payload);
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${actionType}` }, { status: 400 });
    }

    // Telemetry + pending cleanup on success
    const responseBody = await result.clone().json();
    if (responseBody.success) {
      emit.actionConfirmed(supabase, user.id, actionType);
      // Mark pending as completed
      const pending = await getActivePending(supabase, user.id);
      if (pending) await completePending(supabase, pending.id);
    } else {
      emit.actionFailed(supabase, user.id, actionType, responseBody.error || "unknown");
    }

    return result;
  } catch (error) {
    console.error("Luna action confirm error:", error);
    // Best-effort telemetry on error
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) emit.actionFailed(supabase, user.id, "unknown", String(error));
    } catch { /* swallow */ }
    return NextResponse.json(
      { error: "Something went wrong executing the action." },
      { status: 500 }
    );
  }
}

/* ── Create Task ── */

async function handleCreateTask(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  payload: Record<string, unknown>
) {
  const title = String(payload.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Task title is required" }, { status: 400 });
  }

  const assigneeId = String(payload.assignee_id || userId);

  // Insert task (matches tasks/new/page.tsx pattern exactly)
  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({
      title,
      description: payload.description || null,
      status: String(payload.status || "todo"),
      priority: String(payload.priority || "medium"),
      due_date: payload.due_date || null,
      programme_id: payload.programme_id || null,
      assignee_id: assigneeId,
      created_by: userId,
      evidence_required: Boolean(payload.evidence_required),
    })
    .select("id, title")
    .single();

  if (insertError) {
    console.error("Luna create task error:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Insert into task_assignees
  await supabase.from("task_assignees").insert({
    task_id: task.id,
    user_id: assigneeId,
    assigned_by: userId,
  });

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "task_created",
    entity_type: "task",
    entity_id: task.id,
    details: {
      title: task.title,
      source: "luna",
      assignee_count: 1,
      evidence_required: Boolean(payload.evidence_required),
    },
  });

  return NextResponse.json({
    success: true,
    message: `Task "${task.title}" created.`,
    href: `/tasks/${task.id}`,
  });
}

/* ── Update Task Status ── */

async function handleUpdateTaskStatus(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  payload: Record<string, unknown>
) {
  const taskId = String(payload.task_id || "").trim();
  const newStatus = String(payload.new_status || "").trim();

  if (!taskId || !newStatus) {
    return NextResponse.json({ error: "task_id and new_status are required" }, { status: 400 });
  }

  const validStatuses = ["todo", "in_progress", "pending_review", "done", "blocked"];
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: `Invalid status: ${newStatus}` }, { status: 400 });
  }

  // Get current task to log the change
  const { data: current } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("id", taskId)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Update status
  const { error: updateError } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId);

  if (updateError) {
    console.error("Luna update task error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "task_status_updated",
    entity_type: "task",
    entity_id: taskId,
    details: {
      title: current.title,
      from_status: current.status,
      to_status: newStatus,
      source: "luna",
    },
  });

  return NextResponse.json({
    success: true,
    message: `"${current.title}" updated to ${newStatus}.`,
    href: `/tasks/${taskId}`,
  });
}

/* ── Create Programme (matches programmes/new/page.tsx pattern) ── */

async function handleCreateProgramme(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  payload: Record<string, unknown>
) {
  // Role gate: manager+ only
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role === "member") {
    return NextResponse.json({ error: "Permission denied. Manager+ required." }, { status: 403 });
  }

  const name = String(payload.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Programme name is required" }, { status: 400 });
  }

  const { data: programme, error: insertError } = await supabase
    .from("programmes")
    .insert({
      name,
      description: payload.description || null,
      status: String(payload.status || "draft"),
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      created_by: userId,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Luna create programme error:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "programme_created",
    entity_type: "programme",
    entity_id: programme.id,
    details: {
      name: programme.name,
      source: "luna",
    },
  });

  return NextResponse.json({
    success: true,
    message: `Programme "${programme.name}" created.`,
    href: `/programmes/${programme.id}`,
  });
}

/* ── Update Programme Status ── */

async function handleUpdateProgrammeStatus(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  payload: Record<string, unknown>
) {
  // Role gate: manager+ only
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role === "member") {
    return NextResponse.json({ error: "Permission denied. Manager+ required." }, { status: 403 });
  }

  const programmeId = String(payload.programme_id || "").trim();
  const newStatus = String(payload.new_status || "").trim();

  if (!programmeId || !newStatus) {
    return NextResponse.json({ error: "programme_id and new_status are required" }, { status: 400 });
  }

  const validStatuses = ["draft", "active", "paused", "completed", "archived"];
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: `Invalid status: ${newStatus}` }, { status: 400 });
  }

  // Get current programme
  const { data: current } = await supabase
    .from("programmes")
    .select("id, name, status")
    .eq("id", programmeId)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Programme not found" }, { status: 404 });
  }

  // Update
  const { error: updateError } = await supabase
    .from("programmes")
    .update({ status: newStatus })
    .eq("id", programmeId);

  if (updateError) {
    console.error("Luna update programme error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "programme_status_updated",
    entity_type: "programme",
    entity_id: programmeId,
    details: {
      name: current.name,
      from_status: current.status,
      to_status: newStatus,
      source: "luna",
    },
  });

  return NextResponse.json({
    success: true,
    message: `"${current.name}" updated to ${newStatus}.`,
    href: `/programmes/${programmeId}`,
  });
}

/* ── Update Programme Fields (Slice D) ── */

async function handleUpdateProgrammeFields(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  payload: Record<string, unknown>
) {
  // Role gate: manager+ only
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role === "member") {
    return NextResponse.json({ error: "Permission denied. Manager+ required." }, { status: 403 });
  }

  const programmeId = String(payload.programme_id || "").trim();
  const updateField = String(payload.update_field || "").trim();
  const updateValue = String(payload.update_value || "").trim();
  const programmeName = String(payload.programme_name || "").trim();

  if (!programmeId || !updateField || !updateValue) {
    return NextResponse.json({ error: "programme_id, update_field, and update_value are required" }, { status: 400 });
  }

  const allowedFields = ["name", "description", "start_date", "end_date"];
  if (!allowedFields.includes(updateField)) {
    return NextResponse.json({ error: `Cannot update field: ${updateField}` }, { status: 400 });
  }

  // Validate name uniqueness if renaming
  if (updateField === "name") {
    const { data: existing } = await supabase
      .from("programmes")
      .select("id")
      .ilike("name", updateValue)
      .neq("id", programmeId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: `A programme named "${updateValue}" already exists.` }, { status: 409 });
    }
  }

  // Get current for audit
  const { data: current } = await supabase
    .from("programmes")
    .select("id, name, description, start_date, end_date")
    .eq("id", programmeId)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Programme not found" }, { status: 404 });
  }

  const oldValue = current[updateField as keyof typeof current];

  // Update the field
  const { error: updateError } = await supabase
    .from("programmes")
    .update({ [updateField]: updateValue })
    .eq("id", programmeId);

  if (updateError) {
    console.error("Luna update programme fields error:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "programme_field_updated",
    entity_type: "programme",
    entity_id: programmeId,
    details: {
      name: current.name,
      field: updateField,
      from: oldValue,
      to: updateValue,
      source: "luna",
    },
  });

  const fieldLabels: Record<string, string> = {
    name: "name", description: "description", start_date: "start date", end_date: "end date",
  };

  return NextResponse.json({
    success: true,
    message: `"${programmeName || current.name}" ${fieldLabels[updateField] || updateField} updated to "${updateValue}".`,
    href: `/programmes/${programmeId}`,
  });
}