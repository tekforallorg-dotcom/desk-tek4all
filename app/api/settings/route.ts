import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, role, preferences")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[Settings] Fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }

  return NextResponse.json(profile);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { full_name, username, preferences } = body;

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (full_name !== undefined) updates.full_name = full_name;
  if (username !== undefined) updates.username = username;
  if (preferences !== undefined) updates.preferences = preferences;

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("id, full_name, username, email, role, preferences")
    .single();

  if (error) {
    console.error("[Settings] Update error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }

  // Log the update
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "settings_updated",
    entity_type: "profile",
    entity_id: user.id,
    details: { updated_fields: Object.keys(updates).filter(k => k !== "updated_at") },
  });

  return NextResponse.json(data);
}