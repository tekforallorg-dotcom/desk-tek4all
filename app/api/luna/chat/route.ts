/**
 * POST /api/luna/chat — Agent Brain
 *
 * Multi-layer intent engine:
 * 1. Check pending state (fill field, correction, cancel)
 * 2. Deterministic pre-processor (chips, known patterns)
 * 3. Gemini classification (with conversation history)
 * 4. Tool execution
 * 5. Create new pending state if fields are missing
 *
 * Returns: { text, items, action, clarify, meta }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyIntent, type ChatHistoryMessage } from "@/lib/luna/gemini";
import { executeTool, type LunaToolResult, type LunaActionPreviewData } from "@/lib/luna/tools";
import { preProcess, isOrphanStepCommand } from "@/lib/luna/preprocessor";
import { fuzzySearchProgrammes, fuzzySearchUsers } from "@/lib/luna/fuzzy";
import {
  getPlaybook,
  resolvePlaybookTarget,
  createPlaybookState,
  type PlaybookState,
  type PlaybookDef,
} from "@/lib/luna/playbooks";
import type { PlaybookProgress } from "@/lib/luna/types";
import {
  getActivePending,
  createPending,
  updatePending,
  cancelPending,
  purgeOldRecords,
} from "@/lib/luna/pending";
import { emit } from "@/lib/luna/telemetry";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const message = String(body.message || "").trim();
    const pageContext = String(body.pageContext || "Dashboard");
    const history: ChatHistoryMessage[] = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Telemetry: message received + opportunistic cleanup of old records
    emit.messageSent(supabase, user.id, message.length);
    purgeOldRecords(supabase, user.id); // fire-and-forget, non-blocking

    // ── Step 1: Get active pending state ──
    const pending = await getActivePending(supabase, user.id);

    // ── Step 2: Pre-process (handles pending fills, corrections, chips) ──
    const preResult = preProcess(message, pending);

    // ── Step 2a: Handle pending state operations ──
    if (preResult.pendingOp && pending) {
      switch (preResult.pendingOp.type) {
        case "cancel": {
          const wasPlaybook = pending.intent_type === "run_playbook";
          if (wasPlaybook) {
            const cancelPbState = pending.draft_payload as unknown as PlaybookState;
            emit.playbookAborted(supabase, user.id, cancelPbState?.playbook_id || "unknown", cancelPbState?.current_step || 0);
          }
          await cancelPending(supabase, pending.id);
          return json({
            text: wasPlaybook ? "Playbook cancelled. What else can I help with?" : "Cancelled. What else can I help with?",
            items: [],
          });
        }

        case "fill_field": {
          const { field, value } = preResult.pendingOp;

          // Validate/normalize field value before storing
          let normalizedValue = normalizeFieldValue(field, value);

          // Smart entity resolution for reference fields
          if (field === "programme_name" && normalizedValue) {
            const resolved = await resolveEntity(supabase, "programme", normalizedValue);
            if (resolved.status === "not_found") {
              return json({
                text: `No programme found matching "${normalizedValue}". Try a different name, or say "skip".`,
                items: [],
                clarify: {
                  waitingFor: fieldLabel(field),
                  example: fieldExample(field),
                  intentType: pending.intent_type,
                },
              });
            }
            if (resolved.status === "ambiguous") {
              return json({
                text: `Did you mean one of these? Type the exact name, or say "skip".`,
                items: resolved.suggestions || [],
                clarify: {
                  waitingFor: fieldLabel(field),
                  example: resolved.suggestions?.[0]?.label || fieldExample(field),
                  intentType: pending.intent_type,
                },
              });
            }
            normalizedValue = resolved.resolvedName!;
          }

          if (field === "assignee_name" && normalizedValue) {
            const resolved = await resolveEntity(supabase, "user", normalizedValue);
            if (resolved.status === "not_found") {
              return json({
                text: `No team member found matching "${normalizedValue}". Try a different name, or say "skip".`,
                items: [],
                clarify: {
                  waitingFor: fieldLabel(field),
                  example: fieldExample(field),
                  intentType: pending.intent_type,
                },
              });
            }
            if (resolved.status === "ambiguous") {
              return json({
                text: `Multiple matches for "${normalizedValue}". Which one? Or say "skip".`,
                items: resolved.suggestions || [],
                clarify: {
                  waitingFor: fieldLabel(field),
                  example: resolved.suggestions?.[0]?.label || fieldExample(field),
                  intentType: pending.intent_type,
                },
              });
            }
            normalizedValue = resolved.resolvedName!;
          }

          // Playbook target — resolve programme name
          if (field === "target_name" && normalizedValue && pending.intent_type === "run_playbook") {
            const resolved = await resolveEntity(supabase, "programme", normalizedValue);
            if (resolved.status === "not_found") {
              return json({
                text: `No programme found matching "${normalizedValue}". Try a different name.`,
                items: [],
                clarify: {
                  waitingFor: "Programme name",
                  example: "e.g. \"Sabitek\" or \"Youth Digital Skills\"",
                  intentType: pending.intent_type,
                },
              });
            }
            if (resolved.status === "ambiguous") {
              return json({
                text: `Did you mean one of these?`,
                items: resolved.suggestions || [],
                clarify: {
                  waitingFor: "Programme name",
                  example: resolved.suggestions?.[0]?.label || "",
                  intentType: pending.intent_type,
                },
              });
            }
            normalizedValue = resolved.resolvedName!;
          }

          const newPayload = { ...pending.draft_payload, [field]: normalizedValue };
          const newMissing = pending.missing_fields.filter((f) => f !== field);

          if (newMissing.length > 0) {
            // Still have missing fields — ask for next one
            const nextField = newMissing[0];
            const followUp = getFollowUpQuestion(nextField);
            await updatePending(supabase, pending.id, {
              draft_payload: newPayload,
              missing_fields: newMissing,
              follow_up_question: followUp,
            });
            return json({
              text: followUp,
              items: [],
              clarify: {
                waitingFor: fieldLabel(nextField),
                example: fieldExample(nextField),
                intentType: pending.intent_type,
              },
            });
          }

          // All fields filled — generate preview
          await updatePending(supabase, pending.id, {
            draft_payload: newPayload,
            missing_fields: [],
            follow_up_question: null,
          });

          // Special case: playbook target was just filled — initialize playbook
          if (pending.intent_type === "run_playbook" && field === "target_name") {
            await cancelPending(supabase, pending.id);
            return await initializePlaybook(supabase, user.id, {
              playbook_id: newPayload.playbook_id || pending.draft_payload.playbook_id,
              target_name: normalizedValue,
            });
          }

          // Execute tool to generate preview
          const result = await executeTool(
            pending.intent_type as Parameters<typeof executeTool>[0],
            supabase,
            user.id,
            newPayload
          );

          if (result.action) {
            emit.actionPreviewed(supabase, user.id, result.action.actionType);
          }

          return json({
            text: result.text,
            items: result.items,
            action: result.action || null,
            meta: { tool: pending.intent_type, confidence: 1 },
          });
        }

        case "skip_field": {
          // Remove current field from missing, ask for next
          const skippedField = pending.missing_fields[0];
          const remainingMissing = pending.missing_fields.filter((f) => f !== skippedField);

          if (remainingMissing.length > 0) {
            const nextField = remainingMissing[0];
            const followUp = getFollowUpQuestion(nextField);
            await updatePending(supabase, pending.id, {
              missing_fields: remainingMissing,
              follow_up_question: followUp,
            });
            return json({
              text: `Skipped ${fieldLabel(skippedField).toLowerCase()}. ${followUp}`,
              items: [],
              clarify: {
                waitingFor: fieldLabel(nextField),
                example: fieldExample(nextField),
                intentType: pending.intent_type,
              },
            });
          }

          // No more fields — generate preview with defaults
          await updatePending(supabase, pending.id, {
            missing_fields: [],
            follow_up_question: null,
          });

          const skipResult = await executeTool(
            pending.intent_type as Parameters<typeof executeTool>[0],
            supabase,
            user.id,
            pending.draft_payload
          );

          if (skipResult.action) {
            emit.actionPreviewed(supabase, user.id, skipResult.action.actionType);
          }

          return json({
            text: skipResult.text,
            items: skipResult.items,
            action: skipResult.action || null,
            meta: { tool: pending.intent_type, confidence: 1 },
          });
        }

        case "skip_all_fields": {
          // Skip ALL remaining fields at once — go straight to preview
          const skippedFields = pending.missing_fields.map((f) => fieldLabel(f).toLowerCase()).join(", ");
          await updatePending(supabase, pending.id, {
            missing_fields: [],
            follow_up_question: null,
          });

          const skipAllResult = await executeTool(
            pending.intent_type as Parameters<typeof executeTool>[0],
            supabase,
            user.id,
            pending.draft_payload
          );

          if (skipAllResult.action) {
            emit.actionPreviewed(supabase, user.id, skipAllResult.action.actionType);
          }

          return json({
            text: `Skipped ${skippedFields}. Here's the preview:`,
            items: skipAllResult.items,
            action: skipAllResult.action || null,
            meta: { tool: pending.intent_type, confidence: 1 },
          });
        }

        case "correction": {
          const newPayload = { ...pending.draft_payload, ...preResult.pendingOp.corrections };
          await updatePending(supabase, pending.id, { draft_payload: newPayload });

          // Check if still missing fields
          const stillMissing = pending.missing_fields.filter(
            (f) => !newPayload[f] || String(newPayload[f]).trim() === ""
          );

          if (stillMissing.length > 0) {
            const followUp = getFollowUpQuestion(stillMissing[0]);
            return json({
              text: `Updated. ${followUp}`,
              items: [],
              clarify: {
                waitingFor: fieldLabel(stillMissing[0]),
                example: fieldExample(stillMissing[0]),
                intentType: pending.intent_type,
              },
            });
          }

          // Re-generate preview with corrected payload
          const corrResult = await executeTool(
            pending.intent_type as Parameters<typeof executeTool>[0],
            supabase,
            user.id,
            newPayload
          );

          if (corrResult.action) {
            emit.actionPreviewed(supabase, user.id, corrResult.action.actionType);
          }

          return json({
            text: corrResult.text,
            items: corrResult.items,
            action: corrResult.action || null,
            meta: { tool: pending.intent_type, confidence: 1 },
          });
        }

        /* ── Playbook Step Operations (Run Mode) ── */

        case "playbook_abort": {
          const abortPbState = pending.draft_payload as unknown as PlaybookState;
          await cancelPending(supabase, pending.id);
          emit.playbookAborted(supabase, user.id, abortPbState?.playbook_id || "unknown", abortPbState?.current_step || 0);
          return json({ text: "Playbook cancelled. What else can I help with?", items: [] });
        }

        case "playbook_next":
        case "playbook_skip": {
          return await handlePlaybookStep(
            supabase,
            user.id,
            pending,
            preResult.pendingOp.type === "playbook_skip" ? "skip" : "next"
          );
        }
      }
    }

    // ── Step 2b: Guard active playbooks from accidental cancellation ──
    // If a playbook is running and the user typed something that wasn't a step command,
    // show help instead of silently falling through to intent classification.
    if (pending && pending.intent_type === "run_playbook" && pending.status === "pending") {
      const pbState = pending.draft_payload as unknown as { playbook_id?: string; current_step?: number };
      const stepHints = [
        "\"next\" or \"continue\" — advance to the next step",
        "\"skip\" — skip this step",
        "\"abort\" — cancel the entire playbook",
      ];
      return json({
        text: `I'm in the middle of a playbook (step ${(pbState.current_step ?? 0) + 1}). Here's what you can say:\n\n${stepHints.join("\n")}`,
        items: [],
      });
    }

    // ── Step 3: Catch orphan step commands (next/ok/confirm without active playbook) ──
    // These words only make sense inside a playbook. If no playbook is running,
    // intercept them before Gemini misclassifies as navigate/search.
    const hasActivePlaybook = pending && pending.intent_type === "run_playbook" && pending.status === "pending";
    if (!hasActivePlaybook && isOrphanStepCommand(preResult.cleanedMessage.toLowerCase())) {
      // Also cancel any stale non-playbook pending that wasn't cleaned up
      if (pending) await cancelPending(supabase, pending.id);
      return json({
        text: "Nothing to advance — no active playbook or pending action. Try a command like \"weekly review\" or \"create task\".",
        items: [],
      });
    }

    // ── Step 3a: Deterministic intent from pre-processor ──
    let intent = preResult.intent;
    const intentSource = intent ? "preprocessor" : "gemini";

    // ── Step 3b: Gemini classification (if no deterministic match) ──
    if (!intent) {
      intent = await classifyIntent(preResult.cleanedMessage, pageContext, history);
    }

    // Telemetry: intent classified
    emit.intentClassified(supabase, user.id, intent.tool, intent.confidence, intentSource);

    // ── Step 4: Check for missing fields → enter Clarify Mode ──
    const isWriteAction =
      intent.tool === "create_task" ||
      intent.tool === "update_task_status" ||
      intent.tool === "create_programme" ||
      intent.tool === "update_programme_status";

    if (isWriteAction) {
      const missingFields = detectMissingFields(intent.tool, intent.params);

      if (missingFields.length > 0) {
        // Cancel any existing pending action
        if (pending) await cancelPending(supabase, pending.id);

        const followUp = intent.follow_up_question || getFollowUpQuestion(missingFields[0]);

        await createPending(supabase, user.id, intent.tool, intent.params, missingFields, followUp);

        return json({
          text: followUp,
          items: [],
          clarify: {
            waitingFor: fieldLabel(missingFields[0]),
            example: fieldExample(missingFields[0]),
            intentType: intent.tool,
          },
        });
      }
    }

    // ── Step 4b: Playbook initialization (Run Mode) ──
    if (intent.tool === "run_playbook") {
      // Cancel any existing pending
      if (pending) await cancelPending(supabase, pending.id);
      return await initializePlaybook(supabase, user.id, intent.params);
    }

    // ── Step 5: Confidence gating ──
    if (intent.confidence < 0.4 && !isWriteAction) {
      return json({
        text: "I'm not sure what you need. Could you rephrase? For example:\n• \"Create a task called Review budget\"\n• \"Show my overdue tasks\"\n• \"Who missed check-in?\"",
        items: [],
      });
    }

    // ── Step 6: Cancel pending if user started a new intent ──
    if (pending) {
      await cancelPending(supabase, pending.id);
    }

    // ── Step 7: Execute tool ──
    const toolStart = Date.now();
    const result = await executeTool(
      intent.tool,
      supabase,
      user.id,
      intent.params
    );
    emit.toolExecuted(supabase, user.id, intent.tool, Date.now() - toolStart, true);

    // ── Step 8: If tool returned an action preview, create pending state ──
    if (result.action) {
      await createPending(
        supabase,
        user.id,
        result.action.actionType,
        result.action.payload,
        [],
        null as unknown as string
      );
      emit.actionPreviewed(supabase, user.id, result.action.actionType);
    }

    return json({
      text: result.text,
      items: result.items,
      action: result.action || null,
      meta: { tool: intent.tool, confidence: intent.confidence },
    });
  } catch (error) {
    console.error("Luna chat error:", error);
    // Best-effort telemetry on error — supabase/user may not be available
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) emit.error(supabase, user.id, String(error), "chat_route");
    } catch { /* swallow */ }
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

/* ── Helpers ── */

function json(data: Record<string, unknown>) {
  return NextResponse.json(data);
}

function detectMissingFields(
  tool: string,
  params: Record<string, unknown>
): string[] {
  const missing: string[] = [];

  if (tool === "create_task") {
    const title = String(params.title || "").trim();
    const genericTitles = ["", "task", "new task", "a task", "new", "the task"];
    if (genericTitles.includes(title.toLowerCase())) {
      missing.push("title");
    }
    // Optional but important fields — ask if not already provided
    if (!params.priority || String(params.priority) === "medium") missing.push("priority");
    if (!params.due_date) missing.push("due_date");
    if (!params.programme_name) missing.push("programme_name");
    if (!params.assignee_name) missing.push("assignee_name");
  }

  if (tool === "update_task_status") {
    if (!String(params.task_title || "").trim()) missing.push("task_title");
    if (!String(params.new_status || "").trim()) missing.push("new_status");
  }

  if (tool === "create_programme") {
    const name = String(params.name || "").trim();
    const genericNames = ["", "programme", "new programme", "a programme", "program", "new program"];
    if (genericNames.includes(name.toLowerCase())) {
      missing.push("name");
    }
    // Optional but important fields
    if (!params.description) missing.push("description");
    if (!params.start_date) missing.push("start_date");
    if (!params.end_date) missing.push("end_date");
  }

  if (tool === "update_programme_status") {
    if (!String(params.programme_name || "").trim()) missing.push("programme_name");
    if (!String(params.new_status || "").trim()) missing.push("programme_status");
  }

  if (tool === "update_programme_fields") {
    if (!String(params.programme_name || "").trim()) missing.push("programme_name");
    if (!String(params.update_field || "").trim()) missing.push("update_field");
    if (!String(params.update_value || "").trim()) missing.push("update_value");
  }

  return missing;
}

function getFollowUpQuestion(field: string): string {
  const questions: Record<string, string> = {
    // Required fields (no skip hint)
    title: "What should the task be called?",
    task_title: "Which task do you want to update?",
    new_status: "What status? Options: todo, in progress, done, blocked.",
    name: "What should the programme be called?",
    // Optional fields (include skip hint)
    priority: "What priority? (low / medium / high / urgent) — or say \"skip\"",
    due_date: "When is it due? (e.g. 2026-03-15) — or say \"skip\"",
    programme_name: "Which programme does this belong to? — or say \"skip\"",
    programme_status: "What status? Options: draft, active, paused, completed, archived.",
    assignee_name: "Who should this be assigned to? — or say \"skip\"",
    description: "Brief description of the programme — or say \"skip\"",
    start_date: "Start date? (e.g. 2026-03-01) — or say \"skip\"",
    end_date: "End date? (e.g. 2026-06-30) — or say \"skip\"",
    update_field: "Which field? Options: name, description, start_date, end_date.",
    update_value: "What should the new value be?",
  };
  return questions[field] || `What is the ${field}?`;
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: "Task title",
    task_title: "Task name",
    new_status: "Status",
    name: "Programme name",
    priority: "Priority",
    due_date: "Due date",
    programme_name: "Programme",
    programme_status: "Programme status",
    assignee_name: "Assignee",
    description: "Description",
    start_date: "Start date",
    end_date: "End date",
    target_name: "Programme name",
    update_field: "Field to update",
    update_value: "New value",
  };
  return labels[field] || field;
}

function fieldExample(field: string): string {
  const examples: Record<string, string> = {
    title: "e.g. \"Review Q1 budget\"",
    task_title: "e.g. \"Luna demo notes\"",
    new_status: "e.g. \"done\" or \"in progress\"",
    name: "e.g. \"Youth Tech Training\"",
    priority: "low / medium / high / urgent",
    due_date: "e.g. \"2026-03-15\" or \"skip\"",
    programme_name: "e.g. \"Tek4Teachers Pilot\" or \"skip\"",
    programme_status: "e.g. \"active\" or \"paused\"",
    assignee_name: "e.g. \"Esther\" or \"skip\"",
    description: "e.g. \"Digital literacy for secondary schools\"",
    start_date: "e.g. \"2026-03-01\" or \"skip\"",
    end_date: "e.g. \"2026-06-30\" or \"skip\"",
    target_name: "e.g. \"Sabitek\" or \"Youth Digital Skills\"",
    update_field: "name / description / start_date / end_date",
    update_value: "e.g. \"2026-06-30\" or \"New programme name\"",
  };
  return examples[field] || "";
}

/**
 * Normalize field values — validate priority, parse dates.
 * Returns the cleaned value or original if no normalization needed.
 */
function normalizeFieldValue(field: string, value: string): string {
  if (field === "priority") {
    const lower = value.toLowerCase().trim();
    const validPriorities: Record<string, string> = {
      low: "low", l: "low",
      medium: "medium", med: "medium", m: "medium",
      high: "high", h: "high",
      urgent: "urgent", u: "urgent", critical: "urgent",
    };
    return validPriorities[lower] || "medium"; // Default to medium for invalid values
  }

  if (field === "status") {
    const lower = value.toLowerCase().trim();
    const validStatuses: Record<string, string> = {
      todo: "todo", "to do": "todo", "to-do": "todo",
      "in progress": "in_progress", "in_progress": "in_progress", doing: "in_progress",
      review: "pending_review", "pending review": "pending_review", "pending_review": "pending_review",
      done: "done", complete: "done", completed: "done", finished: "done",
      blocked: "blocked", stuck: "blocked",
    };
    return validStatuses[lower] || value;
  }

  if (field === "due_date" || field === "start_date" || field === "end_date") {
    // Try to parse common date formats
    const trimmed = value.trim();
    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
    // Try native Date parse
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
    // Return as-is, the tool will handle it
    return trimmed;
  }

  if (field === "update_field") {
    const lower = value.toLowerCase().trim();
    const fieldMap: Record<string, string> = {
      name: "name", "programme name": "name", rename: "name", title: "name",
      description: "description", desc: "description", about: "description",
      "start date": "start_date", start_date: "start_date", "start": "start_date",
      "end date": "end_date", end_date: "end_date", "end": "end_date",
      "closing date": "end_date", "close date": "end_date", deadline: "end_date",
    };
    return fieldMap[lower] || value;
  }

  return value.trim();
}

/* ── Entity Resolution ── */

interface ResolveResult {
  status: "resolved" | "ambiguous" | "not_found";
  resolvedName?: string;
  suggestions?: { label: string; detail: string; href?: string }[];
}

async function resolveEntity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityType: "programme" | "user",
  query: string
): Promise<ResolveResult> {
  if (entityType === "programme") {
    const matches = await fuzzySearchProgrammes(supabase, query, { limit: 5, threshold: 0.25 });
    if (matches.length === 0) return { status: "not_found" };

    // High-confidence single match → auto-resolve
    if (matches[0].score >= 0.5) {
      return { status: "resolved", resolvedName: matches[0].item.name };
    }

    // Multiple candidates, none confident → ambiguous
    return {
      status: "ambiguous",
      suggestions: matches.slice(0, 3).map((m) => ({
        label: m.item.name,
        detail: `${m.item.status} · ${Math.round(m.score * 100)}% match`,
        href: `/programmes/${m.item.id}`,
      })),
    };
  }

  if (entityType === "user") {
    const matches = await fuzzySearchUsers(supabase, query, { limit: 5, threshold: 0.25 });
    if (matches.length === 0) return { status: "not_found" };

    if (matches[0].score >= 0.5) {
      return { status: "resolved", resolvedName: matches[0].item.full_name || matches[0].item.username };
    }

    return {
      status: "ambiguous",
      suggestions: matches.slice(0, 3).map((m) => ({
        label: m.item.full_name || m.item.username || "Unknown",
        detail: `${m.item.role} · ${Math.round(m.score * 100)}% match`,
        href: `/team`,
      })),
    };
  }

  return { status: "not_found" };
}

/* ══════════════════════════════════════════════════════════
   PLAYBOOK HANDLERS (Run Mode, Iteration 5)
   ══════════════════════════════════════════════════════════ */

async function initializePlaybook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: Record<string, unknown>
): Promise<NextResponse> {
  const playbookId = String(params.playbook_id || "").trim();
  const targetName = String(params.target_name || "").trim();

  const playbook = getPlaybook(playbookId);
  if (!playbook) {
    return json({ text: `Unknown playbook "${playbookId}".`, items: [] });
  }

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  const role = profile?.role || "member";

  if (!playbook.requiredRoles.includes(role)) {
    return json({ text: "You don't have permission to run this playbook.", items: [] });
  }

  // Resolve target if needed
  let target: { id: string; name: string } | undefined;
  if (playbook.requiresTarget === "programme") {
    if (!targetName) {
      // Need to ask for the target — create pending with missing target
      await createPending(supabase, userId, "run_playbook", { playbook_id: playbookId }, ["target_name"], "Which programme?");
      return json({
        text: `Starting "${playbook.name}". Which programme?`,
        items: [],
        clarify: {
          waitingFor: "Programme name",
          example: "e.g. \"Sabitek\" or \"Youth Digital Skills\"",
          intentType: "run_playbook",
        },
      });
    }

    const resolved = await resolvePlaybookTarget(supabase, targetName);
    if (!resolved) {
      // Show available programmes to help user
      const { data: available } = await supabase
        .from("programmes")
        .select("name, status")
        .order("name")
        .limit(10);

      const items = (available || []).map((p) => ({
        label: p.name,
        detail: p.status,
      }));

      await createPending(supabase, userId, "run_playbook", { playbook_id: playbookId }, ["target_name"], "Which programme?");
      return json({
        text: `No programme found matching "${targetName}". Here are the available programmes:`,
        items,
        clarify: {
          waitingFor: "Programme name",
          example: items[0]?.label || "Type the programme name",
          intentType: "run_playbook",
        },
      });
    }
    target = resolved;
  }

  // Initialize playbook state
  const pbState = createPlaybookState(playbookId, target);

  // Create pending action with playbook state
  await createPending(
    supabase,
    userId,
    "run_playbook",
    pbState as unknown as Record<string, unknown>,
    [], // no missing fields — step progression is handled differently
    null as unknown as string
  );

  // Telemetry: playbook started
  emit.playbookStarted(supabase, userId, playbookId, target?.name);

  // Run first step
  return await runPlaybookCurrentStep(supabase, userId, playbook, pbState);
}

async function handlePlaybookStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  pending: { id: string; intent_type: string; draft_payload: Record<string, unknown>; missing_fields: string[]; status: string },
  operation: "next" | "skip"
): Promise<NextResponse> {
  const pbState = pending.draft_payload as unknown as PlaybookState;
  const playbook = getPlaybook(pbState.playbook_id);

  if (!playbook) {
    await cancelPending(supabase, pending.id);
    return json({ text: "Playbook not found. State cleared.", items: [] });
  }

  const stepIndex = pbState.current_step;
  const step = playbook.steps[stepIndex];

  if (!step) {
    await cancelPending(supabase, pending.id);
    emit.playbookCompleted(supabase, userId, pbState.playbook_id, pbState.completed.length, pbState.skipped.length);
    return json({ text: "Playbook complete.", items: [] });
  }

  // Handle action steps — execute on "next", skip on "skip"
  if (step.type === "action" && operation === "next" && step.execute) {
    const execResult = await step.execute(supabase, userId, pbState.context);

    if (!execResult.success) {
      return json({
        text: `Step failed: ${execResult.message}. Try again or say "skip" to skip this step.`,
        items: [],
        playbookProgress: buildProgress(playbook, pbState),
      });
    }

    // Merge context from execution
    if (execResult.context) {
      Object.assign(pbState.context, execResult.context);
    }
    pbState.completed.push(stepIndex);
  } else if (operation === "skip") {
    pbState.skipped.push(stepIndex);
  } else {
    // Check/summary step — just mark as completed
    pbState.completed.push(stepIndex);
  }

  // Advance to next step
  pbState.current_step = stepIndex + 1;

  // Check if past the end
  if (pbState.current_step >= playbook.steps.length) {
    await cancelPending(supabase, pending.id);
    emit.playbookCompleted(supabase, userId, pbState.playbook_id, pbState.completed.length, pbState.skipped.length);
    return json({ text: "Playbook complete!", items: [] });
  }

  const nextStep = playbook.steps[pbState.current_step];

  // Summary steps auto-complete — run inline, cancel pending, done.
  if (nextStep.type === "summary") {
    const presentation = await nextStep.run(supabase, userId, pbState.context);
    pbState.completed.push(pbState.current_step);
    await cancelPending(supabase, pending.id);
    emit.playbookCompleted(supabase, userId, pbState.playbook_id, pbState.completed.length, pbState.skipped.length);

    return json({
      text: presentation.text,
      items: presentation.items,
      playbookProgress: {
        playbookName: playbook.name,
        currentStep: pbState.current_step,
        totalSteps: playbook.steps.length,
        stepTitle: nextStep.title,
        stepType: "summary",
        completed: [...pbState.completed],
        skipped: [...pbState.skipped],
      },
    });
  }

  // Update state for non-summary steps
  await updatePending(supabase, pending.id, {
    draft_payload: pbState as unknown as Record<string, unknown>,
  });

  // Run next step
  return await runPlaybookCurrentStep(supabase, userId, playbook, pbState);
}

async function runPlaybookCurrentStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playbook: PlaybookDef,
  pbState: PlaybookState
): Promise<NextResponse> {
  const step = playbook.steps[pbState.current_step];

  if (!step) {
    emit.playbookCompleted(supabase, userId, pbState.playbook_id, pbState.completed.length, pbState.skipped.length);
    return json({ text: "Playbook complete!", items: [] });
  }

  const presentation = await step.run(supabase, userId, pbState.context);

  // Merge step context into playbook state (for data passing between steps)
  if (presentation.context) {
    Object.assign(pbState.context, presentation.context);
  }

  // CRITICAL: Persist updated context to DB so next request has it
  const activePending = await getActivePending(supabase, userId);
  if (activePending) {
    await updatePending(supabase, activePending.id, {
      draft_payload: pbState as unknown as Record<string, unknown>,
    });
  }

  const progress = buildProgress(playbook, pbState);

  // Auto-skip if step says "auto-skipping"
  if (presentation.text.includes("auto-skipping")) {
    // Mark as skipped, advance, and recurse
    pbState.skipped.push(pbState.current_step);
    pbState.current_step += 1;

    // Need to update pending state
    const pending = await getActivePending(supabase, userId);
    if (pending) {
      await updatePending(supabase, pending.id, {
        draft_payload: pbState as unknown as Record<string, unknown>,
      });
    }

    return await runPlaybookCurrentStep(supabase, userId, playbook, pbState);
  }

  // Build action card for action steps
  let action = null;
  if (step.type === "action" && presentation.fields.length > 0) {
    action = {
      actionType: "playbook_step" as const,
      title: step.title,
      fields: presentation.fields,
      payload: { step_id: step.id, playbook_id: pbState.playbook_id },
    };
  }

  // Build hint for user
  let hint = "";
  if (step.type === "check") {
    hint = "\n\nType \"next\" to continue, \"skip\" to skip, or \"abort\" to cancel.";
  } else if (step.type === "action") {
    hint = "\n\nType \"confirm\" to execute, \"skip\" to skip, or \"abort\" to cancel.";
  }

  return json({
    text: presentation.text + hint,
    items: presentation.items,
    action,
    playbookProgress: progress,
  });
}

function buildProgress(playbook: PlaybookDef, state: PlaybookState): PlaybookProgress {
  const step = playbook.steps[state.current_step];
  return {
    playbookName: playbook.name,
    currentStep: state.current_step,
    totalSteps: playbook.steps.length,
    stepTitle: step?.title || "Complete",
    stepType: step?.type || "summary",
    completed: [...state.completed],
    skipped: [...state.skipped],
  };
}