/**
 * app/api/drive/search/route.ts
 *
 * GET /api/drive/search?q=keyword&pageToken=X
 * Searches files across the entire shared drive.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, ROOT_FOLDER_ID, LIST_FIELDS } from "@/lib/google/drive";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const pageToken = searchParams.get("pageToken") || undefined;
  const fileType = searchParams.get("type"); // folder, document, spreadsheet, image, pdf, etc.

  if (!query || query.length < 2) {
    return NextResponse.json({ files: [], nextPageToken: null });
  }

  try {
    const drive = getDriveClient();

    // Build query: search within root folder tree + name/fullText match
    let q = `'${ROOT_FOLDER_ID}' in parents or fullText contains '${query.replace(/'/g, "\\'")}'`;
    
    // More targeted: search by name contains + not trashed
    q = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;

    // Optionally filter by type
    if (fileType === "folder") {
      q += ` and mimeType = 'application/vnd.google-apps.folder'`;
    } else if (fileType === "document") {
      q += ` and (mimeType = 'application/vnd.google-apps.document' or mimeType contains 'word')`;
    } else if (fileType === "spreadsheet") {
      q += ` and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType contains 'sheet' or mimeType contains 'excel')`;
    } else if (fileType === "presentation") {
      q += ` and (mimeType = 'application/vnd.google-apps.presentation' or mimeType contains 'powerpoint')`;
    } else if (fileType === "pdf") {
      q += ` and mimeType = 'application/pdf'`;
    } else if (fileType === "image") {
      q += ` and mimeType contains 'image/'`;
    } else if (fileType === "video") {
      q += ` and mimeType contains 'video/'`;
    }

    const response = await drive.files.list({
      q,
      fields: LIST_FIELDS,
      orderBy: "modifiedTime desc",
      pageSize: 50,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return NextResponse.json({
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || null,
      query,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] Search error:", message);
    return NextResponse.json({ error: "Search failed", detail: message }, { status: 500 });
  }
}