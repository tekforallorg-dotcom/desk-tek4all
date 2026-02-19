import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, ROOT_FOLDER_ID } from "@/lib/google/drive";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, parentId } = await request.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }

    const drive = getDriveClient();

    const response = await drive.files.create({
      requestBody: {
        name: name.trim(),
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId || ROOT_FOLDER_ID],
      },
      fields: "id, name, mimeType, modifiedTime, webViewLink",
      supportsAllDrives: true,
    });

    return NextResponse.json({ folder: response.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] Create folder error:", message);
    return NextResponse.json({ error: "Failed to create folder", detail: message }, { status: 500 });
  }
}