import { NextResponse } from "next/server";
import { sendReply } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";

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

    const body = await request.json();
    const { threadId, to, subject, content } = body;

    if (!threadId || !to || !subject || !content) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await sendReply(threadId, to, subject, content);

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "email_reply_sent",
      entity_type: "email",
      entity_id: threadId,
      details: { to, subject },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending reply:", error);
    return NextResponse.json(
      { error: "Failed to send reply" },
      { status: 500 }
    );
  }
}