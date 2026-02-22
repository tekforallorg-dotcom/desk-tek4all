/**
 * MoonDesk Luna — Context Provider
 *
 * Agent upgrade: sends conversation history, handles clarify mode.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  LunaMessage,
  LunaPageContext,
  LunaActionPreview,
  LunaClarifyInfo,
} from "./types";

/* ── Context Shape ── */

interface LunaContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  pageContext: LunaPageContext;
  messages: LunaMessage[];
  sendMessage: (content: string) => void;
  confirmAction: (actionId: string) => void;
  cancelAction: (actionId: string) => void;
  retryMessage: (messageId: string) => void;
  isTyping: boolean;
  /** Active clarify mode info (if Luna is waiting for a field) */
  clarifyInfo: LunaClarifyInfo | null;
  /** Current user's role (member/manager/admin/super_admin) */
  userRole: string | null;
}

const LunaContext = createContext<LunaContextValue | null>(null);

/* ── Page Context ── */

function derivePageContext(pathname: string): LunaPageContext {
  const path = pathname.replace(/\/$/, "");
  if (path === "" || path === "/") return "Dashboard";
  if (/^\/programmes\/[^/]+/.test(path)) return "Programme Detail";
  if (path === "/programmes" || path === "/programmes/new") return "Programmes";
  if (/^\/tasks\/[^/]+/.test(path)) return "Task Detail";
  if (path.startsWith("/tasks")) return "Tasks";
  if (path === "/team") return "Team";
  if (path === "/checkins") return "Check-ins";
  if (path === "/messaging") return "Messaging";
  if (path.startsWith("/shared-mail")) return "Shared Mail";
  if (path === "/drive") return "Drive";
  if (path === "/calendar") return "Calendar";
  if (path === "/activity") return "Activity";
  if (path === "/analytics") return "Analytics";
  if (path === "/control-tower") return "Control Tower";
  if (path === "/settings") return "Settings";
  return "Dashboard";
}

/* ── Provider ── */

export function LunaProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LunaMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [clarifyInfo, setClarifyInfo] = useState<LunaClarifyInfo | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const pathname = usePathname();

  // Ref for latest messages (avoids stale closure)
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Ref-based guard for concurrent send prevention
  const isSendingRef = useRef(false);

  /* ── Abort controller for in-flight requests ── */
  const abortRef = useRef<AbortController | null>(null);

  const pageContext = useMemo(() => derivePageContext(pathname), [pathname]);

  /* ── Fetch user role on mount ── */
  useEffect(() => {
    async function fetchRole() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setUserRole(data?.role || "member");
      } catch {
        setUserRole("member");
      }
    }
    fetchRole();
  }, []);

  /* ── Telemetry helper (fire-and-forget) ── */
  const trackEvent = useCallback((eventType: string) => {
    fetch("/api/luna/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType }),
    }).catch(() => {}); // swallow errors
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    trackEvent("drawer_open");
  }, [trackEvent]);

  const close = useCallback(() => {
    setIsOpen(false);
    trackEvent("drawer_close");
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsTyping(false);
      isSendingRef.current = false;
    }
  }, [trackEvent]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      trackEvent(next ? "drawer_open" : "drawer_close");
      return next;
    });
  }, [trackEvent]);

  /* ── Keyboard shortcut: Cmd+L / Ctrl+L ── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  /* ── Send message → API ── */
  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      // Double-send guard — prevent concurrent requests
      if (isSendingRef.current) return;
      isSendingRef.current = true;

      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: LunaMessage = {
        id: `msg-${Date.now()}-u`,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        // Build history (last 8 messages for context)
        const history = [...messagesRef.current, userMsg]
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/luna/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, pageContext, history }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Handle clarify mode
        if (data.clarify) {
          setClarifyInfo(data.clarify as LunaClarifyInfo);
        } else {
          setClarifyInfo(null);
        }

        // Build action preview if present
        let action: LunaActionPreview | undefined;
        if (data.action) {
          action = {
            id: `action-${Date.now()}`,
            actionType: data.action.actionType,
            title: data.action.title,
            fields: data.action.fields || [],
            status: "pending",
            payload: data.action.payload || {},
          };
          // Clear clarify when showing action card
          setClarifyInfo(null);
        }

        const reply: LunaMessage = {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          content: data.text || "Done.",
          timestamp: new Date(),
          items: data.items?.length > 0 ? data.items : undefined,
          action,
          clarify: data.clarify || undefined,
          playbookProgress: data.playbookProgress || undefined,
        };

        setMessages((prev) => [...prev, reply]);
      } catch (error) {
        // Silently ignore aborted requests
        if (error instanceof DOMException && error.name === "AbortError") return;

        console.error("Luna API error:", error);
        setClarifyInfo(null);

        const isNetworkError =
          error instanceof TypeError && error.message.includes("fetch");
        const errorText = isNetworkError
          ? "Network error — check your connection and try again."
          : "Sorry, something went wrong. Please try again.";

        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-e`,
            role: "assistant",
            content: errorText,
            timestamp: new Date(),
            retryContent: trimmed, // Store original message for retry
          },
        ]);
      } finally {
        setIsTyping(false);
        isSendingRef.current = false;
        abortRef.current = null;
      }
    },
    [pageContext]
  );

  /* ── Confirm Action → write to DB ── */
  const confirmAction = useCallback(async (actionId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.action?.id !== actionId) return msg;
        return { ...msg, action: { ...msg.action, status: "confirmed" as const } };
      })
    );

    const msg = messagesRef.current.find((m) => m.action?.id === actionId);
    if (!msg?.action) return;

    try {
      const res = await fetch("/api/luna/action/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: msg.action.actionType,
          payload: msg.action.payload,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      setMessages((prev) =>
        prev.map((m) => {
          if (m.action?.id !== actionId) return m;
          return {
            ...m,
            action: {
              ...m.action,
              status: "confirmed" as const,
              resultMessage: data.message,
              resultHref: data.href,
            },
          };
        })
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-s`,
          role: "assistant",
          content: data.message || "Done!",
          timestamp: new Date(),
          items: data.href
            ? [{ label: "View result", detail: data.message, href: data.href }]
            : undefined,
        },
      ]);

      // Clear clarify
      setClarifyInfo(null);
    } catch (error) {
      console.error("Luna confirm error:", error);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.action?.id !== actionId) return m;
          return { ...m, action: { ...m.action, status: "error" as const } };
        })
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          role: "assistant",
          content: `Action failed: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  /* ── Cancel Action ── */
  const cancelAction = useCallback((actionId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.action?.id !== actionId) return msg;
        return { ...msg, action: { ...msg.action, status: "cancelled" as const } };
      })
    );
    setClarifyInfo(null);
  }, []);

  /* ── Retry Failed Message ── */
  const retryMessage = useCallback(
    (messageId: string) => {
      const errorMsg = messagesRef.current.find((m) => m.id === messageId);
      if (!errorMsg?.retryContent) return;

      const content = errorMsg.retryContent;

      // Remove the error message and the original user message before it
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx < 0) return prev;
        // Remove user msg before error + the error itself
        const start = idx > 0 && prev[idx - 1]?.role === "user" ? idx - 1 : idx;
        return [...prev.slice(0, start), ...prev.slice(idx + 1)];
      });

      // Re-send
      sendMessage(content);
    },
    [sendMessage]
  );

  const value = useMemo<LunaContextValue>(
    () => ({
      isOpen, open, close, toggle, pageContext,
      messages, sendMessage, confirmAction, cancelAction, retryMessage,
      isTyping, clarifyInfo, userRole,
    }),
    [isOpen, open, close, toggle, pageContext, messages, sendMessage, confirmAction, cancelAction, retryMessage, isTyping, clarifyInfo, userRole],
  );

  return <LunaContext.Provider value={value}>{children}</LunaContext.Provider>;
}

export function useLuna(): LunaContextValue {
  const ctx = useContext(LunaContext);
  if (!ctx) throw new Error("useLuna must be used within <LunaProvider>");
  return ctx;
}