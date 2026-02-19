

import { NextResponse } from "next/server";
import { listThreads } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { checkSharedMailAccess } from "@/lib/gmail-access";

export async function GET() {
  try {
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

    const threads = await listThreads(30);
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("Error fetching threads:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}