"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  CheckSquare,
  Calendar,
  FolderKanban,
  List,
  LayoutGrid,
  GripVertical,
  Clock,
  AlertCircle,
  Circle,
  CheckCircle2,
  XCircle,
  Lock,
  Link2,
} from "lucide-react";
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
  assignees?: { user: { full_name: string | null; username: string } }[];
  isBlockedByDependencies?: boolean;
}

interface Column {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const COLUMNS: Column[] = [
  {
    id: "todo",
    title: "To Do",
    icon: Circle,
    color: "text-gray-600",
    bgColor: "bg-gray-50 dark:bg-gray-900/50",
    borderColor: "border-gray-200 dark:border-gray-800",
  },
  {
    id: "in_progress",
    title: "In Progress",
    icon: Clock,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  {
    id: "done",
    title: "Done",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    borderColor: "border-green-200 dark:border-green-800",
  },
  {
    id: "blocked",
    title: "Blocked",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    borderColor: "border-red-200 dark:border-red-800",
  },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 border-gray-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

type FilterType = "all" | "my_tasks";

// Loading skeleton for Suspense fallback
function BoardSkeleton() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-9 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-10 w-28 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
      <div className="flex gap-2 pb-4">
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="flex flex-1 gap-4 overflow-hidden">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="flex w-72 shrink-0 flex-col rounded-2xl border-2 border-border bg-card animate-pulse"
          >
            <div className="h-12 border-b-2 border-border" />
            <div className="flex-1 p-3 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main board content - uses useSearchParams
function TaskBoardContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [myTaskIds, setMyTaskIds] = useState<Set<string>>(new Set());
  const [blockedTaskIds, setBlockedTaskIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get filter from URL if present
  useEffect(() => {
    const urlFilter = searchParams.get("filter") as FilterType | null;
    if (urlFilter && ["all", "my_tasks"].includes(urlFilter)) {
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
        const dependsOnIds = [...new Set(allDependencies.map((d) => d.depends_on_id))];
        
        const { data: dependentTasks } = await supabase
          .from("tasks")
          .select("id, status")
          .in("id", dependsOnIds);

        const taskStatusMap = new Map<string, string>();
        dependentTasks?.forEach((t) => taskStatusMap.set(t.id, t.status));

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
    if (filter === "my_tasks") {
      return myTaskIds.has(task.id);
    }
    return true;
  });

  // Group tasks by status
  const tasksByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = filteredTasks.filter((t) => t.status === col.id);
      return acc;
    },
    {} as Record<string, Task[]>
  );

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    // Prevent dragging blocked tasks (they can't change status)
    if (task.isBlockedByDependencies && task.status !== "blocked") {
      e.preventDefault();
      return;
    }
    
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    
    setTimeout(() => {
      const element = document.getElementById(`task-${task.id}`);
      if (element) {
        element.style.opacity = "0.5";
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (draggedTask) {
      const element = document.getElementById(`task-${draggedTask.id}`);
      if (element) {
        element.style.opacity = "1";
      }
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }

    // Prevent moving blocked tasks (except to "blocked" status)
    if (draggedTask.isBlockedByDependencies && newStatus !== "blocked") {
      setDraggedTask(null);
      return;
    }

    const taskId = draggedTask.id;
    const oldStatus = draggedTask.status;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    setIsUpdating(taskId);

    // Update in database
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (error) {
      console.error("Error updating task status:", error);
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: oldStatus } : t))
      );
    } else {
      // Log to audit
      if (user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "task_status_changed",
          entity_type: "task",
          entity_id: taskId,
          details: {
            title: draggedTask.title,
            from: oldStatus,
            to: newStatus,
          },
        });

        await supabase.from("task_updates").insert({
          task_id: taskId,
          user_id: user.id,
          content: `Moved task from "${COLUMNS.find((c) => c.id === oldStatus)?.title}" to "${COLUMNS.find((c) => c.id === newStatus)?.title}"`,
          update_type: "status_change",
        });
      }
    }

    setIsUpdating(null);
    setDraggedTask(null);
  };

  // Touch handlers for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const xDiff = touchStart.x - e.touches[0].clientX;
    const yDiff = touchStart.y - e.touches[0].clientY;
    
    if (Math.abs(xDiff) > Math.abs(yDiff)) {
      // Let the container scroll naturally
    }
  };

  const taskCounts = {
    all: tasks.length,
    my_tasks: tasks.filter((t) => myTaskIds.has(t.id)).length,
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Task Board
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Drag and drop to update status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center rounded-xl border-2 border-border bg-card p-1 shadow-retro-sm">
            <Link
              href={`/tasks${filter !== "all" ? `?filter=${filter}` : ""}`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground"
              title="List View"
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">List</span>
            </Link>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all bg-foreground text-background shadow-sm"
              title="Board View"
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Board</span>
            </button>
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

      {/* Quick Filters */}
      <div className="flex gap-2 pb-4">
        {(["all", "my_tasks"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border-2 px-3 py-1.5 font-mono text-xs font-medium transition-all ${
              filter === f
                ? "border-foreground bg-foreground text-background shadow-retro-sm"
                : "border-border bg-card text-muted-foreground hover:border-foreground"
            }`}
          >
            {f === "all" ? "All Tasks" : "My Tasks"}
            <span className="ml-1.5 opacity-60">({taskCounts[f]})</span>
          </button>
        ))}
        {blockedTaskIds.size > 0 && (
          <span className="flex items-center gap-1 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-1.5 font-mono text-xs font-medium text-red-600">
            <Lock className="h-3 w-3" />
            {blockedTaskIds.size} blocked
          </span>
        )}
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex flex-1 gap-4 overflow-hidden">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="flex w-72 shrink-0 flex-col rounded-2xl border-2 border-border bg-card animate-pulse"
            >
              <div className="h-12 border-b-2 border-border" />
              <div className="flex-1 p-3 space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex flex-1 gap-4 overflow-x-auto pb-4 snap-x snap-mandatory lg:snap-none scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          {COLUMNS.map((column) => {
            const columnTasks = tasksByStatus[column.id] || [];
            const Icon = column.icon;
            const isOver = dragOverColumn === column.id;

            return (
              <div
                key={column.id}
                className={`flex w-[85vw] sm:w-80 shrink-0 snap-center flex-col rounded-2xl border-2 transition-all duration-200 ${
                  isOver
                    ? `${column.borderColor} ${column.bgColor} scale-[1.02] shadow-retro`
                    : "border-border bg-card shadow-retro-sm"
                }`}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className={`flex items-center justify-between rounded-t-xl border-b-2 px-4 py-3 ${
                  isOver ? column.borderColor : "border-border"
                }`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${column.color}`} strokeWidth={2} />
                    <h3 className="font-bold text-sm">{column.title}</h3>
                  </div>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    columnTasks.length > 0
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {columnTasks.length}
                  </span>
                </div>

                {/* Column Content */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-200px">
                  {columnTasks.length === 0 ? (
                    <div className={`flex h-24 items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
                      isOver ? column.borderColor : "border-border"
                    }`}>
                      <p className="font-mono text-xs text-muted-foreground">
                        {isOver ? "Drop here" : "No tasks"}
                      </p>
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isUpdating={isUpdating === task.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>

                {/* Quick Add */}
                <div className="border-t-2 border-border p-2">
                  <Link
                    href={`/tasks/new?status=${column.id}`}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add task
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile scroll hint */}
      <div className="flex justify-center gap-1.5 pt-2 lg:hidden">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="h-1.5 w-6 rounded-full bg-border"
          />
        ))}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  isUpdating,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  isUpdating: boolean;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragEnd: () => void;
}) {
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

  // Can't drag blocked tasks (except to manually set to "blocked" status)
  const canDrag = !task.isBlockedByDependencies || task.status === "blocked";

  return (
    <div
      id={`task-${task.id}`}
      draggable={canDrag}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={`group relative rounded-xl border-2 bg-background p-3 shadow-sm transition-all duration-200 ${
        canDrag 
          ? "cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-retro-sm" 
          : "cursor-not-allowed"
      } ${
        isUpdating ? "opacity-50 pointer-events-none" : ""
      } ${
        task.status === "done" ? "opacity-60" : ""
      } ${
        task.isBlockedByDependencies 
          ? "border-red-200 bg-red-50/50" 
          : "border-border"
      }`}
    >
      {/* Drag handle indicator */}
      {canDrag && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-50 transition-opacity">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Blocked indicator */}
      {task.isBlockedByDependencies && (
        <div className="absolute right-2 top-2">
          <Lock className="h-4 w-4 text-red-500" />
        </div>
      )}

      {/* Priority indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium uppercase ${
            PRIORITY_COLORS[task.priority]
          }`}
        >
          {task.priority}
        </span>
        {isOverdue && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-red-500">
            <AlertCircle className="h-3 w-3" />
            Overdue
          </span>
        )}
        {task.isBlockedByDependencies && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-red-500">
            <Link2 className="h-3 w-3" />
            Blocked
          </span>
        )}
      </div>

      {/* Title */}
      <Link href={`/tasks/${task.id}`}>
        <h4 className={`font-medium text-sm leading-snug hover:underline ${
          task.status === "done" ? "line-through" : ""
        }`}>
          {task.title}
        </h4>
      </Link>

      {/* Meta */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {task.programme && (
          <span className="flex items-center gap-1 truncate max-w-120px">
            <FolderKanban className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{task.programme.name}</span>
          </span>
        )}
        {task.due_date && (
          <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500" : ""}`}>
            <Calendar className="h-3 w-3" strokeWidth={1.5} />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>

      {/* Loading overlay */}
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/80">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        </div>
      )}
    </div>
  );
}

// Default export wraps content in Suspense
export default function TaskBoardPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <TaskBoardContent />
    </Suspense>
  );
}