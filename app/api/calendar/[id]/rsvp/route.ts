import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("[Calendar] RSVP error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}