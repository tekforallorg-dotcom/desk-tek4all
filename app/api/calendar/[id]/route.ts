import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/calendar/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: event, error } = await supabase
      .from("calendar_events")
      .select(
        `
        *,
        creator:profiles!calendar_events_created_by_fkey(id, full_name, email),
        programme:programmes!calendar_events_programme_id_fkey(id, name),
        participants:event_participants(
          id,
          status,
          responded_at,
          user:profiles!event_participants_user_id_fkey(id, full_name, email)
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Normalize
    const normalized = {
      ...event,
      creator: Array.isArray(event.creator)
        ? event.creator[0] || null
        : event.creator,
      programme: Array.isArray(event.programme)
        ? event.programme[0] || null
        : event.programme,
      participants: (event.participants || []).map((p: any) => ({
        ...p,
        user: Array.isArray(p.user) ? p.user[0] || null : p.user,
      })),
    };

    return NextResponse.json(normalized);
  } catch (err) {
    console.error("[Calendar] GET detail error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/calendar/[id] — update event
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership or admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const { data: existing } = await supabase
      .from("calendar_events")
      .select("created_by")
      .eq("id", id)
      .single();

    if (
      !existing ||
      (existing.created_by !== user.id &&
        !["admin", "super_admin"].includes(profile?.role || ""))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (event_type !== undefined) updates.event_type = event_type;
    if (start_time !== undefined) updates.start_time = start_time;
    if (end_time !== undefined) updates.end_time = end_time;
    if (all_day !== undefined) updates.all_day = all_day;
    if (location !== undefined) updates.location = location;
    if (meeting_link !== undefined) updates.meeting_link = meeting_link;
    if (meeting_platform !== undefined) updates.meeting_platform = meeting_platform;
    if (visibility !== undefined) updates.visibility = visibility;
    if (color !== undefined) updates.color = color;
    if (programme_id !== undefined) updates.programme_id = programme_id;

    const { error: updateError } = await supabase
      .from("calendar_events")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Update participants if provided
    if (participant_ids && Array.isArray(participant_ids)) {
      // Get current participants
      const { data: currentParts } = await supabase
        .from("event_participants")
        .select("user_id")
        .eq("event_id", id);

      const currentIds = new Set((currentParts || []).map((p) => p.user_id));
      const newIds = new Set(participant_ids as string[]);

      // Add new participants
      const toAdd = participant_ids.filter(
        (pid: string) => !currentIds.has(pid)
      );
      if (toAdd.length > 0) {
        await supabase.from("event_participants").insert(
          toAdd.map((pid: string) => ({
            event_id: id,
            user_id: pid,
            status: "pending",
          }))
        );
      }

      // Remove participants no longer in list (but keep creator)
      const toRemove = [...currentIds].filter(
        (pid) => !newIds.has(pid) && pid !== existing.created_by
      );
      if (toRemove.length > 0) {
        await supabase
          .from("event_participants")
          .delete()
          .eq("event_id", id)
          .in("user_id", toRemove);
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "updated",
      entity_type: "calendar_event",
      entity_id: id,
      metadata: { fields: Object.keys(updates) },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Calendar] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/calendar/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const { data: existing } = await supabase
      .from("calendar_events")
      .select("created_by, title")
      .eq("id", id)
      .single();

    if (
      !existing ||
      (existing.created_by !== user.id &&
        !["admin", "super_admin"].includes(profile?.role || ""))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Cascade deletes participants via ON DELETE CASCADE
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "deleted",
      entity_type: "calendar_event",
      entity_id: id,
      metadata: { title: existing.title },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Calendar] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}