/**
 * lib/google/drive.ts
 * Google Drive API client using the same service account as Gmail.
 * Impersonates impact@tekforall.org for storage quota + full access.
 */

import { google, drive_v3 } from "googleapis";
import { JWT } from "google-auth-library";

// Cache the auth client
let cachedAuth: JWT | null = null;

function getAuth(): JWT {
  if (cachedAuth) return cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const impersonate = process.env.GMAIL_IMPERSONATE_EMAIL; // impact@tekforall.org

  if (!email || !key) {
    throw new Error("[Drive] Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  cachedAuth = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: impersonate, // Required for uploads (SA has no storage quota)
  });

  return cachedAuth;
}

export function getDriveClient(): drive_v3.Drive {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
}

export const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

/** Standard fields to request for file listings */
export const FILE_FIELDS =
  "id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, iconLink, thumbnailLink, parents, shared, starred, description, owners(displayName, emailAddress), lastModifyingUser(displayName, emailAddress)";

export const LIST_FIELDS = `files(${FILE_FIELDS}), nextPageToken`;

/** Map MIME types to human-readable categories */
export function getFileCategory(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "folder";
  if (mimeType === "application/vnd.google-apps.document") return "document";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "spreadsheet";
  if (mimeType === "application/vnd.google-apps.presentation") return "presentation";
  if (mimeType === "application/vnd.google-apps.form") return "form";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")) return "archive";
  if (mimeType.includes("word") || mimeType.includes("document")) return "document";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "presentation";
  return "file";
}

/** Format bytes to human-readable */
export function formatBytes(bytes: number | string | undefined): string {
  if (!bytes) return "--";
  const b = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(b) || b === 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}