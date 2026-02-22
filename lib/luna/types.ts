/**
 * MoonDesk Luna — Shared Types
 *
 * Iteration 5: Added playbook step progress types.
 */

/* ── Message Types ── */

export type LunaMessageRole = "user" | "assistant";

export interface LunaResponseItem {
  label: string;
  detail?: string;
  href?: string;
}

export interface LunaMessage {
  id: string;
  role: LunaMessageRole;
  content: string;
  timestamp: Date;
  /** Deep-link result items (read operations) */
  items?: LunaResponseItem[];
  /** Action preview card (write operations) */
  action?: LunaActionPreview;
  /** Clarify mode indicator */
  clarify?: LunaClarifyInfo;
  /** Playbook step progress (Run Mode) */
  playbookProgress?: PlaybookProgress;
}

/* ── Action Preview (Preview + Confirm) ── */

export type LunaActionStatus = "pending" | "confirmed" | "cancelled" | "error";

export interface LunaActionField {
  label: string;
  value: string;
}

export interface LunaActionPreview {
  id: string;
  actionType: string;
  title: string;
  fields: LunaActionField[];
  status: LunaActionStatus;
  /** Payload sent to /api/luna/action/confirm */
  payload: Record<string, unknown>;
  /** Result after confirm */
  resultHref?: string;
  resultMessage?: string;
}

/* ── Clarify Mode ── */

export interface LunaClarifyInfo {
  /** What Luna is waiting for */
  waitingFor: string;
  /** Example input */
  example?: string;
  /** The pending intent type */
  intentType: string;
}

/* ── Playbook Progress (Run Mode, Iteration 5) ── */

export interface PlaybookProgress {
  playbookName: string;
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
  stepType: "check" | "action" | "summary";
  completed: number[];
  skipped: number[];
}

/* ── Page Context ── */

export type LunaPageContext =
  | "Dashboard"
  | "Programmes"
  | "Programme Detail"
  | "Tasks"
  | "Task Detail"
  | "Team"
  | "Check-ins"
  | "Messaging"
  | "Shared Mail"
  | "Drive"
  | "Calendar"
  | "Activity"
  | "Analytics"
  | "Control Tower"
  | "Settings";

/* ── Quick Action Chip ── */

export interface LunaQuickAction {
  label: string;
  prompt: string;
}