/**
 * app/api/drive/files/[id]/route.ts
 *
 * GET    /api/drive/files/[id]?action=download|details|share
 * DELETE /api/drive/files/[id]   (admin only — moves to trash)
 * PATCH  /api/drive/files/[id]   (admin only — rename, star, move)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, FILE_FIELDS } from "@/lib/google/drive";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "details";

  const drive = getDriveClient();

  try {
    if (action === "download") {
      // Stream file content for download
      const meta = await drive.files.get({
        fileId: id,
        fields: "name, mimeType, size",
        supportsAllDrives: true,
      });

      // Google Docs/Sheets/Slides need export
      const isGoogleDoc = meta.data.mimeType?.startsWith("application/vnd.google-apps.");

      if (isGoogleDoc) {
        const exportMimes: Record<string, string> = {
          "application/vnd.google-apps.document": "application/pdf",
          "application/vnd.google-apps.spreadsheet":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.google-apps.presentation": "application/pdf",
          "application/vnd.google-apps.drawing": "application/pdf",
        };

        const exportMime = exportMimes[meta.data.mimeType || ""] || "application/pdf";

        const exported = await drive.files.export(
          { fileId: id, mimeType: exportMime },
          { responseType: "arraybuffer" }
        );

        const ext = exportMime.includes("pdf")
          ? ".pdf"
          : exportMime.includes("sheet")
            ? ".xlsx"
            : ".pdf";

        return new NextResponse(exported.data as ArrayBuffer, {
          headers: {
            "Content-Type": exportMime,
            "Content-Disposition": `attachment; filename="${(meta.data.name || "download") + ext}"`,
          },
        });
      }

      // Regular file — stream binary
      const file = await drive.files.get(
        { fileId: id, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );

      return new NextResponse(file.data as ArrayBuffer, {
        headers: {
          "Content-Type": meta.data.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${meta.data.name || "download"}"`,
        },
      });
    }

    if (action === "share") {
      // Get or create shareable link
      const file = await drive.files.get({
        fileId: id,
        fields: "webViewLink, webContentLink, name",
        supportsAllDrives: true,
      });

      return NextResponse.json({
        webViewLink: file.data.webViewLink,
        webContentLink: file.data.webContentLink,
        name: file.data.name,
      });
    }

    // Default: details
    const file = await drive.files.get({
      fileId: id,
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });

    return NextResponse.json({ file: file.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] File operation error:", message);
    return NextResponse.json({ error: "Operation failed", detail: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const drive = getDriveClient();

    // Move to trash (not permanent delete — safety first)
    await drive.files.update({
      fileId: id,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] Delete error:", message);
    return NextResponse.json({ error: "Failed to delete", detail: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const body = await request.json();

  try {
    const drive = getDriveClient();

    const updateBody: Record<string, unknown> = {};
    if (body.name !== undefined) updateBody.name = body.name;
    if (body.starred !== undefined) updateBody.starred = body.starred;
    if (body.description !== undefined) updateBody.description = body.description;

    const moveToFolder = body.moveTo;

    const response = await drive.files.update({
      fileId: id,
      requestBody: updateBody,
      addParents: moveToFolder || undefined,
      removeParents: body.removeFrom || undefined,
      fields: "id, name, starred, description",
      supportsAllDrives: true,
    });

    return NextResponse.json({ file: response.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Drive] Update error:", message);
    return NextResponse.json({ error: "Failed to update", detail: message }, { status: 500 });
  }
}