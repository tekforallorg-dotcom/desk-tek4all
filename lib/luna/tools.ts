/**
 * MoonDesk Luna — Tool Executor
 *
 * Agent upgrade: Write-preview tools + noise stripping for search.
 * Read tools return items with deep links.
 * Write tools return action previews — actual write at /api/luna/action/confirm.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { LunaToolName } from "./gemini";
import { stripNoiseWords } from "./preprocessor";
import { fuzzySearchProgrammes, fuzzySearchUsers, fuzzySearchTasks } from "./fuzzy";

/* ── Result Types ── */

export interface LunaResultItem {
  label: string;
  detail?: string;
  href?: string;
}

export interface LunaActionPreviewData {
  actionType: "create_task" | "update_task_status" | "create_programme" | "update_programme_status" | "update_programme_fields" | "playbook_step";
  title: string;
  fields: { label: string; value: string }[];
  /** Payload sent to confirm endpoint */
  payload: Record<string, unknown>;
}

export interface LunaToolResult {
  text: string;
  items: LunaResultItem[];
  action?: LunaActionPreviewData;
}

/* ── Tool Registry ── */

type ToolFn = (
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
) => Promise<LunaToolResult>;

const TOOLS: Record<LunaToolName, ToolFn> = {
  search_tasks: searchTasks,
  search_programmes: searchProgrammes,
  search_users: searchUsers,
  get_my_overdue_tasks: getMyOverdueTasks,
  get_my_tasks: getMyTasks,
  get_checkin_status: getCheckinStatus,
  get_programme_health: getProgrammeHealth,
  get_blockers: getBlockers,
  navigate: handleNavigate,
  general_answer: handleGeneralAnswer,
  create_task: previewCreateTask,
  update_task_status: previewUpdateTaskStatus,
  create_programme: previewCreateProgramme,
  update_programme_status: previewUpdateProgrammeStatus,
  update_programme_fields: previewUpdateProgrammeFields,
  get_team_overdue: getTeamOverdue,
  get_team_summary: getTeamSummary,
  run_playbook: handleRunPlaybook,
};

export async function executeTool(
  toolName: LunaToolName,
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const fn = TOOLS[toolName];
  if (!fn) {
    return { text: "I don't know how to do that yet.", items: [] };
  }

  try {
    return await fn(supabase, userId, params);
  } catch (error) {
    console.error(`Luna tool error (${toolName}):`, error);
    return { text: "Something went wrong running that query. Please try again.", items: [] };
  }
}

/* ══════════════════════════════════════════════════════════
   WRITE PREVIEW TOOLS (Iteration 3)
   ══════════════════════════════════════════════════════════ */

async function previewCreateTask(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const rawTitle = String(params.title || "").trim();

  // Reject empty or generic titles — ask user to specify
  const genericTitles = ["", "task", "new task", "a task", "new", "the task"];
  if (genericTitles.includes(rawTitle.toLowerCase())) {
    return {
      text: "What should the task be called? For example: \"Create a task called Review Q1 budget\"",
      items: [],
    };
  }

  const title = rawTitle;

  const description = String(params.description || "").trim() || undefined;
  const priority = String(params.priority || "medium").trim();
  const dueDate = String(params.due_date || "").trim() || undefined;
  const programmeName = String(params.programme_name || "").trim() || undefined;
  const assigneeName = String(params.assignee_name || "").trim() || undefined;

  // Resolve programme ID if name given — fuzzy matching
  let programmeId: string | undefined;
  let resolvedProgrammeName: string | undefined;
  if (programmeName) {
    const matches = await fuzzySearchProgrammes(supabase, programmeName, { bestOnly: true, threshold: 0.3 });
    if (matches.length > 0) {
      programmeId = matches[0].item.id;
      resolvedProgrammeName = matches[0].item.name;
    }
  }

  // Resolve assignee ID if name given — fuzzy matching
  let assigneeId: string | undefined;
  let resolvedAssigneeName: string | undefined;
  if (assigneeName) {
    const matches = await fuzzySearchUsers(supabase, assigneeName, { bestOnly: true, threshold: 0.3 });
    if (matches.length > 0) {
      assigneeId = matches[0].item.id;
      resolvedAssigneeName = matches[0].item.full_name || assigneeName;
    }
  }

  // Build fields for preview card
  const fields: { label: string; value: string }[] = [
    { label: "Title", value: title },
    { label: "Priority", value: priority },
    { label: "Status", value: "todo" },
  ];
  if (dueDate) fields.push({ label: "Due", value: dueDate });
  if (resolvedProgrammeName) fields.push({ label: "Programme", value: resolvedProgrammeName });
  if (resolvedAssigneeName) fields.push({ label: "Assignee", value: resolvedAssigneeName });

  return {
    text: "Here's the task I'll create:",
    items: [],
    action: {
      actionType: "create_task",
      title: `Create: ${title}`,
      fields,
      payload: {
        title,
        description: description || null,
        status: "todo",
        priority,
        due_date: dueDate || null,
        programme_id: programmeId || null,
        assignee_id: assigneeId || userId,
        created_by: userId,
        evidence_required: false,
      },
    },
  };
}

async function previewUpdateTaskStatus(
  supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const rawTaskTitle = String(params.task_title || "").trim();
  const newStatus = String(params.new_status || "").trim();

  if (!rawTaskTitle) {
    return { text: "Which task do you want to update? Give me the task name.", items: [] };
  }
  if (!newStatus) {
    return { text: "What status should I set? Options: todo, in_progress, pending_review, done, blocked.", items: [] };
  }

  const validStatuses = ["todo", "in_progress", "pending_review", "done", "blocked"];
  if (!validStatuses.includes(newStatus)) {
    return {
      text: `"${newStatus}" isn't a valid status. Options: ${validStatuses.join(", ")}.`,
      items: [],
    };
  }

  // Strip noise words from search query
  const taskTitle = stripNoiseWords(rawTaskTitle);

  if (!taskTitle) {
    return { text: "I couldn't figure out which task you mean. What's the task name?", items: [] };
  }

  // Find the task — fuzzy matching
  const taskMatches = await fuzzySearchTasks(supabase, taskTitle, { limit: 5, threshold: 0.3 });

  if (taskMatches.length === 0) {
    return { text: `No task found matching "${taskTitle}". Check the name and try again.`, items: [] };
  }

  // If best match is fuzzy (not exact substring), confirm with user
  if (taskMatches[0].matchType === "fuzzy" && taskMatches[0].score < 0.7 && taskMatches.length > 1) {
    return {
      text: `I couldn't find an exact match for "${taskTitle}". Did you mean one of these?`,
      items: taskMatches.map((m) => ({
        label: m.item.title,
        detail: `${m.item.status} · ${Math.round(m.score * 100)}% match`,
        href: `/tasks/${m.item.id}`,
      })),
    };
  }

  // If multiple exact matches, ask user to be specific
  if (taskMatches.length > 1 && taskMatches[0].matchType === "exact" && taskMatches[1].matchType === "exact") {
    const closeScores = taskMatches.filter((m) => m.score > taskMatches[0].score - 0.15);
    if (closeScores.length > 1) {
      return {
        text: `Found ${closeScores.length} tasks matching "${taskTitle}". Which one?`,
        items: closeScores.map((m) => ({
          label: m.item.title,
          detail: m.item.status,
          href: `/tasks/${m.item.id}`,
        })),
      };
    }
  }

  // Use best match — refetch full details
  const bestId = taskMatches[0].item.id;
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, programme:programmes(name)")
    .eq("id", bestId)
    .limit(1);

  if (!tasks || tasks.length === 0) {
    return { text: `Task not found.`, items: [] };
  }

  const task = tasks[0];
  const prog = Array.isArray(task.programme) ? task.programme[0] : task.programme;

  const STATUS_LABELS: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    pending_review: "Pending Review",
    done: "Done",
    blocked: "Blocked",
  };

  return {
    text: `Update status for "${task.title}":`,
    items: [],
    action: {
      actionType: "update_task_status",
      title: `${task.title} → ${STATUS_LABELS[newStatus] || newStatus}`,
      fields: [
        { label: "Task", value: task.title },
        { label: "From", value: STATUS_LABELS[task.status] || task.status },
        { label: "To", value: STATUS_LABELS[newStatus] || newStatus },
        ...(prog?.name ? [{ label: "Programme", value: prog.name }] : []),
      ],
      payload: {
        task_id: task.id,
        new_status: newStatus,
      },
    },
  };
}

/* ══════════════════════════════════════════════════════════
   READ TOOLS (unchanged from Iteration 2)
   ══════════════════════════════════════════════════════════ */

async function searchTasks(
  supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const query = String(params.query || "").trim();
  const status = String(params.status || "").trim();
  const priority = String(params.priority || "").trim();

  let q = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, programme:programmes(name)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (query) {
    q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  }
  if (status) {
    q = q.eq("status", status);
  }
  if (priority) {
    q = q.eq("priority", priority);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Fuzzy fallback when ilike finds nothing
  if ((!data || data.length === 0) && query) {
    const fuzzyMatches = await fuzzySearchTasks(supabase, query, { limit: 10, threshold: 0.25 });
    if (fuzzyMatches.length > 0) {
      return {
        text: `No exact match for "${query}", but found ${fuzzyMatches.length} close result${fuzzyMatches.length !== 1 ? "s" : ""}:`,
        items: fuzzyMatches.map((m) => ({
          label: m.item.title,
          detail: `${m.item.status} · ${Math.round(m.score * 100)}% match`,
          href: `/tasks/${m.item.id}`,
        })),
      };
    }
    return { text: `No tasks found matching "${query}".`, items: [] };
  }

  if (!data || data.length === 0) {
    return { text: "No tasks found matching your search.", items: [] };
  }

  return {
    text: `Found ${data.length} task${data.length !== 1 ? "s" : ""}:`,
    items: data.map((t) => {
      const prog = Array.isArray(t.programme) ? t.programme[0] : t.programme;
      const parts = [t.status, t.priority];
      if (t.due_date) parts.push(`due ${formatDate(t.due_date)}`);
      if (prog?.name) parts.push(prog.name);
      return { label: t.title, detail: parts.join(" · "), href: `/tasks/${t.id}` };
    }),
  };
}

async function searchProgrammes(
  supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const query = String(params.query || "").trim();
  const status = String(params.status || "").trim();

  let q = supabase
    .from("programmes")
    .select("id, name, status, description")
    .order("created_at", { ascending: false })
    .limit(10);

  if (query) {
    q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
  }
  if (status) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Fuzzy fallback
  if ((!data || data.length === 0) && query) {
    const fuzzyMatches = await fuzzySearchProgrammes(supabase, query, { limit: 10, threshold: 0.25 });
    if (fuzzyMatches.length > 0) {
      return {
        text: `No exact match for "${query}", but found ${fuzzyMatches.length} close result${fuzzyMatches.length !== 1 ? "s" : ""}:`,
        items: fuzzyMatches.map((m) => ({
          label: m.item.name,
          detail: `${m.item.status} · ${Math.round(m.score * 100)}% match`,
          href: `/programmes/${m.item.id}`,
        })),
      };
    }
    return { text: `No programmes found matching "${query}".`, items: [] };
  }

  if (!data || data.length === 0) {
    return { text: "No programmes found.", items: [] };
  }

  return {
    text: `Found ${data.length} programme${data.length !== 1 ? "s" : ""}:`,
    items: data.map((p) => ({
      label: p.name, detail: p.status, href: `/programmes/${p.id}`,
    })),
  };
}

async function searchUsers(
  supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const query = String(params.query || "").trim();
  const role = String(params.role || "").trim();

  let q = supabase.from("profiles").select("id, full_name, username, email, role").limit(10);
  if (query) {
    q = q.or(`full_name.ilike.%${query}%,username.ilike.%${query}%,email.ilike.%${query}%`);
  }
  if (role) {
    q = q.eq("role", role);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Fuzzy fallback
  if ((!data || data.length === 0) && query) {
    const fuzzyMatches = await fuzzySearchUsers(supabase, query, { limit: 10, threshold: 0.25 });
    if (fuzzyMatches.length > 0) {
      return {
        text: `No exact match for "${query}", but found ${fuzzyMatches.length} close result${fuzzyMatches.length !== 1 ? "s" : ""}:`,
        items: fuzzyMatches.map((m) => ({
          label: m.item.full_name || m.item.username || "Unknown",
          detail: `${m.item.role} · ${Math.round(m.score * 100)}% match`,
          href: `/team`,
        })),
      };
    }
    return { text: `No team members found matching "${query}".`, items: [] };
  }

  if (!data || data.length === 0) {
    return { text: "No team members found.", items: [] };
  }

  return {
    text: `Found ${data.length} team member${data.length !== 1 ? "s" : ""}:`,
    items: data.map((p) => ({
      label: p.full_name || p.username || "Unknown",
      detail: `${p.role}${p.email ? " · " + p.email : ""}`,
      href: `/team`,
    })),
  };
}

async function getMyOverdueTasks(
  supabase: SupabaseClient,
  userId: string
): Promise<LunaToolResult> {
  const today = new Date().toISOString().split("T")[0];

  const { data: assignments } = await supabase
    .from("task_assignees").select("task_id").eq("user_id", userId);

  if (!assignments || assignments.length === 0) {
    return { text: "You have no assigned tasks.", items: [] };
  }

  const taskIds = assignments.map((a) => a.task_id);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, programme:programmes(name)")
    .in("id", taskIds)
    .lt("due_date", today)
    .neq("status", "done")
    .order("due_date", { ascending: true })
    .limit(15);

  if (error) throw error;

  if (!data || data.length === 0) {
    return { text: "No overdue tasks. You're on track.", items: [] };
  }

  return {
    text: `You have ${data.length} overdue task${data.length !== 1 ? "s" : ""}:`,
    items: data.map((t) => {
      const prog = Array.isArray(t.programme) ? t.programme[0] : t.programme;
      const parts = [t.priority];
      if (t.due_date) parts.push(`due ${formatDate(t.due_date)}`);
      if (prog?.name) parts.push(prog.name);
      return { label: t.title, detail: parts.join(" · "), href: `/tasks/${t.id}` };
    }),
  };
}

async function getMyTasks(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const status = String(params.status || "").trim();

  const { data: assignments } = await supabase
    .from("task_assignees").select("task_id").eq("user_id", userId);

  if (!assignments || assignments.length === 0) {
    return { text: "You have no assigned tasks.", items: [] };
  }

  const taskIds = assignments.map((a) => a.task_id);

  let q = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, programme:programmes(name)")
    .in("id", taskIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(15);

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw error;

  if (!data || data.length === 0) {
    return { text: status ? `No tasks with status "${status}".` : "No tasks assigned to you.", items: [] };
  }

  return {
    text: `You have ${data.length} task${data.length !== 1 ? "s" : ""}${status ? ` (${status})` : ""}:`,
    items: data.map((t) => {
      const prog = Array.isArray(t.programme) ? t.programme[0] : t.programme;
      const parts = [t.status, t.priority];
      if (t.due_date) parts.push(`due ${formatDate(t.due_date)}`);
      if (prog?.name) parts.push(prog.name);
      return { label: t.title, detail: parts.join(" · "), href: `/tasks/${t.id}` };
    }),
  };
}

async function getCheckinStatus(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const weekStart = params.week_start ? String(params.week_start) : getMonday(new Date());

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", userId).single();

  const isManagerOrAdmin =
    profile?.role === "manager" || profile?.role === "admin" || profile?.role === "super_admin";

  if (!isManagerOrAdmin) {
    const { data } = await supabase
      .from("checkins")
      .select("id, mood, submitted_at")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (data) {
      return {
        text: `You submitted your check-in for this week (mood: ${data.mood}).`,
        items: [{ label: "View your check-in", detail: `Submitted ${formatDate(data.submitted_at)}`, href: `/checkins` }],
      };
    }
    return {
      text: "You haven't submitted your check-in for this week yet.",
      items: [{ label: "Submit check-in now", detail: "Weekly check-in", href: `/checkins/new?week=${weekStart}` }],
    };
  }

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  let reportIds: string[] = [];

  if (isAdmin) {
    const { data: allProfiles } = await supabase
      .from("profiles").select("id").neq("id", userId);
    reportIds = (allProfiles || []).map((p) => p.id);
  } else {
    const { data: reports } = await supabase
      .from("hierarchy").select("member_id").eq("manager_id", userId);
    reportIds = (reports || []).map((r) => r.member_id);
  }

  if (reportIds.length === 0) {
    return { text: "No team members found.", items: [] };
  }

  const { data: reportProfiles } = await supabase
    .from("profiles").select("id, full_name").in("id", reportIds);

  const { data: checkins } = await supabase
    .from("checkins").select("user_id, mood").eq("week_start", weekStart).in("user_id", reportIds);

  const submittedIds = new Set((checkins || []).map((c) => c.user_id));
  const submitted: LunaResultItem[] = [];
  const missed: LunaResultItem[] = [];

  (reportProfiles || []).forEach((p) => {
    const name = p.full_name || "Unknown";
    if (submittedIds.has(p.id)) {
      const checkin = checkins?.find((c) => c.user_id === p.id);
      submitted.push({ label: `✓ ${name}`, detail: `mood: ${checkin?.mood || "—"}`, href: `/checkins` });
    } else {
      missed.push({ label: `✗ ${name}`, detail: "Not submitted", href: `/checkins` });
    }
  });

  const total = reportIds.length;

  return {
    text: `Week of ${weekStart}: ${submitted.length}/${total} submitted, ${missed.length} missed.`,
    items: [...missed, ...submitted],
  };
}

async function getProgrammeHealth(
  supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const name = String(params.programme_name || params.query || "").trim();
  if (!name) {
    return { text: "Which programme would you like a health summary for?", items: [] };
  }

  const progMatches = await fuzzySearchProgrammes(supabase, name, { bestOnly: true, threshold: 0.3 });

  if (progMatches.length === 0) {
    return { text: `No programme found matching "${name}".`, items: [] };
  }

  const prog = progMatches[0].item;
  const today = new Date().toISOString().split("T")[0];

  const { data: tasks } = await supabase
    .from("tasks").select("id, title, status, due_date").eq("programme_id", prog.id);

  if (!tasks || tasks.length === 0) {
    return {
      text: `${prog.name} (${prog.status}) has no tasks yet.`,
      items: [{ label: prog.name, detail: prog.status, href: `/programmes/${prog.id}` }],
    };
  }

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    text: `${prog.name} (${prog.status}): ${done}/${total} tasks done (${pct}%). ${overdue} overdue, ${blocked} blocked, ${inProgress} in progress.`,
    items: [
      { label: `View ${prog.name}`, detail: `${total} tasks`, href: `/programmes/${prog.id}` },
      ...(overdue > 0
        ? tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done").slice(0, 5).map((t) => ({
            label: `⚠ ${t.title}`, detail: `overdue · due ${formatDate(t.due_date!)}`, href: `/tasks/${t.id}`,
          }))
        : []),
    ],
  };
}

async function getBlockers(
  supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const programmeName = String(params.programme_name || "").trim();

  let q = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, programme:programmes(name)")
    .eq("status", "blocked")
    .order("due_date", { ascending: true })
    .limit(15);

  if (programmeName) {
    const progMatches = await fuzzySearchProgrammes(supabase, programmeName, { bestOnly: true, threshold: 0.3 });
    if (progMatches.length > 0) q = q.eq("programme_id", progMatches[0].item.id);
  }

  const { data, error } = await q;
  if (error) throw error;

  if (!data || data.length === 0) {
    return { text: "No blocked tasks found.", items: [] };
  }

  return {
    text: `${data.length} blocked task${data.length !== 1 ? "s" : ""}:`,
    items: data.map((t) => {
      const prog = Array.isArray(t.programme) ? t.programme[0] : t.programme;
      const parts = [t.priority];
      if (t.due_date) parts.push(`due ${formatDate(t.due_date)}`);
      if (prog?.name) parts.push(prog.name);
      return { label: t.title, detail: parts.join(" · "), href: `/tasks/${t.id}` };
    }),
  };
}

async function handleNavigate(
  _supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const dest = String(params.destination || "").toLowerCase();

  const NAV_MAP: Record<string, { label: string; href: string; detail: string }> = {
    dashboard: { label: "Dashboard", href: "/", detail: "Overview" },
    tasks: { label: "Tasks", href: "/tasks", detail: "View and manage all tasks" },
    programmes: { label: "Programmes", href: "/programmes", detail: "View and manage programmes" },
    team: { label: "Team", href: "/team", detail: "Team directory and roles" },
    checkins: { label: "Check-ins", href: "/checkins", detail: "Weekly check-ins" },
    "check-ins": { label: "Check-ins", href: "/checkins", detail: "Weekly check-ins" },
    messaging: { label: "Messaging", href: "/messaging", detail: "Direct and group messages" },
    calendar: { label: "Calendar", href: "/calendar", detail: "Events and meetings" },
    drive: { label: "Drive", href: "/drive", detail: "Google Drive files" },
    analytics: { label: "Analytics", href: "/analytics", detail: "Reports and metrics" },
    settings: { label: "Settings", href: "/settings", detail: "Your account settings" },
    mail: { label: "Shared Mail", href: "/shared-mail", detail: "Shared email inbox" },
    "shared mail": { label: "Shared Mail", href: "/shared-mail", detail: "Shared email inbox" },
    activity: { label: "Activity", href: "/activity", detail: "Activity log" },
  };

  for (const [key, value] of Object.entries(NAV_MAP)) {
    if (dest.includes(key)) return { text: "Here's where to go:", items: [value] };
  }

  return { text: "Here are the main sections in MoonDesk:", items: Object.values(NAV_MAP).slice(0, 8) };
}

async function handleGeneralAnswer(
  _supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const topic = String(params.topic || "").toLowerCase();

  if (topic.includes("create task") || topic.includes("new task")) {
    return {
      text: "To create a task, just say \"Create a task to [description]\". Or go to Tasks → New Task.",
      items: [{ label: "Go to Tasks", detail: "Create a new task", href: "/tasks/new" }],
    };
  }
  if (topic.includes("create programme") || topic.includes("new programme")) {
    return {
      text: "To create a programme, go to Programmes and click 'New Programme'. Requires Manager role or above.",
      items: [{ label: "Go to Programmes", detail: "Create a new programme", href: "/programmes/new" }],
    };
  }
  if (topic.includes("calendar") || topic.includes("event") || topic.includes("meeting") || topic.includes("schedule")) {
    return {
      text: "You can manage events in the Calendar section. Go to Calendar to create, view, or edit events and meetings.",
      items: [{ label: "Go to Calendar", detail: "View & create events", href: "/calendar" }],
    };
  }
  if (topic.includes("message") || topic.includes("chat") || topic.includes("inbox")) {
    return {
      text: "You can send and receive messages in the Messages section.",
      items: [{ label: "Go to Messages", detail: "View inbox & send messages", href: "/messages" }],
    };
  }
  if (topic.includes("report") || topic.includes("analytics") || topic.includes("dashboard")) {
    return {
      text: "You can view reports and analytics from the Dashboard or Reports section.",
      items: [
        { label: "Go to Dashboard", detail: "Overview & analytics", href: "/dashboard" },
        { label: "Go to Reports", detail: "Detailed reports", href: "/reports" },
      ],
    };
  }
  if (topic.includes("check-in") || topic.includes("checkin") || topic.includes("standup")) {
    return {
      text: "Check-ins let team members share daily updates. Go to Check-ins to submit yours or view your team's.",
      items: [{ label: "Go to Check-ins", detail: "Submit or view check-ins", href: "/check-ins" }],
    };
  }
  if (topic.includes("setting") || topic.includes("profile") || topic.includes("account") || topic.includes("password")) {
    return {
      text: "You can manage your profile and account settings from the Settings page.",
      items: [{ label: "Go to Settings", detail: "Profile & account", href: "/settings" }],
    };
  }
  if (topic.includes("notification") || topic.includes("alert")) {
    return {
      text: "Notifications show updates on tasks, programmes, and messages. Check the bell icon in the top bar or go to Notifications.",
      items: [{ label: "Go to Notifications", detail: "View all notifications", href: "/notifications" }],
    };
  }
  if (topic.includes("help") || topic.includes("what can you do") || topic.includes("how do you work")) {
    return {
      text: "Here's what I can help with:\n• Create or search tasks and programmes\n• Check overdue items and blockers\n• Review team check-in status\n• Update task status or programme fields\n• Run playbooks (weekly review, close/start programme)\n• Navigate to any section\n\nTry: \"Create a task\", \"Team summary\", or \"Weekly review\".",
      items: [],
    };
  }

  // Fallback — guide toward specific actions
  return {
    text: `I'm not sure how to help with "${params.topic || "that"}" specifically, but I can create tasks, search programmes, check overdue items, run weekly reviews, and more. Try asking something like "Create a task" or "Team summary".`,
    items: [
      { label: "Go to Dashboard", detail: "Main overview", href: "/dashboard" },
    ],
  };
}

/* ── Helpers ── */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

/* ══════════════════════════════════════════════════════════
   HELPERS — Role & Reports
   ══════════════════════════════════════════════════════════ */

async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role || "member";
}

/** Get user IDs of direct reports (managers use hierarchy; admins get everyone). */
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

  // Manager — use hierarchy table
  const { data } = await supabase
    .from("hierarchy")
    .select("member_id")
    .eq("manager_id", userId);
  return (data || []).map((h) => h.member_id);
}

/* ══════════════════════════════════════════════════════════
   PROGRAMME WRITE PREVIEW TOOLS (Iteration 4)
   ══════════════════════════════════════════════════════════ */

async function previewCreateProgramme(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  // Role gate: manager+ only
  const role = await getUserRole(supabase, userId);
  if (role === "member") {
    return {
      text: "You don't have permission to create programmes. Only managers and above can do this.",
      items: [],
    };
  }

  const name = String(params.name || "").trim();
  const genericNames = ["", "programme", "new programme", "a programme", "program"];
  if (genericNames.includes(name.toLowerCase())) {
    return {
      text: "What should the programme be called?",
      items: [],
    };
  }

  const description = params.description ? String(params.description).trim() : undefined;
  const status = String(params.status || "draft");
  const startDate = params.start_date ? String(params.start_date) : undefined;
  const endDate = params.end_date ? String(params.end_date) : undefined;

  const validStatuses = ["draft", "active", "paused", "completed", "archived"];
  const finalStatus = validStatuses.includes(status) ? status : "draft";

  const fields: { label: string; value: string }[] = [
    { label: "Name", value: name },
    { label: "Status", value: finalStatus },
  ];
  if (description) fields.push({ label: "Description", value: description });
  if (startDate) fields.push({ label: "Start date", value: formatDate(startDate) });
  if (endDate) fields.push({ label: "End date", value: formatDate(endDate) });

  return {
    text: "Here's the programme I'll create:",
    items: [],
    action: {
      actionType: "create_programme",
      title: `Create: ${name}`,
      fields,
      payload: {
        name,
        description: description || null,
        status: finalStatus,
        start_date: startDate || null,
        end_date: endDate || null,
        created_by: userId,
      },
    },
  };
}

async function previewUpdateProgrammeStatus(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  // Role gate: manager+ only
  const role = await getUserRole(supabase, userId);
  if (role === "member") {
    return {
      text: "You don't have permission to update programme status. Only managers and above can do this.",
      items: [],
    };
  }

  const programmeName = stripNoiseWords(String(params.programme_name || "")).trim();
  const newStatus = String(params.new_status || "").trim();

  if (!programmeName) {
    return { text: "Which programme do you want to update?", items: [] };
  }
  if (!newStatus) {
    return { text: "What status? Options: draft, active, paused, completed, archived.", items: [] };
  }

  const validStatuses = ["draft", "active", "paused", "completed", "archived"];
  if (!validStatuses.includes(newStatus)) {
    return {
      text: `"${newStatus}" isn't a valid programme status. Options: ${validStatuses.join(", ")}.`,
      items: [],
    };
  }

  // Find the programme — fuzzy matching
  const progMatches = await fuzzySearchProgrammes(supabase, programmeName, { limit: 5, threshold: 0.3 });

  if (progMatches.length === 0) {
    return { text: `No programme found matching "${programmeName}".`, items: [] };
  }

  // If best match is fuzzy and low confidence, confirm
  if (progMatches[0].matchType === "fuzzy" && progMatches[0].score < 0.7 && progMatches.length > 1) {
    return {
      text: `No exact match for "${programmeName}". Did you mean one of these?`,
      items: progMatches.map((m) => ({
        label: m.item.name,
        detail: `${m.item.status} · ${Math.round(m.score * 100)}% match`,
        href: `/programmes/${m.item.id}`,
      })),
    };
  }

  const programme = progMatches[0].item;

  if (programme.status === newStatus) {
    return {
      text: `"${programme.name}" is already ${newStatus}.`,
      items: [{ label: programme.name, detail: newStatus, href: `/programmes/${programme.id}` }],
    };
  }

  const statusLabels: Record<string, string> = {
    draft: "Draft", active: "Active", paused: "Paused", completed: "Completed", archived: "Archived",
  };

  return {
    text: `Update status for "${programme.name}":`,
    items: [],
    action: {
      actionType: "update_programme_status",
      title: `${programme.name} → ${statusLabels[newStatus] || newStatus}`,
      fields: [
        { label: "Programme", value: programme.name },
        { label: "From", value: statusLabels[programme.status] || programme.status },
        { label: "To", value: statusLabels[newStatus] || newStatus },
      ],
      payload: {
        programme_id: programme.id,
        new_status: newStatus,
        old_status: programme.status,
        programme_name: programme.name,
      },
    },
  };
}

/* ── Update Programme Fields (Slice D) ── */

const UPDATABLE_PROGRAMME_FIELDS = ["name", "description", "start_date", "end_date"] as const;
type UpdatableField = (typeof UPDATABLE_PROGRAMME_FIELDS)[number];

const FIELD_DISPLAY: Record<UpdatableField, string> = {
  name: "Name",
  description: "Description",
  start_date: "Start date",
  end_date: "End date",
};

async function previewUpdateProgrammeFields(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  // Role gate: manager+ only
  const role = await getUserRole(supabase, userId);
  if (role === "member") {
    return {
      text: "You don't have permission to update programmes. Only managers and above can do this.",
      items: [],
    };
  }

  const programmeName = stripNoiseWords(String(params.programme_name || "")).trim();
  const updateField = String(params.update_field || "").trim().toLowerCase() as UpdatableField;
  const updateValue = String(params.update_value || "").trim();

  if (!programmeName) {
    return { text: "Which programme do you want to update?", items: [] };
  }
  if (!updateField || !UPDATABLE_PROGRAMME_FIELDS.includes(updateField)) {
    return {
      text: `Which field do you want to change? Options: ${UPDATABLE_PROGRAMME_FIELDS.join(", ")}.`,
      items: [],
    };
  }
  if (!updateValue) {
    return { text: `What should the new ${FIELD_DISPLAY[updateField].toLowerCase()} be?`, items: [] };
  }

  // Normalize date values
  let normalizedValue = updateValue;
  if (updateField === "start_date" || updateField === "end_date") {
    normalizedValue = normalizeDateValue(updateValue);
  }

  // Find the programme — fuzzy matching
  const progMatches = await fuzzySearchProgrammes(supabase, programmeName, { limit: 5, threshold: 0.3 });

  if (progMatches.length === 0) {
    return { text: `No programme found matching "${programmeName}".`, items: [] };
  }

  // If best match is fuzzy and low confidence, show options
  if (progMatches[0].matchType === "fuzzy" && progMatches[0].score < 0.7 && progMatches.length > 1) {
    return {
      text: `No exact match for "${programmeName}". Did you mean one of these?`,
      items: progMatches.map((m) => ({
        label: m.item.name,
        detail: `${m.item.status} · ${Math.round(m.score * 100)}% match`,
        href: `/programmes/${m.item.id}`,
      })),
    };
  }

  const programme = progMatches[0].item;

  // Get current value for comparison
  const { data: current } = await supabase
    .from("programmes")
    .select("id, name, description, start_date, end_date")
    .eq("id", programme.id)
    .single();

  if (!current) {
    return { text: "Programme not found.", items: [] };
  }

  const currentValue = String(current[updateField] || "not set");

  // Same value check
  if (currentValue === normalizedValue) {
    return {
      text: `"${programme.name}" ${FIELD_DISPLAY[updateField].toLowerCase()} is already "${normalizedValue}".`,
      items: [{ label: programme.name, detail: currentValue, href: `/programmes/${programme.id}` }],
    };
  }

  return {
    text: `Update ${FIELD_DISPLAY[updateField].toLowerCase()} for "${programme.name}":`,
    items: [],
    action: {
      actionType: "update_programme_fields",
      title: `Update ${programme.name}`,
      fields: [
        { label: "Programme", value: programme.name },
        { label: "Field", value: FIELD_DISPLAY[updateField] },
        { label: "From", value: currentValue === "null" ? "not set" : currentValue },
        { label: "To", value: normalizedValue },
      ],
      payload: {
        programme_id: programme.id,
        programme_name: programme.name,
        update_field: updateField,
        update_value: normalizedValue,
        old_value: currentValue,
      },
    },
  };
}

/** Normalize natural-language dates to ISO format */
function normalizeDateValue(input: string): string {
  const trimmed = input.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  // "March 2026" / "march 31 2026" / "march 31, 2026"
  const monthNames: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07",
    aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const monthDayYear = trimmed.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (monthDayYear) {
    const mm = monthNames[monthDayYear[1].toLowerCase()];
    if (mm) return `${monthDayYear[3]}-${mm}-${monthDayYear[2].padStart(2, "0")}`;
  }
  // "March 2026" → last day of that month
  const monthYear = trimmed.match(/^(\w+)\s+(\d{4})$/i);
  if (monthYear) {
    const mm = monthNames[monthYear[1].toLowerCase()];
    if (mm) {
      const year = parseInt(monthYear[2]);
      const month = parseInt(mm);
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
    }
  }
  // Try native parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  // Return as-is
  return trimmed;
}

/* ══════════════════════════════════════════════════════════
   MANAGER INSIGHT TOOLS (Iteration 4)
   ══════════════════════════════════════════════════════════ */

async function getTeamOverdue(
  supabase: SupabaseClient,
  userId: string,
  _params: Record<string, unknown> = {}
): Promise<LunaToolResult> {
  const role = await getUserRole(supabase, userId);
  if (role === "member") {
    return {
      text: "Team overdue view is available for managers and above. Use \"My overdue\" to see your own.",
      items: [],
    };
  }

  const reportIds = await getReportIds(supabase, userId, role);
  if (reportIds.length === 0) {
    return { text: "You have no direct reports yet.", items: [] };
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: assignments } = await supabase
    .from("task_assignees")
    .select("task_id, user_id")
    .in("user_id", reportIds);

  if (!assignments || assignments.length === 0) {
    return { text: "No tasks assigned to your team.", items: [] };
  }

  const taskIds = [...new Set(assignments.map((a) => a.task_id))];

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, programme:programmes(name)")
    .in("id", taskIds)
    .lt("due_date", today)
    .not("status", "eq", "done")
    .order("due_date", { ascending: true })
    .limit(20);

  if (!tasks || tasks.length === 0) {
    return { text: "No overdue tasks across your team. Everyone is on track!", items: [] };
  }

  // Build assignee map for display
  const taskAssigneeMap: Record<string, string[]> = {};
  for (const a of assignments) {
    if (!taskAssigneeMap[a.task_id]) taskAssigneeMap[a.task_id] = [];
    taskAssigneeMap[a.task_id].push(a.user_id);
  }

  // Get names for assignees
  const allUserIds = [...new Set(assignments.map((a) => a.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", allUserIds);
  const nameMap: Record<string, string> = {};
  for (const p of profiles || []) {
    nameMap[p.id] = p.full_name || p.username || "Unknown";
  }

  const items = tasks.map((t) => {
    const progJoin = Array.isArray(t.programme) ? t.programme[0] : t.programme;
    const prog = (progJoin as { name: string } | null)?.name;
    const assigneeNames = (taskAssigneeMap[t.id] || [])
      .map((uid) => nameMap[uid] || "Unknown")
      .join(", ");
    const detail = [
      `Due: ${formatDate(t.due_date)}`,
      t.priority !== "medium" ? t.priority : null,
      prog || null,
      assigneeNames ? `→ ${assigneeNames}` : null,
    ].filter(Boolean).join(" · ");
    return { label: t.title, detail, href: `/tasks/${t.id}` };
  });

  return {
    text: `${tasks.length} overdue task${tasks.length === 1 ? "" : "s"} across your team:`,
    items,
  };
}

async function getTeamSummary(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, unknown> = {}
): Promise<LunaToolResult> {
  const role = await getUserRole(supabase, userId);
  if (role === "member") {
    return {
      text: "Team summary is available for managers and above.",
      items: [],
    };
  }

  const reportIds = await getReportIds(supabase, userId, role);
  if (reportIds.length === 0) {
    return { text: "You have no direct reports yet.", items: [] };
  }

  // Get all task assignments for reports
  const { data: assignments } = await supabase
    .from("task_assignees")
    .select("task_id, user_id")
    .in("user_id", reportIds);

  if (!assignments || assignments.length === 0) {
    return { text: "No tasks assigned to your team yet.", items: [] };
  }

  const taskIds = [...new Set(assignments.map((a) => a.task_id))];

  // Optional programme filter
  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, programme:programmes(name)")
    .in("id", taskIds);

  const progFilter = String(params.programme_name || "").trim();
  if (progFilter) {
    const progMatches = await fuzzySearchProgrammes(supabase, progFilter, { bestOnly: true, threshold: 0.3 });
    if (progMatches.length > 0) {
      query = query.eq("programme_id", progMatches[0].item.id);
    }
  }

  const { data: tasks } = await query;

  if (!tasks || tasks.length === 0) {
    return { text: "No tasks found for your team.", items: [] };
  }

  // Count by status
  const counts: Record<string, number> = { todo: 0, in_progress: 0, pending_review: 0, done: 0, blocked: 0 };
  const today = new Date().toISOString().split("T")[0];
  let overdueCount = 0;

  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
    if (t.due_date && t.due_date < today && t.status !== "done") {
      overdueCount++;
    }
  }

  const total = tasks.length;
  const completionPct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const lines = [
    `Team summary across ${reportIds.length} member${reportIds.length === 1 ? "" : "s"}:`,
    "",
    `Total tasks: ${total}`,
    `✓ Done: ${counts.done} (${completionPct}%)`,
    `→ In progress: ${counts.in_progress}`,
    `○ To do: ${counts.todo}`,
    `⏳ Pending review: ${counts.pending_review}`,
    `⚠ Blocked: ${counts.blocked}`,
  ];

  if (overdueCount > 0) {
    lines.push(`🔴 Overdue: ${overdueCount}`);
  } else {
    lines.push(`No overdue tasks.`);
  }

  const items: LunaResultItem[] = [];

  // Link to blocked tasks if any
  if (counts.blocked > 0) {
    items.push({ label: `${counts.blocked} blocked`, detail: "View blocked tasks", href: "/tasks?status=blocked" });
  }
  if (overdueCount > 0) {
    items.push({ label: `${overdueCount} overdue`, detail: "View overdue tasks", href: "/tasks?status=overdue" });
  }

  return { text: lines.join("\n"), items };
}

/* ══════════════════════════════════════════════════════════
   RUN MODE PLAYBOOKS (Iteration 5)
   Actual flow managed by chat route. This stub validates and signals.
   ══════════════════════════════════════════════════════════ */

async function handleRunPlaybook(
  _supabase: SupabaseClient,
  _userId: string,
  params: Record<string, unknown>
): Promise<LunaToolResult> {
  const playbookId = String(params.playbook_id || "").trim();
  const targetName = String(params.target_name || "").trim();

  // Signal to chat route that this needs playbook handling
  // The actual flow is managed in the chat route, not here.
  return {
    text: `__PLAYBOOK__:${playbookId}:${targetName}`,
    items: [],
  };
}