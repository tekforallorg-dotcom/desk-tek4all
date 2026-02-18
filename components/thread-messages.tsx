"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, Loader2 } from "lucide-react";

interface ThreadMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender: {
    id: string;
    full_name: string | null;
    username: string;
  } | null;
}

interface ThreadMessagesProps {
  taskId?: string;
  programmeId?: string;
  title?: string;
}

export default function ThreadMessages({
  taskId,
  programmeId,
  title = "Discussion",
}: ThreadMessagesProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  useEffect(() => {
    async function fetchMessages() {
      const param = taskId ? `task_id=${taskId}` : `programme_id=${programmeId}`;
      try {
        const res = await fetch(`/api/threads?${param}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        } else {
          const err = await res.json();
          setError(err.error || "Failed to load messages");
        }
      } catch (err) {
        console.error("Failed to fetch thread:", err);
        setError("Failed to load messages");
      } finally {
        setIsLoading(false);
      }
    }

    if (taskId || programmeId) {
      fetchMessages();
    }
  }, [taskId, programmeId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMessage.trim(),
          task_id: taskId || null,
          programme_id: programmeId || null,
        }),
      });

      if (res.ok) {
        const message = await res.json();
        setMessages([...messages, message]);
        setNewMessage("");
      } else {
        const err = await res.json();
        setError(err.error || "Failed to send message");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading discussion...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-card shadow-retro overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="font-bold">{title}</h2>
          {messages.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({messages.length})
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="max-h-80 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the discussion!
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                {getInitials(
                  message.sender?.full_name || null,
                  message.sender?.username || "?"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {message.sender?.full_name || message.sender?.username || "Unknown"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(message.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div className="px-6 py-4 border-t border-border bg-muted/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a message..."
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            disabled={isSending}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className="px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium shadow-retro-sm hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}