/**
 * Luna Quick Actions — Role-Aware Compact Chip Row
 *
 * Horizontally scrollable, small chips.
 * Managers+ see programme and insight chips.
 * Members see task-only chips.
 */
"use client";

import type { LunaQuickAction } from "@/lib/luna/types";

const L = {
  surface: "#161616",
  border: "#2A2A2A",
  text: "#A0A0A0",
} as const;

const MEMBER_ACTIONS: LunaQuickAction[] = [
  { label: "Create task", prompt: "Create a task" },
  { label: "My overdue", prompt: "Show my overdue tasks" },
  { label: "Check-ins", prompt: "Who missed check-in this week?" },
  { label: "Blockers", prompt: "What is blocking my team?" },
];

const MANAGER_ACTIONS: LunaQuickAction[] = [
  { label: "Create task", prompt: "Create a task" },
  { label: "Create programme", prompt: "Create a programme" },
  { label: "My overdue", prompt: "Show my overdue tasks" },
  { label: "Team overdue", prompt: "Team overdue" },
  { label: "Team summary", prompt: "Team summary" },
  { label: "Weekly review", prompt: "Weekly review" },
  { label: "Check-ins", prompt: "Who missed check-in this week?" },
  { label: "Blockers", prompt: "What is blocking my team?" },
];

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  /** User role — managers+ get extra chips */
  userRole?: string | null;
  actions?: LunaQuickAction[];
  /** Disable all chips (e.g. while typing) */
  disabled?: boolean;
}

export function QuickActions({
  onAction,
  userRole,
  actions,
  disabled,
}: QuickActionsProps) {
  const isManager = userRole === "manager" || userRole === "admin" || userRole === "super_admin";
  const chipActions = actions || (isManager ? MANAGER_ACTIONS : MEMBER_ACTIONS);

  return (
    <div
      className="luna-chips-scroll shrink-0 overflow-x-auto px-3.5 py-1.5"
      style={{ borderTop: `1px solid ${L.border}` }}
    >
      <div className="flex gap-1.5">
        {chipActions.map((a) => (
          <button
            key={a.label}
            onClick={() => !disabled && onAction(a.prompt)}
            disabled={disabled}
            className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: L.surface,
              color: L.text,
              border: `1px solid ${L.border}`,
            }}
            type="button"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}