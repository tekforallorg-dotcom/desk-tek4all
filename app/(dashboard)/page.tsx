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
  CalendarDays,
  Shield,
  Mail,
  Activity,
  Video,
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

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, string> | null;
  created_at: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  meeting_link: string | null;
  meeting_platform: string | null;
}

export default function DashboardPage() {
  const { profile, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user?.id || !profile) return;

      const supabase = createClient();
      const isAdmin = profile.role === "admin" || profile.role === "super_admin";
      const isManager = profile.role === "manager";

      // ── 1. Fetch all tasks ──────────────────────────────────────────
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, programme:programmes(name)");

      const taskList = (tasks || []).map((t) => ({
        ...t,
        programme: Array.isArray(t.programme) ? t.programme[0] : t.programme,
      }));

      // ── 2. Get MY task IDs via task_assignees (many-to-many) ────────
      const { data: myAssignments } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", user.id);

      const myTaskIds = new Set((myAssignments || []).map((a) => a.task_id));

      // ── 3. Fetch all programmes ─────────────────────────────────────
      const { data: programmes } = await supabase
        .from("programmes")
        .select("id, status");

      const programmeList = programmes || [];

      // ── 4. Calculate stats ──────────────────────────────────────────
      const now = new Date();

      const myTasks = taskList.filter((t) => myTaskIds.has(t.id));
      const overdueTasks = taskList.filter(
        (t) => t.due_date && new Date(t.due_date) < now && t.status !== "done"
      );

      setStats({
        totalTasks: taskList.length,
        myTasks: myTasks.length,
        overdueTasks: overdueTasks.length,
        completedTasks: taskList.filter((t) => t.status === "done").length,
        totalProgrammes: programmeList.length,
        activeProgrammes: programmeList.filter((p) => p.status === "active").length,
      });

      // ── 5. Due This Week (MY tasks only) ────────────────────────────
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      const upcoming = myTasks
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

      // ── 6. Activity scope via hierarchy ─────────────────────────────
      let activityUserIds: string[] | null = null;

      if (!isAdmin) {
        activityUserIds = [user.id];

        if (isManager) {
          const { data: hierarchyData } = await supabase
            .from("hierarchy")
            .select("report_id")
            .eq("manager_id", user.id);

          for (const h of hierarchyData || []) {
            activityUserIds.push(h.report_id);
          }
        }
      }

      let activityQuery = supabase
        .from("audit_logs")
        .select("*")
        .not("action", "eq", "email_classified")
        .order("created_at", { ascending: false })
        .limit(5);

      if (activityUserIds !== null && activityUserIds.length > 0) {
        activityQuery = activityQuery.in("user_id", activityUserIds);
      }

      const { data: logs } = await activityQuery;
      setRecentActivity(logs || []);

      // ── 7. Build name map for activity display ──────────────────────
      const userIds = [...new Set((logs || []).map((l) => l.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds);

        const names = new Map<string, string>();
        for (const p of profiles || []) {
          names.set(p.id, p.full_name || p.username || "Unknown user");
        }
        setNameMap(names);
      }

      // ── 8. Fetch upcoming calendar events ───────────────────────────
      const weekFromNowCal = new Date();
      weekFromNowCal.setDate(weekFromNowCal.getDate() + 7);

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, start_time, end_time, all_day, meeting_link, meeting_platform")
        .gte("start_time", now.toISOString())
        .lte("start_time", weekFromNowCal.toISOString())
        .order("start_time", { ascending: true })
        .limit(5);

      setUpcomingEvents(calendarEvents || []);

      setIsLoading(false);
    };

    if (user && profile) {
      fetchDashboardData();
    }
  }, [user, profile]);

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

  const getActivityIcon = (log: AuditLog) => {
    if (log.action.startsWith("email")) return Mail;
    if (
      ["login", "user_login", "logout", "password_reset", "password_changed", "user_created"].includes(
        log.action
      )
    )
      return Shield;
    if (log.entity_type === "programme") return FolderKanban;
    if (log.entity_type === "task") return CheckSquare;
    return Activity;
  };

  const getActivityLabel = (log: AuditLog) => {
    const name = log.details?.title || log.details?.name || "";
    switch (log.action) {
      case "task_created":
        return `Created task "${name}"`;
      case "task_updated":
        return `Updated task "${name}"`;
      case "task_deleted":
        return `Deleted task "${name}"`;
      case "task_status_changed":
        return `Changed status to ${log.details?.to || "unknown"}`;
      case "task_assigned":
        return `Assigned task "${name}"`;
      case "task_unassigned":
        return `Unassigned from "${name}"`;
      case "task_commented":
        return `Commented on "${name}"`;
      case "programme_created":
        return `Created programme "${name}"`;
      case "programme_updated":
        return `Updated programme "${name}"`;
      case "programme_deleted":
        return `Deleted programme "${name}"`;
      case "login":
      case "user_login":
        return "Signed in";
      case "logout":
        return "Signed out";
      case "password_reset":
        return `Reset password for ${name || "a user"}`;
      case "password_changed":
        return "Changed password";
      case "user_created":
        return `Created user "${name}"`;
      case "email_replied":
        return `Replied to email "${name}"`;
      case "email_sent":
        return `Sent email "${name}"`;
      case "email_drafted":
        return `Drafted reply to "${name}"`;
      case "programme_member_added":
        return `programme member added`;
      default:
        return log.action.replace(/_/g, " ");
    }
  };

  const getUserName = (userId: string) => {
    return nameMap.get(userId) || "Unknown user";
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

  const formatEventTime = (start: string, end: string, allDay: boolean) => {
    if (allDay) return "All day";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startTime = startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const endTime = endDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${startTime} – ${endTime}`;
  };

  const getEventTypeStyle = (type: string) => {
    switch (type) {
      case "meeting":
        return "bg-foreground text-background";
      case "deadline":
        return "bg-red-100 text-red-700";
      case "reminder":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
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
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {getGreeting()}, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <Link href="/tasks/new">
          <Button className="w-full border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            New Task
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 sm:gap-4">
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
        <div className="overflow-hidden rounded-2xl border-2 border-border bg-card p-4 shadow-retro sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-card-foreground sm:text-lg">
              <Calendar className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Due This Week
            </h2>
            <Link
              href="/tasks"
              className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {upcomingTasks.length === 0 ? (
              <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                No tasks due this week. 
              </p>
            ) : (
              upcomingTasks.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`}>
                  <div className="group flex items-center justify-between rounded-xl border-2 border-border bg-background p-3 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-card-foreground sm:text-base">
                        {task.title}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {task.programme?.name || "No programme"} •{" "}
                        {formatDate(task.due_date!)}
                      </p>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${getPriorityStyle(task.priority)}`}
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
        <div className="overflow-hidden rounded-2xl border-2 border-border bg-card p-4 shadow-retro sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-card-foreground sm:text-lg">
              <Clock className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              Recent Activity
            </h2>
            <Link
              href="/activity"
              className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {recentActivity.length === 0 ? (
              <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                No recent activity.
              </p>
            ) : (
              recentActivity.map((log) => {
                const Icon = getActivityIcon(log);
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-xl border-2 border-border bg-background p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted">
                      <Icon
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-card-foreground">
                        <span className="font-medium">{getUserName(log.user_id)}</span>{" "}
                        <span className="text-muted-foreground">{getActivityLabel(log)}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {formatActivityTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="overflow-hidden rounded-2xl border-2 border-border bg-card p-4 shadow-retro sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-card-foreground sm:text-lg">
            <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={1.5} />
            Upcoming Events
          </h2>
          <Link
            href="/calendar"
            className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            View calendar
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {upcomingEvents.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" strokeWidth={1.5} />
              <p className="font-mono text-sm text-muted-foreground">
                No upcoming events this week.
              </p>
              <Link href="/calendar">
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-2 shadow-retro-sm"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                  Create Event
                </Button>
              </Link>
            </div>
          ) : (
            upcomingEvents.map((event) => (
              <Link key={event.id} href="/calendar">
                <div className="group flex items-center justify-between rounded-xl border-2 border-border bg-background p-3 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro-sm">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted">
                      {event.meeting_link ? (
                        <Video className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      ) : (
                        <Calendar className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-card-foreground sm:text-base">
                        {event.title}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {formatDate(event.start_time)} • {formatEventTime(event.start_time, event.end_time, event.all_day)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${getEventTypeStyle(event.event_type)}`}
                  >
                    {event.event_type}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro sm:p-6">
        <h2 className="text-base font-bold text-card-foreground sm:text-lg">Quick Actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tasks/new">
            <Button
              variant="outline"
              size="sm"
              className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              New Task
            </Button>
          </Link>
          <Link href="/programmes/new">
            <Button
              variant="outline"
              size="sm"
              className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              New Programme
            </Button>
          </Link>
          <Link href="/tasks">
            <Button
              variant="outline"
              size="sm"
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
        className={`group overflow-hidden rounded-2xl border-2 p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro sm:p-5 ${
          highlight
            ? "border-foreground bg-foreground"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-center justify-between">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 sm:h-10 sm:w-10 ${
              highlight
                ? "border-background/20 bg-background/10"
                : "border-border bg-background"
            }`}
          >
            <Icon
              className={`h-4 w-4 sm:h-5 sm:w-5 ${highlight ? "text-background" : "text-muted-foreground"}`}
              strokeWidth={1.5}
            />
          </div>
        </div>
        <div className="mt-3">
          <p
            className={`text-2xl font-bold sm:text-3xl ${highlight ? "text-background" : "text-foreground"}`}
          >
            {value}
          </p>
          <p
            className={`font-mono text-[10px] sm:text-xs ${highlight ? "text-background/80" : "text-muted-foreground"}`}
          >
            {label} • {subtext}
          </p>
        </div>
      </div>
    </Link>
  );
}