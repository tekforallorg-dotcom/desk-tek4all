/**
 * app/api/drive/files/route.ts
 *
 * GET  /api/drive/files?folderId=X&sort=name|modified|size&order=asc|desc&pageToken=X
 * POST /api/drive/files  (multipart form-data, admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, ROOT_FOLDER_ID, LIST_FIELDS } from "@/lib/google/drive";
import { Readable } from "stream";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId") || ROOT_FOLDER_ID;
  const sort = searchParams.get("sort") || "name";
  const order = searchParams.get("order") || "asc";
  const pageToken = searchParams.get("pageToken") || undefined;
  const pageSize = 100;

  console.log("[Drive] Listing files in folder:", folderId, "ROOT_FOLDER_ID env:", ROOT_FOLDER_ID);

  if (!folderId) {
    return NextResponse.json(
      { error: "GOOGLE_DRIVE_FOLDER_ID not configured", detail: "Set GOOGLE_DRIVE_FOLDER_ID in .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const orderByMap: Record<string, string> = {
    name: `folder,name ${order === "desc" ? "desc" : ""}`.trim(),
    modified: `folder,modifiedTime ${order === "desc" ? "desc" : ""}`.trim(),
    size: `folder,quotaBytesUsed ${order === "desc" ? "desc" : ""}`.trim(),
  };

  try {
    const drive = getDriveClient();

    // First verify the folder exists and is accessible
    try {
      await drive.files.get({
        fileId: folderId,
        fields: "id, name",
        supportsAllDrives: true,
      });
    } catch (verifyErr: unknown) {
      const msg = verifyErr instanceof Error ? verifyErr.message : "Unknown";
      console.error("[Drive] Cannot access folder:", folderId, msg);
      return NextResponse.json(
        {
          error: "Cannot access Drive folder",
          detail: `Folder ID "${folderId}" not found or not shared with the service account. Make sure the folder is shared with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
        },
        { status: 500 }
      );
    }

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: LIST_FIELDS,
      orderBy: orderByMap[sort] || "folder,name",
      pageSize,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    // Build breadcrumbs (fail gracefully — don't crash the whole request)
    let breadcrumbs: { id: string; name: string }[] = [{ id: ROOT_FOLDER_ID, name: "Shared Drive" }];
    try {
      breadcrumbs = await buildBreadcrumbs(drive, folderId);
    } catch (breadcrumbErr) {
      console.warn("[Drive] Breadcrumb build failed, using fallback:", breadcrumbErr);
    }

    return NextResponse.json({
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || null,
      breadcrumbs,
      currentFolderId: folderId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] List files error:", message);
    return NextResponse.json({ error: "Failed to list files", detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folderId = (formData.get("folderId") as string) || ROOT_FOLDER_ID;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const drive = getDriveClient();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = Readable.from(buffer);

    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: stream,
      },
      fields: "id, name, mimeType, size, modifiedTime, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    return NextResponse.json({ file: response.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] Upload error:", message);
    return NextResponse.json({ error: "Failed to upload file", detail: message }, { status: 500 });
  }
}

/* ─── Breadcrumb Builder ─────────────────────────────────────────────── */

async function buildBreadcrumbs(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const crumbs: { id: string; name: string }[] = [];
  let currentId = folderId;

  for (let i = 0; i < 10; i++) {
    if (currentId === ROOT_FOLDER_ID) {
      crumbs.unshift({ id: ROOT_FOLDER_ID, name: "Shared Drive" });
      break;
    }

    try {
      const res = await drive.files.get({
        fileId: currentId,
        fields: "id, name, parents",
        supportsAllDrives: true,
      });

      crumbs.unshift({
        id: res.data.id || currentId,
        name: res.data.name || "Unknown",
      });

      const parents = res.data.parents;
      if (!parents || parents.length === 0) {
        // Hit the top — prepend root
        crumbs.unshift({ id: ROOT_FOLDER_ID, name: "Shared Drive" });
        break;
      }

      currentId = parents[0];
    } catch {
      // Can't read this parent — stop walking
      crumbs.unshift({ id: ROOT_FOLDER_ID, name: "Shared Drive" });
      break;
    }
  }

  if (crumbs.length === 0) {
    crumbs.push({ id: ROOT_FOLDER_ID, name: "Shared Drive" });
  }

  return crumbs;
}