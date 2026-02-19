import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/attachments?entity_type=task&entity_id=xxx
 * 
 * Get all attachments for an entity (task or programme)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "entity_type and entity_id are required" },
        { status: 400 }
      );
    }

    if (!["task", "programme"].includes(entityType)) {
      return NextResponse.json(
        { error: "entity_type must be 'task' or 'programme'" },
        { status: 400 }
      );
    }

    // Fetch attachments
    const { data: attachments, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching attachments:", error);
      return NextResponse.json(
        { error: "Failed to fetch attachments" },
        { status: 500 }
      );
    }

    // Get uploader profiles
    const uploaderIds = [...new Set(attachments.map((a) => a.uploaded_by))];
    let uploaders: Record<string, { full_name: string | null; username: string }> = {};
    
    if (uploaderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", uploaderIds);
      
      if (profiles) {
        profiles.forEach((p) => {
          uploaders[p.id] = { full_name: p.full_name, username: p.username };
        });
      }
    }

    // Add uploader info to attachments
    const attachmentsWithUploaders = attachments.map((a) => ({
      ...a,
      uploader: uploaders[a.uploaded_by] || { full_name: null, username: "Unknown" },
    }));

    return NextResponse.json({ attachments: attachmentsWithUploaders });

  } catch (error) {
    console.error("Attachments GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/attachments
 * 
 * Add a new attachment
 * Body: { entity_type, entity_id, file }
 * where file = { id, name, mimeType, webViewLink, iconUrl, thumbnailUrl }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Parse body
    const body = await request.json();
    const { entity_type, entity_id, file } = body;

    if (!entity_type || !entity_id || !file) {
      return NextResponse.json(
        { error: "entity_type, entity_id, and file are required" },
        { status: 400 }
      );
    }

    if (!["task", "programme"].includes(entity_type)) {
      return NextResponse.json(
        { error: "entity_type must be 'task' or 'programme'" },
        { status: 400 }
      );
    }

    if (!file.id || !file.name || !file.webViewLink) {
      return NextResponse.json(
        { error: "file must have id, name, and webViewLink" },
        { status: 400 }
      );
    }

    // Check permission to add attachment
    const canAdd = await checkAddPermission(
      supabase,
      user.id,
      profile?.role || "member",
      entity_type,
      entity_id
    );

    if (!canAdd) {
      return NextResponse.json(
        { error: "You don't have permission to add attachments to this item" },
        { status: 403 }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from("attachments")
      .select("id")
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .eq("drive_file_id", file.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "This file is already attached" },
        { status: 400 }
      );
    }

    // Create attachment
    const { data: attachment, error: insertError } = await supabase
      .from("attachments")
      .insert({
        entity_type,
        entity_id,
        drive_file_id: file.id,
        drive_file_name: file.name,
        drive_file_url: file.webViewLink,
        drive_mime_type: file.mimeType || null,
        drive_icon_url: file.iconUrl || null,
        drive_thumbnail_url: file.thumbnailUrl || null,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating attachment:", insertError);
      return NextResponse.json(
        { error: "Failed to create attachment" },
        { status: 500 }
      );
    }

    // Log to audit
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "attachment_added",
      entity_type: entity_type,
      entity_id: entity_id,
      details: {
        file_name: file.name,
        file_id: file.id,
      },
    });

    return NextResponse.json({
      success: true,
      attachment,
    });

  } catch (error) {
    console.error("Attachments POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/attachments
 * 
 * Remove an attachment
 * Body: { attachment_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Parse body
    const body = await request.json();
    const { attachment_id } = body;

    if (!attachment_id) {
      return NextResponse.json(
        { error: "attachment_id is required" },
        { status: 400 }
      );
    }

    // Get attachment
    const { data: attachment, error: fetchError } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", attachment_id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Check permission to delete
    const canDelete = await checkDeletePermission(
      supabase,
      user.id,
      profile?.role || "member",
      attachment
    );

    if (!canDelete) {
      return NextResponse.json(
        { error: "You don't have permission to remove this attachment" },
        { status: 403 }
      );
    }

    // Delete attachment
    const { error: deleteError } = await supabase
      .from("attachments")
      .delete()
      .eq("id", attachment_id);

    if (deleteError) {
      console.error("Error deleting attachment:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete attachment" },
        { status: 500 }
      );
    }

    // Log to audit
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "attachment_removed",
      entity_type: attachment.entity_type,
      entity_id: attachment.entity_id,
      details: {
        file_name: attachment.drive_file_name,
        file_id: attachment.drive_file_id,
      },
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Attachments DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Check if user can add attachments
 * Rules: Assignees + Creator + Admin can add
 */
async function checkAddPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  entityType: string,
  entityId: string
): Promise<boolean> {
  // Admin/Super Admin can always add
  if (role === "admin" || role === "super_admin") {
    return true;
  }

  if (entityType === "task") {
    // Check if user is task creator
    const { data: task } = await supabase
      .from("tasks")
      .select("created_by")
      .eq("id", entityId)
      .single();

    if (task?.created_by === userId) {
      return true;
    }

    // Check if user is assigned to task
    const { data: assignment } = await supabase
      .from("task_assignees")
      .select("id")
      .eq("task_id", entityId)
      .eq("user_id", userId)
      .single();

    if (assignment) {
      return true;
    }
  }

  if (entityType === "programme") {
    // Check if user is programme creator or manager
    const { data: programme } = await supabase
      .from("programmes")
      .select("created_by, manager_id")
      .eq("id", entityId)
      .single();

    if (programme?.created_by === userId || programme?.manager_id === userId) {
      return true;
    }
  }

  return false;
}

/**
 * Check if user can delete an attachment
 * Rules: Uploader + Creator + Admin can delete
 */
async function checkDeletePermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  attachment: { uploaded_by: string; entity_type: string; entity_id: string }
): Promise<boolean> {
  // Admin/Super Admin can always delete
  if (role === "admin" || role === "super_admin") {
    return true;
  }

  // Uploader can delete their own
  if (attachment.uploaded_by === userId) {
    return true;
  }

  // Check if user is entity creator
  if (attachment.entity_type === "task") {
    const { data: task } = await supabase
      .from("tasks")
      .select("created_by")
      .eq("id", attachment.entity_id)
      .single();

    if (task?.created_by === userId) {
      return true;
    }
  }

  if (attachment.entity_type === "programme") {
    const { data: programme } = await supabase
      .from("programmes")
      .select("created_by, manager_id")
      .eq("id", attachment.entity_id)
      .single();

    if (programme?.created_by === userId || programme?.manager_id === userId) {
      return true;
    }
  }

  return false;
}