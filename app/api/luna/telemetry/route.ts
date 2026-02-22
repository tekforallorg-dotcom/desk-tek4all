/**
 * POST /api/luna/telemetry — Client-side telemetry events
 *
 * Lightweight fire-and-forget endpoint for UI events.
 * Iteration 6: drawer_open, drawer_close tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent, type LunaEventType } from "@/lib/luna/telemetry";

const ALLOWED_EVENTS: LunaEventType[] = ["drawer_open", "drawer_close"];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = await request.json();
    const eventType = String(body.event_type || "") as LunaEventType;

    if (!ALLOWED_EVENTS.includes(eventType)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await emitEvent(supabase, {
      user_id: user.id,
      event_type: eventType,
      metadata: typeof body.metadata === "object" && body.metadata !== null
        ? JSON.parse(JSON.stringify(body.metadata)) // Deep clone to strip prototypes
        : {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}