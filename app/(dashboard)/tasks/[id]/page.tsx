"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ThreadMessages from "@/components/thread-messages";
import Subtasks from "@/components/subtasks";
import { TaskAttachments } from "@/components/task-attachments";
import { EvidenceSubmission } from "@/components/evidence-submission";
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
  FileCheck,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Link2,
  Lock,
  Unlock,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  // Evidence fields
  evidence_required: boolean;
  evidence_link: string | null;
  evidence_notes: string | null;
  evidence_submitted_at: string | null;
  evidence_submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  // Joins
  programme?: { id: string; name: string } | null;
  creator?: { id: string; full_name: string | null; username: string } | null;
  reviewer?: { id: string; full_name: string | null; username: string } | null;
  submitter?: { id: string; full_name: string | null; username: string } | null;
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

interface Dependency {
  dependency_id: string;
  task: { id: string; title: string; status: string };
  created_at: string;
}

interface DependenciesData {
  dependencies: Dependency[];
  dependents: Dependency[];
  isBlocked: boolean;
  incompleteCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  done: "Done",
  blocked: "Blocked",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700 border-gray-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  pending_review: "bg-amber-100 text-amber-700 border-amber-200",
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
  const { user, profile } = useAuth();
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

  // Evidence state
  const [evidenceLink, setEvidenceLink] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");

  // Review state
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [canReview, setCanReview] = useState(false);

  // Dependencies state
  const [dependenciesData, setDependenciesData] = useState<DependenciesData | null>(null);
  const [showAddDependency, setShowAddDependency] = useState(false);
  const [allTasks, setAllTasks] = useState<{ id: string; title: string; status: string }[]>([]);
  const [dependencySearch, setDependencySearch] = useState("");
  const [isAddingDependency, setIsAddingDependency] = useState(false);
  const [dependencyError, setDependencyError] = useState("");

  // Check if current user is an assignee
  const isAssignee = assignees.some((a) => a.user_id === user?.id);

  // Check if user can edit: creator OR admin/super_admin only
  // Managers can only edit tasks THEY created
  const canEdit =
    profile?.role === "admin" ||
    profile?.role === "super_admin" ||
    task?.created_by === user?.id;

  // Check if task is blocked by dependencies
  const isBlockedByDependencies = dependenciesData?.isBlocked || false;

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

      // Fetch creator separately
      let creator = null;
      if (taskData.created_by) {
        const { data: creatorData } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .eq("id", taskData.created_by)
          .single();
        creator = creatorData;
      }

      // Fetch reviewer separately
      let reviewer = null;
      if (taskData.reviewed_by) {
        const { data: reviewerData } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .eq("id", taskData.reviewed_by)
          .single();
        reviewer = reviewerData;
      }

      // Fetch evidence submitter separately
      let submitter = null;
      if (taskData.evidence_submitted_by) {
        const { data: submitterData } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .eq("id", taskData.evidence_submitted_by)
          .single();
        submitter = submitterData;
      }

      setTask({
        ...taskData,
        programme: Array.isArray(taskData.programme) ? taskData.programme[0] : taskData.programme,
        creator,
        reviewer,
        submitter,
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

      // Fetch all tasks for dependency picker
      const { data: allTasksData } = await supabase
        .from("tasks")
        .select("id, title, status")
        .neq("id", taskId)
        .order("created_at", { ascending: false });
      setAllTasks(allTasksData || []);

      setIsLoading(false);
    };

    fetchTask();
  }, [taskId]);

  // Fetch dependencies
  useEffect(() => {
    const fetchDependencies = async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/dependencies`);
        if (response.ok) {
          const data = await response.json();
          setDependenciesData(data);
        }
      } catch (err) {
        console.error("Error fetching dependencies:", err);
      }
    };

    if (taskId) {
      fetchDependencies();
    }
  }, [taskId]);

  // Check review permission when task/profile changes
  useEffect(() => {
    const checkReviewPermission = async () => {
      if (!user?.id || !profile || !task) {
        setCanReview(false);
        return;
      }

      // RULE 1: Evidence submitter CANNOT approve their own evidence
      if (task.evidence_submitted_by === user.id) {
        setCanReview(false);
        return;
      }

      // RULE 2: Admins and super_admins can approve
      if (profile.role === "admin" || profile.role === "super_admin") {
        setCanReview(true);
        return;
      }

      // RULE 3: Task creator can approve if they're a manager+
      if (
        task.created_by === user.id &&
        ["manager", "admin", "super_admin"].includes(profile.role)
      ) {
        setCanReview(true);
        return;
      }

      // RULE 4: Direct manager of evidence submitter can approve
      if (task.evidence_submitted_by) {
        const supabase = createClient();
        const { data: hierarchyMatch } = await supabase
          .from("hierarchy")
          .select("id")
          .eq("manager_id", user.id)
          .eq("report_id", task.evidence_submitted_by)
          .single();

        if (hierarchyMatch) {
          setCanReview(true);
          return;
        }
      }

      setCanReview(false);
    };

    checkReviewPermission();
  }, [user?.id, profile, task]);

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

    await logAudit(user.id, "task_commented", "task", taskId, {
      title: task.title,
      comment: newUpdate.trim().slice(0, 100),
    });

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
    
    // Notify task participants about comment
    fetch(`/api/tasks/${taskId}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "comment", comment: newUpdate.trim() }),
    }).catch(console.error);

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

    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: `Assigned ${newUser?.full_name || newUser?.username} to this task`,
      update_type: "assignment",
    });

    await logAudit(user.id, "task_assigned", "task", taskId, {
      title: task.title,
      name: newUser?.full_name || newUser?.username || "",
    });

    setShowAddAssignee(false);

    // Notify assignee
    fetch(`/api/tasks/${taskId}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "assigned", assignee_id: userId }),
    }).catch(console.error);
  };

  const handleRemoveAssignee = async (assigneeId: string, assigneeUser: TaskAssignee["user"]) => {
    if (!user?.id || !task) return;
    const supabase = createClient();

    await supabase.from("task_assignees").delete().eq("id", assigneeId);

    setAssignees(assignees.filter((a) => a.id !== assigneeId));

    await supabase.from("task_updates").insert({
      task_id: taskId,
      user_id: user.id,
      content: `Removed ${assigneeUser.full_name || assigneeUser.username} from this task`,
      update_type: "assignment",
    });

    await logAudit(user.id, "task_unassigned", "task", taskId, {
      title: task.title,
      name: assigneeUser.full_name || assigneeUser.username,
    });
  };

  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSaveChanges = async () => {
    if (!user?.id || !task) return;

    // Block status change if blocked by dependencies (except to "blocked" status)
    if (isBlockedByDependencies && editStatus !== "blocked" && editStatus !== task.status) {
      setSaveError("Cannot change status while blocked by incomplete dependencies.");
      return;
    }

    setIsSavingStatus(true);
    setSaveError("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("tasks")
      .update({
        status: editStatus,
        priority: editPriority,
      })
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      console.error("Error updating task:", error);
      setSaveError("Failed to save changes. Please try again.");
      setIsSavingStatus(false);
      return;
    }

    if (!data) {
      console.error("No data returned from update - possible RLS issue");
      setSaveError("Failed to save changes. You may not have permission.");
      setIsSavingStatus(false);
      return;
    }

    if (editStatus !== task.status) {
      await supabase.from("task_updates").insert({
        task_id: taskId,
        user_id: user.id,
        content: `Changed status from "${STATUS_LABELS[task.status] || task.status}" to "${STATUS_LABELS[editStatus] || editStatus}"`,
        update_type: "status_change",
      });

      await logAudit(user.id, "task_status_changed", "task", taskId, {
        title: task.title,
        from: STATUS_LABELS[task.status] || task.status,
        to: STATUS_LABELS[editStatus] || editStatus,
      });

      // Notify task participants about status change
      fetch(`/api/tasks/${taskId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status_changed", new_status: editStatus }),
      }).catch(console.error);
    }

    if (editPriority !== task.priority) {
      await logAudit(user.id, "task_updated", "task", taskId, {
        title: task.title,
        field: "priority",
        from: task.priority,
        to: editPriority,
      });
    }

    setTask((prev) => (prev ? { ...prev, status: data.status, priority: data.priority } : null));
    setIsEditing(false);
    setIsSavingStatus(false);
  };

  // ─── Evidence Submission ─────────────────────────────────────────────────────
  const handleSubmitEvidence = async () => {
    if (!evidenceLink.trim()) {
      setEvidenceError("Please provide an evidence link");
      return;
    }

    setIsSubmittingEvidence(true);
    setEvidenceError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}/submit-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence_link: evidenceLink.trim(),
          evidence_notes: evidenceNotes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setEvidenceError(data.error || "Failed to submit evidence");
        setIsSubmittingEvidence(false);
        return;
      }

      setTask((prev) =>
        prev
          ? {
              ...prev,
              status: "pending_review",
              evidence_link: evidenceLink.trim(),
              evidence_notes: evidenceNotes.trim() || null,
              evidence_submitted_at: new Date().toISOString(),
              evidence_submitted_by: user?.id || null,
            }
          : null
      );
      setEditStatus("pending_review");
      setEvidenceLink("");
      setEvidenceNotes("");
    } catch (err) {
      console.error("Submit evidence error:", err);
      setEvidenceError("An unexpected error occurred");
    } finally {
      setIsSubmittingEvidence(false);
    }
  };

  // ─── Review Actions ──────────────────────────────────────────────────────────
  const handleReview = async (action: "approve" | "reject") => {
    if (action === "reject" && !reviewNotes.trim()) {
      return;
    }

    setIsReviewing(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          review_notes: reviewNotes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Review error:", data.error);
        setIsReviewing(false);
        return;
      }

      const newStatus = action === "approve" ? "done" : "in_progress";
      setTask((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              reviewed_by: user?.id || null,
              reviewed_at: new Date().toISOString(),
              review_notes: reviewNotes.trim() || null,
              ...(action === "reject"
                ? {
                    evidence_link: null,
                    evidence_notes: null,
                    evidence_submitted_at: null,
                  }
                : {}),
            }
          : null
      );
      setEditStatus(newStatus);
      setShowRejectForm(false);
      setReviewNotes("");
    } catch (err) {
      console.error("Review error:", err);
    } finally {
      setIsReviewing(false);
    }
  };

  // ─── Dependency Management ───────────────────────────────────────────────────
  const handleAddDependency = async (dependsOnId: string) => {
    setIsAddingDependency(true);
    setDependencyError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depends_on_id: dependsOnId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setDependencyError(data.error || "Failed to add dependency");
        setIsAddingDependency(false);
        return;
      }

      // Refresh dependencies
      const depsResponse = await fetch(`/api/tasks/${taskId}/dependencies`);
      if (depsResponse.ok) {
        const depsData = await depsResponse.json();
        setDependenciesData(depsData);
      }

      setShowAddDependency(false);
      setDependencySearch("");
    } catch (err) {
      console.error("Add dependency error:", err);
      setDependencyError("An unexpected error occurred");
    } finally {
      setIsAddingDependency(false);
    }
  };

  const handleRemoveDependency = async (dependencyId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependency_id: dependencyId }),
      });

      if (response.ok) {
        // Refresh dependencies
        const depsResponse = await fetch(`/api/tasks/${taskId}/dependencies`);
        if (depsResponse.ok) {
          const depsData = await depsResponse.json();
          setDependenciesData(depsData);
        }
      }
    } catch (err) {
      console.error("Remove dependency error:", err);
    }
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

  // Filter tasks for dependency picker (exclude already added dependencies)
  const availableTasksForDependency = allTasks.filter((t) => {
    const alreadyDependent = dependenciesData?.dependencies.some(
      (d) => d.task.id === t.id
    );
    return !alreadyDependent && t.id !== taskId;
  });

  const filteredTasksForDependency = availableTasksForDependency.filter((t) =>
    t.title.toLowerCase().includes(dependencySearch.toLowerCase())
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

  // Determine what evidence UI to show
  const showPendingReview = task.status === "pending_review" && task.evidence_link;
  const showReviewActions = task.status === "pending_review" && canReview;
  const showRejectionFeedback =
    task.status === "in_progress" && task.review_notes && task.reviewed_at;

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
                  STATUS_COLORS[task.status] || STATUS_COLORS.todo
                }`}
              >
                {STATUS_LABELS[task.status] || task.status}
              </span>
              <span
                className={`rounded-full border-2 px-3 py-1 font-mono text-xs font-medium ${
                  PRIORITY_COLORS[task.priority]
                }`}
              >
                {task.priority}
              </span>
              {task.evidence_required && (
                <span className="flex items-center gap-1 rounded-full border-2 border-foreground bg-muted px-3 py-1 font-mono text-xs font-medium text-foreground">
                  <FileCheck className="h-3 w-3" />
                  Evidence Required
                </span>
              )}
              {isBlockedByDependencies && (
                <span className="flex items-center gap-1 rounded-full border-2 border-red-300 bg-red-100 px-3 py-1 font-mono text-xs font-medium text-red-700">
                  <Lock className="h-3 w-3" />
                  Blocked
                </span>
              )}
            </div>
          </div>
        </div>

        {canEdit && (
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
        )}
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

          {/* Dependencies Section */}
          {(dependenciesData?.dependencies.length || dependenciesData?.dependents.length || canEdit) && (
            <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-foreground" />
                  <h2 className="font-bold">Dependencies</h2>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddDependency(true)}
                    className="h-8 border-2"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Blocked Warning */}
              {isBlockedByDependencies && (
                <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-5 w-5 text-red-500" />
                    <div>
                      <p className="font-medium text-red-700">
                        Blocked by {dependenciesData?.incompleteCount} incomplete task
                        {dependenciesData?.incompleteCount !== 1 ? "s" : ""}
                      </p>
                      <p className="mt-1 font-mono text-sm text-red-600">
                        Complete the tasks below before this task can progress.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* This task depends on (blockers) */}
              {dependenciesData && dependenciesData.dependencies.length > 0 && (
                <div className="mt-4">
                  <p className="font-mono text-xs text-muted-foreground uppercase tracking-wide">
                    This task depends on
                  </p>
                  <div className="mt-2 space-y-2">
                    {dependenciesData.dependencies.map((dep) => (
                      <div
                        key={dep.dependency_id}
                        className={`flex items-center justify-between rounded-xl border-2 p-3 ${
                          dep.task.status === "done"
                            ? "border-green-200 bg-green-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {dep.task.status === "done" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                          )}
                          <Link
                            href={`/tasks/${dep.task.id}`}
                            className="font-medium hover:underline"
                          >
                            {dep.task.title}
                          </Link>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                              dep.task.status === "done"
                                ? "bg-green-200 text-green-700"
                                : "bg-amber-200 text-amber-700"
                            }`}
                          >
                            {STATUS_LABELS[dep.task.status] || dep.task.status}
                          </span>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => handleRemoveDependency(dep.dependency_id)}
                            className="text-muted-foreground hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tasks that depend on this task */}
              {dependenciesData && dependenciesData.dependents.length > 0 && (
                <div className="mt-4">
                  <p className="font-mono text-xs text-muted-foreground uppercase tracking-wide">
                    Tasks blocked by this
                  </p>
                  <div className="mt-2 space-y-2">
                    {dependenciesData.dependents.map((dep) => (
                      <div
                        key={dep.dependency_id}
                        className="flex items-center gap-3 rounded-xl border-2 border-border bg-muted/30 p-3"
                      >
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <Link
                          href={`/tasks/${dep.task.id}`}
                          className="font-medium hover:underline"
                        >
                          {dep.task.title}
                        </Link>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {STATUS_LABELS[dep.task.status] || dep.task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {(!dependenciesData ||
                (dependenciesData.dependencies.length === 0 &&
                  dependenciesData.dependents.length === 0)) && (
                <p className="mt-4 font-mono text-sm text-muted-foreground">
                  No dependencies. Click + to add one.
                </p>
              )}
            </div>
          )}

            {/* Attachments Section */}
<TaskAttachments
  entityType="task"
  entityId={task.id}
  canAdd={isAssignee || canEdit}
  canRemove={canEdit}
/>

          {/* Evidence Section */}
          {(task.evidence_required || showPendingReview) && (
            <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-foreground" />
                <h2 className="font-bold">Evidence</h2>
              </div>

              {/* Rejection Feedback */}
              {showRejectionFeedback && (
                <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 text-red-500" />
                    <div>
                      <p className="font-medium text-red-700">Evidence Rejected</p>
                      <p className="mt-1 font-mono text-sm text-red-600">
                        {task.review_notes}
                      </p>
                      <p className="mt-2 font-mono text-xs text-red-500">
                        Reviewed by{" "}
                        {task.reviewer?.full_name ||
                          task.reviewer?.username ||
                          "Unknown"}{" "}
                        on {formatTime(task.reviewed_at!)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Guidance for To Do status */}
              {task.evidence_required && task.status === "todo" && isAssignee && (
                <div className="mt-4 rounded-xl border-2 border-border bg-muted/50 p-4">
                  <p className="font-mono text-sm text-muted-foreground">
                    Change status to <strong>"In Progress"</strong> above, then
                    submit your evidence here.
                  </p>
                </div>
              )}

              {/* Submit Evidence Form */}
              {task.evidence_required &&
  task.status === "in_progress" &&
  isAssignee &&
  !isBlockedByDependencies && (
    <EvidenceSubmission
      taskId={taskId}
      onSubmitSuccess={(link, notes) => {
        setTask((prev) =>
          prev
            ? {
                ...prev,
                status: "pending_review",
                evidence_link: link,
                evidence_notes: notes,
                evidence_submitted_at: new Date().toISOString(),
                evidence_submitted_by: user?.id || null,
              }
            : null
        );
        setEditStatus("pending_review");
      }}
    />
  )}

              {/* Blocked by dependencies - can't submit evidence */}
              {task.evidence_required &&
                task.status === "in_progress" &&
                isAssignee &&
                isBlockedByDependencies && (
                  <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <Lock className="mt-0.5 h-5 w-5 text-amber-600" />
                      <p className="font-mono text-sm text-amber-700">
                        Complete all dependencies before submitting evidence.
                      </p>
                    </div>
                  </div>
                )}

              {/* Pending Review Display */}
              {showPendingReview && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-700">Awaiting Review</p>
                        <p className="mt-1 font-mono text-sm text-amber-600">
                          Evidence submitted on{" "}
                          {formatTime(task.evidence_submitted_at!)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-border p-4">
                    <p className="font-mono text-xs text-muted-foreground">
                      Submitted Evidence
                    </p>
                    <a
                      href={task.evidence_link!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-start gap-2 font-medium text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="break-all">{task.evidence_link}</span>
                    </a>
                    {task.evidence_notes && (
                      <p className="mt-2 font-mono text-sm text-muted-foreground">
                        {task.evidence_notes}
                      </p>
                    )}
                  </div>

                  {/* Review Actions */}
                  {showReviewActions && (
                    <div className="space-y-3">
                      {!showRejectForm ? (
                        <div className="flex gap-3">
                          <Button
                            onClick={() => handleReview("approve")}
                            disabled={isReviewing}
                            className="flex-1 border-2 border-green-600 bg-green-600 text-white shadow-retro hover:bg-green-700"
                          >
                            {isReviewing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Approve
                          </Button>
                          <Button
                            onClick={() => setShowRejectForm(true)}
                            disabled={isReviewing}
                            variant="outline"
                            className="flex-1 border-2 border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3 rounded-xl border-2 border-red-200 bg-red-50 p-4">
                          <p className="font-medium text-red-700">Reject Evidence</p>
                          <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Explain why the evidence is being rejected..."
                            rows={2}
                            className="w-full rounded-xl border-2 border-red-200 bg-white px-4 py-3 font-mono text-sm focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleReview("reject")}
                              disabled={isReviewing || !reviewNotes.trim()}
                              className="border-2 border-red-600 bg-red-600 text-white hover:bg-red-700"
                            >
                              {isReviewing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <XCircle className="mr-2 h-4 w-4" />
                              )}
                              Confirm Reject
                            </Button>
                            <Button
                              onClick={() => {
                                setShowRejectForm(false);
                                setReviewNotes("");
                              }}
                              variant="outline"
                              className="border-2"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message for submitter */}
                  {task.status === "pending_review" &&
                    task.evidence_submitted_by === user?.id &&
                    !canReview && (
                      <div className="rounded-xl border-2 border-border bg-muted/50 p-4">
                        <p className="font-mono text-sm text-muted-foreground">
                          You submitted this evidence. The task creator or your
                          manager will review it.
                        </p>
                      </div>
                    )}
                </div>
              )}

              {/* Completed with evidence */}
              {task.status === "done" && task.evidence_link && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-700">
                          Evidence Approved
                        </p>
                        {task.reviewer && (
                          <p className="mt-1 font-mono text-xs text-green-600">
                            Approved by{" "}
                            {task.reviewer.full_name || task.reviewer.username} on{" "}
                            {formatTime(task.reviewed_at!)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-border p-4">
                    <p className="font-mono text-xs text-muted-foreground">
                      Submitted Evidence
                    </p>
                    <a
                      href={task.evidence_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-2 font-medium text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Evidence
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  disabled={isSavingStatus}
                  className="border-2 border-foreground bg-foreground text-background"
                >
                  {isSavingStatus ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              )}
            </div>

            {saveError && (
              <div className="mt-3 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {saveError}
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="font-mono text-xs text-muted-foreground">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => {
                    if (task.evidence_required && e.target.value === "done") {
                      return;
                    }
                    setEditStatus(e.target.value);
                    setIsEditing(true);
                  }}
                  disabled={isBlockedByDependencies && task.status !== "blocked"}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-2 font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  {task.status === "pending_review" && (
                    <option value="pending_review">Pending Review</option>
                  )}
                  <option value="done" disabled={task.evidence_required}>
                    Done {task.evidence_required ? "(requires evidence)" : ""}
                  </option>
                  <option value="blocked">Blocked</option>
                </select>
                {isBlockedByDependencies && task.status !== "blocked" && (
                  <p className="font-mono text-[10px] text-amber-600">
                    Blocked by dependencies
                  </p>
                )}
                {task.evidence_required && task.status === "in_progress" && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Submit evidence below to complete this task
                  </p>
                )}
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

          {/* Activity */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="font-bold">Activity</h2>

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
                        {getInitials(
                          assignee.user.full_name,
                          assignee.user.username
                        )}
                      </div>
                      <span className="text-sm font-medium">
                        {assignee.user.full_name || assignee.user.username}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleRemoveAssignee(assignee.id, assignee.user)
                      }
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
                  <p className="font-mono text-xs text-muted-foreground">
                    Created by
                  </p>
                  <p className="text-sm font-medium">
                    {task.creator?.full_name ||
                      task.creator?.username ||
                      "Unknown"}
                  </p>
                </div>
              </div>

              {task.due_date && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      Due date
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(task.due_date)}
                    </p>
                  </div>
                </div>
              )}

              {task.programme && (
                <div className="flex items-center gap-3">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      Programme
                    </p>
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
                  <p className="font-mono text-xs text-muted-foreground">
                    Created
                  </p>
                  <p className="text-sm font-medium">
                    {formatDate(task.created_at)}
                  </p>
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
                      {u.email && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {u.email}
                        </p>
                      )}
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

      {/* Add Dependency Modal */}
      {showAddDependency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/60"
            onClick={() => {
              setShowAddDependency(false);
              setDependencySearch("");
              setDependencyError("");
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-xl font-bold">Add Dependency</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Select a task that must be completed before this one.
            </p>

            {dependencyError && (
              <div className="mt-3 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {dependencyError}
              </div>
            )}

            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={dependencySearch}
                  onChange={(e) => setDependencySearch(e.target.value)}
                  placeholder="Search tasks..."
                  className="border-2 pl-10"
                />
              </div>
            </div>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {filteredTasksForDependency.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  {dependencySearch
                    ? "No matching tasks found."
                    : "No available tasks."}
                </p>
              ) : (
                filteredTasksForDependency.slice(0, 10).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleAddDependency(t.id)}
                    disabled={isAddingDependency}
                    className="flex w-full items-center justify-between rounded-xl border-2 border-border p-3 text-left transition-all hover:border-foreground disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      {t.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                      )}
                      <span className="font-medium">{t.title}</span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                        t.status === "done"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDependency(false);
                  setDependencySearch("");
                  setDependencyError("");
                }}
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