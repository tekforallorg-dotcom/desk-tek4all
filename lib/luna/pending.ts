/**
 * MoonDesk Luna — Pending Action State Manager
 *
 * Server-side state for multi-turn conversations.
 * Only ONE active pending action per user at a time.
 * Auto-expires after 5 minutes of inactivity.
 *
 * Iteration 6: Reduced expiry, added bulk cleanup, hardened getActive.
 */

import { SupabaseClient } from "@supabase/supabase-js";

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PendingAction {
  id: string;
  user_id: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  intent_type: string;
  missing_fields: string[];
  draft_payload: Record<string, unknown>;
  follow_up_question: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/**
 * Get the active pending action for a user (if any).
 * Auto-expires stale actions and cleans up old records.
 */
export async function getActivePending(
  supabase: SupabaseClient,
  userId: string
): Promise<PendingAction | null> {
  const now = new Date().toISOString();

  // Expire any overdue pending actions
  await supabase
    .from("luna_pending_actions")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", now);

  // Get active pending action
  const { data } = await supabase
    .from("luna_pending_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as PendingAction | null;
}

/**
 * Bulk cleanup: cancel all pending actions for a user.
 * Called on drawer open to ensure clean state.
 */
export async function cleanupAllPending(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from("luna_pending_actions")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id");

  return data?.length || 0;
}

/**
 * Purge old terminal records (completed/cancelled/expired) older than 24 hours.
 * Keeps table small. Called opportunistically.
 */
export async function purgeOldRecords(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("luna_pending_actions")
    .delete()
    .eq("user_id", userId)
    .neq("status", "pending")
    .lt("updated_at", cutoff);
}

/**
 * Create a new pending action. Cancels any existing active action first.
 */
export async function createPending(
  supabase: SupabaseClient,
  userId: string,
  intentType: string,
  draftPayload: Record<string, unknown>,
  missingFields: string[],
  followUpQuestion: string
): Promise<PendingAction> {
  // Cancel existing pending actions
  await supabase
    .from("luna_pending_actions")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "pending");

  const { data, error } = await supabase
    .from("luna_pending_actions")
    .insert({
      user_id: userId,
      intent_type: intentType,
      draft_payload: draftPayload,
      missing_fields: missingFields,
      follow_up_question: followUpQuestion,
      status: "pending",
      expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as PendingAction;
}

/**
 * Update draft payload and missing fields for an active pending action.
 * Extends expiry by TTL.
 */
export async function updatePending(
  supabase: SupabaseClient,
  pendingId: string,
  updates: {
    draft_payload?: Record<string, unknown>;
    missing_fields?: string[];
    follow_up_question?: string | null;
  }
): Promise<PendingAction> {
  const { data, error } = await supabase
    .from("luna_pending_actions")
    .update({
      ...updates,
      expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    })
    .eq("id", pendingId)
    .select()
    .single();

  if (error) throw error;
  return data as PendingAction;
}

/**
 * Mark a pending action as completed (successful confirm).
 */
export async function completePending(
  supabase: SupabaseClient,
  pendingId: string
): Promise<void> {
  await supabase
    .from("luna_pending_actions")
    .update({ status: "completed" })
    .eq("id", pendingId);
}

/**
 * Cancel a pending action.
 */
export async function cancelPending(
  supabase: SupabaseClient,
  pendingId: string
): Promise<void> {
  await supabase
    .from("luna_pending_actions")
    .update({ status: "cancelled" })
    .eq("id", pendingId);
}