// DESTINATION: app/(dashboard)/drive/page.tsx

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Folder,
  File,
  FileText,
  FileSpreadsheet,
  FileImage,
  Film,
  Music,
  Archive,
  Presentation,
  Search,
  Download,
  ExternalLink,
  Copy,
  Trash2,
  Plus,
  Upload,
  FolderPlus,
  ChevronRight,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  MoreHorizontal,
  X,
  Edit3,
  Eye,
  Clock,
  HardDrive,
  Users,
  Star,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileType,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  parents?: string[];
  shared?: boolean;
  starred?: boolean;
  description?: string;
  owners?: { displayName: string; emailAddress: string }[];
  lastModifyingUser?: { displayName: string; emailAddress: string };
}

interface Breadcrumb {
  id: string;
  name: string;
}

type ViewMode = "grid" | "list";
type SortField = "name" | "modified" | "size";
type SortOrder = "asc" | "desc";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function getFileCategory(mimeType: string): string {
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

function formatBytes(bytes: string | number | undefined): string {
  if (!bytes) return "--";
  const b = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(b) || b === 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getFileIcon(category: string, className = "h-5 w-5") {
  const props = { className, strokeWidth: 1.5 };
  switch (category) {
    case "folder": return <Folder {...props} />;
    case "document": return <FileText {...props} />;
    case "spreadsheet": return <FileSpreadsheet {...props} />;
    case "presentation": return <Presentation {...props} />;
    case "pdf": return <FileType {...props} />;
    case "image": return <FileImage {...props} />;
    case "video": return <Film {...props} />;
    case "audio": return <Music {...props} />;
    case "archive": return <Archive {...props} />;
    case "form": return <FileText {...props} />;
    default: return <File {...props} />;
  }
}

function getFileIconBg(category: string): string {
  switch (category) {
    case "folder": return "bg-amber-50 text-amber-600 border-amber-200";
    case "document": return "bg-blue-50 text-blue-600 border-blue-200";
    case "spreadsheet": return "bg-green-50 text-green-600 border-green-200";
    case "presentation": return "bg-orange-50 text-orange-600 border-orange-200";
    case "pdf": return "bg-red-50 text-red-600 border-red-200";
    case "image": return "bg-purple-50 text-purple-600 border-purple-200";
    case "video": return "bg-pink-50 text-pink-600 border-pink-200";
    case "audio": return "bg-indigo-50 text-indigo-600 border-indigo-200";
    case "archive": return "bg-gray-50 text-gray-600 border-gray-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

/* ─── Toast ──────────────────────────────────────────────────────────── */

interface Toast {
  id: string;
  message: string;
  type: "success" | "error";
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 font-mono text-xs shadow-retro-sm animate-in slide-in-from-bottom-2 ${
            t.type === "success"
              ? "border-green-300 bg-green-50 text-green-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {t.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function DrivePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isSuperAdmin = profile?.role === "super_admin";

  // State
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // View & sort
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveFile[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // UI
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ file: DriveFile; x: number; y: number } | null>(null);
  const [renameFile, setRenameFile] = useState<DriveFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Toast helper ─────────────────────────────────────────────────── */

  const addToast = (message: string, type: "success" | "error" = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  /* ─── Fetch files ──────────────────────────────────────────────────── */

  const fetchFiles = useCallback(
    async (folderId?: string, append = false) => {
      if (!append) setIsLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          sort: sortField,
          order: sortOrder,
        });
        if (folderId) params.set("folderId", folderId);
        if (append && nextPageToken) params.set("pageToken", nextPageToken);

        const res = await fetch(`/api/drive/files?${params}`);
        if (!res.ok) throw new Error("Failed to load files");

        const data = await res.json();

        if (append) {
          setFiles((prev) => [...prev, ...(data.files || [])]);
        } else {
          setFiles(data.files || []);
          setBreadcrumbs(data.breadcrumbs || []);
          setCurrentFolderId(data.currentFolderId || "");
        }
        setNextPageToken(data.nextPageToken || null);
      } catch (err) {
        console.error(err);
        addToast("Failed to load files", "error");
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    [sortField, sortOrder, nextPageToken]
  );

  useEffect(() => {
    fetchFiles();
  }, []);

  /* ─── Navigate to folder ───────────────────────────────────────────── */

  const navigateToFolder = (folderId: string) => {
    setSearchQuery("");
    setSearchResults(null);
    setSelectedFile(null);
    setContextMenu(null);
    fetchFiles(folderId);
  };

  /* ─── Refresh ──────────────────────────────────────────────────────── */

  const handleRefresh = () => {
    setSelectedFile(null);
    setContextMenu(null);
    fetchFiles(currentFolderId || undefined);
  };

  /* ─── Sort ─────────────────────────────────────────────────────────── */

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  useEffect(() => {
    if (!isLoading && currentFolderId) {
      fetchFiles(currentFolderId);
    }
  }, [sortField, sortOrder]);

  /* ─── Search ───────────────────────────────────────────────────────── */

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (query.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/drive/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSearchResults(data.files || []);
      } catch {
        addToast("Search failed", "error");
      } finally {
        setIsSearching(false);
      }
    }, 400);
  };

  /* ─── Download (everyone) ──────────────────────────────────────────── */

  const handleDownload = async (file: DriveFile) => {
    addToast(`Downloading ${file.name}...`);
    try {
      const res = await fetch(`/api/drive/files/${file.id}?action=download`);
      if (!res.ok) throw new Error();

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Downloaded ${file.name}`);
    } catch {
      addToast("Download failed", "error");
    }
  };

  /* ─── Copy link ────────────────────────────────────────────────────── */

  const handleCopyLink = async (file: DriveFile) => {
    const link = file.webViewLink || file.webContentLink;
    if (link) {
      await navigator.clipboard.writeText(link);
      addToast("Link copied to clipboard");
    } else {
      try {
        const res = await fetch(`/api/drive/files/${file.id}?action=share`);
        const data = await res.json();
        if (data.webViewLink) {
          await navigator.clipboard.writeText(data.webViewLink);
          addToast("Link copied to clipboard");
        }
      } catch {
        addToast("Failed to copy link", "error");
      }
    }
  };

  /* ─── Open in Google ───────────────────────────────────────────────── */

  const handleOpenExternal = (file: DriveFile) => {
    if (file.webViewLink) {
      window.open(file.webViewLink, "_blank");
    }
  };

  /* ─── Upload (everyone) ────────────────────────────────────────────── */

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    const total = fileList.length;
    let uploaded = 0;

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      setUploadProgress(`Uploading ${f.name} (${i + 1}/${total})...`);

      const formData = new FormData();
      formData.append("file", f);
      if (currentFolderId) formData.append("folderId", currentFolderId);

      try {
        const res = await fetch("/api/drive/files", { method: "POST", body: formData });
        if (!res.ok) throw new Error();
        uploaded++;
      } catch {
        addToast(`Failed to upload ${f.name}`, "error");
      }
    }

    setIsUploading(false);
    setUploadProgress("");
    setShowUpload(false);

    if (uploaded > 0) {
      addToast(`${uploaded} file${uploaded > 1 ? "s" : ""} uploaded`);
      fetchFiles(currentFolderId || undefined);
    }
  };

  /* ─── Create folder (everyone) ─────────────────────────────────────── */

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);

    try {
      const res = await fetch("/api/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentFolderId || undefined,
        }),
      });

      if (!res.ok) throw new Error();
      addToast(`Folder "${newFolderName.trim()}" created`);
      setNewFolderName("");
      setShowNewFolder(false);
      fetchFiles(currentFolderId || undefined);
    } catch {
      addToast("Failed to create folder", "error");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  /* ─── Delete (super_admin only) ────────────────────────────────────── */

  const handleDelete = async (file: DriveFile) => {
    if (!isSuperAdmin) return;
    if (!confirm(`Move "${file.name}" to trash?`)) return;

    try {
      const res = await fetch(`/api/drive/files/${file.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      addToast(`"${file.name}" moved to trash`);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (selectedFile?.id === file.id) setSelectedFile(null);
    } catch {
      addToast("Failed to delete", "error");
    }
  };

  /* ─── Rename (admin/super_admin) ───────────────────────────────────── */

  const handleRename = async () => {
    if (!renameFile || !renameValue.trim() || !isAdmin) return;

    try {
      const res = await fetch(`/api/drive/files/${renameFile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error();

      setFiles((prev) =>
        prev.map((f) => (f.id === renameFile.id ? { ...f, name: renameValue.trim() } : f))
      );
      addToast("Renamed successfully");
      setRenameFile(null);
    } catch {
      addToast("Failed to rename", "error");
    }
  };

  /* ─── Drag & Drop (everyone) ───────────────────────────────────────── */

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  /* ─── Context menu ─────────────────────────────────────────────────── */

  const handleContextMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ file, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  /* ─── Display data ─────────────────────────────────────────────────── */

  const displayFiles = searchResults !== null ? searchResults : files;
  const folders = displayFiles.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
  const regularFiles = displayFiles.filter((f) => f.mimeType !== "application/vnd.google-apps.folder");

  const stats = {
    totalFiles: regularFiles.length,
    totalFolders: folders.length,
    totalSize: regularFiles.reduce((acc, f) => acc + (parseInt(f.size || "0", 10) || 0), 0),
  };

  /* ─── Render ───────────────────────────────────────────────────────── */

  return (
    <div
      className="space-y-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay — everyone can upload */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-foreground p-12">
            <Upload className="h-12 w-12 text-foreground" strokeWidth={1.5} />
            <p className="text-lg font-bold">Drop files to upload</p>
            <p className="font-mono text-sm text-muted-foreground">
              Files will be added to the current folder
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Drive</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Tek4All shared drive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            className="border-2 shadow-retro-sm"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          {/* Upload & New Folder — available to everyone */}
          <Button
            variant="outline"
            onClick={() => setShowNewFolder(true)}
            className="border-2 shadow-retro-sm"
          >
            <FolderPlus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            New Folder
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border-2 border-border bg-card p-3 shadow-retro-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50">
              <Folder className="h-4 w-4 text-amber-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-lg font-bold">{stats.totalFolders}</p>
              <p className="font-mono text-[10px] text-muted-foreground">Folders</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-3 shadow-retro-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
              <File className="h-4 w-4 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-lg font-bold">{stats.totalFiles}</p>
              <p className="font-mono text-[10px] text-muted-foreground">Files</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-3 shadow-retro-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
              <HardDrive className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-lg font-bold">{formatBytes(stats.totalSize)}</p>
              <p className="font-mono text-[10px] text-muted-foreground">Size (uploads)</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-3 shadow-retro-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-200 bg-green-50">
              <Users className="h-4 w-4 text-green-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-lg font-bold">
                {isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Member"}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">Your Role</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Controls bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search files and folders..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-xl border-2 border-border bg-card py-2.5 pl-10 pr-4 font-mono text-sm text-foreground placeholder-muted-foreground transition-all focus:border-foreground focus:outline-none focus:shadow-retro-sm"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {searchQuery && !isSearching && (
            <button
              onClick={() => { setSearchQuery(""); setSearchResults(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* View + Sort controls */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border-2 border-border">
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-l-md p-2 ${viewMode === "list" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded-r-md p-2 ${viewMode === "grid" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      {searchResults === null && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 font-mono text-sm">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button
                onClick={() => navigateToFolder(crumb.id)}
                className={`rounded-md px-2 py-0.5 transition-colors ${
                  i === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {searchResults !== null && (
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm text-muted-foreground">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
          </p>
          <button
            onClick={() => { setSearchQuery(""); setSearchResults(null); }}
            className="font-mono text-xs text-foreground underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Upload progress banner */}
      {isUploading && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <p className="font-mono text-sm text-blue-700">{uploadProgress}</p>
        </div>
      )}

      {/* File listing */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border-2 border-border bg-card" />
          ))}
        </div>
      ) : displayFiles.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
            <HardDrive className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            {searchResults !== null ? "No files match your search." : "This folder is empty."}
          </p>
          {searchResults === null && (
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 border-2 border-foreground bg-foreground text-background shadow-retro"
            >
              <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Upload Files
            </Button>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* ─── List View ────────────────────────────────────────────── */
        <div className="rounded-2xl border-2 border-border bg-card shadow-retro overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 border-b-2 border-border px-4 py-2.5 font-mono text-[10px] font-medium uppercase text-muted-foreground">
            <div className="col-span-6 sm:col-span-5">
              <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                Name <ArrowUpDown className="h-3 w-3" />
              </button>
            </div>
            <div className="col-span-3 hidden sm:block">
              <button onClick={() => handleSort("modified")} className="flex items-center gap-1 hover:text-foreground">
                Modified <ArrowUpDown className="h-3 w-3" />
              </button>
            </div>
            <div className="col-span-2 hidden sm:block">
              <button onClick={() => handleSort("size")} className="flex items-center gap-1 hover:text-foreground">
                Size <ArrowUpDown className="h-3 w-3" />
              </button>
            </div>
            <div className="col-span-6 sm:col-span-2 text-right">Actions</div>
          </div>

          {/* Folders first */}
          {folders.map((file) => (
            <FileListRow
              key={file.id}
              file={file}
              isAdmin={isAdmin}
              isSuperAdmin={isSuperAdmin}
              onNavigate={navigateToFolder}
              onSelect={setSelectedFile}
              onDownload={handleDownload}
              onCopyLink={handleCopyLink}
              onOpenExternal={handleOpenExternal}
              onDelete={handleDelete}
              onRename={(f) => { setRenameFile(f); setRenameValue(f.name); }}
              onContextMenu={handleContextMenu}
            />
          ))}

          {/* Then regular files */}
          {regularFiles.map((file) => (
            <FileListRow
              key={file.id}
              file={file}
              isAdmin={isAdmin}
              isSuperAdmin={isSuperAdmin}
              onNavigate={navigateToFolder}
              onSelect={setSelectedFile}
              onDownload={handleDownload}
              onCopyLink={handleCopyLink}
              onOpenExternal={handleOpenExternal}
              onDelete={handleDelete}
              onRename={(f) => { setRenameFile(f); setRenameValue(f.name); }}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      ) : (
        /* ─── Grid View ────────────────────────────────────────────── */
        <div>
          {folders.length > 0 && (
            <>
              <p className="mb-3 font-mono text-xs font-medium uppercase text-muted-foreground">
                Folders ({folders.length})
              </p>
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {folders.map((file) => (
                  <FileGridCard
                    key={file.id}
                    file={file}
                    isAdmin={isAdmin}
                    onNavigate={navigateToFolder}
                    onSelect={setSelectedFile}
                    onDownload={handleDownload}
                    onCopyLink={handleCopyLink}
                    onOpenExternal={handleOpenExternal}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            </>
          )}

          {regularFiles.length > 0 && (
            <>
              <p className="mb-3 font-mono text-xs font-medium uppercase text-muted-foreground">
                Files ({regularFiles.length})
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {regularFiles.map((file) => (
                  <FileGridCard
                    key={file.id}
                    file={file}
                    isAdmin={isAdmin}
                    onNavigate={navigateToFolder}
                    onSelect={setSelectedFile}
                    onDownload={handleDownload}
                    onCopyLink={handleCopyLink}
                    onOpenExternal={handleOpenExternal}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Load more */}
      {nextPageToken && searchResults === null && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchFiles(currentFolderId || undefined, true)}
            disabled={loadingMore}
            className="border-2 shadow-retro-sm"
          >
            {loadingMore ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Load More
          </Button>
        </div>
      )}

      {/* ─── Detail Side Panel ────────────────────────────────────────── */}
      {selectedFile && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l-2 border-border bg-card shadow-xl overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Panel header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 ${getFileIconBg(getFileCategory(selectedFile.mimeType))}`}>
                  {getFileIcon(getFileCategory(selectedFile.mimeType))}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{selectedFile.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {getFileCategory(selectedFile.mimeType)}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Thumbnail */}
            {selectedFile.thumbnailLink && (
              <div className="overflow-hidden rounded-xl border-2 border-border">
                <img
                  src={selectedFile.thumbnailLink.replace("=s220", "=s600")}
                  alt=""
                  className="w-full object-contain"
                />
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              {selectedFile.mimeType !== "application/vnd.google-apps.folder" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(selectedFile)}
                  className="border-2 text-xs"
                >
                  <Download className="mr-1 h-3 w-3" /> Download
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyLink(selectedFile)}
                className="border-2 text-xs"
              >
                <Copy className="mr-1 h-3 w-3" /> Copy Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenExternal(selectedFile)}
                className="border-2 text-xs"
              >
                <ExternalLink className="mr-1 h-3 w-3" /> Open
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRenameFile(selectedFile); setRenameValue(selectedFile.name); }}
                  className="border-2 text-xs"
                >
                  <Edit3 className="mr-1 h-3 w-3" /> Rename
                </Button>
              )}
              {isSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(selectedFile)}
                  className="col-span-2 border-2 text-xs text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Move to Trash
                </Button>
              )}
            </div>

            {/* Meta info */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase text-muted-foreground">
                <Eye className="h-3 w-3" /> Details
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-mono text-xs">{getFileCategory(selectedFile.mimeType)}</dd>
                </div>
                {selectedFile.size && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="font-mono text-xs">{formatBytes(selectedFile.size)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Modified</dt>
                  <dd className="font-mono text-xs">{formatDate(selectedFile.modifiedTime)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-mono text-xs">{formatDate(selectedFile.createdTime)}</dd>
                </div>
                {selectedFile.owners?.[0] && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd className="truncate font-mono text-xs">{selectedFile.owners[0].displayName}</dd>
                  </div>
                )}
                {selectedFile.lastModifyingUser && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Modified by</dt>
                    <dd className="truncate font-mono text-xs">
                      {selectedFile.lastModifyingUser.displayName}
                    </dd>
                  </div>
                )}
                {selectedFile.description && (
                  <div>
                    <dt className="mb-1 text-muted-foreground">Description</dt>
                    <dd className="rounded-lg border border-border bg-muted p-2 font-mono text-xs">
                      {selectedFile.description}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* ─── Context Menu ────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-48 rounded-xl border-2 border-border bg-card p-1 shadow-retro"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { setSelectedFile(contextMenu.file); setContextMenu(null); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
          >
            <Eye className="h-4 w-4" /> View Details
          </button>
          {contextMenu.file.mimeType !== "application/vnd.google-apps.folder" && (
            <button
              onClick={() => { handleDownload(contextMenu.file); setContextMenu(null); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Download
            </button>
          )}
          <button
            onClick={() => { handleCopyLink(contextMenu.file); setContextMenu(null); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
          >
            <Copy className="h-4 w-4" /> Copy Link
          </button>
          <button
            onClick={() => { handleOpenExternal(contextMenu.file); setContextMenu(null); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> Open in Google Drive
          </button>
          {isAdmin && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  setRenameFile(contextMenu.file);
                  setRenameValue(contextMenu.file.name);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <Edit3 className="h-4 w-4" /> Rename
              </button>
            </>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => { handleDelete(contextMenu.file); setContextMenu(null); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Move to Trash
            </button>
          )}
        </div>
      )}

      {/* ─── New Folder Modal ────────────────────────────────────────── */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/60" onClick={() => setShowNewFolder(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-lg font-bold">New Folder</h2>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
              className="mt-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-mono text-sm focus:border-foreground focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewFolder(false)} className="border-2">
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className="border-2 border-foreground bg-foreground text-background"
              >
                {isCreatingFolder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rename Modal ────────────────────────────────────────────── */}
      {renameFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/60" onClick={() => setRenameFile(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-lg font-bold">Rename</h2>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
              className="mt-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-mono text-sm focus:border-foreground focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameFile(null)} className="border-2">
                Cancel
              </Button>
              <Button
                onClick={handleRename}
                disabled={!renameValue.trim()}
                className="border-2 border-foreground bg-foreground text-background"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}

/* ─── List Row Component ─────────────────────────────────────────────── */

function FileListRow({
  file,
  isAdmin,
  isSuperAdmin,
  onNavigate,
  onSelect,
  onDownload,
  onCopyLink,
  onOpenExternal,
  onDelete,
  onRename,
  onContextMenu,
}: {
  file: DriveFile;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  onNavigate: (id: string) => void;
  onSelect: (f: DriveFile) => void;
  onDownload: (f: DriveFile) => void;
  onCopyLink: (f: DriveFile) => void;
  onOpenExternal: (f: DriveFile) => void;
  onDelete: (f: DriveFile) => void;
  onRename: (f: DriveFile) => void;
  onContextMenu: (e: React.MouseEvent, f: DriveFile) => void;
}) {
  const category = getFileCategory(file.mimeType);
  const isFolder = category === "folder";

  return (
    <div
      className="group grid grid-cols-12 gap-2 border-b border-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50 cursor-pointer"
      onClick={() => (isFolder ? onNavigate(file.id) : onSelect(file))}
      onContextMenu={(e) => onContextMenu(e, file)}
    >
      {/* Name */}
      <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${getFileIconBg(category)}`}>
          {getFileIcon(category, "h-4 w-4")}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.name}</p>
          {file.lastModifyingUser && (
            <p className="truncate font-mono text-[10px] text-muted-foreground sm:hidden">
              {formatDate(file.modifiedTime)}
            </p>
          )}
        </div>
      </div>

      {/* Modified */}
      <div className="col-span-3 hidden items-center sm:flex">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{formatDate(file.modifiedTime)}</p>
          {file.lastModifyingUser && (
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              by {file.lastModifyingUser.displayName}
            </p>
          )}
        </div>
      </div>

      {/* Size */}
      <div className="col-span-2 hidden items-center sm:flex">
        <span className="font-mono text-xs text-muted-foreground">
          {isFolder ? "--" : formatBytes(file.size)}
        </span>
      </div>

      {/* Actions */}
      <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1">
        {!isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file); }}
            className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onCopyLink(file); }}
          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
          title="Copy link"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenExternal(file); }}
          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
          title="Open in Drive"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
        {/* 3-dot menu: visible for admin (rename) or super_admin (rename + delete) */}
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onContextMenu(e, file); }}
            className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
            title="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Grid Card Component ────────────────────────────────────────────── */

function FileGridCard({
  file,
  isAdmin,
  onNavigate,
  onSelect,
  onDownload,
  onCopyLink,
  onOpenExternal,
  onContextMenu,
}: {
  file: DriveFile;
  isAdmin: boolean;
  onNavigate: (id: string) => void;
  onSelect: (f: DriveFile) => void;
  onDownload: (f: DriveFile) => void;
  onCopyLink: (f: DriveFile) => void;
  onOpenExternal: (f: DriveFile) => void;
  onContextMenu: (e: React.MouseEvent, f: DriveFile) => void;
}) {
  const category = getFileCategory(file.mimeType);
  const isFolder = category === "folder";

  return (
    <div
      className="group relative cursor-pointer rounded-xl border-2 border-border bg-card p-3 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro"
      onClick={() => (isFolder ? onNavigate(file.id) : onSelect(file))}
      onContextMenu={(e) => onContextMenu(e, file)}
    >
      {/* Thumbnail or icon */}
      <div className="flex h-20 items-center justify-center rounded-lg border border-border bg-background">
        {file.thumbnailLink && !isFolder ? (
          <img
            src={file.thumbnailLink}
            alt=""
            className="h-full w-full rounded-lg object-contain"
          />
        ) : (
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 ${getFileIconBg(category)}`}>
            {getFileIcon(category, "h-6 w-6")}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="mt-2">
        <p className="truncate text-xs font-medium">{file.name}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {isFolder ? formatDate(file.modifiedTime) : formatBytes(file.size)}
        </p>
      </div>

      {/* Hover actions */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file); }}
            className="rounded-lg border border-border bg-card p-1.5 shadow-sm hover:bg-muted"
            title="Download"
          >
            <Download className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onCopyLink(file); }}
          className="rounded-lg border border-border bg-card p-1.5 shadow-sm hover:bg-muted"
          title="Copy link"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}