

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReply } from "@/lib/gemini";
import { checkSharedMailAccess } from "@/lib/gmail-access";

export async function POST(request: Request) {
  try {
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

    const { subject, from, body, instructions } = await request.json();

    if (!subject || !from || !body) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const draftReply = await generateReply(subject, from, body, instructions);

    return NextResponse.json({ draftReply });
  } catch (error) {
    console.error("Error generating draft:", error);
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    );
  }
}