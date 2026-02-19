import { createClient as createServerClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notification types and their configuration
 */
export type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "task_comment"
  | "task_due_soon"
  | "evidence_submitted"
  | "evidence_approved"
  | "evidence_rejected"
  | "event_invited"
  | "event_reminder"
  | "event_rsvp"
  | "programme_added";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href: string;
  entityType?: "task" | "programme" | "event" | "evidence";
  entityId?: string;
  actorId?: string;
  idempotencyKey?: string;
}

/**
 * Create a notification for a user
 * 
 * Uses idempotency key to prevent duplicates.
 * 
 * @example
 * await createNotification({
 *   userId: assigneeId,
 *   type: "task_assigned",
 *   title: "New task assigned",
 *   body: `You've been assigned to "${taskTitle}"`,
 *   href: `/tasks/${taskId}`,
 *   entityType: "task",
 *   entityId: taskId,
 *   actorId: assignerId,
 *   idempotencyKey: `task_assigned_${taskId}_${assigneeId}`,
 * });
 */
export async function createNotification(
  params: CreateNotificationParams,
  supabase?: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = supabase || (await createServerClient());

    const { error } = await client.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      href: params.href,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      actor_id: params.actorId || null,
      idempotency_key: params.idempotencyKey || null,
    });

    if (error) {
      // Ignore duplicate key errors (idempotency)
      if (error.code === "23505") {
        return { success: true }; // Already exists, that's fine
      }
      console.error("[createNotification] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[createNotification] Unexpected error:", err);
    return { success: false, error: "Unexpected error" };
  }
}

/**
 * Create notifications for multiple users at once
 */
export async function createNotificationBatch(
  notifications: CreateNotificationParams[],
  supabase?: SupabaseClient
): Promise<{ success: boolean; created: number; errors: number }> {
  const client = supabase || (await createServerClient());
  
  let created = 0;
  let errors = 0;

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    
    const rows = batch.map((params) => ({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      href: params.href,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      actor_id: params.actorId || null,
      idempotency_key: params.idempotencyKey || null,
    }));

    const { error, data } = await client
      .from("notifications")
      .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error("[createNotificationBatch] Batch error:", error);
      errors += batch.length;
    } else {
      created += data?.length || 0;
    }
  }

  return { success: errors === 0, created, errors };
}

/**
 * Notification helper functions for common scenarios
 */
export const notifyTaskAssigned = async (
  taskId: string,
  taskTitle: string,
  assigneeId: string,
  assignerId: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: assigneeId,
    type: "task_assigned",
    title: "New task assigned",
    body: `You've been assigned to "${taskTitle}"`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    actorId: assignerId,
    idempotencyKey: `task_assigned_${taskId}_${assigneeId}_${Date.now()}`,
  }, supabase);
};

export const notifyTaskStatusChanged = async (
  taskId: string,
  taskTitle: string,
  newStatus: string,
  recipientId: string,
  actorId: string,
  supabase?: SupabaseClient
) => {
  const statusLabels: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    pending_review: "Pending Review",
    done: "Done",
    blocked: "Blocked",
  };

  return createNotification({
    userId: recipientId,
    type: "task_status_changed",
    title: "Task status updated",
    body: `"${taskTitle}" is now ${statusLabels[newStatus] || newStatus}`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    actorId: actorId,
    idempotencyKey: `task_status_${taskId}_${newStatus}_${Date.now()}`,
  }, supabase);
};

export const notifyTaskComment = async (
  taskId: string,
  taskTitle: string,
  commentPreview: string,
  recipientId: string,
  commenterId: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: recipientId,
    type: "task_comment",
    title: "New comment",
    body: `On "${taskTitle}": ${commentPreview}`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    actorId: commenterId,
    idempotencyKey: `task_comment_${taskId}_${commenterId}_${Date.now()}`,
  }, supabase);
};

export const notifyTaskDueSoon = async (
  taskId: string,
  taskTitle: string,
  dueDate: string,
  recipientId: string,
  supabase?: SupabaseClient
) => {
  const due = new Date(dueDate);
  const formattedDate = due.toLocaleDateString("en-GB", { 
    day: "numeric", 
    month: "short" 
  });

  return createNotification({
    userId: recipientId,
    type: "task_due_soon",
    title: "Task due soon",
    body: `"${taskTitle}" is due on ${formattedDate}`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    idempotencyKey: `task_due_${taskId}_${recipientId}_${dueDate}`,
  }, supabase);
};

export const notifyEvidenceSubmitted = async (
  taskId: string,
  taskTitle: string,
  reviewerId: string,
  submitterId: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: reviewerId,
    type: "evidence_submitted",
    title: "Evidence needs review",
    body: `Evidence submitted for "${taskTitle}"`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    actorId: submitterId,
    idempotencyKey: `evidence_submitted_${taskId}_${Date.now()}`,
  }, supabase);
};

export const notifyEvidenceApproved = async (
  taskId: string,
  taskTitle: string,
  submitterId: string,
  reviewerId: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: submitterId,
    type: "evidence_approved",
    title: "Evidence approved! ✓",
    body: `Your evidence for "${taskTitle}" was approved`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    actorId: reviewerId,
    idempotencyKey: `evidence_approved_${taskId}_${Date.now()}`,
  }, supabase);
};

export const notifyEvidenceRejected = async (
  taskId: string,
  taskTitle: string,
  submitterId: string,
  reviewerId: string,
  reason?: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: submitterId,
    type: "evidence_rejected",
    title: "Evidence needs revision",
    body: reason 
      ? `"${taskTitle}": ${reason.slice(0, 100)}` 
      : `Your evidence for "${taskTitle}" needs revision`,
    href: `/tasks/${taskId}`,
    entityType: "task",
    entityId: taskId,
    actorId: reviewerId,
    idempotencyKey: `evidence_rejected_${taskId}_${Date.now()}`,
  }, supabase);
};

export const notifyEventInvited = async (
  eventId: string,
  eventTitle: string,
  inviteeId: string,
  inviterId: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: inviteeId,
    type: "event_invited",
    title: "Event invitation",
    body: `You're invited to "${eventTitle}"`,
    href: `/calendar?event=${eventId}`,
    entityType: "event",
    entityId: eventId,
    actorId: inviterId,
    idempotencyKey: `event_invited_${eventId}_${inviteeId}`,
  }, supabase);
};

export const notifyEventReminder = async (
  eventId: string,
  eventTitle: string,
  startTime: string,
  recipientId: string,
  supabase?: SupabaseClient
) => {
  const start = new Date(startTime);
  const timeStr = start.toLocaleTimeString("en-GB", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });

  return createNotification({
    userId: recipientId,
    type: "event_reminder",
    title: "Event starting soon",
    body: `"${eventTitle}" starts at ${timeStr}`,
    href: `/calendar?event=${eventId}`,
    entityType: "event",
    entityId: eventId,
    idempotencyKey: `event_reminder_${eventId}_${recipientId}`,
  }, supabase);
};

export const notifyEventRSVP = async (
  eventId: string,
  eventTitle: string,
  organizerId: string,
  responderId: string,
  response: "yes" | "no" | "maybe",
  supabase?: SupabaseClient
) => {
  const responseText = {
    yes: "is attending",
    no: "declined",
    maybe: "might attend",
  }[response];

  return createNotification({
    userId: organizerId,
    type: "event_rsvp",
    title: "RSVP received",
    body: `Someone ${responseText} "${eventTitle}"`,
    href: `/calendar?event=${eventId}`,
    entityType: "event",
    entityId: eventId,
    actorId: responderId,
    idempotencyKey: `event_rsvp_${eventId}_${responderId}_${response}`,
  }, supabase);
};

export const notifyProgrammeAdded = async (
  programmeId: string,
  programmeName: string,
  memberId: string,
  addedById: string,
  supabase?: SupabaseClient
) => {
  return createNotification({
    userId: memberId,
    type: "programme_added",
    title: "Added to programme",
    body: `You've been added to "${programmeName}"`,
    href: `/programmes/${programmeId}`,
    entityType: "programme",
    entityId: programmeId,
    actorId: addedById,
    idempotencyKey: `programme_added_${programmeId}_${memberId}`,
  }, supabase);
};