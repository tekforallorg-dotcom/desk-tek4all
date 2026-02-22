/**
 * MoonDesk Luna — Fuzzy Matching Utility
 *
 * Provides typo-tolerant, abbreviation-aware entity matching.
 * Used across all Luna tools for tasks, programmes, users, etc.
 *
 * Strategy (in order):
 * 1. Exact substring match (ilike)
 * 2. Word-by-word partial match
 * 3. Trigram similarity scoring (JS-side)
 *
 * No database extensions required — fetches broader candidates
 * then scores in JS for maximum portability.
 */

import { SupabaseClient } from "@supabase/supabase-js";

/* ── Types ── */

export interface FuzzyMatch<T = Record<string, unknown>> {
  item: T;
  score: number;
  matchType: "exact" | "partial" | "fuzzy";
}

export interface FuzzySearchOptions {
  /** Minimum similarity score (0-1) to count as a match. Default: 0.3 */
  threshold?: number;
  /** Maximum results to return. Default: 5 */
  limit?: number;
  /** If true, return only the single best match. Default: false */
  bestOnly?: boolean;
}

/* ── Main Fuzzy Search Functions ── */

/**
 * Fuzzy search programmes by name.
 * Returns best matches ranked by similarity.
 */
export async function fuzzySearchProgrammes(
  supabase: SupabaseClient,
  query: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzyMatch<{ id: string; name: string; status: string }>[]> {
  const { threshold = 0.3, limit = 5, bestOnly = false } = options;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Strategy 1: Exact ilike match
  const { data: exact } = await supabase
    .from("programmes")
    .select("id, name, status")
    .ilike("name", `%${trimmed}%`)
    .limit(limit);

  if (exact && exact.length > 0) {
    return exact.map((p) => ({
      item: p,
      score: similarity(trimmed.toLowerCase(), p.name.toLowerCase()),
      matchType: "exact" as const,
    })).sort((a, b) => b.score - a.score);
  }

  // Strategy 2: Fetch broader set and score with fuzzy matching
  // Get first letters to narrow down
  const firstWord = trimmed.split(/\s+/)[0];
  const prefix = firstWord.slice(0, Math.max(2, Math.floor(firstWord.length * 0.5)));

  const { data: candidates } = await supabase
    .from("programmes")
    .select("id, name, status")
    .ilike("name", `%${prefix}%`)
    .limit(20);

  if (!candidates || candidates.length === 0) {
    // Strategy 3: Last resort — fetch all programmes (for small orgs this is fine)
    const { data: all } = await supabase
      .from("programmes")
      .select("id, name, status")
      .limit(50);

    return rankMatches(trimmed, all || [], (p) => p.name, threshold, bestOnly ? 1 : limit);
  }

  return rankMatches(trimmed, candidates, (p) => p.name, threshold, bestOnly ? 1 : limit);
}

/**
 * Fuzzy search tasks by title.
 */
export async function fuzzySearchTasks(
  supabase: SupabaseClient,
  query: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzyMatch<{ id: string; title: string; status: string }>[]> {
  const { threshold = 0.3, limit = 5, bestOnly = false } = options;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Strategy 1: Exact ilike
  const { data: exact } = await supabase
    .from("tasks")
    .select("id, title, status")
    .ilike("title", `%${trimmed}%`)
    .limit(limit);

  if (exact && exact.length > 0) {
    return exact.map((t) => ({
      item: t,
      score: similarity(trimmed.toLowerCase(), t.title.toLowerCase()),
      matchType: "exact" as const,
    })).sort((a, b) => b.score - a.score);
  }

  // Strategy 2: Prefix search + fuzzy scoring
  const firstWord = trimmed.split(/\s+/)[0];
  const prefix = firstWord.slice(0, Math.max(2, Math.floor(firstWord.length * 0.5)));

  const { data: candidates } = await supabase
    .from("tasks")
    .select("id, title, status")
    .ilike("title", `%${prefix}%`)
    .limit(30);

  if (!candidates || candidates.length === 0) {
    const { data: all } = await supabase
      .from("tasks")
      .select("id, title, status")
      .limit(100);

    return rankMatches(trimmed, all || [], (t) => t.title, threshold, bestOnly ? 1 : limit);
  }

  return rankMatches(trimmed, candidates, (t) => t.title, threshold, bestOnly ? 1 : limit);
}

/**
 * Fuzzy search users/profiles by name.
 */
export async function fuzzySearchUsers(
  supabase: SupabaseClient,
  query: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzyMatch<{ id: string; full_name: string; username: string; role: string }>[]> {
  const { threshold = 0.3, limit = 5, bestOnly = false } = options;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Strategy 1: Exact ilike on full_name or username
  const { data: exact } = await supabase
    .from("profiles")
    .select("id, full_name, username, role")
    .or(`full_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`)
    .limit(limit);

  if (exact && exact.length > 0) {
    return exact.map((u) => ({
      item: u,
      score: Math.max(
        similarity(trimmed.toLowerCase(), (u.full_name || "").toLowerCase()),
        similarity(trimmed.toLowerCase(), (u.username || "").toLowerCase())
      ),
      matchType: "exact" as const,
    })).sort((a, b) => b.score - a.score);
  }

  // Strategy 2: Fetch all profiles and fuzzy rank (profiles are usually < 100)
  const { data: all } = await supabase
    .from("profiles")
    .select("id, full_name, username, role")
    .limit(100);

  return rankMatches(
    trimmed,
    all || [],
    (u) => `${u.full_name || ""} ${u.username || ""}`,
    threshold,
    bestOnly ? 1 : limit
  );
}

/* ══════════════════════════════════════════════════════════
   SIMILARITY ALGORITHMS
   ══════════════════════════════════════════════════════════ */

/**
 * Combined similarity score (0 to 1) using multiple algorithms.
 * Higher = more similar.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const al = a.toLowerCase();
  const bl = b.toLowerCase();

  // Exact substring: high score
  if (bl.includes(al) || al.includes(bl)) {
    return 0.85 + (0.15 * Math.min(al.length, bl.length) / Math.max(al.length, bl.length));
  }

  // Combine trigram and Levenshtein for best results
  const trigramScore = trigramSimilarity(al, bl);
  const levenScore = 1 - levenshteinDistance(al, bl) / Math.max(al.length, bl.length);
  const wordOverlap = wordOverlapScore(al, bl);

  // Weighted combination
  return Math.max(
    trigramScore * 0.4 + levenScore * 0.4 + wordOverlap * 0.2,
    trigramScore,
    levenScore * 0.9
  );
}

/**
 * Trigram similarity (similar to pg_trgm).
 * Splits strings into 3-character sequences and measures overlap.
 */
function trigramSimilarity(a: string, b: string): number {
  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);

  if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  return intersection / (trigramsA.size + trigramsB.size - intersection);
}

function getTrigrams(str: string): Set<string> {
  const padded = `  ${str} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Levenshtein edit distance.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Optimize for very different lengths
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return Math.max(m, n);

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

/**
 * Word overlap — how many words from query appear in the target.
 */
function wordOverlapScore(query: string, target: string): number {
  const queryWords = query.split(/\s+/).filter((w) => w.length > 1);
  const targetLower = target.toLowerCase();

  if (queryWords.length === 0) return 0;

  let matches = 0;
  for (const word of queryWords) {
    if (targetLower.includes(word)) matches++;
  }

  return matches / queryWords.length;
}

/* ── Ranking Helper ── */

function rankMatches<T>(
  query: string,
  candidates: T[],
  getLabel: (item: T) => string,
  threshold: number,
  limit: number
): FuzzyMatch<T>[] {
  const queryLower = query.toLowerCase();

  const scored: FuzzyMatch<T>[] = candidates
    .map((item) => ({
      item,
      score: similarity(queryLower, getLabel(item).toLowerCase()),
      matchType: "fuzzy" as const,
    }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}