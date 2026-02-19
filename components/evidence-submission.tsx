"use client";

import { useState } from "react";
import {
  ExternalLink,
  HardDrive,
  Link2,
  Send,
  Loader2,
  X,
  FileText,
  FileSpreadsheet,
  Image as FileImage,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DriveFilePicker } from "@/components/drive-file-picker";

// Match GoogleDriveFile from drive-file-picker (not exported)
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

interface EvidenceSubmissionProps {
  taskId: string;
  onSubmitSuccess: (evidenceLink: string, evidenceNotes: string | null) => void;
}

type EvidenceType = "drive" | "external";

export function EvidenceSubmission({ taskId, onSubmitSuccess }: EvidenceSubmissionProps) {
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("drive");
  const [selectedDriveFile, setSelectedDriveFile] = useState<GoogleDriveFile | null>(null);
  const [externalLink, setExternalLink] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    if (mimeType.includes("document") || mimeType.includes("word")) {
      return <FileText className="h-5 w-5 text-blue-600" />;
    }
    if (mimeType.includes("image")) {
      return <FileImage className="h-5 w-5 text-purple-600" />;
    }
    if (mimeType.includes("pdf")) {
      return <FileText className="h-5 w-5 text-red-600" />;
    }
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const handleDriveFileSelect = (file: GoogleDriveFile) => {
    setSelectedDriveFile(file);
    setShowDrivePicker(false);
    setError("");
  };

  const getEvidenceLink = (): string => {
    if (evidenceType === "drive" && selectedDriveFile) {
      return selectedDriveFile.webViewLink || `https://drive.google.com/file/d/${selectedDriveFile.id}/view`;
    }
    return externalLink.trim();
  };

  const canSubmit = (): boolean => {
    if (evidenceType === "drive") {
      return !!selectedDriveFile;
    }
    return !!externalLink.trim();
  };

  const handleSubmit = async () => {
    const link = getEvidenceLink();
    if (!link) {
      setError("Please select a file or enter a link");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}/submit-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence_link: link,
          evidence_notes: evidenceNotes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to submit evidence");
        setIsSubmitting(false);
        return;
      }

      // Success - notify parent
      onSubmitSuccess(link, evidenceNotes.trim() || null);
      
      // Reset form
      setSelectedDriveFile(null);
      setExternalLink("");
      setEvidenceNotes("");
    } catch (err) {
      console.error("Submit evidence error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="font-mono text-sm text-muted-foreground">
        This task requires evidence before it can be marked complete.
        Select a file from Google Drive or enter an external link.
      </p>

      {error && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Evidence Type Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setEvidenceType("drive")}
          className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-mono text-sm transition-all ${
            evidenceType === "drive"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
          }`}
        >
          <HardDrive className="h-4 w-4" />
          Google Drive
        </button>
        <button
          onClick={() => setEvidenceType("external")}
          className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-mono text-sm transition-all ${
            evidenceType === "external"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="h-4 w-4" />
          External Link
        </button>
      </div>

      {/* Drive Selection */}
      {evidenceType === "drive" && (
        <div className="space-y-3">
          {selectedDriveFile ? (
            <div className="flex items-center justify-between rounded-xl border-2 border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                {getFileIcon(selectedDriveFile.mimeType)}
                <div className="min-w-0">
                  <p className="font-medium text-green-800 truncate">
                    {selectedDriveFile.name}
                  </p>
                  <a
                    href={selectedDriveFile.webViewLink || `https://drive.google.com/file/d/${selectedDriveFile.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-xs text-green-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Drive
                  </a>
                </div>
              </div>
              <button
                onClick={() => setSelectedDriveFile(null)}
                className="text-green-600 hover:text-red-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setShowDrivePicker(true)}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 transition-all hover:border-foreground hover:bg-muted/50"
            >
              <HardDrive className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium text-foreground">
                Select from Google Drive
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                Choose a document, photo, or file as evidence
              </p>
            </div>
          )}
        </div>
      )}

      {/* External Link Input */}
      {evidenceType === "external" && (
        <div>
          <label className="font-mono text-xs text-muted-foreground">
            Evidence URL *
          </label>
          <Input
            type="url"
            value={externalLink}
            onChange={(e) => {
              setExternalLink(e.target.value);
              setError("");
            }}
            placeholder="https://example.com/my-evidence.pdf"
            className="mt-1 border-2"
          />
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Enter a link to your evidence (Dropbox, OneDrive, website, etc.)
          </p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="font-mono text-xs text-muted-foreground">
          Notes (optional)
        </label>
        <textarea
          value={evidenceNotes}
          onChange={(e) => setEvidenceNotes(e.target.value)}
          placeholder="Describe your evidence or add any relevant context..."
          rows={2}
          className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm focus:outline-none"
        />
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !canSubmit()}
        className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Submit for Review
          </>
        )}
      </Button>

      {/* Drive Picker Modal */}
      <DriveFilePicker
        isOpen={showDrivePicker}
        onSelect={handleDriveFileSelect}
        onClose={() => setShowDrivePicker(false)}
      />
    </div>
  );
}