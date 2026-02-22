/**
 * MoonDesk Luna — Telemetry Events
 *
 * Structured logging for Luna interactions.
 * Events are stored in luna_telemetry table for analytics.
 * Lightweight — fire-and-forget, never blocks user flow.
 *
 * Iteration 6: Initial telemetry implementation.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export type LunaEventType =
  | "drawer_open"
  | "drawer_close"
  | "message_sent"
  | "intent_classified"
  | "tool_executed"
  | "action_previewed"
  | "action_confirmed"
  | "action_failed"
  | "playbook_started"
  | "playbook_step_completed"
  | "playbook_completed"
  | "playbook_aborted"
  | "pending_expired"
  | "pending_cleaned"
  | "error";

export interface LunaTelemetryEvent {
  user_id: string;
  event_type: LunaEventType;
  metadata?: Record<string, unknown>;
}

/**
 * Emit a telemetry event. Fire-and-forget — never throws.
 * Uses audit_logs table with source="luna_telemetry" to avoid new table migration.
 */
export async function emitEvent(
  supabase: SupabaseClient,
  event: LunaTelemetryEvent
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      user_id: event.user_id,
      action: `luna_${event.event_type}`,
      entity_type: "luna",
      entity_id: null,
      details: {
        source: "luna_telemetry",
        event_type: event.event_type,
        ...event.metadata,
      },
    });
  } catch (err) {
    // Never let telemetry failures affect user flow
    console.warn("[Luna telemetry] Failed to emit event:", event.event_type, err);
  }
}

/**
 * Shorthand helpers for common events.
 */
export const emit = {
  messageSent(supabase: SupabaseClient, userId: string, messageLength: number) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "message_sent",
      metadata: { message_length: messageLength },
    });
  },

  intentClassified(
    supabase: SupabaseClient,
    userId: string,
    tool: string,
    confidence: number,
    source: "preprocessor" | "gemini"
  ) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "intent_classified",
      metadata: { tool, confidence, source },
    });
  },

  toolExecuted(
    supabase: SupabaseClient,
    userId: string,
    tool: string,
    durationMs: number,
    success: boolean
  ) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "tool_executed",
      metadata: { tool, duration_ms: durationMs, success },
    });
  },

  actionPreviewed(supabase: SupabaseClient, userId: string, actionType: string) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "action_previewed",
      metadata: { action_type: actionType },
    });
  },

  actionConfirmed(supabase: SupabaseClient, userId: string, actionType: string) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "action_confirmed",
      metadata: { action_type: actionType },
    });
  },

  actionFailed(supabase: SupabaseClient, userId: string, actionType: string, error: string) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "action_failed",
      metadata: { action_type: actionType, error },
    });
  },

  playbookStarted(supabase: SupabaseClient, userId: string, playbookId: string, target?: string) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "playbook_started",
      metadata: { playbook_id: playbookId, target },
    });
  },

  playbookCompleted(supabase: SupabaseClient, userId: string, playbookId: string, stepsCompleted: number, stepsSkipped: number) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "playbook_completed",
      metadata: { playbook_id: playbookId, steps_completed: stepsCompleted, steps_skipped: stepsSkipped },
    });
  },

  playbookAborted(supabase: SupabaseClient, userId: string, playbookId: string, atStep: number) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "playbook_aborted",
      metadata: { playbook_id: playbookId, at_step: atStep },
    });
  },

  pendingCleaned(supabase: SupabaseClient, userId: string, count: number) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "pending_cleaned",
      metadata: { cleaned_count: count },
    });
  },

  error(supabase: SupabaseClient, userId: string, errorMessage: string, context?: string) {
    return emitEvent(supabase, {
      user_id: userId,
      event_type: "error",
      metadata: { error: errorMessage, context },
    });
  },
};