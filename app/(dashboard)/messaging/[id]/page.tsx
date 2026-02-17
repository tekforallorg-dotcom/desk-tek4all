"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: { full_name: string; username: string } | null;
}

interface Conversation {
  id: string;
  type: string;
  title: string | null;
}

interface Participant {
  user_id: string;
  user: { full_name: string; username: string };
}

export default function ConversationPage() {
  const params = useParams();
  const { user } = useAuth();
  const conversationId = params.id as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchConversation = async () => {
      const supabase = createClient();

      // Get conversation
      const { data: convData } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (convData) {
        setConversation(convData);
      }

      // Get participants
      const { data: partData } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);

      if (partData) {
        const participantsWithDetails = await Promise.all(
          partData.map(async (p) => {
            const { data: userData } = await supabase
              .from("profiles")
              .select("full_name, username")
              .eq("id", p.user_id)
              .single();
            return { user_id: p.user_id, user: userData! };
          })
        );
        setParticipants(participantsWithDetails);
      }

      // Get messages
      const { data: msgData } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (msgData) {
        const messagesWithSenders = await Promise.all(
          msgData.map(async (msg) => {
            const { data: senderData } = await supabase
              .from("profiles")
              .select("full_name, username")
              .eq("id", msg.sender_id)
              .single();
            return { ...msg, sender: senderData };
          })
        );
        setMessages(messagesWithSenders);
      }

      setIsLoading(false);
    };

    fetchConversation();

    // Set up real-time subscription
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          const { data: senderData } = await supabase
            .from("profiles")
            .select("full_name, username")
            .eq("id", newMsg.sender_id)
            .single();

          setMessages((prev) => [...prev, { ...newMsg, sender: senderData }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    const supabase = createClient();

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user?.id,
      content: newMessage.trim(),
    });

    if (error) {
      console.error("Error sending message:", error);
    } else {
      setNewMessage("");
    }

    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getConversationTitle = () => {
    if (conversation?.title) return conversation.title;
    if (conversation?.type === "dm") {
      const otherParticipant = participants.find((p) => p.user_id !== user?.id);
      return (
        otherParticipant?.user.full_name ||
        otherParticipant?.user.username ||
        "Conversation"
      );
    }
    return "Conversation";
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
    });
  };

  const groupMessagesByDate = () => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msg.created_at, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col">
        <div className="flex items-center gap-4 pb-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex-1 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4">
        <Link href="/messaging">
          <Button
            variant="outline"
            size="icon"
            className="border-2 shadow-retro-sm"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {getConversationTitle()}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl border-2 border-border bg-card p-4 shadow-retro">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-sm text-muted-foreground">
              No messages yet. Say hello! 👋
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupMessagesByDate().map((group, groupIndex) => (
              <div key={groupIndex}>
                {/* Date separator */}
                <div className="flex items-center justify-center py-2">
                  <span className="rounded-full bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
                    {formatDate(group.date)}
                  </span>
                </div>

                {/* Messages */}
                <div className="space-y-3">
                  {group.messages.map((msg) => {
                    const isOwn = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            isOwn
                              ? "rounded-br-md border-2 border-foreground bg-foreground text-background"
                              : "rounded-bl-md border-2 border-border bg-muted"
                          }`}
                        >
                          {!isOwn && (
                            <p className="mb-1 font-mono text-xs font-medium text-muted-foreground">
                              {msg.sender?.full_name || msg.sender?.username}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p
                            className={`mt-1 text-right font-mono text-[10px] ${
                              isOwn ? "text-background/70" : "text-muted-foreground"
                            }`}
                          >
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-3 pt-4">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-xl border-2 border-border bg-card px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
        />
        <Button
          onClick={handleSend}
          disabled={!newMessage.trim() || isSending}
          className="h-12 w-12 border-2 border-foreground bg-foreground p-0 text-background shadow-retro disabled:opacity-50"
        >
          <Send className="h-5 w-5" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}