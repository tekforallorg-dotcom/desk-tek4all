"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Paperclip,
  Plus,
  X,
  ExternalLink,
  Loader2,
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  Film,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriveFilePicker, GoogleDriveFile } from "@/components/drive-file-picker";
import { useAuth } from "@/lib/auth";

interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string;
  drive_file_id: string;
  drive_file_name: string;
  drive_file_url: string;
  drive_mime_type: string | null;
  drive_icon_url: string | null;
  drive_thumbnail_url: string | null;
  uploaded_by: string;
  created_at: string;
  uploader?: { full_name: string | null; username: string };
}

interface TaskAttachmentsProps {
  entityType: "task" | "programme";
  entityId: string;
  canAdd: boolean;
  canRemove: boolean;
}

const MIME_TYPE_ICONS: Record<string, React.ElementType> = {
  "application/vnd.google-apps.document": FileText,
  "application/vnd.google-apps.spreadsheet": FileSpreadsheet,
  "application/vnd.google-apps.presentation": Presentation,
  "application/pdf": FileText,
  "image/jpeg": Image,
  "image/png": Image,
  "image/gif": Image,
  "video/mp4": Film,
};

function getFileIcon(mimeType: string | null): React.ElementType {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("video/")) return Film;
  return MIME_TYPE_ICONS[mimeType] || File;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function TaskAttachments({
  entityType,
  entityId,
  canAdd,
  canRemove,
}: TaskAttachmentsProps) {
  const { user, profile } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/attachments?entity_type=${entityType}&entity_id=${entityId}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch attachments");
      }

      setAttachments(data.attachments);
    } catch (err) {
      console.error("Error fetching attachments:", err);
      setError(err instanceof Error ? err.message : "Failed to load attachments");
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Add attachment - accepts GoogleDriveFile from picker
  const handleFileSelect = async (file: GoogleDriveFile) => {
    try {
      setIsAdding(true);
      setError(null);

      const response = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          file: {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
            iconUrl: file.iconLink || null,
            thumbnailUrl: file.thumbnailLink || null,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add attachment");
      }

      // Add to list
      setAttachments((prev) => [
        {
          ...data.attachment,
          uploader: {
            full_name: profile?.full_name || null,
            username: profile?.username || user?.email || "You",
          },
        },
        ...prev,
      ]);

      setShowPicker(false);
    } catch (err) {
      console.error("Error adding attachment:", err);
      setError(err instanceof Error ? err.message : "Failed to add attachment");
    } finally {
      setIsAdding(false);
    }
  };

  // Remove attachment
  const handleRemove = async (attachmentId: string) => {
    try {
      setRemovingId(attachmentId);
      setError(null);

      const response = await fetch("/api/attachments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment_id: attachmentId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove attachment");
      }

      // Remove from list
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err) {
      console.error("Error removing attachment:", err);
      setError(err instanceof Error ? err.message : "Failed to remove attachment");
    } finally {
      setRemovingId(null);
    }
  };

  // Check if user can remove a specific attachment
  const canRemoveAttachment = (attachment: Attachment) => {
    if (profile?.role === "admin" || profile?.role === "super_admin") return true;
    if (attachment.uploaded_by === user?.id) return true;
    return canRemove;
  };

  // Get existing file IDs to exclude from picker
  const existingFileIds = attachments.map((a) => a.drive_file_id);

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-5 w-5 text-foreground" />
          <h2 className="font-bold">Attachments</h2>
          {attachments.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">
              {attachments.length}
            </span>
          )}
        </div>
        {canAdd && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPicker(true)}
            disabled={isAdding}
            className="h-8 border-2"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="mt-4 flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : attachments.length === 0 ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-border py-6 text-center">
          <Paperclip className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            No attachments yet
          </p>
          {canAdd && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPicker(true)}
              className="mt-3 border-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add from Drive
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {attachments.map((attachment) => {
            const Icon = getFileIcon(attachment.drive_mime_type);
            const isRemoving = removingId === attachment.id;

            return (
              <div
                key={attachment.id}
                className={`flex items-center gap-3 rounded-xl border-2 border-border p-3 transition-all ${
                  isRemoving ? "opacity-50" : ""
                }`}
              >
                {/* Thumbnail or Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {attachment.drive_thumbnail_url ? (
                    <img
                      src={attachment.drive_thumbnail_url}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <a
                    href={attachment.drive_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 truncate font-medium hover:underline"
                  >
                    {attachment.drive_file_name}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </a>
                  <p className="font-mono text-xs text-muted-foreground">
                    Added by {attachment.uploader?.full_name || attachment.uploader?.username || "Unknown"} on{" "}
                    {formatDate(attachment.created_at)}
                  </p>
                </div>

                {/* Remove button */}
                {canRemoveAttachment(attachment) && (
                  <button
                    onClick={() => handleRemove(attachment.id)}
                    disabled={isRemoving}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    title="Remove attachment"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Drive File Picker Modal */}
      <DriveFilePicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleFileSelect}
        title="Attach from Drive"
        excludeFileIds={existingFileIds}
      />
    </div>
  );
}