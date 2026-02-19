import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyEventInvited } from "@/lib/notifications";

// ─── Recurrence expansion helper ─────────────────────────────────────
function expandRecurringEvents(
  events: any[],
  rangeStart: Date,
  rangeEnd: Date
): any[] {
  const expanded: any[] = [];

  for (const event of events) {
    const recurrence = event.recurrence;
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const duration = eventEnd.getTime() - eventStart.getTime();

    // No recurrence - just add the event as-is
    if (!recurrence || recurrence === "none") {
      expanded.push(event);
      continue;
    }

    // Generate recurring instances within the range
    let current = new Date(eventStart);
    const maxInstances = 100; // Safety limit
    let count = 0;

    while (current <= rangeEnd && count < maxInstances) {
      const instanceEnd = new Date(current.getTime() + duration);

      // Only include if instance overlaps with range
      if (instanceEnd >= rangeStart) {
        expanded.push({
          ...event,
          id: count === 0 ? event.id : `${event.id}_${current.toISOString()}`,
          start_time: current.toISOString(),
          end_time: instanceEnd.toISOString(),
          is_recurring_instance: count > 0,
          original_event_id: event.id,
          recurrence_label: getRecurrenceLabel(recurrence),
        });
      }

      // Advance to next occurrence
      const next = new Date(current);
      switch (recurrence) {
        case "daily":
          next.setDate(next.getDate() + 1);
          break;
        case "weekly":
          next.setDate(next.getDate() + 7);
          break;
        case "biweekly":
          next.setDate(next.getDate() + 14);
          break;
        case "monthly":
          next.setMonth(next.getMonth() + 1);
          break;
        case "yearly":
          next.setFullYear(next.getFullYear() + 1);
          break;
        default:
          count = maxInstances; // Stop if unknown recurrence
      }
      current = next;
      count++;
    }
  }

  return expanded.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}

function getRecurrenceLabel(recurrence: string): string {
  const labels: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    monthly: "Monthly",
    yearly: "Yearly",
  };
  return labels[recurrence] || "";
}

// GET /api/calendar?start=ISO&end=ISO
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query params required" },
        { status: 400 }
      );
    }

    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);

    // Fetch events:
    // 1. Non-recurring events that start within range
    // 2. Recurring events that started before range end (they might recur into range)
    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select(
        `
        *,
        creator:profiles!calendar_events_created_by_fkey(id, full_name),
        programme:programmes!calendar_events_programme_id_fkey(id, name),
        participants:event_participants(
          id,
          status,
          responded_at,
          user:profiles!event_participants_user_id_fkey(id, full_name, email)
        )
      `
      )
      .or(`and(recurrence.is.null,start_time.gte.${start},start_time.lte.${end}),and(recurrence.eq.none,start_time.gte.${start},start_time.lte.${end}),and(recurrence.neq.none,start_time.lte.${end})`)
      .order("start_time", { ascending: true });

    if (eventsError) {
      console.error("[Calendar] Events error:", eventsError);
      // Fallback: simpler query
      const { data: fallbackEvents, error: fallbackError } = await supabase
        .from("calendar_events")
        .select(
          `
          *,
          creator:profiles!calendar_events_created_by_fkey(id, full_name),
          programme:programmes!calendar_events_programme_id_fkey(id, name),
          participants:event_participants(
            id,
            status,
            responded_at,
            user:profiles!event_participants_user_id_fkey(id, full_name, email)
          )
        `
        )
        .lte("start_time", end)
        .order("start_time", { ascending: true });

      if (fallbackError) {
        return NextResponse.json(
          { error: fallbackError.message },
          { status: 500 }
        );
      }

      // Filter and expand manually
      const filtered = (fallbackEvents || []).filter((e: any) => {
        const eventStart = new Date(e.start_time);
        const hasRecurrence = e.recurrence && e.recurrence !== "none";
        // Include if: starts in range OR has recurrence
        return (eventStart >= rangeStart && eventStart <= rangeEnd) || hasRecurrence;
      });

      const normalized = filtered.map((e: any) => ({
        ...e,
        creator: Array.isArray(e.creator) ? e.creator[0] || null : e.creator,
        programme: Array.isArray(e.programme) ? e.programme[0] || null : e.programme,
        participants: (e.participants || []).map((p: any) => ({
          ...p,
          user: Array.isArray(p.user) ? p.user[0] || null : p.user,
        })),
      }));

      const expandedEvents = expandRecurringEvents(normalized, rangeStart, rangeEnd);

      // Get tasks and programmes
      const { taskDeadlines, programmeDeadlines } = await getDeadlines(supabase, user.id, start, end);

      return NextResponse.json({
        events: expandedEvents,
        taskDeadlines,
        programmeDeadlines,
      });
    }

    // Normalize creator/programme from arrays
    const normalized = (events || []).map((e: any) => ({
      ...e,
      creator: Array.isArray(e.creator) ? e.creator[0] || null : e.creator,
      programme: Array.isArray(e.programme) ? e.programme[0] || null : e.programme,
      participants: (e.participants || []).map((p: any) => ({
        ...p,
        user: Array.isArray(p.user) ? p.user[0] || null : p.user,
      })),
    }));

    // Expand recurring events
    const expandedEvents = expandRecurringEvents(normalized, rangeStart, rangeEnd);

    // Get tasks and programmes
    const { taskDeadlines, programmeDeadlines } = await getDeadlines(supabase, user.id, start, end);

    return NextResponse.json({
      events: expandedEvents,
      taskDeadlines,
      programmeDeadlines,
    });
  } catch (err) {
    console.error("[Calendar] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper to get task and programme deadlines
async function getDeadlines(supabase: any, userId: string, start: string, end: string) {
  // Get task deadlines
  const { data: taskAssignments } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", userId);

  const myTaskIds = (taskAssignments || []).map((a: any) => a.task_id);

  let taskDeadlines: any[] = [];
  if (myTaskIds.length > 0) {
    const { data: taskData } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, programme_id")
      .in("id", myTaskIds)
      .gte("due_date", start.split("T")[0])
      .lte("due_date", end.split("T")[0])
      .not("due_date", "is", null);

    taskDeadlines = taskData || [];
  }

  // Get programme deadlines
  const { data: programmes } = await supabase
    .from("programmes")
    .select("id, name, status, end_date")
    .gte("end_date", start.split("T")[0])
    .lte("end_date", end.split("T")[0])
    .not("end_date", "is", null);

  return {
    taskDeadlines,
    programmeDeadlines: programmes || [],
  };
}

// POST /api/calendar — create event + invite participants
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
    const {
      title,
      description,
      event_type,
      start_time,
      end_time,
      all_day,
      location,
      meeting_link,
      meeting_platform,
      visibility,
      color,
      recurrence,
      programme_id,
      participant_ids,
    } = body;

    if (!title || !start_time || !end_time) {
      return NextResponse.json(
        { error: "title, start_time, end_time required" },
        { status: 400 }
      );
    }

    const eventId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from("calendar_events")
      .insert({
        id: eventId,
        title,
        description: description || null,
        event_type: event_type || "meeting",
        start_time,
        end_time,
        all_day: all_day || false,
        location: location || null,
        meeting_link: meeting_link || null,
        meeting_platform: meeting_platform || null,
        visibility: visibility || "everyone",
        color: color || "#000000",
        recurrence: recurrence || "none",
        programme_id: programme_id || null,
        created_by: user.id,
      });

    if (insertError) {
      console.error("[Calendar] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Add participants (always include creator as accepted)
    const participantRows = [
      {
        event_id: eventId,
        user_id: user.id,
        status: "accepted",
        responded_at: new Date().toISOString(),
      },
    ];

    // Track invited user IDs for notifications
    const invitedUserIds: string[] = [];

    if (participant_ids && Array.isArray(participant_ids)) {
      for (const pid of participant_ids) {
        if (pid !== user.id) {
          participantRows.push({
            event_id: eventId,
            user_id: pid,
            status: "pending",
            responded_at: null as any,
          });
          invitedUserIds.push(pid);
        }
      }
    }

    const { error: partError } = await supabase
      .from("event_participants")
      .insert(participantRows);

    if (partError) {
      console.error("[Calendar] Participants error:", partError);
    }

    // Notify invited participants
    for (const inviteeId of invitedUserIds) {
      await notifyEventInvited(
        eventId,
        title,
        inviteeId,
        user.id
      );
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "calendar_event_created",
      entity_type: "calendar_event",
      entity_id: eventId,
      details: { 
        title, 
        event_type: event_type || "meeting",
        recurrence: recurrence || "none",
      },
    });

    return NextResponse.json({ id: eventId, success: true });
  } catch (err) {
    console.error("[Calendar] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}