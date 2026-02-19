"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckSquare,
  Clock,
  AlertTriangle,
  Download,
  ChevronDown,
  BarChart3,
  PieChart,
  Target,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface ProgrammeAnalyticsProps {
  programmeId: string;
  programmeName: string;
}

interface AnalyticsData {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  completionRate: number;
  tasksByPriority: { priority: string; count: number }[];
  recentActivity: { date: string; completed: number; created: number }[];
  teamMembers: number;
  daysRemaining: number | null;
}

type TimeFilter = "week" | "month" | "quarter" | "all";

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "all", label: "All Time" },
];

export default function ProgrammeAnalytics({
  programmeId,
  programmeName,
}: ProgrammeAnalyticsProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("month");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [data, setData] = useState<AnalyticsData>({
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    todoTasks: 0,
    blockedTasks: 0,
    overdueTasks: 0,
    completionRate: 0,
    tasksByPriority: [],
    recentActivity: [],
    teamMembers: 0,
    daysRemaining: null,
  });

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      const supabase = createClient();

      const now = new Date();
      let startDate: Date | null = null;

      switch (timeFilter) {
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "quarter":
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 3);
          break;
        default:
          startDate = null;
      }

      let query = supabase
        .from("tasks")
        .select("id, status, priority, due_date, created_at, updated_at")
        .eq("programme_id", programmeId);

      if (startDate) {
        query = query.gte("created_at", startDate.toISOString());
      }

      const { data: tasks } = await query;

      const { data: programme } = await supabase
        .from("programmes")
        .select("start_date, end_date")
        .eq("id", programmeId)
        .single();

      const { count: memberCount } = await supabase
        .from("programme_members")
        .select("*", { count: "exact", head: true })
        .eq("programme_id", programmeId);

      const taskList = tasks || [];
      const completed = taskList.filter((t) => t.status === "done").length;
      const inProgress = taskList.filter((t) => t.status === "in_progress").length;
      const todo = taskList.filter((t) => t.status === "todo").length;
      const blocked = taskList.filter((t) => t.status === "blocked").length;
      const overdue = taskList.filter(
        (t) => t.due_date && new Date(t.due_date) < now && t.status !== "done"
      ).length;

      const priorityCounts = ["urgent", "high", "medium", "low"].map((p) => ({
        priority: p,
        count: taskList.filter((t) => t.priority === p).length,
      }));

      const activityDays: { date: string; completed: number; created: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        const completedOnDay = taskList.filter((t) => {
          if (t.status !== "done") return false;
          const updated = new Date(t.updated_at).toISOString().split("T")[0];
          return updated === dateStr;
        }).length;

        const createdOnDay = taskList.filter((t) => {
          const created = new Date(t.created_at).toISOString().split("T")[0];
          return created === dateStr;
        }).length;

        activityDays.push({
          date: date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
          completed: completedOnDay,
          created: createdOnDay,
        });
      }

      let daysRemaining: number | null = null;
      if (programme?.end_date) {
        const endDate = new Date(programme.end_date);
        const diffTime = endDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      setData({
        totalTasks: taskList.length,
        completedTasks: completed,
        inProgressTasks: inProgress,
        todoTasks: todo,
        blockedTasks: blocked,
        overdueTasks: overdue,
        completionRate: taskList.length > 0 ? Math.round((completed / taskList.length) * 100) : 0,
        tasksByPriority: priorityCounts,
        recentActivity: activityDays,
        teamMembers: memberCount || 0,
        daysRemaining,
      });

      setIsLoading(false);
    };

    fetchAnalytics();
  }, [programmeId, timeFilter]);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const rows = [
        ["Programme Analytics Report"],
        [`Programme: ${programmeName}`],
        [`Period: ${TIME_FILTERS.find((f) => f.value === timeFilter)?.label}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ["Metric", "Value"],
        ["Total Tasks", data.totalTasks.toString()],
        ["Completed", data.completedTasks.toString()],
        ["In Progress", data.inProgressTasks.toString()],
        ["To Do", data.todoTasks.toString()],
        ["Blocked", data.blockedTasks.toString()],
        ["Overdue", data.overdueTasks.toString()],
        ["Completion Rate", `${data.completionRate}%`],
        ["Team Members", data.teamMembers.toString()],
        [],
        ["Priority Breakdown"],
        ...data.tasksByPriority.map((p) => [p.priority.toUpperCase(), p.count.toString()]),
        [],
        ["Recent Activity (7 days)"],
        ["Date", "Completed", "Created"],
        ...data.recentActivity.map((a) => [a.date, a.completed.toString(), a.created.toString()]),
      ];

      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${programmeName.replace(/\s+/g, "_")}_analytics_${timeFilter}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export error:", err);
    }

    setIsExporting(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-card shadow-retro overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="text-lg font-bold">Analytics</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Time Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 rounded-lg border-2 border-border bg-background px-3 py-1.5 text-sm font-medium transition-all hover:border-foreground"
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {TIME_FILTERS.find((f) => f.value === timeFilter)?.label}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {showFilterDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowFilterDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl border-2 border-border bg-card shadow-retro-lg overflow-hidden">
                  {TIME_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setTimeFilter(f.value);
                        setShowFilterDropdown(false);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                        timeFilter === f.value
                          ? "bg-foreground text-background"
                          : "hover:bg-muted"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Export Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="border-2 shadow-retro-sm"
          >
            <Download className="mr-1.5 h-4 w-4" />
            {isExporting ? "..." : "Export"}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Completion Rate"
            value={`${data.completionRate}%`}
            icon={Target}
            trend={data.completionRate >= 50 ? "up" : "down"}
            detail={`${data.completedTasks} of ${data.totalTasks} tasks`}
          />
          <KPICard
            label="In Progress"
            value={data.inProgressTasks.toString()}
            icon={Clock}
            detail={`${data.todoTasks} in backlog`}
          />
          <KPICard
            label="Overdue"
            value={data.overdueTasks.toString()}
            icon={AlertTriangle}
            trend={data.overdueTasks > 0 ? "down" : "up"}
            alert={data.overdueTasks > 0}
            detail={data.overdueTasks > 0 ? "Needs attention" : "On track"}
          />
          <KPICard
            label="Days Remaining"
            value={data.daysRemaining !== null ? data.daysRemaining.toString() : "—"}
            icon={Calendar}
            trend={data.daysRemaining !== null && data.daysRemaining < 14 ? "down" : undefined}
            detail={data.daysRemaining !== null && data.daysRemaining < 0 ? "Past deadline" : "Until deadline"}
          />
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Task Status Breakdown */}
          <div className="rounded-xl border-2 border-border bg-background p-4">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-muted-foreground" />
              Task Status
            </h3>
            <div className="space-y-3">
              <StatusBar label="Done" count={data.completedTasks} total={data.totalTasks} color="bg-green-500" />
              <StatusBar label="In Progress" count={data.inProgressTasks} total={data.totalTasks} color="bg-blue-500" />
              <StatusBar label="To Do" count={data.todoTasks} total={data.totalTasks} color="bg-gray-400" />
              <StatusBar label="Blocked" count={data.blockedTasks} total={data.totalTasks} color="bg-red-500" />
            </div>
          </div>

          {/* Priority Distribution */}
          <div className="rounded-xl border-2 border-border bg-background p-4">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Priority Distribution
            </h3>
            <div className="flex items-end justify-between gap-2 h-32">
              {data.tasksByPriority.map((p) => {
                const maxCount = Math.max(...data.tasksByPriority.map((x) => x.count), 1);
                const height = (p.count / maxCount) * 100;
                return (
                  <div key={p.priority} className="flex flex-1 flex-col items-center gap-2">
                    <div className="w-full flex flex-col items-center">
                      <span className="text-xs font-bold mb-1">{p.count}</span>
                      <div
                        className={`w-full rounded-t-lg transition-all ${getPriorityColor(p.priority)}`}
                        style={{ height: `${Math.max(height, 8)}px` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                      {p.priority.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Activity Chart */}
        <div className="rounded-xl border-2 border-border bg-background p-4">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            7-Day Activity
          </h3>
          <div className="flex items-end justify-between gap-1 h-24">
            {data.recentActivity.map((day, i) => {
              const maxVal = Math.max(
                ...data.recentActivity.map((d) => Math.max(d.completed, d.created)),
                1
              );
              const completedHeight = (day.completed / maxVal) * 100;
              const createdHeight = (day.created / maxVal) * 100;

              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end justify-center gap-0.5 h-20">
                    <div
                      className="w-2 rounded-t bg-green-500 transition-all"
                      style={{ height: `${Math.max(completedHeight, 4)}%` }}
                      title={`${day.completed} completed`}
                    />
                    <div
                      className="w-2 rounded-t bg-blue-500 transition-all"
                      style={{ height: `${Math.max(createdHeight, 4)}%` }}
                      title={`${day.created} created`}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {day.date.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Completed
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Created
            </span>
          </div>
        </div>

        {/* Team Summary */}
        <div className="flex items-center justify-between rounded-xl border-2 border-border bg-background p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-muted">
              <CheckSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-mono text-xs text-muted-foreground">Team Performance</p>
              <p className="text-sm font-medium">
                {data.teamMembers} members • {data.completedTasks} tasks completed
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs text-muted-foreground">Avg per member</p>
            <p className="text-lg font-bold">
              {data.teamMembers > 0
                ? (data.completedTasks / data.teamMembers).toFixed(1)
                : "0"}{" "}
              <span className="text-xs font-normal text-muted-foreground">tasks</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon: Icon,
  trend,
  alert,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: "up" | "down";
  alert?: boolean;
  detail?: string;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all ${
        alert
          ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon
          className={`h-5 w-5 ${alert ? "text-red-500" : "text-muted-foreground"}`}
          strokeWidth={1.5}
        />
        {trend && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              trend === "up"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </div>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold ${alert ? "text-red-600" : ""}`}>{value}</p>
      <p className="font-mono text-xs text-muted-foreground">{label}</p>
      {detail && (
        <p className={`mt-1 text-[10px] ${alert ? "text-red-500" : "text-muted-foreground"}`}>
          {detail}
        </p>
      )}
    </div>
  );
}

function StatusBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted-foreground">
          {count} ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-red-500";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-gray-400";
    default:
      return "bg-gray-300";
  }
}