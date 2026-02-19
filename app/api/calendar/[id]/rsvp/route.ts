import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyEventRSVP } from "@/lib/notifications";

// PATCH /api/calendar/[id]/rsvp — accept/decline/tentative
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

    const { status } = await request.json();

    if (!["accepted", "declined", "tentative"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be accepted, declined, or tentative" },
        { status: 400 }
      );
    }

    // Get event details for notification
    const { data: event } = await supabase
      .from("calendar_events")
      .select("id, title, created_by")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("event_participants")
      .update({
        status,
        responded_at: new Date().toISOString(),
      })
      .eq("event_id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[Calendar] RSVP error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "rsvp_" + status,
      entity_type: "calendar_event",
      entity_id: id,
      metadata: { status },
    });

    // Notify event creator (if not self)
    if (event && event.created_by && event.created_by !== user.id) {
      // Map status to notification format
      const rsvpStatus = status === "accepted" ? "yes" 
        : status === "declined" ? "no" 
        : "maybe";
      
      await notifyEventRSVP(
        id,
        event.title,
        event.created_by,
        user.id,
        rsvpStatus
      );
    }

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("[Calendar] RSVP error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}