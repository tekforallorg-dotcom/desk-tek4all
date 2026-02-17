"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  User,
  UserCog,
  Settings,
  Network,
  AlertTriangle,
  CheckSquare,
  FolderKanban,
  Activity,
  Download,
  TrendingUp,
  Dumbbell,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Calendar,
  Smile,
  Meh,
  Frown,
  UserCheck,
  UserX,
  CircleDot,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface OrgHealth {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  completionRate: number;
  activeProgrammes: number;
  totalProgrammes: number;
  totalCheckins: number;
  checkinsThisWeek: number;
}

interface WorkloadItem {
  userId: string;
  name: string;
  total: number;
  done: number;
  overdue: number;
  inProgress: number;
}

interface ActivityItem {
  id: string;
  action: string;
  entity_type: string;
  details: Record<string, string> | null;
  created_at: string;
  user_id: string;
  user_name: string;
}

interface CheckinEntry {
  userId: string;
  name: string;
  submitted: boolean;
  mood: string | null;
  submittedAt: string | null;
}

interface ProgrammeDeadline {
  id: string;
  name: string;
  status: string;
  endDate: string | null;
  daysLeft: number | null;
  isOverdue: boolean;
}

interface TeamPulseEntry {
  userId: string;
  name: string;
  role: string;
  lastActive: string | null;
  isOnline: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  member: "Member",
  manager: "Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  member: User,
  manager: UserCog,
  admin: Shield,
  super_admin: ShieldCheck,
};

const MOOD_ICONS: Record<string, React.ElementType> = {
  great: Smile,
  good: Smile,
  okay: Meh,
  struggling: Frown,
  bad: Frown,
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { profile, user, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orgHealth, setOrgHealth] = useState<OrgHealth | null>(null);
  const [workload, setWorkload] = useState<WorkloadItem[]>([]);
  const [activityStream, setActivityStream] = useState<ActivityItem[]>([]);
  const [checkinTracker, setCheckinTracker] = useState<CheckinEntry[]>([]);
  const [programmeDeadlines, setProgrammeDeadlines] = useState<ProgrammeDeadline[]>([]);
  const [teamPulse, setTeamPulse] = useState<TeamPulseEntry[]>([]);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllCheckins, setShowAllCheckins] = useState(false);

  // Use role from auth context (reliable)
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  // ─── Fetch all dashboard data ────────────────────────────────────────────

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id || !profile) return;

    const supabase = createClient();
    const isAdminRole = profile.role === "admin" || profile.role === "super_admin";
    const isManagerRole = profile.role === "manager";

    // ── 1. Fetch all users ──────────────────────────────────────────────
    const { data: usersData, error: usersError } = await supabase
      .from("profiles")
      .select("id, username, full_name, email, role, status, created_at")
      .order("created_at", { ascending: false });

    if (usersError) {
      console.error("[Control Tower] profiles query failed:", usersError);
    }

    const allUsers = (usersData || []) as UserProfile[];
    setUsers(allUsers);

    // Build a name lookup map for use across all panels
    const nameMap = new Map<string, string>();
    for (const u of allUsers) {
      nameMap.set(u.id, u.full_name || u.username);
    }

    // ── 2. Get direct reports via hierarchy table ───────────────────────
    // This is the ONLY reliable source — profiles has no manager_id column
    let directReportIds: Set<string> = new Set();

    if (!isAdminRole) {
      const { data: hierarchyData, error: hierError } = await supabase
        .from("hierarchy")
        .select("report_id")
        .eq("manager_id", user.id);

      if (hierError) {
        console.error("[Control Tower] hierarchy query failed:", hierError);
      }

      for (const h of hierarchyData || []) {
        directReportIds.add(h.report_id);
      }
    }

    // ── 3. Determine scoped user set ────────────────────────────────────
    // Admins: all active users
    // Managers: direct reports from hierarchy
    // Members: just themselves
    let scopedUserIds: Set<string>;
    if (isAdminRole) {
      scopedUserIds = new Set(allUsers.filter((u) => u.status === "active").map((u) => u.id));
    } else if (isManagerRole) {
      scopedUserIds = directReportIds;
    } else {
      scopedUserIds = new Set([user.id]);
    }

    const scopedUsers = allUsers.filter((u) => scopedUserIds.has(u.id));

    // ── 4. Fetch tasks ──────────────────────────────────────────────────
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, assignee_id");

    if (tasksError) {
      console.error("[Control Tower] tasks query failed:", tasksError);
    }
    const taskList = tasks || [];

    // ── 5. Fetch programmes ─────────────────────────────────────────────
    const { data: programmes, error: progError } = await supabase
      .from("programmes")
      .select("id, name, status, end_date");

    if (progError) {
      console.error("[Control Tower] programmes query failed:", progError);
    }
    const progList = programmes || [];

    // ── 6. Fetch check-ins (this week) ──────────────────────────────────
    const now = new Date();
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday-based week
    weekStart.setDate(weekStart.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    const { data: allCheckins } = await supabase.from("checkins").select("id");
    const { data: weekCheckins, error: checkinError } = await supabase
      .from("checkins")
      .select("id, user_id, mood, submitted_at")
      .gte("week_start", weekStartStr);

    if (checkinError) {
      console.error("[Control Tower] checkins query failed:", checkinError);
    }

    // ── 7. Org Health ───────────────────────────────────────────────────
    const completed = taskList.filter((t) => t.status === "done").length;
    const overdue = taskList.filter(
      (t) => t.due_date && new Date(t.due_date) < now && t.status !== "done"
    ).length;
    const blocked = taskList.filter((t) => t.status === "blocked").length;

    setOrgHealth({
      totalTasks: taskList.length,
      completedTasks: completed,
      overdueTasks: overdue,
      blockedTasks: blocked,
      completionRate: taskList.length > 0 ? Math.round((completed / taskList.length) * 100) : 0,
      activeProgrammes: progList.filter((p) => p.status === "active").length,
      totalProgrammes: progList.length,
      totalCheckins: allCheckins?.length || 0,
      checkinsThisWeek: weekCheckins?.length || 0,
    });

    // ── 8. Workload per user (uses task_assignees for many-to-many) ─────
    // tasks.assignee_id is a single UUID; real assignments are in task_assignees
    const { data: taskAssignees, error: taError } = await supabase
      .from("task_assignees")
      .select("user_id, task_id");

    if (taError) {
      console.error("[Control Tower] task_assignees query failed:", taError);
    }

    // Build a task lookup for status/due_date
    const taskLookup = new Map<string, { status: string; due_date: string | null }>();
    for (const t of taskList) {
      taskLookup.set(t.id, { status: t.status, due_date: t.due_date });
    }

    const workloadUserIds = new Set([user.id, ...Array.from(scopedUserIds)]);
    const workloadUsers = allUsers.filter((u) => workloadUserIds.has(u.id));
    const userMap = new Map<string, WorkloadItem>();
    for (const u of workloadUsers) {
      userMap.set(u.id, {
        userId: u.id,
        name: u.full_name || u.username,
        total: 0,
        done: 0,
        overdue: 0,
        inProgress: 0,
      });
    }

    for (const ta of taskAssignees || []) {
      if (!userMap.has(ta.user_id)) continue;
      const taskInfo = taskLookup.get(ta.task_id);
      if (!taskInfo) continue;

      const item = userMap.get(ta.user_id)!;
      item.total++;
      if (taskInfo.status === "done") item.done++;
      else if (taskInfo.status === "in_progress") item.inProgress++;
      if (taskInfo.due_date && new Date(taskInfo.due_date) < now && taskInfo.status !== "done") {
        item.overdue++;
      }
    }

    const workloadList = Array.from(userMap.values())
      .filter((w) => w.total > 0)
      .sort((a, b) => b.total - a.total);
    setWorkload(workloadList);

    // ── 9. Check-ins Tracker (scoped via hierarchy) ─────────────────────
    const weekCheckinMap = new Map<string, { mood: string | null; submitted_at: string }>();
    for (const c of weekCheckins || []) {
      weekCheckinMap.set(c.user_id, { mood: c.mood, submitted_at: c.submitted_at });
    }

    const checkins: CheckinEntry[] = scopedUsers.map((u) => {
      const entry = weekCheckinMap.get(u.id);
      return {
        userId: u.id,
        name: u.full_name || u.username,
        submitted: !!entry,
        mood: entry?.mood || null,
        submittedAt: entry?.submitted_at || null,
      };
    });
    checkins.sort((a, b) => {
      if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    setCheckinTracker(checkins);

    // ── 10. Programme Deadlines ─────────────────────────────────────────
    const deadlines: ProgrammeDeadline[] = progList
      .filter((p) => p.status !== "completed" && p.status !== "cancelled")
      .map((p) => {
        const endDate = p.end_date || null;
        let daysLeft: number | null = null;
        let isOverdue = false;
        if (endDate) {
          const end = new Date(endDate);
          const diffMs = end.getTime() - now.getTime();
          daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          isOverdue = daysLeft < 0;
        }
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          endDate,
          daysLeft,
          isOverdue,
        };
      })
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
        if (a.daysLeft !== null) return -1;
        return 1;
      });
    setProgrammeDeadlines(deadlines);

    // ── 11. Team Pulse (scoped via hierarchy) ───────────────────────────
    const { data: loginLogs, error: logsError } = await supabase
      .from("audit_logs")
      .select("user_id, created_at")
      .eq("action", "user_login")
      .order("created_at", { ascending: false })
      .limit(500);

    if (logsError) {
      console.error("[Control Tower] login logs query failed:", logsError);
    }

    const lastLoginMap = new Map<string, string>();
    for (const log of loginLogs || []) {
      if (!lastLoginMap.has(log.user_id)) {
        lastLoginMap.set(log.user_id, log.created_at);
      }
    }

    const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const pulse: TeamPulseEntry[] = scopedUsers.map((u) => {
      const lastLogin = lastLoginMap.get(u.id) || null;
      return {
        userId: u.id,
        name: u.full_name || u.username,
        role: u.role,
        lastActive: lastLogin,
        isOnline: lastLogin ? new Date(lastLogin) > fifteenMinsAgo : false,
      };
    });
    pulse.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      if (a.lastActive && b.lastActive) return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
      if (a.lastActive) return -1;
      return 1;
    });
    setTeamPulse(pulse);

    // ── 12. Activity Stream (role-scoped) ───────────────────────────────
    // Admins: all activity
    // Managers: own + direct reports
    // Members: own only
    const activityUserIds: string[] = isAdminRole
      ? [] // empty = fetch all (no filter)
      : [user.id, ...Array.from(scopedUserIds)];

    let activityQuery = supabase
      .from("audit_logs")
      .select("*")
      .not("action", "eq", "email_classified")
      .order("created_at", { ascending: false })
      .limit(10);

    // Only filter by user_id if not admin (admins see everything)
    if (!isAdminRole && activityUserIds.length > 0) {
      activityQuery = activityQuery.in("user_id", activityUserIds);
    }

    const { data: activityLogs, error: actError } = await activityQuery;

    if (actError) {
      console.error("[Control Tower] activity query failed:", actError);
    }

    if (activityLogs) {
      setActivityStream(
        activityLogs.map((log) => ({
          id: log.id,
          action: log.action,
          entity_type: log.entity_type,
          details: log.details,
          created_at: log.created_at,
          user_id: log.user_id,
          user_name: nameMap.get(log.user_id) || "Unknown user",
        }))
      );
    }

    setIsLoading(false);
  }, [user?.id, profile]);

  useEffect(() => {
    if (authLoading || !user?.id || !profile) return;
    fetchDashboardData();
  }, [authLoading, user?.id, profile, fetchDashboardData]);

  // ─── AI Insights ─────────────────────────────────────────────────────────

  const generateAiInsight = async () => {
    if (!orgHealth) return;
    setIsLoadingAi(true);

    try {
      const insights = generateLocalInsights();
      setAiInsight(insights);
    } catch {
      setAiInsight("Unable to generate insights. Please try again.");
    } finally {
      setIsLoadingAi(false);
    }
  };

  const generateLocalInsights = () => {
    if (!orgHealth) return "No data available yet. Add tasks and programmes to see insights.";

    const lines: string[] = [];

    if (orgHealth.overdueTasks > 0) {
      const pct = orgHealth.totalTasks > 0 ? Math.round((orgHealth.overdueTasks / orgHealth.totalTasks) * 100) : 0;
      lines.push(`⚠️ ${orgHealth.overdueTasks} tasks are overdue (${pct}% of total). Prioritize clearing these to maintain team velocity.`);
    }

    if (orgHealth.blockedTasks > 0) {
      lines.push(`🚧 ${orgHealth.blockedTasks} tasks are blocked. Review blockers in the next standup to unblock the team.`);
    }

    if (orgHealth.totalTasks > 0) {
      if (orgHealth.completionRate < 50) {
        lines.push(`📊 Completion rate is ${orgHealth.completionRate}%. Consider breaking large tasks into smaller deliverables.`);
      } else {
        lines.push(`✅ ${orgHealth.completionRate}% completion rate — the team is making solid progress.`);
      }
    } else {
      lines.push(`📋 No tasks created yet. Start by adding tasks under your programmes.`);
    }

    if (workload.length > 0) {
      const heaviest = workload[0];
      if (heaviest && heaviest.total > 5) {
        lines.push(`👤 ${heaviest.name} has the highest workload (${heaviest.total} tasks). Consider redistributing if they're stretched.`);
      }
    }

    const missingCheckins = checkinTracker.filter((c) => !c.submitted).length;
    if (missingCheckins > 0) {
      lines.push(`📝 ${missingCheckins} team member${missingCheckins > 1 ? "s haven't" : " hasn't"} submitted their weekly check-in yet.`);
    } else if (checkinTracker.length > 0) {
      lines.push(`📝 All ${checkinTracker.length} team members have submitted their check-ins this week. Great compliance!`);
    }

    const overdueProgrammes = programmeDeadlines.filter((p) => p.isOverdue).length;
    if (overdueProgrammes > 0) {
      lines.push(`📅 ${overdueProgrammes} programme${overdueProgrammes > 1 ? "s are" : " is"} past deadline. Review and update end dates or mark complete.`);
    }

    const upcomingDeadlines = programmeDeadlines.filter(
      (p) => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 7
    ).length;
    if (upcomingDeadlines > 0) {
      lines.push(`⏰ ${upcomingDeadlines} programme${upcomingDeadlines > 1 ? "s" : ""} due within 7 days. Ensure final deliverables are on track.`);
    }

    if (lines.length === 0) {
      lines.push(`✅ Everything looks healthy. No overdue tasks, no blockers, all check-ins submitted.`);
    }

    return lines.join("\n\n");
  };

  // ─── Export ──────────────────────────────────────────────────────────────

  const exportDashboard = () => {
    const lines: string[] = [];

    lines.push("MOONDESK CONTROL TOWER EXPORT");
    lines.push(`Generated: ${new Date().toLocaleString("en-GB")}`);
    lines.push("");

    lines.push("=== ORG HEALTH ===");
    if (orgHealth) {
      lines.push(`Total Tasks,${orgHealth.totalTasks}`);
      lines.push(`Completed,${orgHealth.completedTasks}`);
      lines.push(`Overdue,${orgHealth.overdueTasks}`);
      lines.push(`Blocked,${orgHealth.blockedTasks}`);
      lines.push(`Completion Rate,${orgHealth.completionRate}%`);
      lines.push(`Active Programmes,${orgHealth.activeProgrammes}`);
      lines.push(`Total Programmes,${orgHealth.totalProgrammes}`);
      lines.push(`Check-ins This Week,${orgHealth.checkinsThisWeek}`);
    }
    lines.push("");

    lines.push("=== CHECK-IN TRACKER ===");
    lines.push("Name,Submitted,Mood");
    for (const c of checkinTracker) {
      lines.push(`${c.name},${c.submitted ? "Yes" : "No"},${c.mood || "-"}`);
    }
    lines.push("");

    lines.push("=== PROGRAMME DEADLINES ===");
    lines.push("Name,Status,End Date,Days Left");
    for (const p of programmeDeadlines) {
      lines.push(`${p.name},${p.status},${p.endDate || "No date"},${p.daysLeft ?? "-"}`);
    }
    lines.push("");

    lines.push("=== WORKLOAD PER TEAM MEMBER ===");
    lines.push("Name,Total,Done,In Progress,Overdue");
    for (const w of workload) {
      lines.push(`${w.name},${w.total},${w.done},${w.inProgress},${w.overdue}`);
    }
    lines.push("");

    lines.push("=== TEAM PULSE ===");
    lines.push("Name,Role,Last Active,Status");
    for (const t of teamPulse) {
      lines.push(`${t.name},${ROLE_LABELS[t.role] || t.role},${t.lastActive ? new Date(t.lastActive).toLocaleString("en-GB") : "Never"},${t.isOnline ? "Online" : "Offline"}`);
    }
    lines.push("");

    lines.push("=== USERS ===");
    lines.push("Name,Email,Role,Status");
    for (const u of users) {
      lines.push(`${u.full_name || u.username},${u.email},${u.role},${u.status}`);
    }
    lines.push("");

    lines.push("=== RECENT ACTIVITY ===");
    lines.push("Time,User,Action");
    for (const a of activityStream) {
      const time = new Date(a.created_at).toLocaleString("en-GB");
      lines.push(`${time},${a.user_name},${a.action.replace(/_/g, " ")}`);
    }

    if (aiInsight) {
      lines.push("");
      lines.push("=== AI INSIGHTS ===");
      lines.push(aiInsight);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moondesk-control-tower-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const formatActivityTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatRelativeDate = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 5) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const getActionLabel = (action: string, details: Record<string, string> | null) => {
    const name = details?.title || details?.name || "";
    switch (action) {
      case "task_created": return `Created task "${name}"`;
      case "task_updated": return `Updated task "${name}"`;
      case "task_status_changed": return `Changed status → ${details?.to || ""}`;
      case "task_assigned": return `Assigned task "${name}"`;
      case "task_commented": return `Commented on "${name}"`;
      case "task_deleted": return `Deleted task "${name}"`;
      case "task_unassigned": return `Unassigned from "${name}"`;
      case "programme_created": return `Created programme "${name}"`;
      case "programme_updated": return `Updated programme "${name}"`;
      case "login": return "Signed in";
      case "user_login": return "Signed in";
      case "password_reset": return `Reset password for ${name}`;
      case "user_created": return `Created user "${name}"`;
      case "email_replied": return "Replied to email";
      case "email_sent": return "Sent email";
      default: return action.replace(/_/g, " ");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Loading state ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border-2 border-border bg-card" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
          <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
        </div>
      </div>
    );
  }

  // ─── Derived data ────────────────────────────────────────────────────────

  const maxWorkload = Math.max(...workload.map((w) => w.total), 1);
  const submittedCount = checkinTracker.filter((c) => c.submitted).length;
  const missingCount = checkinTracker.filter((c) => !c.submitted).length;
  const onlineCount = teamPulse.filter((t) => t.isOnline).length;
  const checkinScopeLabel = isAdmin ? "All team members" : "Your direct reports";
  const displayedCheckins = showAllCheckins ? checkinTracker : checkinTracker.slice(0, 8);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Control Tower
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Organisation health, team pulse, and operational oversight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportDashboard}
            className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Export
          </Button>
          {isAdmin && (
            <Link href="/admin/users/new">
              <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Add User
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Org Health ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          icon={AlertTriangle}
          label="Overdue Tasks"
          value={orgHealth?.overdueTasks ?? 0}
          subtext={`of ${orgHealth?.totalTasks ?? 0} total`}
          highlight={(orgHealth?.overdueTasks ?? 0) > 0}
        />
        <HealthCard
          icon={TrendingUp}
          label="Completion Rate"
          value={`${orgHealth?.completionRate ?? 0}%`}
          subtext={`${orgHealth?.completedTasks ?? 0} done`}
        />
        <HealthCard
          icon={FolderKanban}
          label="Active Programmes"
          value={orgHealth?.activeProgrammes ?? 0}
          subtext={`of ${orgHealth?.totalProgrammes ?? 0}`}
        />
        <HealthCard
          icon={CheckSquare}
          label="Blocked"
          value={orgHealth?.blockedTasks ?? 0}
          subtext="tasks need attention"
          highlight={(orgHealth?.blockedTasks ?? 0) > 0}
        />
      </div>

      {/* ── Check-ins Tracker + Team Pulse Row ─────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Check-ins Tracker */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ClipboardCheck className="h-5 w-5" strokeWidth={1.5} />
              Weekly Check-ins
            </h2>
            <Link
              href="/checkins"
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>

          {/* Summary bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-foreground/60" strokeWidth={2} />
              <span className="font-mono text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{submittedCount}</span> submitted
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <UserX className="h-3.5 w-3.5 text-foreground/60" strokeWidth={2} />
              <span className="font-mono text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{missingCount}</span> missing
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {checkinScopeLabel}
            </span>
          </div>

          {/* Progress bar */}
          {checkinTracker.length > 0 && (
            <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full border border-border bg-background">
              <div
                className="bg-foreground/60 transition-all"
                style={{ width: `${(submittedCount / checkinTracker.length) * 100}%` }}
              />
            </div>
          )}

          {/* User list */}
          <div className="mt-4 space-y-1.5">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : checkinTracker.length === 0 ? (
              <p className="py-4 text-center font-mono text-sm text-muted-foreground">
                {isAdmin ? "No active users found." : "No direct reports assigned to you."}
              </p>
            ) : (
              displayedCheckins.map((c) => {
                const MoodIcon = c.mood ? (MOOD_ICONS[c.mood] || Meh) : null;
                return (
                  <div
                    key={c.userId}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                      c.submitted
                        ? "border-foreground/20 bg-foreground/10 text-foreground"
                        : "border-border bg-muted text-muted-foreground"
                    }`}>
                      {c.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                    </div>
                    {c.submitted ? (
                      <div className="flex items-center gap-1.5">
                        {MoodIcon && (
                          <MoodIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                        )}
                        <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground">
                          Done
                        </span>
                      </div>
                    ) : (
                      <span className="rounded-full border border-dashed border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Missing
                      </span>
                    )}
                  </div>
                );
              })
            )}
            {checkinTracker.length > 8 && (
              <button
                onClick={() => setShowAllCheckins(!showAllCheckins)}
                className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                {showAllCheckins ? (
                  <>Show less <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>{checkinTracker.length - 8} more <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Team Pulse */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CircleDot className="h-5 w-5" strokeWidth={1.5} />
              Team Pulse
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{onlineCount}</span> online now
            </span>
          </div>

          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {checkinScopeLabel} • Based on last sign-in
          </p>

          <div className="mt-4 space-y-1.5">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : teamPulse.length === 0 ? (
              <p className="py-4 text-center font-mono text-sm text-muted-foreground">
                {isAdmin ? "No active users found." : "No direct reports assigned to you."}
              </p>
            ) : (
              teamPulse.slice(0, 10).map((t) => (
                <div
                  key={t.userId}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="relative">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-bold text-muted-foreground">
                      {t.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                      t.isOnline ? "bg-green-500" : "bg-muted-foreground/40"
                    }`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {ROLE_LABELS[t.role] || t.role}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {t.lastActive ? formatRelativeDate(t.lastActive) : "Never"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Programme Deadlines ─────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5" strokeWidth={1.5} />
            Programme Deadlines
          </h2>
          <Link
            href="/programmes"
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            All programmes →
          </Link>
        </div>

        {programmeDeadlines.length === 0 ? (
          <p className="mt-4 py-4 text-center font-mono text-sm text-muted-foreground">
            No active programmes with deadlines.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {programmeDeadlines.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/programmes/${p.id}`}>
                <div className={`rounded-xl border-2 p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro-sm ${
                  p.isOverdue
                    ? "border-foreground bg-foreground"
                    : p.daysLeft !== null && p.daysLeft <= 7
                      ? "border-foreground/50 bg-foreground/5"
                      : "border-border bg-background"
                }`}>
                  <p className={`truncate text-sm font-bold ${p.isOverdue ? "text-background" : "text-foreground"}`}>
                    {p.name}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                      p.isOverdue
                        ? "bg-background/20 text-background"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {p.status.replace(/_/g, " ")}
                    </span>
                    {p.daysLeft !== null ? (
                      <span className={`font-mono text-xs font-bold ${
                        p.isOverdue
                          ? "text-background"
                          : p.daysLeft <= 7
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}>
                        {p.isOverdue
                          ? `${Math.abs(p.daysLeft)}d overdue`
                          : p.daysLeft === 0
                            ? "Due today"
                            : `${p.daysLeft}d left`
                        }
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        No end date
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── AI Insights ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5" strokeWidth={1.5} />
            AI Insights
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={generateAiInsight}
            disabled={isLoadingAi || !orgHealth}
            className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            {isLoadingAi ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Generate
              </>
            )}
          </Button>
        </div>
        {aiInsight ? (
          <div className="mt-4 whitespace-pre-line rounded-xl border-2 border-border bg-background p-4 font-mono text-sm leading-relaxed text-foreground">
            {aiInsight}
          </div>
        ) : (
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            Click &ldquo;Generate&rdquo; for AI-powered analysis of your org health, check-ins, and team workload.
          </p>
        )}
      </div>

      {/* ── Workload + Activity Row ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Workload Chart */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Dumbbell className="h-5 w-5" strokeWidth={1.5} />
            Workload per Member
          </h2>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : workload.length === 0 ? (
              <p className="py-6 text-center font-mono text-sm text-muted-foreground">
                No assigned tasks yet.
              </p>
            ) : (
              workload.map((w) => (
                <div key={w.userId} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{w.name}</p>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="text-muted-foreground">{w.total} tasks</span>
                      {w.overdue > 0 && (
                        <span className="rounded-full bg-foreground px-1.5 py-0.5 text-background">
                          {w.overdue} overdue
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex h-5 w-full overflow-hidden rounded-full border-2 border-border bg-background">
                    {w.done > 0 && (
                      <div
                        className="bg-foreground/30 transition-all"
                        style={{ width: `${(w.done / maxWorkload) * 100}%` }}
                        title={`${w.done} done`}
                      />
                    )}
                    {w.inProgress > 0 && (
                      <div
                        className="bg-foreground/60 transition-all"
                        style={{ width: `${(w.inProgress / maxWorkload) * 100}%` }}
                        title={`${w.inProgress} in progress`}
                      />
                    )}
                    {w.overdue > 0 && (
                      <div
                        className="bg-foreground transition-all"
                        style={{ width: `${(w.overdue / maxWorkload) * 100}%` }}
                        title={`${w.overdue} overdue`}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
            {workload.length > 0 && (
              <div className="flex items-center gap-4 pt-2 font-mono text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-foreground/30" /> Done
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-foreground/60" /> In Progress
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-foreground" /> Overdue
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Activity Stream */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Activity className="h-5 w-5" strokeWidth={1.5} />
              Activity Stream
            </h2>
            <Link
              href="/activity"
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {activityStream.length === 0 ? (
              <p className="py-6 text-center font-mono text-sm text-muted-foreground">
                No recent activity.
              </p>
            ) : (
              (showAllActivity ? activityStream : activityStream.slice(0, 5)).map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{item.user_name}</span>{" "}
                        <span className="text-muted-foreground">
                          {getActionLabel(item.action, item.details)}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatActivityTime(item.created_at)}
                    </span>
                  </div>
                )
              )
            )}
            {activityStream.length > 5 && (
              <button
                onClick={() => setShowAllActivity(!showAllActivity)}
                className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                {showAllActivity ? (
                  <>Show less <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Show more <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Admin-Only Sections ──────────────────────────────────────── */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-4">
            <div className="h-0.5 flex-1 bg-border" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Admin Management
            </p>
            <div className="h-0.5 flex-1 bg-border" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Link href="/admin/groups">
              <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-muted">
                  <Settings className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-bold">Groups</p>
                  <p className="font-mono text-xs text-muted-foreground">Manage group memberships</p>
                </div>
              </div>
            </Link>

            <Link href="/admin/hierarchy">
              <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-muted">
                  <Network className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-bold">Team Tree</p>
                  <p className="font-mono text-xs text-muted-foreground">Assign direct reports</p>
                </div>
              </div>
            </Link>

            <Link href="/admin/users/new">
              <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-muted">
                  <Plus className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-bold">New User</p>
                  <p className="font-mono text-xs text-muted-foreground">Create a new account</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="font-mono text-xs text-muted-foreground">Total Users</p>
            </div>
            <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
              <p className="text-2xl font-bold">{users.filter((u) => u.status === "active").length}</p>
              <p className="font-mono text-xs text-muted-foreground">Active</p>
            </div>
            <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
              <p className="text-2xl font-bold">{users.filter((u) => u.role === "admin" || u.role === "super_admin").length}</p>
              <p className="font-mono text-xs text-muted-foreground">Admins</p>
            </div>
            <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
              <p className="text-2xl font-bold">{users.filter((u) => u.role === "manager").length}</p>
              <p className="font-mono text-xs text-muted-foreground">Managers</p>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="text-lg font-bold">Users</h2>

            <div className="relative mt-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-2 pl-10 shadow-retro-sm"
              />
            </div>

            {isLoading ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl border-2 border-border bg-muted" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="mt-4 flex min-h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8">
                <Users className="h-8 w-8 text-muted-foreground" strokeWidth={1} />
                <p className="mt-2 font-mono text-sm text-muted-foreground">
                  {searchQuery ? "No users found matching your search." : "No users yet."}
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {filteredUsers.map((u) => (
                  <UserRow key={u.id} user={u} currentUserId={profile?.id} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HealthCard({
  icon: Icon,
  label,
  value,
  subtext,
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subtext: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-5 shadow-retro-sm ${
        highlight ? "border-foreground bg-foreground" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 ${
            highlight ? "border-background/20 bg-background/10" : "border-border bg-background"
          }`}
        >
          <Icon
            className={`h-5 w-5 ${highlight ? "text-background" : "text-muted-foreground"}`}
            strokeWidth={1.5}
          />
        </div>
      </div>
      <div className="mt-3">
        <p className={`text-3xl font-bold ${highlight ? "text-background" : "text-foreground"}`}>
          {value}
        </p>
        <p className={`font-mono text-xs ${highlight ? "text-background/80" : "text-muted-foreground"}`}>
          {label} • {subtext}
        </p>
      </div>
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
}: {
  user: UserProfile;
  currentUserId?: string;
}) {
  const RoleIcon = ROLE_ICONS[user.role] || User;
  const isCurrentUser = user.id === currentUserId;

  const getInitials = () => {
    if (user.full_name) {
      return user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user.username.slice(0, 2).toUpperCase();
  };

  return (
    <Link href={`/admin/users/${user.id}`}>
      <div className="group flex items-center gap-4 rounded-xl border-2 border-border bg-background p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-foreground hover:shadow-retro-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-sm font-bold">
          {getInitials()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">
              {user.full_name || user.username}
            </p>
            {isCurrentUser && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                You
              </span>
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-medium ${
              user.role === "super_admin" || user.role === "admin"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <RoleIcon className="h-3 w-3" strokeWidth={2} />
            {ROLE_LABELS[user.role]}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${
              user.status === "active" ? "bg-green-500" : "bg-muted-foreground"
            }`}
          />
        </div>
      </div>
    </Link>
  );
}