"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ThreadMessages from "@/components/thread-messages";
import ProgrammeAnalytics from "@/components/programme-analytics";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  Users,
  Clock,
  X,
  CheckSquare,
  FolderKanban,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Programme } from "@/lib/types/programme";
import { PROGRAMME_STATUS_LABELS } from "@/lib/types/programme";
import { useAuth } from "@/lib/auth";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface ProgrammeMember {
  id: string;
  user_id: string;
  role: string;
  user: {
    id: string;
    full_name: string | null;
    username: string;
    email: string;
  };
}

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  details: Record<string, string>;
  created_at: string;
  user: { full_name: string | null; username: string };
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

/* ─── Audit log helper ───────────────────────────────────────────────── */

async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, string> = {}
) {
  const supabase = createClient();
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function ProgrammeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const programmeId = params.id as string;

  const [programme, setProgramme] = useState<Programme | null>(null);
  const [members, setMembers] = useState<ProgrammeMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);

  /* ─── Fetch Members (reusable) ─────────────────────────────────────── */

  const fetchMembers = useCallback(async () => {
    setIsRefreshingMembers(true);
    const supabase = createClient();

    const { data: memberData, error: memberError } = await supabase
      .from("programme_members")
      .select("id, user_id, role")
      .eq("programme_id", programmeId);

    if (memberError) {
      console.error("Error fetching members:", memberError.message);
      setIsRefreshingMembers(false);
      return;
    }

    if (memberData && memberData.length > 0) {
      const userIds = memberData.map((m) => m.user_id);
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .in("id", userIds);

      const membersWithUsers = memberData.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role || "member",
        user: usersData?.find((u) => u.id === m.user_id) || {
          id: m.user_id,
          full_name: null,
          username: "",
          email: "",
        },
      }));
      setMembers(membersWithUsers);
    } else {
      setMembers([]);
    }

    setIsRefreshingMembers(false);
  }, [programmeId]);

  /* ─── Initial Data Fetch ───────────────────────────────────────────── */

  useEffect(() => {
    const fetchAll = async () => {
      const supabase = createClient();

      // 1. Programme
      const { data: progData, error } = await supabase
        .from("programmes")
        .select("*")
        .eq("id", programmeId)
        .single();

      if (error || !progData) {
        console.error("Error fetching programme:", error);
        setIsLoading(false);
        return;
      }
      setProgramme(progData);

      // 2. Programme members
      await fetchMembers();

      // 3. All active users
      const { data: allUsersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("status", "active")
        .order("full_name");
      setAllUsers(allUsersData || []);

      // 4. Tasks for this programme
      const { data: taskData } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("programme_id", programmeId)
        .order("created_at", { ascending: false })
        .limit(10);
      setTasks(taskData || []);

      // 5. Recent activity
      const { data: auditData } = await supabase
        .from("audit_logs")
        .select("id, action, details, created_at, user_id")
        .eq("entity_type", "programme")
        .eq("entity_id", programmeId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (auditData && auditData.length > 0) {
        const auditUserIds = [...new Set(auditData.map((a) => a.user_id))];
        const { data: auditUsers } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", auditUserIds);

        const activityWithUsers = auditData.map((a) => ({
          ...a,
          details: (a.details as Record<string, string>) || {},
          user: auditUsers?.find((u) => u.id === a.user_id) || {
            full_name: null,
            username: "Unknown",
          },
        }));
        setActivity(activityWithUsers);
      }

      setIsLoading(false);
    };

    fetchAll();
  }, [programmeId, fetchMembers]);

  /* ─── Scroll to top after loading ──────────────────────────────────── */

  useEffect(() => {
    if (!isLoading) {
      // Use requestAnimationFrame to ensure DOM is painted
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    }
  }, [isLoading]);

  /* ─── Handlers ─────────────────────────────────────────────────────── */

  const handleDelete = async () => {
    if (!user?.id || !programme) return;
    setIsDeleting(true);

    const supabase = createClient();

    await logAudit(user.id, "programme_deleted", "programme", programmeId, {
      name: programme.name,
    });

    const { error } = await supabase
      .from("programmes")
      .delete()
      .eq("id", programmeId);

    if (error) {
      console.error("Error deleting programme:", error);
      setIsDeleting(false);
      return;
    }

    router.push("/programmes");
  };

  const handleAddMember = async (userId: string) => {
    if (!user?.id || !programme) return;
    const supabase = createClient();

    const { data: existing } = await supabase
      .from("programme_members")
      .select("id")
      .eq("programme_id", programmeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await fetchMembers();
      setShowManageMembers(false);
      return;
    }

    const { error } = await supabase
      .from("programme_members")
      .insert({
        programme_id: programmeId,
        user_id: userId,
        role: "member",
      });

    if (error) {
      console.error("Error adding member:", error.message);
      await fetchMembers();
      setShowManageMembers(false);
      return;
    }

    const addedUser = allUsers.find((u) => u.id === userId);

    await logAudit(user.id, "programme_member_added", "programme", programmeId, {
      name: programme.name,
      member_name: addedUser?.full_name || addedUser?.username || "",
    });

    // Notify added member (fire and forget)
    if (userId !== user.id) {
      fetch("/api/notifications/programme-added", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme_id: programmeId,
          programme_name: programme.name,
          member_id: userId,
        }),
      }).catch(console.error);
    }

    await fetchMembers();
    setShowManageMembers(false);
  };

  const handleRemoveMember = async (memberId: string, memberUser: ProgrammeMember["user"]) => {
    if (!user?.id || !programme) return;
    const supabase = createClient();

    const { error } = await supabase
      .from("programme_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      console.error("Error removing member:", error);
      return;
    }

    setMembers(members.filter((m) => m.id !== memberId));

    await logAudit(user.id, "programme_member_removed", "programme", programmeId, {
      name: programme.name,
      member_name: memberUser.full_name || memberUser.username,
    });
  };

  /* ─── Helpers ──────────────────────────────────────────────────────── */

  const formatDate = (date: string | null) => {
    if (!date) return "--";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
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

  const getActionLabel = (action: string): string => {
    const map: Record<string, string> = {
      programme_created: "created this programme",
      programme_updated: "updated this programme",
      programme_deleted: "deleted this programme",
      programme_member_added: "added a team member",
      programme_member_removed: "removed a team member",
    };
    return map[action] || action.replace(/_/g, " ");
  };

  const availableUsers = allUsers.filter(
    (u) => !members.some((m) => m.user_id === u.id)
  );

  const taskStats = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done" || t.status === "completed").length,
    overdue: tasks.filter(
      (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done" && t.status !== "completed"
    ).length,
  };

  /* ─── Loading ──────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!programme) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <h2 className="text-xl font-bold">Programme not found</h2>
        <Link href="/programmes" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Programmes
          </Button>
        </Link>
      </div>
    );
  }

  const statusLabel = PROGRAMME_STATUS_LABELS[programme.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/programmes">
            <Button
              variant="outline"
              size="icon"
              className="border-2 shadow-retro-sm"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {programme.name}
              </h1>
              <span
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider",
                  programme.status === "active"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Created {formatDate(programme.created_at)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href={`/programmes/${programme.id}/edit`}>
            <Button variant="outline" className="border-2 shadow-retro-sm">
              <Edit className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="border-2 text-red-500 shadow-retro-sm hover:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Delete
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
              Description
            </h2>
            <p className="mt-4 whitespace-pre-wrap text-muted-foreground">
              {programme.description || "No description provided."}
            </p>
          </div>

          {/* Tasks Summary */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
                Tasks
              </h2>
              <Link href={`/tasks?programme=${programmeId}`}>
                <Button variant="outline" size="sm" className="border-2 text-xs">
                  View All
                </Button>
              </Link>
            </div>

            {tasks.length === 0 ? (
              <p className="mt-4 font-mono text-sm text-muted-foreground">
                No tasks linked to this programme yet.
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {taskStats.done}/{taskStats.total} done
                  </span>
                  {taskStats.overdue > 0 && (
                    <span className="font-mono text-xs text-red-500">
                      {taskStats.overdue} overdue
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full border border-border bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground transition-all"
                        style={{
                          width: `${taskStats.total > 0 ? (taskStats.done / taskStats.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {tasks.slice(0, 5).map((task) => {
                    const isOverdue =
                      task.due_date &&
                      new Date(task.due_date) < new Date() &&
                      task.status !== "done" &&
                      task.status !== "completed";
                    return (
                      <Link key={task.id} href={`/tasks/${task.id}`}>
                        <div className="flex items-center gap-3 rounded-lg border border-border p-3 transition-all hover:border-foreground">
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              task.status === "done" || task.status === "completed"
                                ? "border-foreground bg-foreground"
                                : "border-border bg-background"
                            }`}
                          >
                            {(task.status === "done" || task.status === "completed") && (
                              <CheckSquare className="h-3 w-3 text-background" strokeWidth={2} />
                            )}
                          </div>
                          <span
                            className={`flex-1 truncate text-sm ${
                              task.status === "done" || task.status === "completed"
                                ? "line-through opacity-60"
                                : "text-foreground"
                            }`}
                          >
                            {task.title}
                          </span>
                          {isOverdue && (
                            <span className="shrink-0 font-mono text-[10px] text-red-500">
                              Overdue
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
            {/* Analytics */}
          <ProgrammeAnalytics
            programmeId={programme.id}
            programmeName={programme.name}
          />
          {/* Recent Activity */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
              Recent Activity
            </h2>

            {activity.length === 0 ? (
              <p className="mt-4 font-mono text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {activity.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 border-b border-border pb-3 last:border-0"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-mono text-[10px]">
                      {getInitials(entry.user.full_name, entry.user.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">
                          {entry.user.full_name || entry.user.username}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {getActionLabel(entry.action)}
                        </span>
                        {entry.details?.member_name && (
                          <span className="font-medium">
                            {" "}{entry.details.member_name}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {formatTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Programme Discussion Thread */}
          <ThreadMessages programmeId={programme.id} title="Programme Discussion" />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="text-lg font-bold text-card-foreground">Details</h2>
            <dl className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" strokeWidth={1.5} />
                  Start Date
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {formatDate(programme.start_date)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" strokeWidth={1.5} />
                  End Date
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {formatDate(programme.end_date)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FolderKanban className="h-4 w-4" strokeWidth={1.5} />
                  Tasks
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {taskStats.total}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" strokeWidth={1.5} />
                  Last Updated
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {formatDate(programme.updated_at)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Team */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-card-foreground">
                Team
                {members.length > 0 && (
                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                    ({members.length})
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchMembers}
                  disabled={isRefreshingMembers}
                  className="border-2 text-xs shadow-retro-sm h-8 w-8 p-0"
                  title="Refresh members"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshingMembers ? "animate-spin" : ""}`} strokeWidth={1.5} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManageMembers(true)}
                  className="border-2 text-xs shadow-retro-sm"
                >
                  <Users className="mr-1 h-3 w-3" strokeWidth={1.5} />
                  Manage
                </Button>
              </div>
            </div>

            {members.length === 0 ? (
              <p className="mt-4 font-mono text-sm text-muted-foreground">
                No team members assigned yet.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted font-mono text-[10px]">
                        {getInitials(member.user.full_name, member.user.username)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {member.user.full_name || member.user.username}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {member.role}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id, member.user)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-red-500"
                      title="Remove member"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Programme?"
        description="This action cannot be undone. The programme and all related data will be permanently removed."
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Add Member Modal */}
      {showManageMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/60"
            onClick={() => setShowManageMembers(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-xl font-bold">Add Team Member</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Select someone to add to {programme.name}.
            </p>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {availableUsers.length === 0 ? (
                <p className="py-4 text-center font-mono text-sm text-muted-foreground">
                  All team members have been added.
                </p>
              ) : (
                availableUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleAddMember(u.id)}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-3 text-left transition-all hover:border-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                      {getInitials(u.full_name, u.username)}
                    </div>
                    <div>
                      <p className="font-medium">
                        {u.full_name || u.username}
                      </p>
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
                onClick={() => setShowManageMembers(false)}
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

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}