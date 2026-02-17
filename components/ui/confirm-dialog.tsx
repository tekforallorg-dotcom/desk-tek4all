"use client";

import { X } from "lucide-react";
import { Button } from "./button";


interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - solid black with opacity */}
      <div
        className="absolute inset-0 bg-foreground/60"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border-2 border-foreground bg-card p-6 shadow-retro-lg">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-background text-muted-foreground shadow-retro-sm transition-all hover:border-foreground hover:text-foreground hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        {/* Icon */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-foreground bg-foreground shadow-retro-sm">
          <span className="font-mono text-2xl text-background">!</span>
        </div>

        {/* Content */}
        <div className="mt-5">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            {description}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            {cancelText}
          </Button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 font-medium shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50 ${
              variant === "danger"
                ? "border-foreground bg-foreground text-background"
                : "border-foreground bg-foreground text-background"
            }`}
          >
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
            ) : (
              confirmText
            )}
          </button>
        </div>

        {/* Retro corner accent */}
        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-br-xl border-b-2 border-r-2 border-foreground" />
      </div>
    </div>
  );
}