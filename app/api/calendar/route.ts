import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Get calendar events in range
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
          user:profiles!event_participants_user_id_fkey(id, full_name, email)
        )
      `
      )
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time", { ascending: true });

    if (eventsError) {
      console.error("[Calendar] Events error:", eventsError);
      return NextResponse.json(
        { error: eventsError.message },
        { status: 500 }
      );
    }

    // Also get task deadlines in range
    const { data: taskAssignments } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", user.id);

    const myTaskIds = (taskAssignments || []).map((a) => a.task_id);

    let tasks: any[] = [];
    if (myTaskIds.length > 0) {
      const { data: taskData } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, programme_id")
        .in("id", myTaskIds)
        .gte("due_date", start.split("T")[0])
        .lte("due_date", end.split("T")[0])
        .not("due_date", "is", null);

      tasks = taskData || [];
    }

    // Get programme deadlines in range
    const { data: programmes } = await supabase
      .from("programmes")
      .select("id, name, status, end_date")
      .gte("end_date", start.split("T")[0])
      .lte("end_date", end.split("T")[0])
      .not("end_date", "is", null);

    // Normalize creator/programme from arrays
    const normalized = (events || []).map((e: any) => ({
      ...e,
      creator: Array.isArray(e.creator) ? e.creator[0] || null : e.creator,
      programme: Array.isArray(e.programme)
        ? e.programme[0] || null
        : e.programme,
      participants: (e.participants || []).map((p: any) => ({
        ...p,
        user: Array.isArray(p.user) ? p.user[0] || null : p.user,
      })),
    }));

    return NextResponse.json({
      events: normalized,
      taskDeadlines: tasks || [],
      programmeDeadlines: programmes || [],
    });
  } catch (err) {
    console.error("[Calendar] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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

    if (participant_ids && Array.isArray(participant_ids)) {
      for (const pid of participant_ids) {
        if (pid !== user.id) {
          participantRows.push({
            event_id: eventId,
            user_id: pid,
            status: "pending",
            responded_at: null as any,
          });
        }
      }
    }

    const { error: partError } = await supabase
      .from("event_participants")
      .insert(participantRows);

    if (partError) {
      console.error("[Calendar] Participants error:", partError);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "created",
      entity_type: "calendar_event",
      entity_id: eventId,
      metadata: { title, event_type: event_type || "meeting" },
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