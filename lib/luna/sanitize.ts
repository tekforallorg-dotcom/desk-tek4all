/**
 * Luna Input Sanitization Utilities
 *
 * Iteration 6 Slice E: Centralized input validation and sanitization
 * for all Luna API boundaries.
 */

/* ── Constants ── */

/** Maximum message length from user input */
export const MAX_MESSAGE_LENGTH = 500;

/** Maximum length for titles/names */
export const MAX_TITLE_LENGTH = 200;

/** Maximum length for descriptions */
export const MAX_DESCRIPTION_LENGTH = 1000;

/** Maximum length for search queries */
export const MAX_QUERY_LENGTH = 200;

/** Maximum chat history entries sent to Gemini */
export const MAX_HISTORY_ENTRIES = 10;

/* ── Text Sanitization ── */

/**
 * Strip HTML/script tags and control characters from user input.
 * Preserves normal punctuation and whitespace.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")           // Remove HTML tags
    .replace(/&[a-z]+;/gi, "")         // Remove HTML entities
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control chars (keep \n, \r, \t)
    .trim();
}

/**
 * Sanitize text input: strip HTML, enforce max length, trim.
 * Safe for DB storage and UI rendering.
 */
export function sanitizeText(input: unknown, maxLength: number = MAX_TITLE_LENGTH): string {
  const str = String(input ?? "").trim();
  if (!str) return "";
  const cleaned = stripHtml(str);
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Sanitize a user message (chat input).
 * More permissive than title — allows longer text.
 */
export function sanitizeMessage(input: unknown): string {
  return sanitizeText(input, MAX_MESSAGE_LENGTH);
}

/**
 * Sanitize a search query — shorter limit, stripped of noise.
 */
export function sanitizeQuery(input: unknown): string {
  return sanitizeText(input, MAX_QUERY_LENGTH);
}

/* ── UUID Validation ── */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID v4 format.
 */
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Extract and validate a UUID from input. Returns null if invalid.
 */
export function parseUUID(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

/* ── Date Validation ── */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate an ISO date string (YYYY-MM-DD) and ensure it's a real date.
 */
export function isValidISODate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!ISO_DATE_REGEX.test(trimmed)) return false;
  const parsed = new Date(trimmed + "T00:00:00Z");
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(trimmed);
}

/* ── History Sanitization ── */

interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Sanitize chat history array from client.
 * - Validate structure (role + content)
 * - Enforce max entries
 * - Sanitize content strings
 * - Only allow "user" and "assistant" roles
 */
export function sanitizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  const validRoles = new Set(["user", "assistant"]);

  return input
    .filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        typeof m.role === "string" &&
        validRoles.has(m.role) &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_HISTORY_ENTRIES)
    .map((m) => ({
      role: m.role,
      content: sanitizeText(m.content, MAX_MESSAGE_LENGTH),
    }));
}

/* ── Enum Validation ── */

/**
 * Validate that a value is one of the allowed options.
 * Returns the value if valid, or the default/null.
 */
export function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  defaultValue?: T
): T | null {
  const str = String(value ?? "").trim().toLowerCase() as T;
  if (allowed.includes(str)) return str;
  return defaultValue ?? null;
}

/* ── Allowlists ── */

export const VALID_TASK_STATUSES = ["todo", "in_progress", "pending_review", "done", "blocked"] as const;
export const VALID_PROGRAMME_STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
export const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const VALID_PROGRAMME_FIELDS = ["name", "description", "start_date", "end_date"] as const;