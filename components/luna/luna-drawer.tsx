/**
 * Luna Drawer — Compact Floating Chat Card
 *
 * Agent upgrade: Clarify mode indicator when Luna is waiting for a field.
 * Shows "Waiting for: Task title" + example + Cancel button.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Minus } from "lucide-react";
import { useLuna } from "@/lib/luna/context";
import { LunaIcon } from "./luna-icon";
import { LunaMessageBubble } from "./luna-message";
import { QuickActions } from "./quick-actions";

const L = {
  bg: "#0B0B0B",
  surface: "#161616",
  surface2: "#222222",
  border: "#2A2A2A",
  text: "#FFFFFF",
  muted: "#A0A0A0",
  dim: "#666666",
  accent: "#3B3B3B",
} as const;

export function LunaDrawer() {
  const {
    isOpen, close, messages, sendMessage, isTyping, clarifyInfo, userRole,
  } = useLuna();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Auto-scroll on new messages ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isTyping]);

  /* ── Focus input when drawer opens ── */
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 160);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  /* ── Escape to close ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isTyping) return;
    const t = input.trim();
    if (!t) return;
    sendMessage(t);
    setInput("");
  }

  function handleCancel() {
    sendMessage("cancel");
  }

  const hasInput = input.trim().length > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* ── Backdrop (mobile only) ── */}
      <div
        className="fixed inset-0 z-50 bg-black/30 md:hidden"
        onClick={close}
        aria-hidden="true"
      />

      {/* ── Floating Card ── */}
      <div
        role="dialog"
        aria-label="Luna assistant"
        aria-modal="true"
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl"
        style={{
          bottom: "88px",
          right: "24px",
          width: "360px",
          maxHeight: "480px",
          backgroundColor: L.bg,
          border: `1px solid ${L.border}`,
          boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {/* ══ Header ══ */}
        <header
          className="flex shrink-0 items-center justify-between px-4 py-2.5"
          style={{ borderBottom: `1px solid ${L.border}` }}
        >
          <div className="flex items-center gap-2">
            <LunaIcon size={18} style={{ color: L.muted }} />
            <span
              className="text-[13px] font-semibold tracking-tight"
              style={{ color: L.text }}
            >
              Luna
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={close}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
              style={{ color: L.dim }}
              aria-label="Minimize Luna"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={close}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
              style={{ color: L.dim }}
              aria-label="Close Luna"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* ══ Messages ══ */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3.5 py-3"
          style={{ minHeight: "120px" }}
        >
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <LunaIcon
                size={28}
                className="mb-3"
                style={{ color: L.dim, opacity: 0.25 }}
              />
              <p className="text-[13px] font-medium" style={{ color: L.dim }}>
                How can I help?
              </p>
              <p
                className="mt-1 text-[11px]"
                style={{ color: L.dim, opacity: 0.5 }}
              >
                Tasks, programmes, team, check-ins.
              </p>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <LunaMessageBubble key={msg.id} message={msg} />
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="mb-2 flex items-center gap-1 px-1 py-1.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{
                    backgroundColor: L.dim,
                    animationDelay: `${delay}ms`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ══ Clarify Mode Indicator ══ */}
        {clarifyInfo && (
          <div
            className="flex items-center justify-between px-3.5 py-1.5"
            style={{
              backgroundColor: L.surface,
              borderTop: `1px solid ${L.border}`,
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium" style={{ color: L.muted }}>
                Waiting for: <span style={{ color: L.text }}>{clarifyInfo.waitingFor}</span>
              </p>
              {clarifyInfo.example && (
                <p className="text-[9px]" style={{ color: L.dim }}>
                  {clarifyInfo.example}
                </p>
              )}
            </div>
            <button
              onClick={handleCancel}
              className="ml-2 shrink-0 rounded-md px-2 py-0.5 text-[9px] font-medium transition-colors hover:bg-white/10"
              style={{ color: L.dim, border: `1px solid ${L.border}` }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ══ Quick Actions ══ */}
        <QuickActions onAction={(p) => sendMessage(p)} userRole={userRole} disabled={isTyping} />

        {/* ══ Input Bar ══ */}
        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 items-center gap-2 px-3.5 py-2.5"
          style={{ borderTop: `1px solid ${L.border}` }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              clarifyInfo
                ? `Type ${clarifyInfo.waitingFor.toLowerCase()}…`
                : "Ask Luna anything…"
            }
            className="flex-1 rounded-lg border-0 px-3 py-2 text-[13px] outline-none"
            style={{
              backgroundColor: L.surface,
              color: L.text,
              caretColor: L.text,
            }}
            aria-label="Message Luna"
          />
          <button
            type="submit"
            disabled={!hasInput || isTyping}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150"
            style={{
              backgroundColor: hasInput && !isTyping ? L.text : L.surface2,
              color: hasInput && !isTyping ? L.bg : L.dim,
              opacity: hasInput && !isTyping ? 1 : 0.4,
            }}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      {/* ── Mobile override ── */}
      <style jsx>{`
        @media (max-width: 767px) {
          div[role="dialog"] {
            left: 5vw !important;
            right: 5vw !important;
            bottom: 80px !important;
            width: auto !important;
            max-height: 50vh !important;
          }
        }
      `}</style>
    </>
  );
}