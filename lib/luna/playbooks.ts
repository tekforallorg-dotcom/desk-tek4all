/**
 * MoonDesk Luna — Playbook Definitions & Runner
 *
 * Run Mode: Multi-step guided workflows.
 * Playbooks: Close Programme, Start Programme, Weekly Manager Review.
 * Each step checks data, proposes an action, or summarizes results.
 * All action steps require explicit user confirmation.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { fuzzySearchProgrammes } from "./fuzzy";

/* ── Types ── */

export interface PlaybookContext {
  targetId?: string;
  targetName?: string;
  [key: string]: unknown;
}

export interface StepPresentation {
  text: string;
  items: { label: string; detail?: string; href?: string }[];
  fields: { label: string; value: string }[];
  /** Data to merge into playbook context for later steps */
  context?: Record<string, unknown>;
}

export interface StepExecuteResult {
  success: boolean;
  message: string;
  href?: string;
  context?: Record<string, unknown>;
}

export interface PlaybookStep {
  id: string;
  title: string;
  type: "check" | "action" | "summary";
  /** Present the step — show data, explain what will happen */
  run: (
    supabase: SupabaseClient,
    userId: string,
    ctx: PlaybookContext
  ) => Promise<StepPresentation>;
  /** Execute the action on confirm (action steps only) */
  execute?: (
    supabase: SupabaseClient,
    userId: string,
    ctx: PlaybookContext
  ) => Promise<StepExecuteResult>;
}

export interface PlaybookDef {
  id: string;
  name: string;
  description: string;
  requiredRoles: string[];
  requiresTarget: "programme" | "none";
  steps: PlaybookStep[];
}

/** State stored in luna_pending_actions.draft_payload */
export interface PlaybookState {
  playbook_id: string;
  current_step: number;
  target_id?: string;
  target_name?: string;
  completed: number[];
  skipped: number[];
  context: PlaybookContext;
}

/* ── Registry ── */

export const PLAYBOOKS: Record<string, PlaybookDef> = {
  close_programme: closeProgrammePlaybook(),
  start_programme: startProgrammePlaybook(),
  weekly_review: weeklyReviewPlaybook(),
};

export function getPlaybook(id: string): PlaybookDef | undefined {
  return PLAYBOOKS[id];
}

export function isPlaybookIntent(intentType: string): boolean {
  return intentType.startsWith("playbook_");
}

export function getPlaybookIdFromIntent(intentType: string): string {
  return intentType.replace("playbook_", "");
}

/* ── Target Resolution ── */

export async function resolvePlaybookTarget(
  supabase: SupabaseClient,
  targetQuery: string
): Promise<{ id: string; name: string } | null> {
  const matches = await fuzzySearchProgrammes(supabase, targetQuery, {
    bestOnly: true,
    threshold: 0.3,
  });
  if (matches.length === 0) return null;
  return { id: matches[0].item.id, name: matches[0].item.name };
}

/* ── Initial State Factory ── */

export function createPlaybookState(
  playbookId: string,
  target?: { id: string; name: string }
): PlaybookState {
  return {
    playbook_id: playbookId,
    current_step: 0,
    target_id: target?.id,
    target_name: target?.name,
    completed: [],
    skipped: [],
    context: {
      targetId: target?.id,
      targetName: target?.name,
    },
  };
}

/* ── Hierarchy Helpers (mirrors tools.ts pattern) ── */

async function getReportIds(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<string[]> {
  if (role === "admin" || role === "super_admin") {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .neq("id", userId);
    return (data || []).map((p) => p.id);
  }
  const { data } = await supabase
    .from("hierarchy")
    .select("member_id")
    .eq("manager_id", userId);
  return (data || []).map((h) => h.member_id);
}

/* ══════════════════════════════════════════════════════════
   CLOSE PROGRAMME
   ══════════════════════════════════════════════════════════ */

function closeProgrammePlaybook(): PlaybookDef {
  return {
    id: "close_programme",
    name: "Close Programme",
    description: "Archive open tasks and mark a programme as completed",
    requiredRoles: ["manager", "admin", "super_admin"],
    requiresTarget: "programme",
    steps: [
      {
        id: "audit_tasks",
        title: "Audit Open Tasks",
        type: "check",
        run: async (supabase, _userId, ctx) => {
          const { data: tasks } = await supabase
            .from("tasks")
            .select("id, title, status, priority, due_date")
            .eq("programme_id", ctx.targetId)
            .neq("status", "done")
            .order("due_date", { ascending: true });

          const open = tasks || [];
          if (open.length === 0) {
            return {
              text: `All tasks in "${ctx.targetName}" are already done or there are none. Programme is ready to close.`,
              items: [],
              fields: [
                { label: "Programme", value: ctx.targetName || "" },
                { label: "Open tasks", value: "0" },
              ],
              context: { openTaskCount: 0, openTaskIds: [] },
            };
          }

          const byStatus: Record<string, number> = {};
          for (const t of open) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
          const summary = Object.entries(byStatus)
            .map(([s, c]) => `${c} ${s}`)
            .join(", ");

          return {
            text: `"${ctx.targetName}" has ${open.length} task${open.length !== 1 ? "s" : ""} still open (${summary}). These need to be resolved before closing.`,
            items: open.slice(0, 8).map((t) => ({
              label: t.title,
              detail: `${t.status}${t.due_date ? " · due " + t.due_date : ""}`,
              href: `/tasks/${t.id}`,
            })),
            fields: [
              { label: "Programme", value: ctx.targetName || "" },
              { label: "Open tasks", value: String(open.length) },
              { label: "Breakdown", value: summary },
            ],
            context: { openTaskCount: open.length, openTaskIds: open.map((t) => t.id) },
          };
        },
      },

      {
        id: "complete_tasks",
        title: "Complete Open Tasks",
        type: "action",
        run: async (_supabase, _userId, ctx) => {
          const count = (ctx.openTaskCount as number) || 0;
          if (count === 0) {
            return {
              text: "No tasks to complete — auto-skipping.",
              items: [],
              fields: [],
              context: { tasksCompleted: 0 },
            };
          }
          return {
            text: `Mark all ${count} open task${count !== 1 ? "s" : ""} as done?`,
            items: [],
            fields: [
              { label: "Action", value: `Set ${count} task${count !== 1 ? "s" : ""} → Done` },
              { label: "Programme", value: ctx.targetName || "" },
            ],
          };
        },
        execute: async (supabase, userId, ctx) => {
          const ids = (ctx.openTaskIds as string[]) || [];
          if (ids.length === 0) {
            return { success: true, message: "No tasks to complete.", context: { tasksCompleted: 0 } };
          }

          const { error } = await supabase
            .from("tasks")
            .update({ status: "done" })
            .in("id", ids);

          if (error) return { success: false, message: `Failed: ${error.message}` };

          await supabase.from("audit_logs").insert({
            user_id: userId,
            action: "tasks_bulk_completed",
            entity_type: "programme",
            entity_id: ctx.targetId,
            details: {
              programme_name: ctx.targetName,
              task_count: ids.length,
              source: "luna_playbook",
            },
          });

          return {
            success: true,
            message: `${ids.length} task${ids.length !== 1 ? "s" : ""} marked as done.`,
            context: { tasksCompleted: ids.length },
          };
        },
      },

      {
        id: "close_status",
        title: "Mark Programme Completed",
        type: "action",
        run: async (supabase, _userId, ctx) => {
          const { data: prog } = await supabase
            .from("programmes")
            .select("status")
            .eq("id", ctx.targetId)
            .single();

          return {
            text: `Update "${ctx.targetName}" status to Completed?`,
            items: [],
            fields: [
              { label: "Programme", value: ctx.targetName || "" },
              { label: "From", value: prog?.status || "unknown" },
              { label: "To", value: "Completed" },
            ],
          };
        },
        execute: async (supabase, userId, ctx) => {
          const { error } = await supabase
            .from("programmes")
            .update({ status: "completed" })
            .eq("id", ctx.targetId);

          if (error) return { success: false, message: `Failed: ${error.message}` };

          await supabase.from("audit_logs").insert({
            user_id: userId,
            action: "programme_status_updated",
            entity_type: "programme",
            entity_id: ctx.targetId,
            details: {
              name: ctx.targetName,
              to_status: "completed",
              source: "luna_playbook",
            },
          });

          return {
            success: true,
            message: `"${ctx.targetName}" marked as completed.`,
            href: `/programmes/${ctx.targetId}`,
            context: { programmeClosed: true },
          };
        },
      },

      {
        id: "summary",
        title: "Closure Summary",
        type: "summary",
        run: async (_supabase, _userId, ctx) => {
          const tc = (ctx.tasksCompleted as number) || 0;
          return {
            text: [
              `✓ Programme "${ctx.targetName}" closed.`,
              "",
              `Tasks completed: ${tc}`,
              `Status: Completed`,
            ].join("\n"),
            items: [{ label: `View ${ctx.targetName}`, detail: "Completed", href: `/programmes/${ctx.targetId}` }],
            fields: [],
          };
        },
      },
    ],
  };
}

/* ══════════════════════════════════════════════════════════
   START PROGRAMME
   ══════════════════════════════════════════════════════════ */

function startProgrammePlaybook(): PlaybookDef {
  return {
    id: "start_programme",
    name: "Start Programme",
    description: "Activate a draft programme and create a kickoff task",
    requiredRoles: ["manager", "admin", "super_admin"],
    requiresTarget: "programme",
    steps: [
      {
        id: "verify",
        title: "Verify Programme",
        type: "check",
        run: async (supabase, _userId, ctx) => {
          const { data: prog } = await supabase
            .from("programmes")
            .select("status, description, start_date, end_date")
            .eq("id", ctx.targetId)
            .single();

          if (!prog) return { text: "Programme not found.", items: [], fields: [] };

          if (prog.status === "active") {
            return {
              text: `"${ctx.targetName}" is already active.`,
              items: [{ label: ctx.targetName!, detail: "Active", href: `/programmes/${ctx.targetId}` }],
              fields: [{ label: "Status", value: "Already active" }],
              context: { alreadyActive: true },
            };
          }

          return {
            text: `Ready to activate "${ctx.targetName}".`,
            items: [],
            fields: [
              { label: "Programme", value: ctx.targetName || "" },
              { label: "Current status", value: prog.status },
              { label: "Description", value: prog.description || "—" },
            ],
          };
        },
      },

      {
        id: "activate",
        title: "Activate Programme",
        type: "action",
        run: async (_s, _u, ctx) => {
          if (ctx.alreadyActive) return { text: "Already active — auto-skipping.", items: [], fields: [] };
          return {
            text: `Set "${ctx.targetName}" to Active?`,
            items: [],
            fields: [
              { label: "Programme", value: ctx.targetName || "" },
              { label: "Action", value: "Draft → Active" },
            ],
          };
        },
        execute: async (supabase, userId, ctx) => {
          if (ctx.alreadyActive) return { success: true, message: "Already active." };

          const { error } = await supabase
            .from("programmes")
            .update({ status: "active" })
            .eq("id", ctx.targetId);
          if (error) return { success: false, message: error.message };

          await supabase.from("audit_logs").insert({
            user_id: userId,
            action: "programme_status_updated",
            entity_type: "programme",
            entity_id: ctx.targetId,
            details: { name: ctx.targetName, to_status: "active", source: "luna_playbook" },
          });

          return { success: true, message: `"${ctx.targetName}" is now active.`, href: `/programmes/${ctx.targetId}` };
        },
      },

      {
        id: "kickoff",
        title: "Create Kickoff Task",
        type: "action",
        run: async (_s, _u, ctx) => ({
          text: `Create a kickoff task for "${ctx.targetName}"?`,
          items: [],
          fields: [
            { label: "Task", value: `Kickoff: ${ctx.targetName}` },
            { label: "Priority", value: "high" },
            { label: "Programme", value: ctx.targetName || "" },
          ],
        }),
        execute: async (supabase, userId, ctx) => {
          const { data: task, error } = await supabase
            .from("tasks")
            .insert({
              title: `Kickoff: ${ctx.targetName}`,
              status: "todo",
              priority: "high",
              programme_id: ctx.targetId,
              created_by: userId,
              assignee_id: userId,
            })
            .select("id")
            .single();

          if (error) return { success: false, message: error.message };

          await supabase.from("task_assignees").insert({
            task_id: task.id,
            user_id: userId,
            assigned_by: userId,
          });

          await supabase.from("audit_logs").insert({
            user_id: userId,
            action: "task_created",
            entity_type: "task",
            entity_id: task.id,
            details: { title: `Kickoff: ${ctx.targetName}`, source: "luna_playbook" },
          });

          return { success: true, message: "Kickoff task created.", href: `/tasks/${task.id}` };
        },
      },

      {
        id: "summary",
        title: "Programme Started",
        type: "summary",
        run: async (_s, _u, ctx) => ({
          text: `✓ "${ctx.targetName}" is active and ready.`,
          items: [{ label: `View ${ctx.targetName}`, detail: "Active", href: `/programmes/${ctx.targetId}` }],
          fields: [],
        }),
      },
    ],
  };
}

/* ══════════════════════════════════════════════════════════
   WEEKLY MANAGER REVIEW
   ══════════════════════════════════════════════════════════ */

function weeklyReviewPlaybook(): PlaybookDef {
  return {
    id: "weekly_review",
    name: "Weekly Manager Review",
    description: "Review overdue tasks, blockers, and check-in status across your team",
    requiredRoles: ["manager", "admin", "super_admin"],
    requiresTarget: "none",
    steps: [
      {
        id: "overdue",
        title: "Team Overdue Tasks",
        type: "check",
        run: async (supabase, userId, _ctx) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .single();
          const role = profile?.role || "member";
          const reportIds = await getReportIds(supabase, userId, role);

          if (reportIds.length === 0) {
            return { text: "No direct reports found.", items: [], fields: [] };
          }

          const today = new Date().toISOString().split("T")[0];
          const { data: assignments } = await supabase
            .from("task_assignees")
            .select("task_id")
            .in("user_id", reportIds);

          const taskIds = [...new Set((assignments || []).map((a) => a.task_id))];

          const { data: overdue } = taskIds.length > 0
            ? await supabase
                .from("tasks")
                .select("id, title, status, due_date")
                .in("id", taskIds)
                .lt("due_date", today)
                .neq("status", "done")
                .order("due_date", { ascending: true })
                .limit(15)
            : { data: [] };

          const count = overdue?.length || 0;

          return {
            text: count > 0
              ? `${count} overdue task${count !== 1 ? "s" : ""} across your team:`
              : "No overdue tasks. Your team is on track!",
            items: (overdue || []).map((t) => ({
              label: t.title,
              detail: `${t.status} · due ${t.due_date}`,
              href: `/tasks/${t.id}`,
            })),
            fields: [
              { label: "Team size", value: String(reportIds.length) },
              { label: "Overdue", value: String(count) },
            ],
            context: { reportIds, overdueCount: count, teamSize: reportIds.length },
          };
        },
      },

      {
        id: "blockers",
        title: "Team Blockers",
        type: "check",
        run: async (supabase, _userId, ctx) => {
          const reportIds = (ctx.reportIds as string[]) || [];
          if (reportIds.length === 0) {
            return { text: "No team data available.", items: [], fields: [] };
          }

          const { data: assignments } = await supabase
            .from("task_assignees")
            .select("task_id")
            .in("user_id", reportIds);

          const taskIds = [...new Set((assignments || []).map((a) => a.task_id))];

          const { data: blocked } = taskIds.length > 0
            ? await supabase
                .from("tasks")
                .select("id, title, priority")
                .in("id", taskIds)
                .eq("status", "blocked")
                .limit(10)
            : { data: [] };

          const count = blocked?.length || 0;

          return {
            text: count > 0
              ? `${count} blocked task${count !== 1 ? "s" : ""}:`
              : "No blocked tasks. All clear.",
            items: (blocked || []).map((t) => ({
              label: t.title,
              detail: t.priority,
              href: `/tasks/${t.id}`,
            })),
            fields: [{ label: "Blocked", value: String(count) }],
            context: { blockerCount: count },
          };
        },
      },

      {
        id: "checkins",
        title: "Check-in Status",
        type: "check",
        run: async (supabase, _userId, ctx) => {
          const reportIds = (ctx.reportIds as string[]) || [];
          if (reportIds.length === 0) {
            return { text: "No team data available.", items: [], fields: [] };
          }

          // Get this week's Monday
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(now);
          monday.setDate(diff);
          const weekStart = monday.toISOString().split("T")[0];

          const { data: checkins } = await supabase
            .from("weekly_checkins")
            .select("user_id")
            .gte("week_start", weekStart)
            .in("user_id", reportIds);

          const checkedIn = new Set((checkins || []).map((c) => c.user_id));
          const missed = reportIds.filter((id) => !checkedIn.has(id));

          if (missed.length === 0) {
            return {
              text: "All team members have checked in this week.",
              items: [],
              fields: [{ label: "Checked in", value: `${reportIds.length}/${reportIds.length}` }],
              context: { missedCheckins: 0 },
            };
          }

          // Get names of people who missed
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, username")
            .in("id", missed);

          return {
            text: `${missed.length} team member${missed.length !== 1 ? "s" : ""} haven't checked in:`,
            items: (profiles || []).map((p) => ({
              label: p.full_name || p.username || "Unknown",
              detail: "Missing check-in",
              href: "/check-ins",
            })),
            fields: [
              { label: "Checked in", value: `${reportIds.length - missed.length}/${reportIds.length}` },
              { label: "Missing", value: String(missed.length) },
            ],
            context: { missedCheckins: missed.length },
          };
        },
      },

      {
        id: "summary",
        title: "Weekly Summary",
        type: "summary",
        run: async (_s, _u, ctx) => {
          const overdue = (ctx.overdueCount as number) || 0;
          const blockers = (ctx.blockerCount as number) || 0;
          const missed = (ctx.missedCheckins as number) || 0;
          const teamSize = (ctx.teamSize as number) || 0;

          const lines = [
            `✓ Weekly review complete for ${teamSize} team members.`,
            "",
            `Overdue tasks: ${overdue}`,
            `Blocked tasks: ${blockers}`,
            `Missed check-ins: ${missed}`,
          ];

          if (overdue === 0 && blockers === 0 && missed === 0) {
            lines.push("", "Everything looks good this week!");
          } else {
            lines.push("", "Consider following up on the items above.");
          }

          return { text: lines.join("\n"), items: [], fields: [] };
        },
      },
    ],
  };
}