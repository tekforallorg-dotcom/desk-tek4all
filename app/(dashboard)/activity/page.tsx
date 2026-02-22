"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  CheckSquare,
  FolderKanban,
  Shield,
  Mail,
  Filter,
  ChevronDown,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type FilterType = "all" | "task" | "programme" | "auth" | "email";

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, string> | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
}

const FILTERS: { label: string; value: FilterType; icon: React.ElementType }[] = [
  { label: "All", value: "all", icon: Activity },
  { label: "Tasks", value: "task", icon: CheckSquare },
  { label: "Programmes", value: "programme", icon: FolderKanban },
  { label: "Auth", value: "auth", icon: Shield },
  { label: "Email", value: "email", icon: Mail },
];

const PAGE_SIZE = 20;

export default function ActivityPage() {
  const { user, profile: authProfile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [scopedUserIds, setScopedUserIds] = useState<string[] | null>(null);

  // ── Resolve scoped user IDs on mount ─────────────────────────────────
  // Admin/super_admin: null (no filter, see everything)
  // Manager: self + direct reports from hierarchy
  // Member: self only
  useEffect(() => {
    const resolveScope = async () => {
      if (!user?.id || !authProfile) return;

      const isAdmin = authProfile.role === "admin" || authProfile.role === "super_admin";

      if (isAdmin) {
        setScopedUserIds(null); // null = no filtering
        return;
      }

      const supabase = createClient();
      const ids: string[] = [user.id];

      // Managers: add direct reports from hierarchy table
      if (authProfile.role === "manager") {
        const { data: hierarchyData, error } = await supabase
          .from("hierarchy")
          .select("report_id")
          .eq("manager_id", user.id);

        if (error) {
          console.error("[Activity] hierarchy query failed:", error);
        }

        for (const h of hierarchyData || []) {
          ids.push(h.report_id);
        }
      }

      setScopedUserIds(ids);
    };

    resolveScope();
  }, [user?.id, authProfile]);

  // ── Fetch logs with scope filtering ──────────────────────────────────
  const fetchLogs = useCallback(
    async (pageNum: number, activeFilter: FilterType, userIds: string[] | null) => {
      const supabase = createClient();

      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      // Exclude email_classified
      query = query.not("action", "eq", "email_classified");

      // Exclude Luna telemetry events (luna_message_sent, luna_intent_classified, etc.)
      // Real actions done via Luna (task_created, programme_created) pass through — no luna_ prefix
      query = query.not("action", "like", "luna_%");

      // ── Role-based scoping ──────────────────────────────────────────
      // null = admin (no filter), array = specific user IDs
      if (userIds !== null && userIds.length > 0) {
        query = query.in("user_id", userIds);
      }

      // Apply category filter
      if (activeFilter !== "all") {
        if (activeFilter === "auth") {
          query = query.in("action", [
            "login",
            "user_login",
            "logout",
            "password_reset",
            "password_changed",
            "user_created",
          ]);
        } else if (activeFilter === "email") {
          query = query.in("action", [
            "email_replied",
            "email_sent",
            "email_drafted",
          ]);
        } else {
          query = query.eq("entity_type", activeFilter);
        }
      }

      const { data, error } = await query;
      if (error) {
        console.error("[Activity] fetch logs failed:", error);
      }
      return data || [];
    },
    []
  );

  const fetchProfiles = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const supabase = createClient();
    const uniqueIds = [...new Set(userIds)];
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .in("id", uniqueIds);

    if (data) {
      const profileMap: Record<string, Profile> = {};
      data.forEach((p) => {
        profileMap[p.id] = p;
      });
      setProfiles((prev) => ({ ...prev, ...profileMap }));
    }
  }, []);

  // ── Load data when scope is resolved or filter changes ───────────────
  useEffect(() => {
    // Wait for scope resolution (scopedUserIds starts as null for admins,
    // or gets set for managers/members)
    if (!user || scopedUserIds === undefined) return;

    const load = async () => {
      setIsLoading(true);
      const data = await fetchLogs(0, filter, scopedUserIds);
      setLogs(data);
      setPage(0);
      setHasMore(data.length === PAGE_SIZE);
      await fetchProfiles(data.map((l) => l.user_id).filter(Boolean));
      setIsLoading(false);
    };

    load();
  }, [user, filter, scopedUserIds, fetchLogs, fetchProfiles]);

  const loadMore = async () => {
    const nextPage = page + 1;
    const data = await fetchLogs(nextPage, filter, scopedUserIds);
    setLogs((prev) => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length === PAGE_SIZE);
    await fetchProfiles(data.map((l) => l.user_id).filter(Boolean));
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
        return { verb: "Created task", subject: name };
      case "task_updated":
        return { verb: "Updated task", subject: name };
      case "task_deleted":
        return { verb: "Deleted task", subject: name };
      case "task_status_changed":
        return {
          verb: "Changed task status",
          subject: `${name} → ${log.details?.to || ""}`,
        };
      case "task_assigned":
        return { verb: "Assigned task", subject: name };
      case "task_unassigned":
        return { verb: "Unassigned from", subject: name };
      case "task_commented":
        return { verb: "Commented on", subject: name };
      case "programme_created":
        return { verb: "Created programme", subject: name };
      case "programme_updated":
        return { verb: "Updated programme", subject: name };
      case "programme_deleted":
        return { verb: "Deleted programme", subject: name };
      case "programme_status_updated":
        return {
          verb: "Updated programme status",
          subject: `${name} → ${log.details?.to_status || ""}`,
        };
      case "programme_field_updated":
        return {
          verb: `Updated programme ${log.details?.field || "field"}`,
          subject: name,
        };
      case "login":
      case "user_login":
        return { verb: "Signed in", subject: "" };
      case "logout":
        return { verb: "Signed out", subject: "" };
      case "password_reset":
        return { verb: "Reset password for", subject: name || "a user" };
      case "password_changed":
        return { verb: "Changed password", subject: "" };
      case "user_created":
        return { verb: "Created user", subject: name };
      case "email_replied":
        return { verb: "Replied to email", subject: name };
      case "email_sent":
        return { verb: "Sent email", subject: name };
      case "email_drafted":
        return { verb: "Drafted email reply", subject: name };
      default:
        return { verb: log.action.replace(/_/g, " "), subject: name };
    }
  };

  const formatTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatFullDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getUserName = (userId: string) => {
    const p = profiles[userId];
    if (p?.full_name) return p.full_name;
    if (p?.username) return p.username;
    return "Unknown user";
  };

  // Group logs by date
  const groupedLogs = logs.reduce<Record<string, AuditLog[]>>((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {});

  // Scope label for subtitle
  const scopeLabel =
    authProfile?.role === "admin" || authProfile?.role === "super_admin"
      ? "Complete history of actions across MoonDesk."
      : authProfile?.role === "manager"
        ? "Your activity and your direct reports."
        : "Your activity history.";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border-2 border-border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Activity Log
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {scopeLabel}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? "border-2 border-foreground bg-foreground text-background shadow-retro-sm"
                : "border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
            }
          >
            <f.icon className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
            {f.label}
          </Button>
        ))}
      </div>

      {/* Activity List */}
      {logs.length === 0 ? (
        <div className="rounded-2xl border-2 border-border bg-card p-12 text-center shadow-retro">
          <Activity
            className="mx-auto h-10 w-10 text-muted-foreground"
            strokeWidth={1.5}
          />
          <p className="mt-3 font-medium text-foreground">No activity found</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {filter !== "all"
              ? "Try a different filter."
              : "Actions will appear here as you work."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedLogs).map(([date, dateLogs]) => (
            <div key={date}>
              {/* Date header */}
              <p className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {date}
              </p>

              <div className="space-y-2">
                {dateLogs.map((log) => {
                  const Icon = getActivityIcon(log);
                  const { verb, subject } = getActivityLabel(log);

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 rounded-xl border-2 border-border bg-card p-4 transition-all hover:shadow-retro-sm"
                    >
                      {/* Icon */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-background">
                        <Icon
                          className="h-4 w-4 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-card-foreground">
                          <span className="font-medium">
                            {getUserName(log.user_id)}
                          </span>{" "}
                          {verb}
                          {subject && (
                            <>
                              {" "}
                              <span className="font-semibold">{subject}</span>
                            </>
                          )}
                        </p>
                        <p
                          className="mt-0.5 font-mono text-[11px] text-muted-foreground"
                          title={formatFullDate(log.created_at)}
                        >
                          {formatTime(log.created_at)}
                        </p>
                      </div>

                      {/* Entity badge */}
                      <span className="shrink-0 rounded-full border-2 border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        {log.entity_type || log.action.split("_")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={loadMore}
                className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
              >
                <ChevronDown className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}