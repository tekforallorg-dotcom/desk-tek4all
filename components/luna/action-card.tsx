/**
 * Luna Action Card — Preview + Confirm UI
 *
 * Iteration 5: Fixed label mapping for all action types.
 * Added playbook step progress indicator.
 */
"use client";

import Link from "next/link";
import { Check, X, ArrowUpRight, Loader2, AlertCircle } from "lucide-react";
import { useLuna } from "@/lib/luna/context";
import type { LunaActionPreview, PlaybookProgress } from "@/lib/luna/types";

const L = {
  surface: "#161616",
  border: "#2A2A2A",
  text: "#FFFFFF",
  muted: "#A0A0A0",
  dim: "#666666",
  success: "#22c55e",
  error: "#ef4444",
  accent: "#3A3A3A",
} as const;

/** Dynamic label from actionType */
const ACTION_LABELS: Record<string, string> = {
  create_task: "Create Task",
  update_task_status: "Update Task",
  create_programme: "Create Programme",
  update_programme_status: "Update Programme",
  playbook_step: "Run Mode",
};

function getActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ActionCardProps {
  action: LunaActionPreview;
  playbookProgress?: PlaybookProgress;
}

export function ActionCard({ action, playbookProgress }: ActionCardProps) {
  const { confirmAction, cancelAction, close, sendMessage } = useLuna();

  const isPending = action.status === "pending";
  const isConfirmed = action.status === "confirmed";
  const isCancelled = action.status === "cancelled";
  const isError = action.status === "error";
  const isPlaybookStep = !!playbookProgress;

  return (
    <div
      className="mt-1.5 rounded-lg p-2.5"
      style={{
        backgroundColor: L.surface,
        border: `1px solid ${L.border}`,
      }}
    >
      {/* Playbook step progress */}
      {playbookProgress && (
        <StepProgressBar progress={playbookProgress} />
      )}

      {/* Header */}
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className="text-[9px] font-semibold uppercase tracking-wide"
          style={{ color: L.muted }}
        >
          {getActionLabel(action.actionType)}
        </span>
        <StatusBadge status={action.status} />
      </div>

      {/* Title */}
      <p className="mb-1.5 text-[12px] font-medium" style={{ color: L.text }}>
        {action.title}
      </p>

      {/* Fields */}
      {action.fields.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {action.fields.map((field) => (
            <div key={field.label} className="flex justify-between text-[10px]">
              <span style={{ color: L.dim }}>{field.label}</span>
              <span style={{ color: L.muted }}>{field.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending — Confirm / Cancel */}
      {isPending && (
        <div className="flex gap-1.5">
          <button
            onClick={() => isPlaybookStep ? sendMessage("confirm") : confirmAction(action.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors duration-150 hover:opacity-90"
            style={{ backgroundColor: L.text, color: L.surface }}
          >
            <Check size={11} />
            Confirm
          </button>
          <button
            onClick={() => isPlaybookStep ? sendMessage("skip") : cancelAction(action.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors duration-150 hover:opacity-90"
            style={{ backgroundColor: "transparent", color: L.muted, border: `1px solid ${L.border}` }}
          >
            <X size={11} />
            {isPlaybookStep ? "Skip" : "Cancel"}
          </button>
        </div>
      )}

      {/* Confirmed — show result link */}
      {isConfirmed && (
        <div className="flex items-center gap-1.5">
          {action.resultHref ? (
            <Link
              href={action.resultHref}
              onClick={close}
              className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-80"
              style={{ color: L.success }}
            >
              <Check size={11} />
              {action.resultMessage || "Done"}
              <ArrowUpRight size={10} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: L.success }}>
              <Loader2 size={11} className="animate-spin" />
              Confirming...
            </span>
          )}
        </div>
      )}

      {/* Cancelled */}
      {isCancelled && (
        <p className="text-[11px]" style={{ color: L.dim }}>
          Action cancelled
        </p>
      )}

      {/* Error */}
      {isError && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: L.error }}>
          <AlertCircle size={11} />
          Action failed. Try again.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: "#2A2A2A", color: "#A0A0A0", label: "Review" },
    confirmed: { bg: "#14532d", color: "#22c55e", label: "Done" },
    cancelled: { bg: "#161616", color: "#666666", label: "Cancelled" },
    error: { bg: "#450a0a", color: "#ef4444", label: "Failed" },
  };
  const s = styles[status] || styles.pending;

  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[8px] font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

/* ── Playbook Step Progress (Run Mode) ── */

function StepProgressBar({ progress }: { progress: PlaybookProgress }) {
  const { playbookName, currentStep, totalSteps, stepTitle, completed, skipped } = progress;

  return (
    <div className="mb-2 pb-2" style={{ borderBottom: `1px solid ${L.border}` }}>
      {/* Playbook name */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: L.dim }}>
          Run Mode
        </span>
        <span className="text-[9px]" style={{ color: L.dim }}>
          Step {currentStep + 1} of {totalSteps}
        </span>
      </div>

      {/* Step dots */}
      <div className="mb-1.5 flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => {
          let bg: string = L.accent; // upcoming
          if (completed.includes(i)) bg = L.success;
          else if (skipped.includes(i)) bg = L.dim;
          else if (i === currentStep) bg = L.text;
          return (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-200"
              style={{ backgroundColor: bg }}
            />
          );
        })}
      </div>

      {/* Current step label */}
      <p className="text-[10px] font-medium" style={{ color: L.muted }}>
        {playbookName}: {stepTitle}
      </p>
    </div>
  );
}