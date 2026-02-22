/**
 * Luna Message Bubble — Compact with Deep Links + Action Cards
 *
 * Iteration 3: Renders action preview cards for write operations.
 */
"use client";

import Link from "next/link";
import type { LunaMessage } from "@/lib/luna/types";
import { ActionCard } from "./action-card";
import { useLuna } from "@/lib/luna/context";
import { ArrowUpRight, RotateCcw } from "lucide-react";

const L = {
  surface2: "#222222",
  border: "#2A2A2A",
  text: "#FFFFFF",
  muted: "#A0A0A0",
  dim: "#666666",
  linkHover: "#333333",
  errorBg: "#1a1212",
  errorBorder: "#3a2020",
} as const;

export function LunaMessageBubble({ message }: { message: LunaMessage }) {
  const { close, retryMessage } = useLuna();
  const isUser = message.role === "user";
  const hasItems = message.items && message.items.length > 0;
  const hasAction = !!message.action;
  const isError = !!message.retryContent;

  return (
    <div className={`mb-2.5 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-xl text-[12px] leading-relaxed ${
          isUser
            ? "max-w-[85%] rounded-br-sm px-3 py-2"
            : "w-full rounded-bl-sm px-2 py-1.5"
        }`}
        style={{
          backgroundColor: isUser ? L.surface2 : isError ? L.errorBg : "transparent",
          border: isUser ? "none" : `1px solid ${isError ? L.errorBorder : L.border}`,
          color: L.text,
        }}
      >
        {/* Text content */}
        <p className={`whitespace-pre-wrap ${isUser ? "" : "px-1 py-0.5"}`}>
          {message.content}
        </p>

        {/* Retry button for error messages */}
        {isError && (
          <button
            onClick={() => retryMessage(message.id)}
            className="mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/10"
            style={{ color: L.muted, border: `1px solid ${L.border}` }}
          >
            <RotateCcw size={11} />
            Retry
          </button>
        )
      }
        {/* Deep-link result items */}
        {hasItems && (
          <div className="mt-1.5 space-y-0.5">
            {message.items!.map((item, idx) => {
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium" style={{ color: L.text }}>
                      {item.label}
                    </p>
                    {item.detail && (
                      <p className="truncate text-[10px]" style={{ color: L.dim }}>
                        {item.detail}
                      </p>
                    )}
                  </div>
                  {item.href && (
                    <ArrowUpRight
                      size={12}
                      style={{ color: L.dim }}
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  )}
                </>
              );

              if (item.href) {
                return (
                  <Link
                    key={`${item.href}-${idx}`}
                    href={item.href}
                    onClick={close}
                    className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-100"
                    style={{ backgroundColor: "transparent" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = L.linkHover)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    {inner}
                  </Link>
                );
              }

              return (
                <div
                  key={`item-${idx}`}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        )}

        {/* Action preview card (write operations) */}
        {hasAction && <ActionCard action={message.action!} playbookProgress={message.playbookProgress} />}
      </div>
    </div>
  );
}