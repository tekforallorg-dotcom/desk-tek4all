"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  FolderKanban,
  AlertTriangle,
  Clock,
  Plus,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface DashboardStats {
  totalTasks: number;
  myTasks: number;
  overdueTasks: number;
  completedTasks: number;
  totalProgrammes: number;
  activeProgrammes: number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  programme?: { name: string } | null;
}

interface Programme {
  id: string;
  name: string;
  status: string;
}

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, string> | null;
  created_at: string;
}

export default function DashboardPage() {
  const { profile, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const supabase = createClient();

      // Fetch all tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("*, programme:programmes(name)");

      // Fetch all programmes
      const { data: programmes } = await supabase
        .from("programmes")
        .select("*");

      // Fetch recent audit logs
      const { data: logs } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      // Calculate stats
      const now = new Date();
      const taskList = tasks || [];
      const programmeList = programmes || [];

      const overdueTasks = taskList.filter(
        (t) =>
          t.due_date &&
          new Date(t.due_date) < now &&
          t.status !== "done"
      );

      setStats({
        totalTasks: taskList.length,
        myTasks: taskList.filter((t) => t.assignee_id === user?.id).length,
        overdueTasks: overdueTasks.length,
        completedTasks: taskList.filter((t) => t.status === "done").length,
        totalProgrammes: programmeList.length,
        activeProgrammes: programmeList.filter((p) => p.status === "active")
          .length,
      });

      // Get upcoming tasks (due in next 7 days, not done)
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      const upcoming = taskList
        .filter(
          (t) =>
            t.due_date &&
            new Date(t.due_date) >= now &&
            new Date(t.due_date) <= weekFromNow &&
            t.status !== "done"
        )
        .sort(
          (a, b) =>
            new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
        )
        .slice(0, 5);

      setUpcomingTasks(upcoming);
      setRecentActivity(logs || []);
      setIsLoading(false);
    };

    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  };

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

  const getActivityLabel = (log: AuditLog) => {
    const name = log.details?.title || log.details?.name || "Item";
    switch (log.action) {
      case "task_created":
        return `Created task "${name}"`;
      case "task_updated":
        return `Updated task "${name}"`;
      case "task_deleted":
        return `Deleted task "${name}"`;
      case "task_status_changed":
        return `Changed task status to ${log.details?.to}`;
      case "programme_created":
        return `Created programme "${name}"`;
      case "programme_updated":
        return `Updated programme "${name}"`;
      case "programme_deleted":
        return `Deleted programme "${name}"`;
      default:
        return log.action.replace(/_/g, " ");
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "urgent":
      case "high":
        return "bg-foreground text-background";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border-2 border-border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {getGreeting()}, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <Link href="/tasks/new">
          <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            New Task
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CheckSquare}
          label="My Tasks"
          value={stats?.myTasks || 0}
          subtext={`${stats?.totalTasks || 0} total`}
          href="/tasks?filter=my_tasks"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={stats?.overdueTasks || 0}
          subtext="needs attention"
          href="/tasks?filter=overdue"
          highlight={stats?.overdueTasks ? stats.overdueTasks > 0 : false}
        />
        <StatCard
          icon={Clock}
          label="Completed"
          value={stats?.completedTasks || 0}
          subtext="tasks done"
          href="/tasks?filter=done"
        />
        <StatCard
          icon={FolderKanban}
          label="Programmes"
          value={stats?.activeProgrammes || 0}
          subtext={`${stats?.totalProgrammes || 0} total`}
          href="/programmes"
        />
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Tasks */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
              <Calendar className="h-5 w-5" strokeWidth={1.5} />
              Due This Week
            </h2>
            <Link
              href="/tasks"
              className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {upcomingTasks.length === 0 ? (
              <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                No tasks due this week. 🎉
              </p>
            ) : (
              upcomingTasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`}>
                  <div className="group flex items-center justify-between rounded-xl border-2 border-border bg-background p-3 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-card-foreground">
                        {task.title}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {task.programme?.name || "No programme"} •{" "}
                        {formatDate(task.due_date!)}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${getPriorityStyle(task.priority)}`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
            <Clock className="h-5 w-5" strokeWidth={1.5} />
            Recent Activity
          </h2>

          <div className="mt-4 space-y-3">
            {recentActivity.length === 0 ? (
              <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                No recent activity.
              </p>
            ) : (
              recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 rounded-xl border-2 border-border bg-background p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted">
                    {log.entity_type === "task" ? (
                      <CheckSquare
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <FolderKanban
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-card-foreground">
                      {getActivityLabel(log)}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {formatActivityTime(log.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <h2 className="text-lg font-bold text-card-foreground">Quick Actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tasks/new">
            <Button
              variant="outline"
              className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              New Task
            </Button>
          </Link>
          <Link href="/programmes/new">
            <Button
              variant="outline"
              className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              New Programme
            </Button>
          </Link>
          <Link href="/tasks">
            <Button
              variant="outline"
              className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <CheckSquare className="mr-2 h-4 w-4" strokeWidth={1.5} />
              View All Tasks
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  href,
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  subtext: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={`group rounded-2xl border-2 p-5 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro ${
          highlight
            ? "border-foreground bg-foreground"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-center justify-between">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 ${
              highlight
                ? "border-background/20 bg-background/10"
                : "border-border bg-background"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${highlight ? "text-background" : "text-muted-foreground"}`}
              strokeWidth={1.5}
            />
          </div>
        </div>
        <div className="mt-3">
          <p
            className={`text-3xl font-bold ${highlight ? "text-background" : "text-foreground"}`}
          >
            {value}
          </p>
          <p
            className={`font-mono text-xs ${highlight ? "text-background/80" : "text-muted-foreground"}`}
          >
            {label} • {subtext}
          </p>
        </div>
      </div>
    </Link>
  );
}