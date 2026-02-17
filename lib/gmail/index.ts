import { google } from "googleapis";

const getGmailClient = async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    clientOptions: {
      subject: process.env.GMAIL_IMPERSONATE_EMAIL,
    },
  });

  const gmail = google.gmail({ version: "v1", auth });
  return gmail;
};

export interface EmailThread {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: { name: string; email: string };
  date: string;
  isUnread: boolean;
  labelIds: string[];
  messagesCount: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  }
  return { name: raw, email: raw };
}

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  if (payload?.body?.data) {
    const decoded = decodeBase64(payload.body.data);
    if (payload.mimeType === "text/plain") text = decoded;
    if (payload.mimeType === "text/html") html = decoded;
  }

  if (payload?.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result.text) text = result.text;
      if (result.html) html = result.html;
    }
  }

  return { text, html };
}

export async function listThreads(maxResults = 20): Promise<EmailThread[]> {
  const gmail = await getGmailClient();

  const response = await gmail.users.threads.list({
    userId: "me",
    maxResults,
    q: "in:inbox",
  });

  const threads: EmailThread[] = [];

  for (const thread of response.data.threads || []) {
    if (!thread.id) continue;

    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: thread.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const firstMessage = threadData.data.messages?.[0];
    if (!firstMessage) continue;

    const headers = firstMessage.payload?.headers;
    const from = parseEmailAddress(getHeader(headers, "From"));
    const subject = getHeader(headers, "Subject") || "(No Subject)";
    const date = getHeader(headers, "Date");

    threads.push({
      id: thread.id,
      threadId: thread.id,
      subject,
      snippet: firstMessage.snippet || "",
      from,
      date,
      isUnread: firstMessage.labelIds?.includes("UNREAD") || false,
      labelIds: firstMessage.labelIds || [],
      messagesCount: threadData.data.messages?.length || 1,
    });
  }

  return threads;
}

export async function getThread(threadId: string): Promise<EmailMessage[]> {
  const gmail = await getGmailClient();

  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages: EmailMessage[] = [];

  for (const message of response.data.messages || []) {
    if (!message.id || !message.threadId) continue;

    const headers = message.payload?.headers;
    const from = parseEmailAddress(getHeader(headers, "From"));
    const toRaw = getHeader(headers, "To");
    const to = toRaw
      ? toRaw.split(",").map((t) => parseEmailAddress(t.trim()))
      : [];
    const subject = getHeader(headers, "Subject") || "(No Subject)";
    const date = getHeader(headers, "Date");
    const { text, html } = extractBody(message.payload);

    messages.push({
      id: message.id,
      threadId: message.threadId,
      from,
      to,
      subject,
      date,
      bodyText: text,
      bodyHtml: html,
    });
  }

  return messages;
}

export async function markAsRead(threadId: string): Promise<void> {
  const gmail = await getGmailClient();

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
  });

  for (const message of thread.data.messages || []) {
    if (!message.id) continue;
    await gmail.users.messages.modify({
      userId: "me",
      id: message.id,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
  }
}

export async function sendReply(
  threadId: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const gmail = await getGmailClient();

  const raw = Buffer.from(
    `To: ${to}\r\n` +
      `Subject: Re: ${subject}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      body
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId,
    },
  });
}