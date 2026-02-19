import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { 
  createNotificationBatch,
  CreateNotificationParams,
} from "@/lib/notifications";

/**
 * GET /api/cron/notifications
 * 
 * Sends reminder notifications for:
 * - Tasks due within 24 hours
 * - Events starting within 1 hour
 * 
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * every 15-30 minutes.
 * 
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/notifications",
 *     "schedule": "0,30 * * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow in development
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Use service role for full access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results = {
      taskReminders: 0,
      eventReminders: 0,
      errors: [] as string[],
    };

    // ─────────────────────────────────────────────────────────────────────
    // 1. TASK DUE DATE REMINDERS (due within 24 hours)
    // ─────────────────────────────────────────────────────────────────────
    
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Find tasks due in the next 24 hours that aren't done
    const { data: dueTasks, error: dueError } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        due_date,
        status,
        created_by
      `)
      .not("status", "eq", "done")
      .not("due_date", "is", null)
      .gte("due_date", now.toISOString())
      .lte("due_date", in24Hours.toISOString());

    if (dueError) {
      results.errors.push(`Task query error: ${dueError.message}`);
    } else if (dueTasks && dueTasks.length > 0) {
      // Get all assignees for these tasks
      const taskIds = dueTasks.map((t) => t.id);
      
      const { data: assignees } = await supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", taskIds);

      // Build notifications
      const taskNotifications: CreateNotificationParams[] = [];
      
      for (const task of dueTasks) {
        // Notify assignees
        const taskAssignees = assignees?.filter((a) => a.task_id === task.id) || [];
        for (const assignee of taskAssignees) {
          taskNotifications.push({
            userId: assignee.user_id,
            type: "task_due_soon",
            title: "Task due soon",
            body: `"${task.title}" is due ${formatDueDate(task.due_date)}`,
            href: `/tasks/${task.id}`,
            entityType: "task",
            entityId: task.id,
            idempotencyKey: `task_due_${task.id}_${assignee.user_id}_${task.due_date}`,
          });
        }

        // Also notify creator if they're not an assignee
        if (task.created_by && !taskAssignees.some((a) => a.user_id === task.created_by)) {
          taskNotifications.push({
            userId: task.created_by,
            type: "task_due_soon",
            title: "Task due soon",
            body: `"${task.title}" is due ${formatDueDate(task.due_date)}`,
            href: `/tasks/${task.id}`,
            entityType: "task",
            entityId: task.id,
            idempotencyKey: `task_due_${task.id}_${task.created_by}_${task.due_date}`,
          });
        }
      }

      if (taskNotifications.length > 0) {
        const batchResult = await createNotificationBatch(taskNotifications, supabase);
        results.taskReminders = batchResult.created;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. EVENT REMINDERS (starting within 1 hour)
    // ─────────────────────────────────────────────────────────────────────
    
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Find events starting in the next hour
    const { data: upcomingEvents, error: eventError } = await supabase
      .from("calendar_events")
      .select(`
        id,
        title,
        start_time,
        created_by
      `)
      .gte("start_time", now.toISOString())
      .lte("start_time", in1Hour.toISOString());

    if (eventError) {
      results.errors.push(`Event query error: ${eventError.message}`);
    } else if (upcomingEvents && upcomingEvents.length > 0) {
      const eventIds = upcomingEvents.map((e) => e.id);
      
      // Get participants who RSVPd yes or maybe
      const { data: participants } = await supabase
        .from("event_participants")
        .select("event_id, user_id, status")
        .in("event_id", eventIds)
        .in("status", ["accepted", "tentative"]);

      // Build notifications
      const eventNotifications: CreateNotificationParams[] = [];
      
      for (const event of upcomingEvents) {
        const eventParticipants = participants?.filter((p) => p.event_id === event.id) || [];
        
        for (const participant of eventParticipants) {
          const startTime = new Date(event.start_time);
          const timeStr = startTime.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });

          eventNotifications.push({
            userId: participant.user_id,
            type: "event_reminder",
            title: "Event starting soon",
            body: `"${event.title}" starts at ${timeStr}`,
            href: `/calendar?event=${event.id}`,
            entityType: "event",
            entityId: event.id,
            idempotencyKey: `event_reminder_${event.id}_${participant.user_id}`,
          });
        }

        // Also notify creator
        if (event.created_by && !eventParticipants.some((p) => p.user_id === event.created_by)) {
          const startTime = new Date(event.start_time);
          const timeStr = startTime.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });

          eventNotifications.push({
            userId: event.created_by,
            type: "event_reminder",
            title: "Event starting soon",
            body: `"${event.title}" starts at ${timeStr}`,
            href: `/calendar?event=${event.id}`,
            entityType: "event",
            entityId: event.id,
            idempotencyKey: `event_reminder_${event.id}_${event.created_by}`,
          });
        }
      }

      if (eventNotifications.length > 0) {
        const batchResult = await createNotificationBatch(eventNotifications, supabase);
        results.eventReminders = batchResult.created;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. CLEANUP: Delete old read notifications (optional)
    // ─────────────────────────────────────────────────────────────────────
    
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    await supabase
      .from("notifications")
      .delete()
      .eq("is_read", true)
      .lt("created_at", thirtyDaysAgo.toISOString());

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error("Cron notifications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper to format due date nicely
function formatDueDate(dateStr: string): string {
  const due = new Date(dateStr);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours <= 1) return "in less than an hour";
  if (diffHours <= 2) return "in about 2 hours";
  if (diffHours <= 6) return "in a few hours";
  if (diffHours <= 12) return "later today";
  return "tomorrow";
}