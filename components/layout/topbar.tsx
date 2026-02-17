"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Bell, Menu, MessageSquare, CheckSquare, FolderKanban, Shield, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { SearchDialog } from "@/components/search-dialog";

interface TopbarProps {
  onMenuClick: () => void;
}

interface NotificationItem {
  id: string;
  type: "message" | "task" | "programme" | "admin" | "email";
  label: string;
  user_name: string;
  created_at: string;
  href: string;
}

const NOTIF_SEEN_KEY = "moondesk_notif_seen_at";

export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, profile, isLoading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  // Cmd/Ctrl + K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Get last-seen timestamp from localStorage ────────────────────────
  const getLastSeen = useCallback((): string => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    const stored = localStorage.getItem(NOTIF_SEEN_KEY);
    if (stored) return stored;
    // Default: 24h ago
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }, []);

  const markAsSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(NOTIF_SEEN_KEY, new Date().toISOString());
  }, []);

  // ── Fetch notifications ──────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user?.id || !profile) return;

    const supabase = createClient();
    const isAdmin = profile.role === "admin" || profile.role === "super_admin";
    const isManager = profile.role === "manager";
    const lastSeen = getLastSeen();
    const items: NotificationItem[] = [];

    // ── A. Unread messages ────────────────────────────────────────────
    // Find conversations user is in, then messages newer than last_read_at
    const { data: myConvos } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    if (myConvos && myConvos.length > 0) {
      const convoIds = myConvos.map((c) => c.conversation_id);

      // Build a map of conversation_id -> last_read_at
      const lastReadMap = new Map<string, string>();
      for (const c of myConvos) {
        lastReadMap.set(c.conversation_id, c.last_read_at || new Date(0).toISOString());
      }

      // Fetch recent messages in those conversations, not sent by me
      const { data: recentMessages } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .in("conversation_id", convoIds)
        .neq("sender_id", user.id)
        .gte("created_at", lastSeen)
        .order("created_at", { ascending: false })
        .limit(10);

      // Filter to only unread (created_at > last_read_at for that conversation)
      const unreadMessages = (recentMessages || []).filter((m) => {
        const lastRead = lastReadMap.get(m.conversation_id);
        return !lastRead || new Date(m.created_at) > new Date(lastRead);
      });

      // Resolve sender names
      const senderIds = [...new Set(unreadMessages.map((m) => m.sender_id))];
      const senderNameMap = new Map<string, string>();

      if (senderIds.length > 0) {
        const { data: senderProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", senderIds);

        for (const p of senderProfiles || []) {
          senderNameMap.set(p.id, p.full_name || p.username || "Someone");
        }
      }

      // Deduplicate: one notification per conversation (latest message)
      const seenConvos = new Set<string>();
      for (const m of unreadMessages) {
        if (seenConvos.has(m.conversation_id)) continue;
        seenConvos.add(m.conversation_id);

        const senderName = senderNameMap.get(m.sender_id) || "Someone";
        const preview = m.content
          ? m.content.length > 40
            ? m.content.slice(0, 40) + "..."
            : m.content
          : "sent a message";

        items.push({
          id: `msg-${m.id}`,
          type: "message",
          label: preview,
          user_name: senderName,
          created_at: m.created_at,
          href: "/messaging",
        });
      }
    }

    // ── B. Audit log events (excluding login noise) ───────────────────
    // Only task/programme/admin actions, not login/email_classified
    const excludedActions = [
      "email_classified",
      "login",
      "user_login",
      "logout",
    ];

    // Build scope for audit events
    let scopedUserIds: string[] | null = null;

    if (!isAdmin) {
      scopedUserIds = [user.id];
      if (isManager) {
        const { data: hierarchyData } = await supabase
          .from("hierarchy")
          .select("report_id")
          .eq("manager_id", user.id);

        for (const h of hierarchyData || []) {
          scopedUserIds.push(h.report_id);
        }
      }
    }

    let auditQuery = supabase
      .from("audit_logs")
      .select("id, action, details, created_at, user_id, entity_type, entity_id")
      .neq("user_id", user.id)
      .gte("created_at", lastSeen)
      .order("created_at", { ascending: false })
      .limit(10);

    // Exclude noisy actions
    for (const action of excludedActions) {
      auditQuery = auditQuery.not("action", "eq", action);
    }

    if (scopedUserIds !== null) {
      auditQuery = auditQuery.in("user_id", scopedUserIds);
    }

    const { data: auditLogs } = await auditQuery;
    const logList = auditLogs || [];

    // Resolve names for audit events
    const auditUserIds = [...new Set(logList.map((l) => l.user_id))];
    const auditNameMap = new Map<string, string>();

    if (auditUserIds.length > 0) {
      const { data: auditProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", auditUserIds);

      for (const p of auditProfiles || []) {
        auditNameMap.set(p.id, p.full_name || p.username || "Someone");
      }
    }

    for (const log of logList) {
      const userName = auditNameMap.get(log.user_id) || "Someone";
      const entityName = log.details?.title || log.details?.name || "";

      let label = "";
      let href = "/activity";
      let type: NotificationItem["type"] = "task";

      switch (log.action) {
        case "task_created":
          label = `created task "${entityName}"`;
          href = `/tasks/${log.entity_id}`;
          type = "task";
          break;
        case "task_updated":
          label = `updated task "${entityName}"`;
          href = `/tasks/${log.entity_id}`;
          type = "task";
          break;
        case "task_status_changed":
          label = `changed status of "${entityName}"`;
          href = `/tasks/${log.entity_id}`;
          type = "task";
          break;
        case "task_assigned":
          label = `assigned you to "${entityName}"`;
          href = `/tasks/${log.entity_id}`;
          type = "task";
          break;
        case "task_unassigned":
          label = `unassigned from "${entityName}"`;
          href = `/tasks/${log.entity_id}`;
          type = "task";
          break;
        case "task_commented":
          label = `commented on "${entityName}"`;
          href = `/tasks/${log.entity_id}`;
          type = "task";
          break;
        case "task_deleted":
          label = `deleted task "${entityName}"`;
          href = "/tasks";
          type = "task";
          break;
        case "programme_created":
          label = `created programme "${entityName}"`;
          href = `/programmes/${log.entity_id}`;
          type = "programme";
          break;
        case "programme_updated":
          label = `updated programme "${entityName}"`;
          href = `/programmes/${log.entity_id}`;
          type = "programme";
          break;
        case "password_reset":
          label = `reset password for ${entityName || "a user"}`;
          href = "/activity";
          type = "admin";
          break;
        case "user_created":
          label = `created user "${entityName}"`;
          href = "/activity";
          type = "admin";
          break;
        case "email_replied":
          label = "replied to an email";
          href = "/shared-mail";
          type = "email";
          break;
        case "email_sent":
          label = "sent an email";
          href = "/shared-mail";
          type = "email";
          break;
        default:
          label = log.action.replace(/_/g, " ");
          break;
      }

      items.push({
        id: `audit-${log.id}`,
        type,
        label,
        user_name: userName,
        created_at: log.created_at,
        href,
      });
    }

    // Sort all items by time (newest first)
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setNotifications(items);
    setNotifCount(items.length);
  }, [user?.id, profile, getLastSeen]);

  useEffect(() => {
    if (user?.id && profile) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [user?.id, profile, fetchNotifications]);

  // ── Mark as seen when dropdown opens ─────────────────────────────────
  const handleDropdownChange = (open: boolean) => {
    setDropdownOpen(open);
    if (open) {
      // Mark as seen after a short delay (so user sees the items first)
      setTimeout(() => {
        markAsSeen();
        setNotifCount(0);
      }, 2000);
    }
  };

  // ── Notification click: mark seen immediately ────────────────────────
  const handleNotifClick = () => {
    markAsSeen();
    setNotifCount(0);
    setDropdownOpen(false);
  };

  // ── Helpers ──────────────────────────────────────────────────────────

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (profile?.username) {
      return profile.username.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "?";
  };

  const getDisplayName = () => {
    if (profile?.full_name) return profile.full_name;
    if (profile?.username) return profile.username;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  };

  const getRoleDisplay = () => {
    if (!profile?.role) return "Loading...";
    return profile.role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getNotifIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "message": return MessageSquare;
      case "task": return CheckSquare;
      case "programme": return FolderKanban;
      case "admin": return Shield;
      case "email": return Mail;
      default: return Bell;
    }
  };

  const formatNotifTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/signin";
  };

  return (
    <>
      <header className="flex h-20 items-center justify-between border-b-2 border-border bg-card px-4 md:px-6">
        {/* Left side - Menu button + Search */}
        <div className="flex flex-1 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onMenuClick}
            className="border-2 shadow-retro-sm lg:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </Button>

          <button
            onClick={() => setSearchOpen(true)}
            className="relative hidden w-full max-w-md sm:block"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
            <div className="flex h-10 w-full items-center rounded-xl border-2 border-border bg-background pl-10 pr-3 font-mono text-sm text-muted-foreground shadow-retro-sm transition-shadow hover:shadow-retro">
              <span>Search anything...</span>
              <kbd className="ml-auto rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                &#8984;K
              </kbd>
            </div>
          </button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSearchOpen(true)}
            className="border-2 shadow-retro-sm sm:hidden"
          >
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </Button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Notifications */}
          {mounted ? (
            <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownChange}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
                >
                  <Bell className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  {notifCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {notifCount > 9 ? "9+" : notifCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 border-2 shadow-retro">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Notifications</span>
                  {notifCount > 0 && (
                    <span className="font-mono text-[10px] font-normal text-muted-foreground">
                      {notifCount} new
                    </span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {notifications.length === 0 ? (
                  <div className="px-2 py-6 text-center">
                    <Bell className="mx-auto h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      All caught up
                    </p>
                  </div>
                ) : (
                  <>
                    {notifications.slice(0, 6).map((item) => {
                      const Icon = getNotifIcon(item.type);
                      return (
                        <DropdownMenuItem key={item.id} asChild>
                          <Link
                            href={item.href}
                            onClick={handleNotifClick}
                            className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5"
                          >
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                              <Icon className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug">
                                <span className="font-medium">{item.user_name}</span>{" "}
                                <span className="text-muted-foreground">{item.label}</span>
                              </p>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {formatNotifTime(item.created_at)}
                              </span>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}

                    {notifications.length > 6 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link
                            href="/activity"
                            onClick={handleNotifClick}
                            className="cursor-pointer justify-center font-mono text-xs text-muted-foreground"
                          >
                            View all activity
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="relative border-2 shadow-retro-sm"
            >
              <Bell className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </Button>
          )}

          {/* User menu */}
          {mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-2 px-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5 md:gap-3 md:px-3"
                >
                  <Avatar className="h-8 w-8 border-2 border-foreground">
                    <AvatarFallback className="bg-background font-mono text-xs font-bold text-foreground">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left md:block">
                    <p className="text-sm font-semibold text-foreground">
                      {getDisplayName()}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {getRoleDisplay()}
                    </p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-2 shadow-retro">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold">{getDisplayName()}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Link href="/settings">
                  <DropdownMenuItem className="cursor-pointer font-medium">
                    Profile
                  </DropdownMenuItem>
                </Link>
                <Link href="/settings">
                  <DropdownMenuItem className="cursor-pointer font-medium">
                    Settings
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer font-medium text-muted-foreground"
                  onClick={handleSignOut}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              className="flex items-center gap-2 border-2 px-2 shadow-retro-sm md:gap-3 md:px-3"
            >
              <Avatar className="h-8 w-8 border-2 border-foreground">
                <AvatarFallback className="bg-background font-mono text-xs font-bold text-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <p className="text-sm font-semibold text-foreground">
                  {getDisplayName()}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {getRoleDisplay()}
                </p>
              </div>
            </Button>
          )}
        </div>
      </header>

      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}