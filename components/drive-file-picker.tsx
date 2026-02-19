"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  X,
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  Film,
  Music,
  Archive,
  Folder,
  Loader2,
  Check,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Match the response format from existing /api/drive/files
interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
}

interface Breadcrumb {
  id: string;
  name: string;
}

interface DriveFilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: GoogleDriveFile) => void;
  title?: string;
  excludeFileIds?: string[];
}

const MIME_TYPE_ICONS: Record<string, React.ElementType> = {
  "application/vnd.google-apps.folder": Folder,
  "application/vnd.google-apps.document": FileText,
  "application/vnd.google-apps.spreadsheet": FileSpreadsheet,
  "application/vnd.google-apps.presentation": Presentation,
  "application/pdf": FileText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileText,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileSpreadsheet,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": Presentation,
  "image/jpeg": Image,
  "image/png": Image,
  "image/gif": Image,
  "image/webp": Image,
  "video/mp4": Film,
  "video/quicktime": Film,
  "audio/mpeg": Music,
  "audio/wav": Music,
  "application/zip": Archive,
  "application/x-zip-compressed": Archive,
};

function getFileIcon(mimeType: string): React.ElementType {
  if (mimeType === "application/vnd.google-apps.folder") return Folder;
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("video/")) return Film;
  if (mimeType.startsWith("audio/")) return Music;
  return MIME_TYPE_ICONS[mimeType] || File;
}

function formatFileSize(bytes: string | undefined): string {
  if (!bytes) return "";
  const num = parseInt(bytes, 10);
  if (isNaN(num)) return "";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DriveFilePicker({
  isOpen,
  onClose,
  onSelect,
  title = "Attach from Drive",
  excludeFileIds = [],
}: DriveFilePickerProps) {
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);

  // Fetch files from existing API
  const fetchFiles = useCallback(async (folderId?: string, pageToken?: string) => {
    try {
      if (!pageToken) {
        setIsLoading(true);
        setFiles([]);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (pageToken) params.set("pageToken", pageToken);
      params.set("sort", "modified");
      params.set("order", "desc");

      const response = await fetch(`/api/drive/files?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.detail || "Failed to fetch files");
      }

      // Filter out excluded files and apply search filter client-side
      let filteredFiles = (data.files || []).filter(
        (f: GoogleDriveFile) => !excludeFileIds.includes(f.id)
      );

      if (search.trim()) {
        const searchLower = search.toLowerCase();
        filteredFiles = filteredFiles.filter((f: GoogleDriveFile) =>
          f.name.toLowerCase().includes(searchLower)
        );
      }

      if (pageToken) {
        setFiles((prev) => [...prev, ...filteredFiles]);
      } else {
        setFiles(filteredFiles);
      }

      setBreadcrumbs(data.breadcrumbs || []);
      setCurrentFolderId(data.currentFolderId || null);
      setNextPageToken(data.nextPageToken || null);

    } catch (err) {
      console.error("Error fetching files:", err);
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial fetch when opened - only trigger on isOpen change
  useEffect(() => {
    if (isOpen) {
      fetchFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setSelectedFile(null);
      setFiles([]);
      setBreadcrumbs([]);
      setCurrentFolderId(null);
      setNextPageToken(null);
    }
  }, [isOpen]);

  // Navigate to folder
  const handleFolderClick = (folderId: string) => {
    setSelectedFile(null);
    setSearch("");
    fetchFiles(folderId);
  };

  // Handle file/folder click
  const handleItemClick = (file: GoogleDriveFile) => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      handleFolderClick(file.id);
    } else {
      setSelectedFile(file);
    }
  };

  // Handle double-click to select immediately
  const handleItemDoubleClick = (file: GoogleDriveFile) => {
    if (file.mimeType !== "application/vnd.google-apps.folder") {
      onSelect(file);
      onClose();
    }
  };

  const handleSelect = () => {
    if (selectedFile) {
      onSelect(selectedFile);
      onClose();
    }
  };

  const handleLoadMore = () => {
    if (nextPageToken && !isLoadingMore) {
      fetchFiles(currentFolderId || undefined, nextPageToken);
    }
  };

  // Filter files by search (client-side for immediate feedback)
  const displayedFiles = search.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border-2 border-border bg-card shadow-retro-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Select a file from the shared Drive folder
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 border-b border-border px-6 py-2 text-sm overflow-x-auto">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1 shrink-0">
                {index > 0 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <button
                  onClick={() => handleFolderClick(crumb.id)}
                  className={`rounded px-2 py-1 hover:bg-muted ${
                    index === breadcrumbs.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="border-b-2 border-border px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter files..."
              className="border-2 pl-10"
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 font-mono text-sm text-muted-foreground">
                Loading files...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-center font-mono text-sm text-red-500">
                {error}
              </p>
              <Button
                variant="outline"
                onClick={() => fetchFiles(currentFolderId || undefined)}
                className="mt-4 border-2"
              >
                Try Again
              </Button>
            </div>
          ) : displayedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <File className="h-12 w-12 text-muted-foreground" />
              <p className="mt-2 font-mono text-sm text-muted-foreground">
                {search ? "No files match your filter" : "No files in this folder"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedFiles.map((file) => {
                const Icon = getFileIcon(file.mimeType);
                const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                const isSelected = selectedFile?.id === file.id;

                return (
                  <button
                    key={file.id}
                    onClick={() => handleItemClick(file)}
                    onDoubleClick={() => handleItemDoubleClick(file)}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected
                        ? "border-foreground bg-muted"
                        : "border-border hover:border-foreground/50"
                    } ${isFolder ? "cursor-pointer" : ""}`}
                  >
                    {/* Thumbnail or Icon */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isFolder ? "bg-amber-100" : "bg-muted"
                    }`}>
                      {file.thumbnailLink && !isFolder ? (
                        <img
                          src={file.thumbnailLink}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                            if (sibling) sibling.classList.remove("hidden");
                          }}
                        />
                      ) : null}
                      <Icon
                        className={`h-5 w-5 ${isFolder ? "text-amber-600" : "text-muted-foreground"} ${
                          file.thumbnailLink && !isFolder ? "hidden" : ""
                        }`}
                      />
                    </div>

                    {/* File Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {isFolder ? (
                          "Folder"
                        ) : (
                          <>
                            {formatDate(file.modifiedTime)}
                            {file.size ? ` • ${formatFileSize(file.size)}` : ""}
                          </>
                        )}
                      </p>
                    </div>

                    {/* Selection indicator or folder arrow */}
                    {isFolder ? (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    ) : isSelected ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground">
                        <Check className="h-4 w-4 text-background" />
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {/* Load More */}
              {nextPageToken && !search && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="border-2"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-border px-6 py-4">
          <div className="flex-1 min-w-0">
            {selectedFile && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                <span className="truncate font-mono text-sm">
                  {selectedFile.name}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-2"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSelect}
              disabled={!selectedFile}
              className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none disabled:transform-none"
            >
              Attach File
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { GoogleDriveFile };