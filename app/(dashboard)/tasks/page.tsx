"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, CheckSquare, Calendar, Flag, FolderKanban, List, LayoutGrid, Lock, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  programme_id: string | null;
  created_at: string;
  programme?: { name: string } | null;
  isBlockedByDependencies?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  done: "Done",
  blocked: "Blocked",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

type FilterType = "all" | "my_tasks" | "todo" | "in_progress" | "done" | "blocked_by_deps";

// Loading skeleton for Suspense fallback
function TasksListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-10 w-28 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>

      {/* Task rows skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border-2 border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}

// Main content component - uses useSearchParams
function TasksContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [myTaskIds, setMyTaskIds] = useState<Set<string>>(new Set());
  const [blockedTaskIds, setBlockedTaskIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  // Get filter from URL if present
  useEffect(() => {
    const urlFilter = searchParams.get("filter") as FilterType | null;
    if (urlFilter && ["all", "my_tasks", "todo", "in_progress", "done", "blocked_by_deps"].includes(urlFilter)) {
      setFilter(urlFilter);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!user?.id) return;

      const supabase = createClient();

      // Fetch all tasks with programme join
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, status, priority, due_date, programme_id, created_at, programme:programmes(name)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching tasks:", error);
      } else {
        // Normalize programme join
        const normalized: Task[] = (data || []).map((t) => {
          const prog = t.programme;
          return {
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            due_date: t.due_date,
            programme_id: t.programme_id,
            created_at: t.created_at,
            programme: Array.isArray(prog) ? prog[0] ?? null : prog ?? null,
          };
        });
        setTasks(normalized);
      }

      // Fetch user's task assignments
      const { data: myAssignments } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", user.id);

      setMyTaskIds(new Set((myAssignments || []).map((a) => a.task_id)));

      // Fetch all dependencies to determine blocked tasks
      const { data: allDependencies } = await supabase
        .from("task_dependencies")
        .select("task_id, depends_on_id");

      if (allDependencies && allDependencies.length > 0) {
        // Get unique depends_on_ids to check their status
        const dependsOnIds = [...new Set(allDependencies.map((d) => d.depends_on_id))];
        
        const { data: dependentTasks } = await supabase
          .from("tasks")
          .select("id, status")
          .in("id", dependsOnIds);

        // Create a map of task status
        const taskStatusMap = new Map<string, string>();
        dependentTasks?.forEach((t) => taskStatusMap.set(t.id, t.status));

        // Determine which tasks are blocked (have at least one incomplete dependency)
        const blocked = new Set<string>();
        allDependencies.forEach((dep) => {
          const depStatus = taskStatusMap.get(dep.depends_on_id);
          if (depStatus && depStatus !== "done") {
            blocked.add(dep.task_id);
          }
        });

        setBlockedTaskIds(blocked);
      }

      setIsLoading(false);
    };

    fetchTasks();
  }, [user?.id]);

  // Add blocked status to tasks
  const tasksWithBlocked = tasks.map((t) => ({
    ...t,
    isBlockedByDependencies: blockedTaskIds.has(t.id),
  }));

  // Filter tasks
  const filteredTasks = tasksWithBlocked.filter((task) => {
    switch (filter) {
      case "my_tasks":
        return myTaskIds.has(task.id);
      case "todo":
        return task.status === "todo";
      case "in_progress":
        return task.status === "in_progress";
      case "done":
        return task.status === "done";
      case "blocked_by_deps":
        return task.isBlockedByDependencies;
      default:
        return true;
    }
  });

  // Task counts
  const taskCounts = {
    all: tasks.length,
    my_tasks: tasks.filter((t) => myTaskIds.has(t.id)).length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    blocked_by_deps: blockedTaskIds.size,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Tasks
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Manage and track all your tasks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center rounded-xl border-2 border-border bg-card p-1 shadow-retro-sm">
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all bg-foreground text-background shadow-sm"
              title="List View"
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">List</span>
            </button>
            <Link
              href={`/tasks/board${filter !== "all" ? `?filter=${filter}` : ""}`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground"
              title="Board View"
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Board</span>
            </Link>
          </div>

          <Link href="/tasks/new">
            <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">New Task</span>
              <span className="sm:hidden">New</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "my_tasks", "todo", "in_progress", "done", "blocked_by_deps"] as FilterType[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border-2 px-3 py-1.5 font-mono text-xs font-medium transition-all ${
                filter === f
                  ? "border-foreground bg-foreground text-background shadow-retro-sm"
                  : "border-border bg-card text-muted-foreground hover:border-foreground"
              }`}
            >
              {f === "all" && "All"}
              {f === "my_tasks" && "My Tasks"}
              {f === "todo" && "To Do"}
              {f === "in_progress" && "In Progress"}
              {f === "done" && "Done"}
              {f === "blocked_by_deps" && (
                <span className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Blocked
                </span>
              )}
              <span className="ml-1.5 opacity-60">({taskCounts[f]})</span>
            </button>
          )
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border-2 border-border bg-card"
            />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date() &&
    task.status !== "done";

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-foreground text-background";
      case "high":
        return "bg-foreground text-background";
      case "medium":
        return "bg-muted text-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "done":
        return "line-through opacity-60";
      case "blocked":
        return "text-red-600";
      default:
        return "";
    }
  };

  return (
    <Link href={`/tasks/${task.id}`}>
      <div className={`group flex items-center gap-4 rounded-xl border-2 bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro ${
        task.isBlockedByDependencies 
          ? "border-red-200 bg-red-50/50" 
          : "border-border"
      }`}>
        {/* Status checkbox visual */}
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
            task.status === "done"
              ? "border-foreground bg-foreground"
              : task.isBlockedByDependencies
              ? "border-red-300 bg-red-100"
              : "border-border bg-background"
          }`}
        >
          {task.status === "done" ? (
            <CheckSquare className="h-4 w-4 text-background" strokeWidth={2} />
          ) : task.isBlockedByDependencies ? (
            <Lock className="h-3 w-3 text-red-500" strokeWidth={2} />
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={`font-medium text-card-foreground ${getStatusStyle(task.status)}`}
            >
              {task.title}
            </p>
            {task.isBlockedByDependencies && (
              <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 font-mono text-[10px] font-medium text-red-600">
                <Link2 className="h-2.5 w-2.5" />
                Blocked
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {task.programme && (
              <span className="flex items-center gap-1">
                <FolderKanban className="h-3 w-3" strokeWidth={1.5} />
                {task.programme.name}
              </span>
            )}
            {task.due_date && (
              <span
                className={`flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : ""}`}
              >
                <Calendar className="h-3 w-3" strokeWidth={1.5} />
                {formatDate(task.due_date)}
                {isOverdue && " (Overdue)"}
              </span>
            )}
          </div>
        </div>

        {/* Priority & Status badges */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${getPriorityStyle(task.priority)}`}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
          <span className="hidden sm:inline-block rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-muted-foreground">
            {STATUS_LABELS[task.status]}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ filter }: { filter: FilterType }) {
  const messages: Record<FilterType, string> = {
    all: "No tasks yet. Create your first task to get started.",
    my_tasks: "No tasks assigned to you.",
    todo: "No tasks in To Do.",
    in_progress: "No tasks in progress.",
    done: "No completed tasks.",
    blocked_by_deps: "No tasks blocked by dependencies.",
  };

  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
        <CheckSquare className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-4 font-mono text-sm text-muted-foreground">
        {messages[filter]}
      </p>
      {filter === "all" && (
        <Link href="/tasks/new" className="mt-4">
          <Button className="border-2 border-foreground bg-foreground text-background shadow-retro">
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Create Task
          </Button>
        </Link>
      )}
    </div>
  );
}

// Default export wraps content in Suspense
export default function TasksPage() {
  return (
    <Suspense fallback={<TasksListSkeleton />}>
      <TasksContent />
    </Suspense>
  );
}