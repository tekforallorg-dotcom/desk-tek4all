"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CheckSquare,
  AlertCircle,
  Clock,
  ArrowRight,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface TeamMember {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string;
  assignee?: TeamMember;
  programme?: { name: string } | null;
}

interface TeamStats {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueThisWeek: number;
}

export default function TeamPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamTasks, setTeamTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TeamStats>({
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
    dueThisWeek: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const isManager = profile?.role === "manager" || profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    const fetchTeamData = async () => {
      if (!user?.id || !isManager) {
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      // Get direct reports
      const { data: hierarchyData } = await supabase
        .from("hierarchy")
        .select("report_id")
        .eq("manager_id", user.id);

      if (!hierarchyData || hierarchyData.length === 0) {
        // For admins, show all users if no direct reports
        if (profile?.role === "admin" || profile?.role === "super_admin") {
          const { data: allUsers } = await supabase
            .from("profiles")
            .select("id, full_name, username, email")
            .neq("id", user.id)
            .order("full_name");
          setTeamMembers(allUsers || []);
          
          if (allUsers && allUsers.length > 0) {
            await fetchTeamTasks(allUsers.map(u => u.id));
          }
        }
        setIsLoading(false);
        return;
      }

      const reportIds = hierarchyData.map((h) => h.report_id);

      // Get team member profiles
      const { data: membersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .in("id", reportIds);

      setTeamMembers(membersData || []);

      // Get team tasks
      await fetchTeamTasks(reportIds);

      setIsLoading(false);
    };

    const fetchTeamTasks = async (memberIds: string[]) => {
      const supabase = createClient();
      
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, assignee_id, programme:programmes(name)")
        .in("assignee_id", memberIds)
        .order("due_date", { ascending: true });

      const tasks: Task[] = (tasksData || []).map((t) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  due_date: t.due_date,
  assignee_id: t.assignee_id,
  programme: Array.isArray(t.programme) ? t.programme[0] : t.programme,
}));
setTeamTasks(tasks);

      // Calculate stats
      const now = new Date();
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      const completed = tasks.filter((t) => t.status === "completed").length;
      const overdue = tasks.filter((t) => {
        if (!t.due_date || t.status === "completed") return false;
        return new Date(t.due_date) < now;
      }).length;
      const dueThisWeek = tasks.filter((t) => {
        if (!t.due_date || t.status === "completed") return false;
        const dueDate = new Date(t.due_date);
        return dueDate >= now && dueDate <= weekFromNow;
      }).length;

      setStats({
        totalTasks: tasks.length,
        completedTasks: completed,
        overdueTasks: overdue,
        dueThisWeek: dueThisWeek,
      });
    };

    if (!authLoading) {
      fetchTeamData();
    }
  }, [user?.id, isManager, authLoading, profile?.role]);

  const filteredTasks = selectedMember
    ? teamTasks.filter((t) => t.assignee_id === selectedMember)
    : teamTasks;

  const activeTasks = filteredTasks.filter((t) => t.status !== "completed");
  const overdueTasks = activeTasks.filter((t) => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < new Date();
  });

  const formatDate = (date: string | null) => {
    if (!date) return "No due date";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  };

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border-2 border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <Users className="h-12 w-12 text-muted-foreground" strokeWidth={1} />
        <h2 className="mt-4 text-xl font-bold">Manager Access Required</h2>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          This page is for managers to view their team.
        </p>
        <Link href="/" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Team Overview
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {teamMembers.length} team member{teamMembers.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-muted">
              <CheckSquare className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalTasks}</p>
              <p className="font-mono text-xs text-muted-foreground">Total Tasks</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-green-50">
              <CheckSquare className="h-5 w-5 text-green-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completedTasks}</p>
              <p className="font-mono text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-red-50">
              <AlertCircle className="h-5 w-5 text-red-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.overdueTasks}</p>
              <p className="font-mono text-xs text-muted-foreground">Overdue</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-blue-50">
              <Clock className="h-5 w-5 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.dueThisWeek}</p>
              <p className="font-mono text-xs text-muted-foreground">Due This Week</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Team Members */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="font-bold">Team Members</h2>
          <div className="mt-4 space-y-2">
            <button
              onClick={() => setSelectedMember(null)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                selectedMember === null
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground"
              }`}
            >
              <Users className="h-5 w-5" strokeWidth={1.5} />
              <span className="font-medium">All Members</span>
              <span className="ml-auto font-mono text-xs opacity-70">
                {teamTasks.filter((t) => t.status !== "completed").length}
              </span>
            </button>

            {teamMembers.map((member) => {
              const memberTasks = teamTasks.filter(
                (t) => t.assignee_id === member.id && t.status !== "completed"
              );
              const memberOverdue = memberTasks.filter((t) => isOverdue(t.due_date));

              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedMember(member.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                    selectedMember === member.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground"
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-current bg-transparent font-mono text-xs">
                    {(member.full_name || member.username)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {member.full_name || member.username}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {memberOverdue.length > 0 && (
                      <span className="rounded bg-red-500 px-1.5 py-0.5 font-mono text-[10px] text-white">
                        {memberOverdue.length}
                      </span>
                    )}
                    <span className="font-mono text-xs opacity-70">
                      {memberTasks.length}
                    </span>
                  </div>
                </button>
              );
            })}

            {teamMembers.length === 0 && (
              <p className="py-4 text-center font-mono text-sm text-muted-foreground">
                No team members assigned.
              </p>
            )}
          </div>
        </div>

        {/* Tasks List */}
        <div className="lg:col-span-2 rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {selectedMember
                ? `${teamMembers.find((m) => m.id === selectedMember)?.full_name || "Member"}'s Tasks`
                : "All Team Tasks"}
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              {activeTasks.length} active
            </span>
          </div>

          {/* Overdue Section */}
          {overdueTasks.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-2 font-mono text-xs font-medium uppercase text-red-600">
                <AlertCircle className="h-3 w-3" />
                Overdue ({overdueTasks.length})
              </p>
              <div className="mt-2 space-y-2">
                {overdueTasks.slice(0, 5).map((task) => (
                  <Link key={task.id} href={`/tasks/${task.id}`}>
                    <div className="flex items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 transition-all hover:border-red-300">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-red-900">
                          {task.title}
                        </p>
                        <p className="font-mono text-xs text-red-600">
                          Due {formatDate(task.due_date)}
                          {task.programme && ` · ${task.programme.name}`}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-red-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Active Tasks */}
          <div className="mt-4">
            <p className="font-mono text-xs font-medium uppercase text-muted-foreground">
              Active Tasks
            </p>
            <div className="mt-2 space-y-2">
              {activeTasks
                .filter((t) => !isOverdue(t.due_date))
                .slice(0, 10)
                .map((task) => (
                  <Link key={task.id} href={`/tasks/${task.id}`}>
                    <div className="flex items-center gap-3 rounded-xl border-2 border-border p-3 transition-all hover:border-foreground">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{task.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatDate(task.due_date)}
                          {task.programme && ` · ${task.programme.name}`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}

              {activeTasks.filter((t) => !isOverdue(t.due_date)).length === 0 && (
                <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                  No active tasks.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}