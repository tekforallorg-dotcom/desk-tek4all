import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pattern = `%${query}%`;

  // Search tasks
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority")
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
    .limit(5);

  // Search programmes
  const { data: programmes } = await supabase
    .from("programmes")
    .select("id, name, status")
    .or(`name.ilike.${pattern},description.ilike.${pattern}`)
    .limit(5);

  // Search users/profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, role")
    .or(`full_name.ilike.${pattern},username.ilike.${pattern},email.ilike.${pattern}`)
    .limit(5);

  // Search messages
  const { data: messages } = await supabase
    .from("messages")
    .select("id, content, conversation_id, created_at")
    .ilike("content", pattern)
    .limit(5);

  const results = [
    ...(tasks || []).map((t) => ({
      type: "task" as const,
      id: t.id,
      title: t.title,
      subtitle: `${t.status} • ${t.priority}`,
      href: `/tasks/${t.id}`,
    })),
    ...(programmes || []).map((p) => ({
      type: "programme" as const,
      id: p.id,
      title: p.name,
      subtitle: p.status,
      href: `/programmes/${p.id}`,
    })),
    ...(profiles || []).map((p) => ({
      type: "user" as const,
      id: p.id,
      title: p.full_name || p.username || "Unknown",
      subtitle: `${p.role} • ${p.email || ""}`,
      href: `/admin/users/${p.id}`,
    })),
    ...(messages || []).map((m) => ({
      type: "message" as const,
      id: m.id,
      title: m.content.length > 60 ? m.content.slice(0, 60) + "…" : m.content,
      subtitle: "Message",
      href: `/messaging/${m.conversation_id}`,
    })),
  ];

  return NextResponse.json({ results });
}