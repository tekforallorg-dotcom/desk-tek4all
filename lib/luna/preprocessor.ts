/**
 * MoonDesk Luna — Deterministic Pre-Processor
 *
 * Runs BEFORE Gemini. Handles:
 * 1. Pending state fill (user replies with missing field value)
 * 2. Correction detection ("no X in the name", "rename to X")
 * 3. Cancel detection
 * 4. Deterministic chip routing (short commands that don't need AI)
 * 5. Noise word stripping for searches
 */

import type { PendingAction } from "./pending";
import type { LunaIntent } from "./gemini";

export interface PreProcessResult {
  /** If set, skip Gemini — use this intent directly */
  intent?: LunaIntent;
  /** If set, this is a pending state operation */
  pendingOp?:
    | { type: "fill_field"; field: string; value: string }
    | { type: "correction"; corrections: Record<string, string> }
    | { type: "skip_field" }
    | { type: "skip_all_fields" }
    | { type: "cancel" }
    | { type: "playbook_next" }
    | { type: "playbook_skip" }
    | { type: "playbook_abort" };
  /** Cleaned message for Gemini (if not short-circuited) */
  cleanedMessage: string;
  /** Original message preserved for titles etc. */
  originalMessage: string;
}

/**
 * Pre-process user message before intent classification.
 */
export function preProcess(
  message: string,
  pending: PendingAction | null
): PreProcessResult {
  const original = message.trim();
  const lower = original.toLowerCase();
  const cleaned = original.replace(/\s+/g, " ").trim();

  // ── 1. Cancel detection (always check first) ──
  if (/^(cancel|stop|never\s*mind|forget\s*it|nvm)$/i.test(lower)) {
    if (pending) {
      return { pendingOp: { type: "cancel" }, cleanedMessage: cleaned, originalMessage: original };
    }
    return {
      intent: { tool: "general_answer", params: { topic: "cancelled" }, confidence: 1 },
      cleanedMessage: cleaned,
      originalMessage: original,
    };
  }

  // ── 2. If pending action exists, check if this is a field fill or correction ──
  if (pending && pending.status === "pending") {
    // 2-pre. Playbook step operations (Run Mode)
    if (pending.intent_type === "run_playbook") {
      // Abort the whole playbook
      if (/^(abort|quit|exit|stop\s+playbook)$/i.test(lower)) {
        return { pendingOp: { type: "playbook_abort" }, cleanedMessage: cleaned, originalMessage: original };
      }
      // Skip current step
      if (/^(skip\s*(step|this)?|pass)$/i.test(lower)) {
        return { pendingOp: { type: "playbook_skip" }, cleanedMessage: cleaned, originalMessage: original };
      }
      // Advance to next step (check/summary steps)
      if (/^(next|continue|ok|okay|yes|go|go\s*ahead|proceed|sure|yep|yeah|y|confirm|confirmed)$/i.test(lower)) {
        return { pendingOp: { type: "playbook_next" }, cleanedMessage: cleaned, originalMessage: original };
      }
    }

    // 2a. Skip detection — user wants to skip the current optional field
    if (pending.missing_fields.length > 0 && isSkipWord(lower)) {
      // "skip all" / "skip the rest" → skip ALL remaining fields
      if (/^skip\s+(all|the\s+rest|remaining|everything)/i.test(lower.trim())) {
        return {
          pendingOp: { type: "skip_all_fields" },
          cleanedMessage: cleaned,
          originalMessage: original,
        };
      }
      return {
        pendingOp: { type: "skip_field" },
        cleanedMessage: cleaned,
        originalMessage: original,
      };
    }

    // 2b. Correction patterns
    const correctionResult = detectCorrection(original, lower, pending);
    if (correctionResult) {
      return { pendingOp: correctionResult, cleanedMessage: cleaned, originalMessage: original };
    }

    // 2c. Fill missing field — if pending has missing_fields and message looks like a value
    if (pending.missing_fields.length > 0) {
      const field = pending.missing_fields[0]; // fill first missing field

      // If user's message doesn't look like a new command, treat as field value
      if (!looksLikeNewCommand(lower)) {
        return {
          pendingOp: { type: "fill_field", field, value: original },
          cleanedMessage: cleaned,
          originalMessage: original,
        };
      }
    }
  }

  // ── 3. Deterministic chip routing (exact matches, skip Gemini) ──
  const chipIntent = matchChipCommand(lower);
  if (chipIntent) {
    return { intent: chipIntent, cleanedMessage: cleaned, originalMessage: original };
  }

  // ── 4. Pass through to Gemini with cleaned message ──
  return { cleanedMessage: cleaned, originalMessage: original };
}

/**
 * Strip noise words from a search query for task/programme matching.
 */
export function stripNoiseWords(query: string): string {
  return query
    .replace(/\b(task|tasks|the|a|an|my|our|status|of|please|show|find|search|get|list|all)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Correction Detection ── */

function detectCorrection(
  original: string,
  lower: string,
  pending: PendingAction
): PreProcessResult["pendingOp"] | null {
  // Determine the primary name field based on intent type
  const nameField = pending.intent_type === "create_programme" ? "name" : "title";
  const currentName = String(pending.draft_payload[nameField] || "");

  // "no X in the name" / "remove X from the name" / "without X"
  const removeWordMatch = lower.match(
    /(?:no|remove|delete|drop|without)\s+(?:the\s+)?(?:word\s+)?["""]?(.+?)["""]?\s+(?:in|from)\s+(?:the\s+)?(?:name|title)/i
  );
  if (removeWordMatch) {
    const wordToRemove = removeWordMatch[1].trim();
    const newName = currentName
      .replace(new RegExp(`\\b${escapeRegex(wordToRemove)}\\b`, "gi"), "")
      .replace(/\s+/g, " ")
      .trim();
    return { type: "correction", corrections: { [nameField]: newName } };
  }

  // "rename to X" / "change name to X" / "call it X" / "title should be X"
  const renameMatch = original.match(
    /(?:rename\s+(?:it\s+)?to|change\s+(?:the\s+)?(?:name|title)\s+to|call\s+it|title\s+should\s+be|name\s+should\s+be)\s+["""]?(.+?)["""]?\s*$/i
  );
  if (renameMatch) {
    return { type: "correction", corrections: { [nameField]: renameMatch[1].trim() } };
  }

  // "no [word]" when it could mean "remove [word] from draft"
  if (lower.startsWith("no ") && currentName) {
    const afterNo = original.slice(3).trim();
    if (currentName.toLowerCase().includes(afterNo.toLowerCase())) {
      const newName = currentName
        .replace(new RegExp(`\\b${escapeRegex(afterNo)}\\b`, "gi"), "")
        .replace(/\s+/g, " ")
        .trim();
      if (newName.length > 0 && newName !== currentName) {
        return { type: "correction", corrections: { [nameField]: newName } };
      }
    }
  }

  // "actually X" / "I meant X" — replace name
  const actuallyMatch = original.match(/^(?:actually|i\s+meant?)\s+["""]?(.+?)["""]?\s*$/i);
  if (actuallyMatch) {
    return { type: "correction", corrections: { [nameField]: actuallyMatch[1].trim() } };
  }

  return null;
}

/* ── New Command Detection ── */

function looksLikeNewCommand(lower: string): boolean {
  const commandPatterns = [
    /^create\s/,
    /^make\s/,
    /^add\s/,
    /^show\s/,
    /^find\s/,
    /^search\s/,
    /^list\s/,
    /^get\s/,
    /^mark\s/,
    /^change\s+status/,
    /^update\s+status/,
    /^who\s/,
    /^what\s/,
    /^where\s/,
    /^how\s/,
    /^my\s+overdue/,
    /^my\s+tasks/,
    /^blockers/,
    /^check-?ins?$/,
    /^navigate/,
    /^go\s+to/,
    /^team\s/,
    /^pause\s/,
    /^activate\s/,
    /^archive\s/,
    /^close\s/,
    /^start\s/,
    /^launch\s/,
    /^weekly\s+review/,
    /^weekly\s+manager/,
    /^run\s/,
  ];
  return commandPatterns.some((p) => p.test(lower));
}

/* ── Chip Command Routing ── */

function matchChipCommand(lower: string): LunaIntent | null {
  // Exact matches for quick action chips and common short commands
  const CHIP_MAP: Record<string, LunaIntent> = {
    "my overdue": { tool: "get_my_overdue_tasks", params: {}, confidence: 1 },
    "show my overdue tasks": { tool: "get_my_overdue_tasks", params: {}, confidence: 1 },
    "show my overdue": { tool: "get_my_overdue_tasks", params: {}, confidence: 1 },
    "overdue tasks": { tool: "get_my_overdue_tasks", params: {}, confidence: 1 },
    "overdue": { tool: "get_my_overdue_tasks", params: {}, confidence: 0.9 },
    "check-ins": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "checkins": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "check ins": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "who missed check-in": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "who missed check-in this week": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "who missed checkin": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "who missed check in": { tool: "get_checkin_status", params: {}, confidence: 1 },
    "blockers": { tool: "get_blockers", params: {}, confidence: 1 },
    "what is blocking my team": { tool: "get_blockers", params: {}, confidence: 1 },
    "what is blocking my team?": { tool: "get_blockers", params: {}, confidence: 1 },
    "blocked tasks": { tool: "get_blockers", params: {}, confidence: 1 },
    "my tasks": { tool: "get_my_tasks", params: {}, confidence: 1 },
    "show my tasks": { tool: "get_my_tasks", params: {}, confidence: 1 },
    "create task": { tool: "create_task", params: { title: "" }, confidence: 1 },
    "create a task": { tool: "create_task", params: { title: "" }, confidence: 1 },
    "create programme": { tool: "create_programme", params: { name: "" }, confidence: 1 },
    "create a programme": { tool: "create_programme", params: { name: "" }, confidence: 1 },
    "create program": { tool: "create_programme", params: { name: "" }, confidence: 1 },
    "team overdue": { tool: "get_team_overdue", params: {}, confidence: 1 },
    "team summary": { tool: "get_team_summary", params: {}, confidence: 1 },
    "how is my team doing": { tool: "get_team_summary", params: {}, confidence: 1 },
    "how is my team doing?": { tool: "get_team_summary", params: {}, confidence: 1 },
    "weekly review": { tool: "run_playbook", params: { playbook_id: "weekly_review" }, confidence: 1 },
    "weekly manager review": { tool: "run_playbook", params: { playbook_id: "weekly_review" }, confidence: 1 },
    "close programme": { tool: "run_playbook", params: { playbook_id: "close_programme", target_name: "" }, confidence: 1 },
    "start programme": { tool: "run_playbook", params: { playbook_id: "start_programme", target_name: "" }, confidence: 1 },
  };

  return CHIP_MAP[lower] || null;
}

/**
 * Catch bare playbook step commands when no playbook is running.
 * Prevents Gemini from misinterpreting "next", "ok", "confirm" as queries.
 */
const ORPHAN_STEP_COMMANDS = /^(next|continue|ok|okay|confirm|skip|skip step|pass|proceed|go ahead|abort)$/i;

export function isOrphanStepCommand(lower: string): boolean {
  return ORPHAN_STEP_COMMANDS.test(lower.trim());
}

/* ── Skip Word Detection ── */

function isSkipWord(lower: string): boolean {
  const trimmed = lower.trim();
  // Exact matches
  if (/^(skip|no|none|default|-|n\/a|na|pass|next)$/.test(trimmed)) return true;
  // "skip all", "skip the rest", "skip remaining", "skip everything", "skip all and create"
  if (/^skip\s+(all|the\s+rest|remaining|everything|this|it)/i.test(trimmed)) return true;
  return false;
}

/* ── Utility ── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}