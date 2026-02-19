import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyProgrammeAdded } from "@/lib/notifications";

/**
 * POST /api/notifications/programme-added
 * 
 * Notify a user when they're added to a programme.
 * Called from client-side after adding member.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { programme_id, programme_name, member_id } = body;

    if (!programme_id || !programme_name || !member_id) {
      return NextResponse.json(
        { error: "programme_id, programme_name, and member_id required" },
        { status: 400 }
      );
    }

    // Don't notify if adding self
    if (member_id === user.id) {
      return NextResponse.json({ success: true, skipped: true });
    }

    await notifyProgrammeAdded(
      programme_id,
      programme_name,
      member_id,
      user.id
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Programme notification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}