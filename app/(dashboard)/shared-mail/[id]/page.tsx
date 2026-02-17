"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Send,
  Clock,
  Check,
  Sparkles,
  AlertCircle,
  Tag,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface EmailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
}

interface Classification {
  importance: string;
  category: string;
  summary: string;
  suggestedActions: string[];
  draftReply: string | null;
}

const IMPORTANCE_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  important: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  partnerships: "bg-purple-100 text-purple-700",
  funding: "bg-green-100 text-green-700",
  programme: "bg-blue-100 text-blue-700",
  media: "bg-pink-100 text-pink-700",
  finance: "bg-yellow-100 text-yellow-700",
  general: "bg-gray-100 text-gray-700",
  spam: "bg-red-100 text-red-700",
};

export default function ThreadDetailPage() {
  const params = useParams();
  const { profile, user, isLoading: authLoading } = useAuth();
  const threadId = params.id as string;

  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState("");

  // AI Classification state
  const [classification, setClassification] = useState<Classification | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    const fetchThread = async () => {
      try {
        const response = await fetch(`/api/gmail/threads/${threadId}`);
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        setMessages(data.messages || []);
      } catch (err) {
        setError("Failed to load email thread.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading && isAdmin && threadId) {
      fetchThread();
    } else if (!authLoading && !isAdmin) {
      setIsLoading(false);
    }
  }, [threadId, isAdmin, authLoading]);

  const handleClassify = async () => {
    if (messages.length === 0) return;

    setIsClassifying(true);
    const firstMessage = messages[0];

    try {
      const response = await fetch("/api/gmail/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: firstMessage.subject,
          from: firstMessage.from.email,
          body: firstMessage.bodyText || firstMessage.bodyHtml,
        }),
      });

      if (!response.ok) throw new Error("Failed to classify");

      const data = await response.json();
      setClassification(data);

      // If there's a draft reply, prefill it
      if (data.draftReply) {
        setReplyText(data.draftReply);
      }
    } catch (err) {
      console.error("Classification error:", err);
    } finally {
      setIsClassifying(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (messages.length === 0) return;

    setIsGeneratingDraft(true);
    const firstMessage = messages[0];

    try {
      const response = await fetch("/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: firstMessage.subject,
          from: firstMessage.from.email,
          body: firstMessage.bodyText || firstMessage.bodyHtml,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate draft");

      const data = await response.json();
      setReplyText(data.draftReply);
    } catch (err) {
      console.error("Draft generation error:", err);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || messages.length === 0) return;

    setIsSending(true);
    setSendError("");
    setSendSuccess(false);

    const firstMessage = messages[0];
    const replyTo = firstMessage.from.email;
    const subject = firstMessage.subject;

    try {
      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          to: replyTo,
          subject,
          content: replyText,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send");
      }

      setSendSuccess(true);
      setReplyText("");

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send reply");
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const subject = messages[0]?.subject || "Loading...";
  const replyTo = messages[0]?.from.email || "";

  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <p className="text-lg font-medium">Access denied</p>
        <Link href="/shared-mail" className="mt-4">
          <Button variant="outline" className="border-2">
            Back to Shared Mail
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/shared-mail">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-foreground">{subject}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {messages.length} message{messages.length !== 1 ? "s" : ""} in thread
          </p>
        </div>
      </div>

      {/* AI Classification Card */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h2 className="font-bold">AI Triage</h2>
          </div>
          <Button
            onClick={handleClassify}
            disabled={isClassifying || messages.length === 0}
            variant="outline"
            size="sm"
            className="border-2"
          >
            {isClassifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : classification ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-analyze
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze Email
              </>
            )}
          </Button>
        </div>

        {classification ? (
          <div className="mt-4 space-y-4">
            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border-2 px-3 py-1 font-mono text-xs font-medium ${IMPORTANCE_COLORS[classification.importance]}`}>
                {classification.importance.toUpperCase()}
              </span>
              <span className={`rounded-full px-3 py-1 font-mono text-xs font-medium ${CATEGORY_COLORS[classification.category]}`}>
                {classification.category}
              </span>
            </div>

            {/* Summary */}
            <div>
              <p className="font-mono text-xs text-muted-foreground">Summary</p>
              <p className="mt-1 text-sm">{classification.summary}</p>
            </div>

            {/* Suggested Actions */}
            {classification.suggestedActions.length > 0 && (
              <div>
                <p className="font-mono text-xs text-muted-foreground">Suggested Actions</p>
                <ul className="mt-1 space-y-1">
                  {classification.suggestedActions.map((action, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            Click "Analyze Email" to get AI-powered classification and suggestions.
          </p>
        )}
      </div>

      {/* Messages */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border-2 border-border bg-card" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
              {/* Message Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-border bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-medium">{message.from.name || message.from.email}</p>
                    <p className="font-mono text-xs text-muted-foreground">{message.from.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(message.date)}
                </div>
              </div>

              {/* To */}
              <div className="mt-2 font-mono text-xs text-muted-foreground">
                To: {message.to.map((t) => t.email).join(", ")}
              </div>

              {/* Body */}
              <div className="mt-4 border-t-2 border-border pt-4">
                {message.bodyHtml ? (
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: message.bodyHtml }} />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-sm">{message.bodyText}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Box */}
      {messages.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">Reply</h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground">To: {replyTo}</p>
            </div>
            <Button
              onClick={handleGenerateDraft}
              disabled={isGeneratingDraft}
              variant="outline"
              size="sm"
              className="border-2"
            >
              {isGeneratingDraft ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Draft
                </>
              )}
            </Button>
          </div>

          {sendSuccess && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Reply sent successfully!
            </div>
          )}

          {sendError && (
            <div className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {sendError}
            </div>
          )}

          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            rows={6}
            disabled={isSending || sendSuccess}
            className="mt-3 w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none disabled:opacity-50"
          />
          <div className="mt-3 flex justify-end">
            <Button
              onClick={handleSendReply}
              disabled={!replyText.trim() || isSending || sendSuccess}
              className="border-2 border-foreground bg-foreground text-background shadow-retro disabled:opacity-50"
            >
              <Send className="mr-2 h-4 w-4" strokeWidth={1.5} />
              {isSending ? "Sending..." : sendSuccess ? "Sent!" : "Send Reply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}