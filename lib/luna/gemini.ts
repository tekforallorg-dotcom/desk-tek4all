/**
 * MoonDesk Luna — Gemini Intent Classification
 *
 * Agent upgrade: conversation-aware, strict JSON output,
 * missing_fields detection, confidence gating.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/** Gemini request timeout (ms) */
const GEMINI_TIMEOUT_MS = 10_000;

/** Max retries on transient Gemini failures */
const GEMINI_MAX_RETRIES = 1;

/* ── Types ── */

export type LunaToolName =
  | "search_tasks"
  | "search_programmes"
  | "search_users"
  | "get_my_overdue_tasks"
  | "get_my_tasks"
  | "get_checkin_status"
  | "get_programme_health"
  | "get_blockers"
  | "navigate"
  | "general_answer"
  | "create_task"
  | "update_task_status"
  | "create_programme"
  | "update_programme_status"
  | "update_programme_fields"
  | "get_team_overdue"
  | "get_team_summary"
  | "run_playbook";

export interface LunaIntent {
  tool: LunaToolName;
  params: Record<string, unknown>;
  confidence: number;
  missing_fields?: string[];
  follow_up_question?: string;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/* ── System Prompt ── */

const SYSTEM_PROMPT = `You are Luna, the AI operations assistant for MoonDesk (Tek4All Foundation).
Classify the user's message into a structured tool call. You receive conversation history for context.

Tools:

READ:
- search_tasks: { query?, status?, priority? }
- search_programmes: { query?, status? }
- search_users: { query?, role? }
- get_my_overdue_tasks: {}
- get_my_tasks: { status? }
- get_checkin_status: { week_start? }
- get_programme_health: { programme_name }
- get_blockers: { programme_name? }
- navigate: { destination }
- general_answer: { topic }

WRITE:
- create_task: { title, description?, priority?, due_date?, programme_name?, assignee_name? }
- update_task_status: { task_title, new_status }
- create_programme: { name, description?, status?, start_date?, end_date? }
- update_programme_status: { programme_name, new_status }
- update_programme_fields: { programme_name, update_field, update_value }

MANAGER INSIGHTS (manager/admin/super_admin only):
- get_team_overdue: {}
- get_team_summary: { programme_name? }

RUN MODE PLAYBOOKS (manager/admin/super_admin only):
- run_playbook: { playbook_id, target_name? }
  playbook_id options: "close_programme", "start_programme", "weekly_review"
  target_name is required for close_programme and start_programme (the programme name).

Task statuses: todo, in_progress, pending_review, done, blocked
Programme statuses: draft, active, paused, completed, archived
Priorities: low, medium, high, urgent

RULES:

1. Return ONLY valid JSON. No markdown. No explanation. No code fences.
2. Pick ONE tool — the best match for the user's primary intent.
3. CONVERSATION CONTEXT: Read history. If Luna asked a question and user answers, complete the action.
4. MISSING FIELDS: If a required field is not in the message, list it in missing_fields and provide a follow_up_question.
5. TITLE EXTRACTION: For create_task, extract the descriptive name — strip command words (create, task, make, new, add, please, a, the). "Create a task to review budget" → title: "Review budget". "Create task called Monthly report" → title: "Monthly report".
6. For update_task_status: strip noise ("task", "the", "a", "status of") from task_title.
7. Handle ONE action per message. If user says "create X and mark done", only handle create_task.
8. SIDEWAYS REQUESTS: "What should I do next?" or "help me" → use get_my_overdue_tasks (show actionable items, not generic help).
9. If confidence < 0.5, set follow_up_question to ask for clarification.
10. CREATE PROGRAMME: Same title extraction rules as tasks. "Create a programme called X" → name: "X". If no name given, set name to "" (empty).
11. UPDATE PROGRAMME STATUS: Extract programme name. Strip noise. "pause Youth Tech" → programme_name: "Youth Tech", new_status: "paused".
12. UPDATE PROGRAMME FIELDS: For "change/update/set end date of X to Y" or "rename X to Y" or "update description of X". Extract programme_name, update_field (one of: name, description, start_date, end_date), update_value. Examples: "change end date of sabitek to march 2026" → programme_name: "sabitek", update_field: "end_date", update_value: "2026-03-31". "rename Youth Digital to Youth Tech" → programme_name: "Youth Digital", update_field: "name", update_value: "Youth Tech".
13. TEAM INSIGHTS: "team overdue" / "my team's overdue tasks" → get_team_overdue. "team summary" / "how is my team doing" → get_team_summary.
14. PLAYBOOKS: "close programme X" / "close down X" → run_playbook with playbook_id: "close_programme", target_name: "X". "start programme Y" / "launch Y" → run_playbook with playbook_id: "start_programme", target_name: "Y". "weekly review" / "manager review" → run_playbook with playbook_id: "weekly_review".

Response format:
{
  "tool": "tool_name",
  "params": { ... },
  "confidence": 0.85,
  "missing_fields": [],
  "follow_up_question": null
}`;

/* ── Classify Intent ── */

export async function classifyIntent(
  userMessage: string,
  pageContext: string,
  history: ChatHistoryMessage[] = []
): Promise<LunaIntent> {
  if (!genAI) {
    console.warn("Luna: Gemini API not available, using fallback");
    return fallbackClassify(userMessage, history);
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const recentHistory = history.slice(-6);
  let historyStr = "";
  if (recentHistory.length > 0) {
    historyStr =
      "\nConversation history:\n" +
      recentHistory.map((m) => `${m.role === "user" ? "User" : "Luna"}: ${m.content}`).join("\n") +
      "\n";
  }

  const prompt = `${SYSTEM_PROMPT}

Page context: ${pageContext}
${historyStr}
User message: "${userMessage}"

JSON:`;

  // Retry loop with timeout
  let lastError: unknown;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      // Timeout wrapper
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS)
        ),
      ]);

      const text = result.response.text();
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      return {
        tool: parsed.tool || "general_answer",
        params: parsed.params || {},
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
        follow_up_question: parsed.follow_up_question || undefined,
      };
    } catch (error) {
      lastError = error;
      console.warn(`Luna: Gemini attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error);

      // Only retry on transient errors (timeout, network), not parse errors
      const isTransient =
        error instanceof Error &&
        (error.message.includes("timeout") ||
          error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("503") ||
          error.message.includes("429"));

      if (!isTransient || attempt >= GEMINI_MAX_RETRIES) break;

      // Brief backoff before retry
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  console.error("Luna: Gemini failed after retries, using fallback:", lastError);
  return fallbackClassify(userMessage, history);
}

/* ── Fallback Classifier ── */

function fallbackClassify(message: string, history: ChatHistoryMessage[] = []): LunaIntent {
  const lower = message.toLowerCase();

  // Check conversation context
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const lastAL = lastAssistant?.content.toLowerCase() || "";

  // Context fills
  if (lastAL.includes("what should the task be called") || lastAL.includes("give me a title")) {
    return { tool: "create_task", params: { title: message.trim() }, confidence: 0.9 };
  }
  if (lastAL.includes("which task")) {
    return { tool: "update_task_status", params: { task_title: message.trim(), new_status: "done" }, confidence: 0.7 };
  }

  // Context fills — programme name after Luna asked
  if (lastAL.includes("what should the programme be called") || lastAL.includes("programme name")) {
    return { tool: "create_programme", params: { name: message.trim() }, confidence: 0.9 };
  }

  // Create programme
  if (lower.includes("create") && (lower.includes("programme") || lower.includes("program"))) {
    const namedMatch = message.match(/(?:named|called|with\s+name)\s+["""]?(.+?)["""]?(?:\s+(?:and|with|start|end).*)?$/i);
    const name = namedMatch?.[1]?.trim() || "";
    if (!name) {
      return { tool: "create_programme", params: { name: "" }, confidence: 0.8, missing_fields: ["name"], follow_up_question: "What should the programme be called?" };
    }
    return { tool: "create_programme", params: { name }, confidence: 0.8 };
  }

  // Update programme status
  if ((lower.includes("pause") || lower.includes("activate") || lower.includes("archive") || lower.includes("complete")) && (lower.includes("programme") || lower.includes("program"))) {
    let newStatus = "active";
    if (lower.includes("pause")) newStatus = "paused";
    if (lower.includes("archive")) newStatus = "archived";
    if (lower.includes("complete")) newStatus = "completed";
    if (lower.includes("draft")) newStatus = "draft";
    const programmeName = message
      .replace(/^(pause|activate|archive|complete|update|change\s+status\s+of)\s+(the\s+)?/i, "")
      .replace(/\s+(programme|program)\s*$/i, "")
      .replace(/\s+(to\s+)(paused|active|archived|completed|draft)\s*$/i, "")
      .trim();
    return { tool: "update_programme_status", params: { programme_name: programmeName, new_status: newStatus }, confidence: 0.7 };
  }

  // Update programme fields (change end date, rename, update description)
  if ((lower.includes("change") || lower.includes("update") || lower.includes("set") || lower.includes("rename")) &&
      (lower.includes("date") || lower.includes("name") || lower.includes("description") || lower.includes("rename")) &&
      (lower.includes("programme") || lower.includes("program") || !lower.includes("task"))) {

    let updateField = "";
    let updateValue = "";
    let programmeName = "";

    // Detect field type
    if (lower.includes("end date") || lower.includes("closing date") || lower.includes("end_date")) {
      updateField = "end_date";
    } else if (lower.includes("start date") || lower.includes("start_date")) {
      updateField = "start_date";
    } else if (lower.includes("rename") || (lower.includes("change") && lower.includes("name"))) {
      updateField = "name";
    } else if (lower.includes("description")) {
      updateField = "description";
    }

    // Extract "X to Y" pattern
    const toMatch = message.match(/(?:of|for)\s+(.+?)\s+to\s+(.+?)$/i);
    if (toMatch) {
      programmeName = toMatch[1].replace(/\b(the|programme|program|'s)\b/gi, "").trim();
      updateValue = toMatch[2].trim();
    }

    // "rename X to Y"
    const renameMatch = message.match(/rename\s+(.+?)\s+to\s+(.+?)$/i);
    if (renameMatch) {
      programmeName = renameMatch[1].replace(/\b(the|programme|program)\b/gi, "").trim();
      updateValue = renameMatch[2].trim();
      updateField = "name";
    }

    if (updateField) {
      return {
        tool: "update_programme_fields",
        params: { programme_name: programmeName, update_field: updateField, update_value: updateValue },
        confidence: 0.7,
        missing_fields: [
          ...(!programmeName ? ["programme_name"] : []),
          ...(!updateValue ? ["update_value"] : []),
        ],
        follow_up_question: !programmeName ? "Which programme?" : !updateValue ? `What should the new ${updateField.replace("_", " ")} be?` : undefined,
      };
    }
  }

  // Team overdue (manager insight)
  if (lower.includes("team") && lower.includes("overdue")) {
    return { tool: "get_team_overdue", params: {}, confidence: 0.8 };
  }

  // Team summary (manager insight)
  if ((lower.includes("team") && lower.includes("summary")) || lower.includes("how is my team")) {
    return { tool: "get_team_summary", params: {}, confidence: 0.8 };
  }

  // Run Mode playbooks
  if (lower.includes("weekly review") || lower.includes("manager review") || lower.includes("weekly check")) {
    return { tool: "run_playbook", params: { playbook_id: "weekly_review" }, confidence: 0.85 };
  }
  if ((lower.includes("close") || lower.includes("shut down") || lower.includes("wrap up")) && (lower.includes("programme") || lower.includes("program"))) {
    const target = message
      .replace(/^(close|shut\s+down|wrap\s+up)\s+(the\s+)?(programme|program)\s*/i, "")
      .trim();
    return { tool: "run_playbook", params: { playbook_id: "close_programme", target_name: target || "" }, confidence: 0.8 };
  }
  if ((lower.includes("start") || lower.includes("launch") || lower.includes("kick off")) && (lower.includes("programme") || lower.includes("program"))) {
    const target = message
      .replace(/^(start|launch|kick\s+off)\s+(the\s+)?(programme|program)\s*/i, "")
      .trim();
    return { tool: "run_playbook", params: { playbook_id: "start_programme", target_name: target || "" }, confidence: 0.8 };
  }
  // Fuzzy match: "start/close X" without "programme" keyword — lower confidence
  if (/^(close|shut\s+down|wrap\s+up)\s+/i.test(lower) && !lower.includes("task")) {
    const target = message.replace(/^(close|shut\s+down|wrap\s+up)\s+(the\s+)?/i, "")
      .replace(/\s+and\s+.*/i, "").replace(/\s+(programme|program)\s*$/i, "").trim();
    if (target) return { tool: "run_playbook", params: { playbook_id: "close_programme", target_name: target }, confidence: 0.7 };
  }
  if (/^(start|launch|kick\s+off)\s+/i.test(lower) && !lower.includes("task")) {
    const target = message.replace(/^(start|launch|kick\s+off)\s+(the\s+)?/i, "")
      .replace(/\s+and\s+.*/i, "").replace(/\s+(programme|program)\s*$/i, "").trim();
    if (target) return { tool: "run_playbook", params: { playbook_id: "start_programme", target_name: target }, confidence: 0.7 };
  }

  // Create task
  if (lower.includes("create") && lower.includes("task")) {
    const namedMatch = message.match(/(?:named|called|with\s+name)\s+["""]?(.+?)["""]?(?:\s+(?:and|with|due|priority).*)?$/i);
    const toMatch = message.match(/(?:create\s+(?:a\s+)?task\s+(?:to\s+|for\s+))(.*?)(?:\s+(?:and|due|priority).*)?$/i);
    const title = namedMatch?.[1]?.trim() || toMatch?.[1]?.trim() || "";
    if (!title) {
      return { tool: "create_task", params: { title: "" }, confidence: 0.8, missing_fields: ["title"], follow_up_question: "What should the task be called?" };
    }
    return { tool: "create_task", params: { title }, confidence: 0.8 };
  }

  // Update status
  if (
    (lower.includes("mark") && (lower.includes("done") || lower.includes("progress") || lower.includes("blocked"))) ||
    lower.includes("change status") || lower.includes("update status")
  ) {
    let newStatus = "done";
    if (lower.includes("in progress") || lower.includes("in_progress")) newStatus = "in_progress";
    if (lower.includes("blocked")) newStatus = "blocked";
    if (lower.includes("todo")) newStatus = "todo";

    const taskTitle = message
      .replace(/^(mark|complete|finish|change|update)\s+(the\s+)?(status\s+of\s+)?/i, "")
      .replace(/\s+(as\s+)?(done|complete|finished|in[_ ]progress|blocked|todo|to do)\s*$/i, "")
      .replace(/\s+(to\s+)(done|complete|finished|in[_ ]progress|blocked|todo|to do)\s*$/i, "")
      .replace(/\s+task\s*$/i, "")
      .replace(/^["'""\s]+|["'""\s]+$/g, "")
      .trim();

    return { tool: "update_task_status", params: { task_title: taskTitle, new_status: newStatus }, confidence: 0.7 };
  }

  // Sideways "help me" / "what should I do"
  if (lower.includes("what should i do") || lower.includes("help me") || lower.includes("what next")) {
    return { tool: "get_my_overdue_tasks", params: {}, confidence: 0.7 };
  }

  // Read intents
  if (lower.includes("overdue")) return { tool: "get_my_overdue_tasks", params: {}, confidence: 0.8 };
  if (lower.includes("my task")) return { tool: "get_my_tasks", params: {}, confidence: 0.8 };
  if (lower.includes("check-in") || lower.includes("checkin") || lower.includes("check in")) return { tool: "get_checkin_status", params: {}, confidence: 0.7 };
  if (lower.includes("block")) return { tool: "get_blockers", params: {}, confidence: 0.7 };
  if (lower.includes("programme") || lower.includes("program")) {
    if (lower.includes("health") || lower.includes("status") || lower.includes("summary")) return { tool: "get_programme_health", params: {}, confidence: 0.6 };
    return { tool: "search_programmes", params: { query: message }, confidence: 0.6 };
  }
  if (lower.includes("task")) return { tool: "search_tasks", params: { query: message }, confidence: 0.6 };
  if (lower.includes("team") || lower.includes("who") || lower.includes("member")) return { tool: "search_users", params: { query: message }, confidence: 0.6 };
  if (lower.includes("where") || lower.includes("how do i") || lower.includes("navigate")) return { tool: "navigate", params: { destination: message }, confidence: 0.6 };

  return { tool: "general_answer", params: { topic: message }, confidence: 0.3 };
}