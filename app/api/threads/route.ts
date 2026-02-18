import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/threads?task_id=xxx OR ?programme_id=xxx
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("task_id");
  const programmeId = searchParams.get("programme_id");

  if (!taskId && !programmeId) {
    return NextResponse.json(
      { error: "task_id or programme_id required" },
      { status: 400 }
    );
  }

  try {
    // Fetch messages without FK join
    let query = supabase
      .from("messages")
      .select("id, content, created_at, sender_id, task_id, programme_id")
      .order("created_at", { ascending: true });

    if (taskId) {
      query = query.eq("task_id", taskId);
    } else if (programmeId) {
      query = query.eq("programme_id", programmeId);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("[Threads] Fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch senders separately
    const senderIds = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))];
    
    let sendersMap: Record<string, any> = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", senderIds);

      if (senders) {
        sendersMap = Object.fromEntries(senders.map((s) => [s.id, s]));
      }
    }

    // Combine messages with sender info
    const normalized = messages.map((m) => ({
      ...m,
      sender: sendersMap[m.sender_id] || null,
    }));

    return NextResponse.json(normalized);
  } catch (err) {
    console.error("[Threads] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

// POST /api/threads - Create a message linked to task or programme
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { content, task_id, programme_id } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  if (!task_id && !programme_id) {
    return NextResponse.json(
      { error: "task_id or programme_id required" },
      { status: 400 }
    );
  }

  try {
    // Insert message
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        content: content.trim(),
        sender_id: user.id,
        task_id: task_id || null,
        programme_id: programme_id || null,
      })
      .select("id, content, created_at, sender_id, task_id, programme_id")
      .single();

    if (error) {
      console.error("[Threads] Create error:", error);
      return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
    }

    // Fetch sender info
    const { data: sender } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .eq("id", user.id)
      .single();

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "thread_message_created",
      entity_type: task_id ? "task" : "programme",
      entity_id: task_id || programme_id,
      details: { content: content.trim().slice(0, 100) },
    });

    return NextResponse.json(
      { ...message, sender },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Threads] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
  }
}