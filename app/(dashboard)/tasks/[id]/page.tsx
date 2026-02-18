"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ThreadMessages from "@/components/thread-messages";
import Subtasks from "@/components/subtasks";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit,
  Trash2,
  User,
  Users,
  FolderKanban,
  Send,
  Plus,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  programme_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  programme?: { id: string; name: string } | null;
  creator?: { id: string; full_name: string | null; username: string } | null;
}

interface TaskAssignee {
  id: string;
  user_id: string;
  user: { id: string; full_name: string | null; username: string; email: string };
}

interface TaskUpdate {
  id: string;
  content: string;
  update_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user: { id: string; full_name: string | null; username: string };
}

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700 border-gray-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-green-100 text-green-700 border-green-200",
  blocked: "bg-red-100 text-red-700 border-red-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 border-gray-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

// ─── Audit log helper ────────────────────────────────────────────────────────
// Writes to audit_logs so events show in Activity Stream + Control Tower
async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, string> = {}
) {
  const supabase = createClient();
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
  if (error) {
    console.error("[audit_log] Failed to log:", action, error);
  }
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [showAddAssignee, setShowAddAssignee] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");

  useEffect(() => {
    const fetchTask = async () => {
      const supabase = createClient();

      // Fetch task with programme join
      const { data: taskData, error } = await supabase
        .from("tasks")
        .select(`
          *,
          programme:programmes(id, name)
        `)
        .eq("id", taskId)
        .single();

      if (error || !taskData) {
        console.error("Error fetching task:", error);
        setIsLoading(false);
        return;
      }

      // Fetch creator separately (avoids FK join issues)
      let creator = null;
      if (taskData.created_by) {
        const { data: creatorData } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .eq("id", taskData.created_by)
          .single();
        creator = creatorData;
      }

      // FIX: single setTask call — use separately-fetched creator
      setTask({
        ...taskData,
        programme: Array.isArray(taskData.programme) ? taskData.programme[0] : taskData.programme,
        creator,
      });
      setEditStatus(taskData.status);
      setEditPriority(taskData.priority);

      // Fetch assignees
      const { data: assigneesData } = await supabase
        .from("task_assignees")
        .select("id, user_id")
        .eq("task_id", taskId);

      if (assigneesData && assigneesData.length > 0) {
        const userIds = assigneesData.map((a) => a.user_id);
        const { data: usersData } = await supabase
          .from("profiles")
          .select("id, full_name, username, email")
          .in("id", userIds);

        const assigneesWithUsers = assigneesData.map((a) => ({
          id: a.id,
          user_id: a.user_id,
          user: usersData?.find((u) => u.id === a.user_id) || {
            id: a.user_id,
            full_name: null,
            username: "",
            email: "",
          },
        }));
        setAssignees(assigneesWithUsers);
      }

      // Fetch updates
      const { data: updatesData } = await supabase
        .from("task_updates")
        .select("id, content, update_type, metadata, created_at, user_id")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (updatesData && updatesData.length > 0) {
        const userIds = [...new Set(updatesData.map((u) => u.user_id))];
        const { data: usersData } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds);

        const updatesWithUsers = updatesData.map((u) => ({
          ...u,
          user: usersData?.find((usr) => usr.id === u.user_id) || {
            id: u.user_id,
            full_name: null,
            username: "",
          },
        }));
        setUpdates(updatesWithUsers);
      }

      // Fetch all users for assignment
      const { data: allUsersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("status", "active")
        .order("full_name");
      setAllUsers(allUsersData || []);

      setIsLoading(false);
    };

    fetchTask();
  }, [taskId]);

  const handleDelete = async () => {
    if (!user?.id || !task) return;
    setIsDeleting(true);
    const supabase = createClient();

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) {
      console.error("Error deleting task:", error);
      setIsDeleting(false);
      return;
    }

    // Log to audit_logs
    await logAudit(user.id, "task_deleted", "task", taskId, {
      title: task.title,
    });

    router.push("/tasks");
  };

  const handlePostUpdate = async () => {
    if (!newUpdate.trim() || !user?.id || !task) return;

    setIsPostingUpdate(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("task_updates")
      .insert({
        task_id: taskId,
        user_id: user.id,
        content: newUpdate.trim(),
        update_type: "comment",
      })
      .select()
      .single();

    if (error) {
      console.error("Error posting update:", error);
      setIsPostingUpdate(false);
      return;
    }

    // FIX: Log to audit_logs so it shows in Activity Stream + Control Tower
    await logAudit(user.id, "task_commented", "task", taskId, {
      title: task.title,
      comment: newUpdate.trim().slice(0, 100),
    });

    // Add to local state
    const { data: userData } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .eq("id", user.id)
      .single();

    setUpdates([
      {
        ...data,
        user: userData || { id: user.id, full_name: null, username: "" },
      },
      ...updates,
    ]);
    setNewUpdate("");
    setIsPostingUpdate(false);
  };

  const handleAddAssignee = async (userId: string) => {
    if (!user?.id || !task) return;
    const supabase = createClient();

    const { error } = await supabase.from("task_assignees").insert({
      task_id: taskId,
      user_id: userId,
      assigned_by: user.id,
    });

    if (error) {
      console.error("Error adding assignee:", error);
      return;
    }

    const newUser = allUsers.find((u) => u.id === userId);
    if (newUser) {
      setAssignees([
        ...assignees,
        {
          id: crypto.randomUUID(),
          user_id: userId,
          user: newUser,
        },
      ]);
    }

    // Log to task_updates (in-task timeline)
    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: `Assigned ${newUser?.full_name || newUser?.username} to this task`,
      update_type: "assignment",
    });

    // FIX: Also log to audit_logs
    await logAudit(user.id, "task_assigned", "task", taskId, {
      title: task.title,
      name: newUser?.full_name || newUser?.username || "",
    });

    setShowAddAssignee(false);
  };

  const handleRemoveAssignee = async (assigneeId: string, assigneeUser: TaskAssignee["user"]) => {
    if (!user?.id || !task) return;
    const supabase = createClient();

    await supabase.from("task_assignees").delete().eq("id", assigneeId);

    setAssignees(assignees.filter((a) => a.id !== assigneeId));

    // Log to task_updates (in-task timeline)
    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: `Removed ${assigneeUser.full_name || assigneeUser.username} from this task`,
      update_type: "assignment",
    });

    // FIX: Also log to audit_logs
    await logAudit(user.id, "task_unassigned", "task", taskId, {
      title: task.title,
      name: assigneeUser.full_name || assigneeUser.username,
    });
  };

  const handleSaveChanges = async () => {
    if (!user?.id || !task) return;
    const supabase = createClient();

    const { error } = await supabase
      .from("tasks")
      .update({
        status: editStatus,
        priority: editPriority,
      })
      .eq("id", taskId);

    if (error) {
      console.error("Error updating task:", error);
      return;
    }

    // Log status change to task_updates (in-task timeline)
    if (editStatus !== task.status) {
      await supabase.from("task_updates").insert({
        task_id: taskId,
        user_id: user.id,
        content: `Changed status from "${STATUS_LABELS[task.status || ""]}" to "${STATUS_LABELS[editStatus]}"`,
        update_type: "status_change",
      });

      // FIX: Also log to audit_logs
      await logAudit(user.id, "task_status_changed", "task", taskId, {
        title: task.title,
        from: STATUS_LABELS[task.status] || task.status,
        to: STATUS_LABELS[editStatus] || editStatus,
      });
    }

    // Log priority change
    if (editPriority !== task.priority) {
      await logAudit(user.id, "task_updated", "task", taskId, {
        title: task.title,
        field: "priority",
        from: task.priority,
        to: editPriority,
      });
    }

    setTask((prev) => (prev ? { ...prev, status: editStatus, priority: editPriority } : null));
    setIsEditing(false);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getInitials = (name: string | null, fallback: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return fallback.slice(0, 2).toUpperCase();
  };

  const availableUsers = allUsers.filter(
    (u) => !assignees.some((a) => a.user_id === u.id)
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <h2 className="text-xl font-bold">Task not found</h2>
        <Link href="/tasks" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tasks
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/tasks">
            <Button
              variant="outline"
              size="icon"
              className="border-2 shadow-retro-sm"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {task.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border-2 px-3 py-1 font-mono text-xs font-medium ${
                  STATUS_COLORS[task.status]
                }`}
              >
                {STATUS_LABELS[task.status]}
              </span>
              <span
                className={`rounded-full border-2 px-3 py-1 font-mono text-xs font-medium ${
                  PRIORITY_COLORS[task.priority]
                }`}
              >
                {task.priority}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/tasks/${taskId}/edit`}>
            <Button variant="outline" className="border-2 shadow-retro-sm">
              <Edit className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setShowDeleteConfirm(true)}
            className="border-2 border-red-200 text-red-600 shadow-retro-sm hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="font-bold">Description</h2>
            <p className="mt-3 whitespace-pre-wrap font-mono text-sm text-muted-foreground">
              {task.description || "No description provided."}
            </p>
          </div>

          {/* Subtasks */}
          <Subtasks taskId={task.id} />

          {/* Quick Edit */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Quick Update</h2>
              {isEditing && (
                <Button
                  size="sm"
                  onClick={handleSaveChanges}
                  className="border-2 border-foreground bg-foreground text-background"
                >
                  Save
                </Button>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="font-mono text-xs text-muted-foreground">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => {
                    setEditStatus(e.target.value);
                    setIsEditing(true);
                  }}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-2 font-mono text-sm"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs text-muted-foreground">
                  Priority
                </label>
                <select
                  value={editPriority}
                  onChange={(e) => {
                    setEditPriority(e.target.value);
                    setIsEditing(true);
                  }}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-2 font-mono text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Activity / Updates */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="font-bold">Activity</h2>


            {/* New Update Input */}
            <div className="mt-4">
              <textarea
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="Add an update or comment..."
                rows={2}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={handlePostUpdate}
                  disabled={!newUpdate.trim() || isPostingUpdate}
                  className="border-2 border-foreground bg-foreground text-background"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isPostingUpdate ? "Posting..." : "Post Update"}
                </Button>
              </div>
            </div>

            {/* Updates List */}
            <div className="mt-6 space-y-4">
              {updates.length === 0 ? (
                <p className="py-4 text-center font-mono text-sm text-muted-foreground">
                  No activity yet.
                </p>
              ) : (
                updates.map((update) => (
                  <div
                    key={update.id}
                    className="flex gap-3 border-b border-border pb-4 last:border-0"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                      {getInitials(update.user.full_name, update.user.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {update.user.full_name || update.user.username}
                        </p>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTime(update.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-sm text-muted-foreground">
                        {update.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <ThreadMessages taskId={task.id} title="Discussion" />
        </div>
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Assignees */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Assignees</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddAssignee(true)}
                className="h-8 border-2"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {assignees.length === 0 ? (
                <p className="py-2 font-mono text-xs text-muted-foreground">
                  No one assigned yet.
                </p>
              ) : (
                assignees.map((assignee) => (
                  <div
                    key={assignee.id}
                    className="flex items-center justify-between rounded-lg border-2 border-border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted font-mono text-[10px]">
                        {getInitials(assignee.user.full_name, assignee.user.username)}
                      </div>
                      <span className="text-sm font-medium">
                        {assignee.user.full_name || assignee.user.username}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveAssignee(assignee.id, assignee.user)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Details */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="font-bold">Details</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Created by</p>
                  <p className="text-sm font-medium">
                    {task.creator?.full_name || task.creator?.username || "Unknown"}
                  </p>
                </div>
              </div>

              {task.due_date && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">Due date</p>
                    <p className="text-sm font-medium">{formatDate(task.due_date)}</p>
                  </div>
                </div>
              )}

              {task.programme && (
                <div className="flex items-center gap-3">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">Programme</p>
                    <Link
                      href={`/programmes/${task.programme.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {task.programme.name}
                    </Link>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-mono text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">{formatDate(task.created_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Task?"
        description="This action cannot be undone. The task and all its updates will be permanently deleted."
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Add Assignee Modal */}
      {showAddAssignee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/60"
            onClick={() => setShowAddAssignee(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-xl font-bold">Add Assignee</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Select someone to assign to this task.
            </p>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {availableUsers.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  Everyone is already assigned.
                </p>
              ) : (
                availableUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAddAssignee(u.id)}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-3 text-left transition-all hover:border-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                      {getInitials(u.full_name, u.username)}
                    </div>
                    <div>
                      <p className="font-medium">{u.full_name || u.username}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {u.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAddAssignee(false)}
                className="border-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}