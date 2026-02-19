"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Search, 
  Bell, 
  Menu, 
  CheckSquare, 
  FolderKanban, 
  Calendar,
  FileCheck,
  Check,
  X,
  Loader2,
} from "lucide-react";
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

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  is_read: boolean;
  created_at: string;
  actor?: { full_name: string | null; username: string } | null;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, profile } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0); // For smooth animation
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

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

  // Smooth count animation
  useEffect(() => {
    if (displayCount === unreadCount) return;
    
    const diff = unreadCount - displayCount;
    const step = diff > 0 ? 1 : -1;
    const delay = Math.max(50, 200 / Math.abs(diff)); // Faster for bigger changes
    
    const timer = setTimeout(() => {
      setDisplayCount((prev) => prev + step);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [displayCount, unreadCount]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      const response = await fetch("/api/notifications?limit=20");
      if (!response.ok) return;

      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, [user?.id]);

  // Initial fetch and polling
  useEffect(() => {
    if (user?.id && profile) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [user?.id, profile, fetchNotifications]);

  // Mark all as read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingRead) return;
    
    setIsMarkingRead(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });

      if (response.ok) {
        setUnreadCount(0);
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true }))
        );
      }
    } catch (err) {
      console.error("Error marking as read:", err);
    } finally {
      setIsMarkingRead(false);
    }
  };

  // Mark single notification as read
  const handleNotificationClick = async (notifId: string) => {
    setDropdownOpen(false);
    
    // Optimistically update
    const notif = notifications.find((n) => n.id === notifId);
    if (notif && !notif.is_read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );

      // Fire and forget
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [notifId] }),
      }).catch(console.error);
    }
  };

  // Helpers
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

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "task_assigned":
      case "task_status_changed":
      case "task_comment":
      case "task_due_soon":
        return CheckSquare;
      case "evidence_submitted":
      case "evidence_approved":
      case "evidence_rejected":
        return FileCheck;
      case "event_invited":
      case "event_reminder":
      case "event_rsvp":
        return Calendar;
      case "programme_added":
        return FolderKanban;
      default:
        return Bell;
    }
  };

  const getNotifColor = (type: string) => {
    switch (type) {
      case "evidence_approved":
        return "text-green-600 bg-green-50 border-green-200";
      case "evidence_rejected":
        return "text-red-600 bg-red-50 border-red-200";
      case "task_due_soon":
      case "event_reminder":
        return "text-amber-600 bg-amber-50 border-amber-200";
      default:
        return "text-muted-foreground bg-muted border-border";
    }
  };

  const formatNotifTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
                >
                  <Bell className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  {/* Animated badge */}
                  <span
                    className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white transition-all duration-300 ${
                      displayCount > 0
                        ? "scale-100 opacity-100"
                        : "scale-0 opacity-0"
                    }`}
                  >
                    <span
                      key={displayCount}
                      className="animate-in fade-in zoom-in duration-150"
                    >
                      {displayCount > 99 ? "99+" : displayCount}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-96 border-2 shadow-retro">
                <div className="flex items-center justify-between px-3 py-2">
                  <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={isMarkingRead}
                      className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {isMarkingRead ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Mark all read
                    </button>
                  )}
                </div>
                <DropdownMenuSeparator />

                {notifications.length === 0 ? (
                  <div className="px-2 py-8 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" strokeWidth={1.5} />
                    <p className="mt-2 font-medium text-muted-foreground">
                      All caught up!
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground/70">
                      No new notifications
                    </p>
                  </div>
                ) : (
                  <div className="max-h-400px overflow-y-auto">
                    {notifications.map((notif) => {
                      const Icon = getNotifIcon(notif.type);
                      const colorClass = getNotifColor(notif.type);
                      const actorName = notif.actor?.full_name || notif.actor?.username || null;

                      return (
                        <DropdownMenuItem key={notif.id} asChild>
                          <Link
                            href={notif.href}
                            onClick={() => handleNotificationClick(notif.id)}
                            className={`flex cursor-pointer items-start gap-3 px-3 py-3 ${
                              !notif.is_read ? "bg-muted/50" : ""
                            }`}
                          >
                            {/* Icon */}
                            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${colorClass}`}>
                              <Icon className="h-4 w-4" strokeWidth={2} />
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm leading-snug ${!notif.is_read ? "font-medium" : ""}`}>
                                  {notif.title}
                                </p>
                                {!notif.is_read && (
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                                )}
                              </div>
                              {notif.body && (
                                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                                  {notif.body}
                                </p>
                              )}
                              <div className="mt-1 flex items-center gap-2">
                                {actorName && (
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    by {actorName}
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {actorName ? "•" : ""} {formatNotifTime(notif.created_at)}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                )}

                {notifications.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href="/activity"
                        onClick={() => setDropdownOpen(false)}
                        className="cursor-pointer justify-center py-2 font-mono text-xs text-muted-foreground"
                      >
                        View all activity
                      </Link>
                    </DropdownMenuItem>
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