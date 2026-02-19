// DESTINATION: app/api/admin/delete-user/route.ts  (NEW FILE)

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    // Check auth
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super_admin can delete users
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    // Verify target user exists
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", userId)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting another super_admin
    if (targetProfile.role === "super_admin") {
      return NextResponse.json(
        { error: "Cannot delete a Super Admin account" },
        { status: 403 }
      );
    }

   // Clean up ALL related data FIRST (FK constraints block auth deletion)
    // Nullify references where we want to keep the record
    await supabaseAdmin.from("attachments").update({ uploaded_by: null }).eq("uploaded_by", userId);
    await supabaseAdmin.from("calendar_events").update({ created_by: null }).eq("created_by", userId);
    await supabaseAdmin.from("tasks").update({ reviewed_by: null }).eq("reviewed_by", userId);
    await supabaseAdmin.from("tasks").update({ evidence_submitted_by: null }).eq("evidence_submitted_by", userId);
    await supabaseAdmin.from("subtasks").update({ created_by: null }).eq("created_by", userId);
    await supabaseAdmin.from("task_dependencies").update({ created_by: null }).eq("created_by", userId);

    // Delete records that belong to the user
    await supabaseAdmin.from("event_participants").delete().eq("user_id", userId);
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
    await supabaseAdmin.from("notifications").update({ actor_id: null }).eq("actor_id", userId);
    await supabaseAdmin.from("group_members").delete().eq("user_id", userId);

    // Now delete profile
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    
    // Now delete auth user
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[Admin] Error deleting auth user:", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "user_deleted",
      entity_type: "user",
      entity_id: userId,
      details: {
        deleted_user: targetProfile.full_name || targetProfile.email,
        deleted_role: targetProfile.role,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin] Delete user error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}