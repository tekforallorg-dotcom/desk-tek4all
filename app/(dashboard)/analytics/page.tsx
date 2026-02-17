"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  CheckSquare,
  FolderKanban,
  Users,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  BarChart3,
  Target,
  Download,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface TaskRow {
  id: string;
  status: string;
  priority: string;
  due_date: string | null;
  programme_id: string | null;
  created_at: string;
}

interface ProgrammeRow {
  id: string;
  name: string;
  status: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  role: string;
  status: string;
}

interface AuditRow {
  id: string;
  action: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  created_at: string;
}

/* ─── Analytics Page ─────────────────────────────────────────────────── */

export default function AnalyticsPage() {
  const { user, profile: authProfile } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [taskAssignments, setTaskAssignments] = useState<{ user_id: string; task_id: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [scopedUserIds, setScopedUserIds] = useState<Set<string>>(new Set());
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAll = async () => {
      if (!user?.id || !authProfile) return;

      const supabase = createClient();
      const isAdmin = authProfile.role === "admin" || authProfile.role === "super_admin";
      const isManager = authProfile.role === "manager";

      const scoped = new Set<string>();
      scoped.add(user.id);

      if (isAdmin) {
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("status", "active");
        for (const p of allProfiles || []) scoped.add(p.id);
      } else if (isManager) {
        const { data: hierarchyData } = await supabase
          .from("hierarchy")
          .select("report_id")
          .eq("manager_id", user.id);
        for (const h of hierarchyData || []) scoped.add(h.report_id);
      }

      setScopedUserIds(scoped);

      const { data: taskData } = await supabase
        .from("tasks")
        .select("id, status, priority, due_date, programme_id, created_at");

      const { data: taData } = await supabase
        .from("task_assignees")
        .select("user_id, task_id");

      const scopedTaskIds = new Set<string>();
      const allAssignments = taData || [];

      if (isAdmin) {
        for (const t of taskData || []) scopedTaskIds.add(t.id);
      } else {
        for (const ta of allAssignments) {
          if (scoped.has(ta.user_id)) scopedTaskIds.add(ta.task_id);
        }
      }

      const filteredTasks = (taskData || []).filter((t) => scopedTaskIds.has(t.id));

      const { data: progData } = await supabase
        .from("programmes")
        .select("id, name, status");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, username, role, status");

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let auditQuery = supabase
        .from("audit_logs")
        .select("id, action, created_at")
        .gte("created_at", thirtyDaysAgo)
        .not("action", "eq", "email_classified");

      if (!isAdmin) {
        auditQuery = auditQuery.in("user_id", Array.from(scoped));
      }

      const { data: auditData } = await auditQuery;

      const { data: msgData } = await supabase
        .from("messages")
        .select("id, conversation_id, created_at")
        .gte("created_at", thirtyDaysAgo);

      setTasks(filteredTasks);
      setTaskAssignments(allAssignments);
      setProgrammes(progData || []);
      setProfiles(profileData || []);
      setAuditLogs(auditData || []);
      setMessages(msgData || []);
      setIsLoading(false);
    };

    fetchAll();
  }, [user?.id, authProfile]);

  /* ─── Direct PDF Download ────────────────────────────────────────── */

  const handleExportPdf = useCallback(async () => {
    if (!reportRef.current) return;
    setIsExporting(true);

    try {
      // Dynamic imports — only load when user clicks export
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const element = reportRef.current;

      // Mark body so CSS can flatten styles for capture
      document.body.classList.add("pdf-capture-active");

      // Small delay for CSS to apply
      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 1200,
      });

      document.body.classList.remove("pdf-capture-active");

      // Calculate PDF dimensions (A4 landscape for dashboards)
      const imgWidth = 297; // A4 landscape width in mm
      const pageHeight = 210; // A4 landscape height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      // If content is taller than one page, paginate
      let heightLeft = imgHeight;
      let position = 0;
      const imgData = canvas.toDataURL("image/png");

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Generate filename with date
      const dateStr = new Date().toISOString().slice(0, 10);
      pdf.save(`moondesk-analytics-${dateStr}.pdf`);
    } catch (err) {
      console.error("[Analytics] PDF export failed:", err);
    } finally {
      setIsExporting(false);
      document.body.classList.remove("pdf-capture-active");
    }
  }, []);

  /* ─── Computed metrics ───────────────────────────────────────────── */

  const now = new Date();

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      const s = t.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      const p = t.priority || "none";
      counts[p] = (counts[p] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const overdueTasks = useMemo(
    () => tasks.filter((t) => t.due_date && new Date(t.due_date) < now && t.status !== "done" && t.status !== "completed"),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === "done" || t.status === "completed"),
    [tasks]
  );

  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  const programmeProgress = useMemo(() => {
    return programmes.map((p) => {
      const progTasks = tasks.filter((t) => t.programme_id === p.id);
      const done = progTasks.filter((t) => t.status === "done" || t.status === "completed").length;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        totalTasks: progTasks.length,
        completedTasks: done,
        progress: progTasks.length > 0 ? Math.round((done / progTasks.length) * 100) : 0,
      };
    });
  }, [programmes, tasks]);

  const teamWorkload = useMemo(() => {
    const userTaskMap = new Map<string, { total: number; done: number; overdue: number }>();

    const taskLookup = new Map<string, TaskRow>();
    for (const t of tasks) taskLookup.set(t.id, t);

    for (const ta of taskAssignments) {
      if (!scopedUserIds.has(ta.user_id)) continue;
      const task = taskLookup.get(ta.task_id);
      if (!task) continue;

      if (!userTaskMap.has(ta.user_id)) {
        userTaskMap.set(ta.user_id, { total: 0, done: 0, overdue: 0 });
      }
      const entry = userTaskMap.get(ta.user_id)!;
      entry.total++;
      if (task.status === "done" || task.status === "completed") entry.done++;
      if (task.due_date && new Date(task.due_date) < now && task.status !== "done" && task.status !== "completed") {
        entry.overdue++;
      }
    }

    const profileMap = new Map<string, string>();
    for (const p of profiles) {
      profileMap.set(p.id, p.full_name || p.username || "Unknown");
    }

    return Array.from(userTaskMap.entries())
      .map(([uid, data]) => ({
        name: profileMap.get(uid) || "Unknown",
        ...data,
      }))
      .sort((a, b) => b.total - a.total);
  }, [taskAssignments, tasks, scopedUserIds, profiles]);

  const taskTrend = useMemo(() => {
    const days: { label: string; count: number; dateKey: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        count: 0,
        dateKey: key,
      });
    }
    for (const t of tasks) {
      const key = t.created_at.slice(0, 10);
      const day = days.find((dd) => dd.dateKey === key);
      if (day) day.count++;
    }
    return days;
  }, [tasks]);

  const activityTrend = useMemo(() => {
    const days: { label: string; count: number; dateKey: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        count: 0,
        dateKey: key,
      });
    }
    for (const log of auditLogs) {
      const key = log.created_at.slice(0, 10);
      const day = days.find((dd) => dd.dateKey === key);
      if (day) day.count++;
    }
    return days;
  }, [auditLogs]);

  const messageTrend = useMemo(() => {
    const days: { label: string; count: number; dateKey: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        count: 0,
        dateKey: key,
      });
    }
    for (const m of messages) {
      const key = m.created_at.slice(0, 10);
      const day = days.find((dd) => dd.dateKey === key);
      if (day) day.count++;
    }
    return days;
  }, [messages]);

  const totalMessages = messages.length;
  const activeTeamMembers = profiles.filter((p) => p.status === "active").length;

  const scopeLabel =
    authProfile?.role === "admin" || authProfile?.role === "super_admin"
      ? "Organisation-wide analytics."
      : authProfile?.role === "manager"
        ? "Analytics for you and your direct reports."
        : "Your personal analytics.";

  const reportDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  /* ─── Loading ─────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border-2 border-border bg-card" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Export Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{scopeLabel}</p>
        </div>
        <Button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-retro"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
              Generating...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Export Report
            </>
          )}
        </Button>
      </div>

      {/* ── Capturable report area ─────────────────────────────────── */}
      <div ref={reportRef} id="analytics-report" className="space-y-8 bg-background">
        {/* PDF header — hidden on screen, visible during capture */}
        <div className="pdf-only-header hidden">
          <div style={{ padding: "16px 0", borderBottom: "2px solid #B0B0B0", marginBottom: "24px" }}>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#000000" }}>
              MoonDesk Analytics Report
            </div>
            <div style={{ fontSize: "12px", color: "#7D7D7D", marginTop: "4px", fontFamily: "monospace" }}>
              TEK4ALL | Generated {reportDate} | {scopeLabel}
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={CheckSquare} label="Total Tasks" value={tasks.length} />
          <KpiCard icon={Target} label="Completion" value={`${completionRate}%`} />
          <KpiCard
            icon={AlertTriangle}
            label="Overdue"
            value={overdueTasks.length}
            highlight={overdueTasks.length > 0}
          />
          <KpiCard icon={FolderKanban} label="Programmes" value={programmes.length} />
          <KpiCard icon={Users} label="Team Members" value={activeTeamMembers} />
          <KpiCard icon={MessageSquare} label="Messages (30d)" value={totalMessages} />
        </div>

        {/* Charts Row 1 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Task Status Breakdown" icon={BarChart3}>
            {tasks.length === 0 ? (
              <EmptyChart message="No tasks to analyse." />
            ) : (
              <HorizontalBarChart
                data={Object.entries(statusCounts).map(([label, value]) => ({
                  label: formatStatusLabel(label),
                  value,
                }))}
                total={tasks.length}
              />
            )}
          </ChartCard>

          <ChartCard title="Priority Distribution" icon={AlertTriangle}>
            {tasks.length === 0 ? (
              <EmptyChart message="No tasks to analyse." />
            ) : (
              <HorizontalBarChart
                data={Object.entries(priorityCounts).map(([label, value]) => ({
                  label: formatPriorityLabel(label),
                  value,
                }))}
                total={tasks.length}
              />
            )}
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Tasks Created (14 days)" icon={TrendingUp}>
            <BarChartVertical data={taskTrend} />
          </ChartCard>

          <ChartCard title="Activity Volume (14 days)" icon={TrendingUp}>
            <BarChartVertical data={activityTrend} />
          </ChartCard>
        </div>

        {/* Charts Row 3 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Programme Progress" icon={FolderKanban}>
            {programmeProgress.length === 0 ? (
              <EmptyChart message="No programmes created yet." />
            ) : (
              <div className="space-y-4">
                {programmeProgress.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                        {p.completedTasks}/{p.totalTasks} tasks
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-border bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground transition-all"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-xs font-medium text-foreground">
                        {p.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Team Workload" icon={Users}>
            {teamWorkload.length === 0 ? (
              <EmptyChart message="No task assignments found." />
            ) : (
              <div className="space-y-3">
                {teamWorkload.map((member, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-28 truncate text-sm font-medium text-foreground">
                      {member.name.split(" ")[0]}
                    </span>
                    <div className="flex flex-1 items-center gap-1.5">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-border bg-muted">
                        <div className="flex h-full">
                          {member.done > 0 && (
                            <div
                              className="h-full bg-foreground/40"
                              style={{
                                width: `${(member.done / Math.max(member.total, 1)) * 100}%`,
                              }}
                            />
                          )}
                          {member.overdue > 0 && (
                            <div
                              className="h-full bg-foreground"
                              style={{
                                width: `${(member.overdue / Math.max(member.total, 1)) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      </div>
                      <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
                        {member.done}d {member.overdue > 0 ? `${member.overdue}o` : ""} / {member.total}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-foreground/40" /> Done
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-foreground" /> Overdue
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full border border-border bg-muted" /> Remaining
                  </span>
                </div>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Charts Row 4 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Messaging Volume (14 days)" icon={MessageSquare}>
            <BarChartVertical data={messageTrend} />
          </ChartCard>

          <ChartCard title="Quick Summary" icon={BarChart3}>
            <div className="space-y-3">
              <SummaryRow label="Tasks in progress" value={statusCounts["in_progress"] || 0} />
              <SummaryRow label="Tasks completed" value={completedTasks.length} />
              <SummaryRow label="Overdue tasks" value={overdueTasks.length} />
              <SummaryRow label="High priority tasks" value={priorityCounts["high"] || 0} />
              <SummaryRow label="Active programmes" value={programmes.filter((p) => p.status === "active").length} />
              <SummaryRow label="Draft programmes" value={programmes.filter((p) => p.status === "draft").length} />
              <SummaryRow label="Audit events (30d)" value={auditLogs.length} />
              <SummaryRow label="Messages (30d)" value={totalMessages} />
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-4 shadow-retro-sm ${
        highlight ? "border-foreground bg-foreground" : "border-border bg-card"
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
          highlight ? "border-background/20 bg-background/10" : "border-border bg-background"
        }`}
      >
        <Icon className={`h-4 w-4 ${highlight ? "text-background" : "text-muted-foreground"}`} strokeWidth={1.5} />
      </div>
      <p className={`mt-2 text-2xl font-bold ${highlight ? "text-background" : "text-foreground"}`}>{value}</p>
      <p className={`font-mono text-[10px] uppercase tracking-wider ${highlight ? "text-background/70" : "text-muted-foreground"}`}>
        {label}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        {title}
      </h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center">
      <p className="font-mono text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}

/* ─── Horizontal Bar Chart ───────────────────────────────────────────── */

function HorizontalBarChart({ data, total }: { data: { label: string; value: number }[]; total: number }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {sorted.map((item, i) => {
        const pct = Math.round((item.value / total) * 100);
        const barWidth = Math.max((item.value / max) * 100, 2);
        return (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm text-foreground">{item.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {item.value} ({pct}%)
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border border-border bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Vertical Bar Chart (SVG) ───────────────────────────────────────── */

function BarChartVertical({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const totalItems = data.length;
  const chartWidth = 500;
  const chartHeight = 160;
  const barGap = 4;
  const barWidth = Math.max((chartWidth - barGap * (totalItems + 1)) / totalItems, 8);
  const labelEvery = totalItems > 10 ? 2 : 1;

  const totalCount = data.reduce((sum, d) => sum + d.count, 0);

  if (totalCount === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">No data in this period.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 28}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = chartHeight - pct * chartHeight;
          return (
            <line
              key={pct}
              x1={0}
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke="#B0B0B0"
              strokeWidth={0.5}
              strokeDasharray={pct === 0 ? "0" : "3,3"}
            />
          );
        })}

        {data.map((d, i) => {
          const x = barGap + i * (barWidth + barGap);
          const barHeight = Math.max((d.count / max) * chartHeight, d.count > 0 ? 3 : 0);
          const y = chartHeight - barHeight;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                fill="#000000"
              />
              {i % labelEvery === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 14}
                  textAnchor="middle"
                  fill="#7D7D7D"
                  style={{ fontSize: "8px", fontFamily: "monospace" }}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        <text x={2} y={10} fill="#7D7D7D" style={{ fontSize: "8px", fontFamily: "monospace" }}>
          {max}
        </text>
        <text x={2} y={chartHeight - 2} fill="#7D7D7D" style={{ fontSize: "8px", fontFamily: "monospace" }}>
          0
        </text>
      </svg>
    </div>
  );
}

/* ─── Formatters ─────────────────────────────────────────────────────── */

function formatStatusLabel(status: string): string {
  const map: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done",
    completed: "Completed",
    blocked: "Blocked",
    review: "In Review",
  };
  return map[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPriorityLabel(priority: string): string {
  const map: Record<string, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
    urgent: "Urgent",
    none: "No Priority",
  };
  return map[priority] || priority.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}