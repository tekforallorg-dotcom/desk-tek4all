import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyEmail } from "@/lib/gemini";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { subject, from, body } = await request.json();

    if (!subject || !from || !body) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const classification = await classifyEmail(subject, from, body);

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "email_classified",
      entity_type: "email",
      details: { subject, importance: classification.importance, category: classification.category },
    });

    return NextResponse.json(classification);
  } catch (error) {
    console.error("Error classifying email:", error);
    return NextResponse.json(
      { error: "Failed to classify email" },
      { status: 500 }
    );
  }
}