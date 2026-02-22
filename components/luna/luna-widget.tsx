/**
 * Luna Widget — Floating Action Button + Drawer Mount
 *
 * Bottom-right moon icon button with animated twinkle.
 * Hidden when drawer is open. Uses retro box-shadow.
 */
"use client";

import { useLuna } from "@/lib/luna/context";
import { LunaIcon } from "./luna-icon";
import { LunaDrawer } from "./luna-drawer";

export function LunaWidget() {
  const { isOpen, toggle } = useLuna();

  return (
    <>
      {/* ── Floating Button (animated twinkle on icon) ── */}
      {!isOpen && (
        <button
          onClick={toggle}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-t4-black text-t4-white transition-all duration-150 hover:scale-105 active:scale-95 md:bottom-8 md:right-8"
          style={{
            boxShadow: "3px 3px 0px 0px oklch(0.556 0 0)",
          }}
          aria-label="Open Luna assistant"
        >
          <LunaIcon size={26} />
        </button>
      )}

      {/* ── Drawer ── */}
      <LunaDrawer />
    </>
  );
}