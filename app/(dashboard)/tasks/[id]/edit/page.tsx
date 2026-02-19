"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Plus, X, FileCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

interface Programme {
  id: string;
  name: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
}

interface TaskAssignee {
  id: string;
  user_id: string;
  user: UserProfile;
}

export default function EditTaskPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const taskId = params.id as string;

  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [taskCreatorId, setTaskCreatorId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [hasEvidenceSubmitted, setHasEvidenceSubmitted] = useState(false);
  const [showAddAssignee, setShowAddAssignee] = useState(false);

  // Permission check: creator, manager, admin, super_admin can edit
  const canEdit =
    profile?.role === "admin" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager" ||
    taskCreatorId === user?.id;

  // Can toggle evidence: only if not submitted AND user has edit permission
  const canToggleEvidence = !hasEvidenceSubmitted && canEdit;

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      // Fetch task
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (taskError || !taskData) {
        setError("Task not found");
        setIsLoading(false);
        return;
      }

      setTitle(taskData.title);
      setDescription(taskData.description || "");
      setStatus(taskData.status);
      setPriority(taskData.priority);
      setDueDate(taskData.due_date || "");
      setProgrammeId(taskData.programme_id || "");
      setEvidenceRequired(taskData.evidence_required || false);
      setHasEvidenceSubmitted(!!taskData.evidence_submitted_at);
      setTaskCreatorId(taskData.created_by);

      // Fetch programmes
      const { data: programmesData } = await supabase
        .from("programmes")
        .select("id, name")
        .order("name");
      setProgrammes(programmesData || []);

      // Fetch all users
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("status", "active")
        .order("full_name");
      setAllUsers(usersData || []);

      // Fetch current assignees
      const { data: assigneesData } = await supabase
        .from("task_assignees")
        .select("id, user_id")
        .eq("task_id", taskId);

      if (assigneesData && assigneesData.length > 0) {
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

      setIsLoading(false);
    };

    fetchData();
  }, [taskId]);

  const handleAddAssignee = async (userId: string) => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("task_assignees")
      .insert({
        task_id: taskId,
        user_id: userId,
        assigned_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding assignee:", error);
      return;
    }

    const newUser = allUsers.find((u) => u.id === userId);
    if (newUser) {
      setAssignees([...assignees, { id: data.id, user_id: userId, user: newUser }]);
    }
    setShowAddAssignee(false);
  };

  const handleRemoveAssignee = async (assigneeId: string) => {
    const supabase = createClient();
    await supabase.from("task_assignees").delete().eq("id", assigneeId);
    setAssignees(assignees.filter((a) => a.id !== assigneeId));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!canEdit) {
      setError("You don't have permission to edit this task");
      return;
    }
    
    setIsSaving(true);
    setError("");

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        title,
        description: description || null,
        status,
        priority,
        due_date: dueDate || null,
        programme_id: programmeId || null,
        evidence_required: evidenceRequired,
      })
      .eq("id", taskId);

    if (updateError) {
      setError(updateError.message);
      setIsSaving(false);
      return;
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user?.id,
      action: "task_updated",
      entity_type: "task",
      entity_id: taskId,
      details: { title, evidence_required: evidenceRequired },
    });

    router.push(`/tasks/${taskId}`);
  };

  const getInitials = (name: string | null, fallback: string) => {
    if (name) {
      return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return fallback.slice(0, 2).toUpperCase();
  };

  const availableUsers = allUsers.filter(
    (u) => !assignees.some((a) => a.user_id === u.id)
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  // Permission denied state
  if (!isLoading && !canEdit && taskCreatorId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/tasks/${taskId}`}>
            <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Edit Task
            </h1>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-xl font-bold text-red-700">Permission Denied</h2>
          <p className="mt-2 text-red-600">
            Only the task creator, managers, or admins can edit this task.
          </p>
          <Link href={`/tasks/${taskId}`} className="mt-6 inline-block">
            <Button variant="outline" className="border-2 border-red-200 text-red-600 hover:bg-red-100">
              Back to Task
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/tasks/${taskId}`}>
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Edit Task
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Update task details and assignees.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="text-lg font-bold text-card-foreground">Task Details</h2>

          <div className="mt-6 space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Task Title *
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
              />
            </div>

            {/* Assignees */}
            <div className="space-y-2">
              <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assignees
              </label>
              <div className="flex flex-wrap gap-2">
                {assignees.map((assignee) => (
                  <div
                    key={assignee.id}
                    className="flex items-center gap-2 rounded-full border-2 border-border bg-muted px-3 py-1"
                  >
                    <span className="text-sm font-medium">
                      {assignee.user.full_name || assignee.user.username}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAssignee(assignee.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAddAssignee(true)}
                  className="flex items-center gap-1 rounded-full border-2 border-dashed border-border px-3 py-1 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>

            {/* Status & Priority */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Due Date & Programme */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Due Date
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Programme
                </label>
                <select
                  value={programmeId}
                  onChange={(e) => setProgrammeId(e.target.value)}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
                >
                  <option value="">No programme</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Evidence Required */}
            <div className={`rounded-xl border-2 p-4 ${
              evidenceRequired 
                ? "border-foreground bg-muted" 
                : "border-border bg-muted/30"
            }`}>
              <label className={`flex items-start gap-3 ${canToggleEvidence ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
                <input
                  type="checkbox"
                  checked={evidenceRequired}
                  onChange={(e) => canToggleEvidence && setEvidenceRequired(e.target.checked)}
                  disabled={!canToggleEvidence}
                  className="mt-1 h-4 w-4 rounded border-2 border-foreground text-foreground focus:ring-foreground disabled:opacity-50"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <FileCheck className={`h-4 w-4 ${evidenceRequired ? "text-foreground" : "text-muted-foreground"}`} />
                    <span className={`font-medium ${evidenceRequired ? "text-foreground" : "text-foreground"}`}>
                      Require Evidence
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Assignee must submit evidence (link to doc/photo) and get
                    manager approval before this task can be marked complete.
                  </p>
                  {hasEvidenceSubmitted && (
                    <p className="mt-2 font-mono text-xs text-amber-600">
                      Cannot change — evidence has already been submitted.
                    </p>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href={`/tasks/${taskId}`}>
            <Button type="button" variant="outline" className="border-2 shadow-retro-sm">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSaving}
            className="border-2 border-foreground bg-foreground text-background shadow-retro"
          >
            {isSaving ? "Saving..." : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Add Assignee Modal */}
      {showAddAssignee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/60" onClick={() => setShowAddAssignee(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-xl font-bold">Add Assignee</h2>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {availableUsers.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  Everyone is already assigned.
                </p>
              ) : (
                availableUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleAddAssignee(u.id)}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-3 text-left hover:border-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                      {getInitials(u.full_name, u.username)}
                    </div>
                    <div>
                      <p className="font-medium">{u.full_name || u.username}</p>
                      {u.email && (
                        <p className="font-mono text-xs text-muted-foreground">{u.email}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setShowAddAssignee(false)} className="border-2">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}