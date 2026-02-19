

import { NextResponse } from "next/server";
import { getThread, markAsRead } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { checkSharedMailAccess } from "@/lib/gmail-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check permission: admin/super_admin role OR shared_mail_admin group
    const { authorized } = await checkSharedMailAccess(supabase, user.id);

    if (!authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const messages = await getThread(id);

    // Mark as read
    await markAsRead(id);

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Error fetching thread:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread" },
      { status: 500 }
    );
  }
}