"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, Plus, Users, X, Search, UserPlus } from "lucide-react";
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
  const [showParticipants, setShowParticipants] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchParticipants = async () => {
    const supabase = createClient();
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
      await fetchParticipants();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const content = newMessage.trim();
    setNewMessage("");
    setIsSending(true);

    // Optimistic update — show message immediately
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      content,
      sender_id: user?.id || "",
      created_at: new Date().toISOString(),
      sender: {
        full_name: "You",
        username: "",
      },
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user?.id,
        content,
      })
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setNewMessage(content); // Restore the message
    } else if (data) {
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...data, sender: optimisticMsg.sender }
            : m
        )
      );
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
    // Group: show names
    const others = participants.filter((p) => p.user_id !== user?.id);
    if (others.length === 0) return "Conversation";
    const names = others.slice(0, 2).map(
      (p) => p.user.full_name?.split(" ")[0] || p.user.username
    );
    const remaining = others.length - 2;
    if (remaining > 0) return `${names.join(", ")} +${remaining}`;
    return names.join(", ");
  };

  const getParticipantSummary = () => {
    const others = participants.filter((p) => p.user_id !== user?.id);
    if (others.length === 0) return `${participants.length} participant`;

    const names = others.slice(0, 2).map(
      (p) => p.user.full_name || p.user.username
    );
    const remaining = others.length - 2;

    let summary = names.join(", ");
    if (remaining > 0) {
      summary += ` and ${remaining} more`;
    }
    return summary;
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
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-4">
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
            <button
              onClick={() => setShowParticipants(true)}
              className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {participants.length} participant{participants.length !== 1 ? "s" : ""}{" "}
              — {getParticipantSummary()}
            </button>
          </div>
        </div>

        {/* Add member button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowAddMember(true)}
          className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
          title="Add participant"
        >
          <UserPlus className="h-4 w-4" strokeWidth={1.5} />
        </Button>
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
                          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
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

      {/* Participants Panel */}
      {showParticipants && (
        <ParticipantsPanel
          participants={participants}
          currentUserId={user?.id}
          onClose={() => setShowParticipants(false)}
          onAddMember={() => {
            setShowParticipants(false);
            setShowAddMember(true);
          }}
        />
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <AddMemberModal
          conversationId={conversationId}
          existingParticipantIds={participants.map((p) => p.user_id)}
          currentUserId={user?.id}
          onClose={() => setShowAddMember(false)}
          onAdded={() => {
            setShowAddMember(false);
            fetchParticipants();
          }}
        />
      )}
    </div>
  );
}

function ParticipantsPanel({
  participants,
  currentUserId,
  onClose,
  onAddMember,
}: {
  participants: Participant[];
  currentUserId?: string;
  onClose: () => void;
  onAddMember: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Participants ({participants.length})
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {participants.map((p) => (
            <div
              key={p.user_id}
              className="flex items-center gap-3 rounded-xl border-2 border-border bg-background p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs font-bold">
                {(p.user.full_name || p.user.username)
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {p.user.full_name || p.user.username}
                  {p.user_id === currentUserId && (
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      (you)
                    </span>
                  )}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  @{p.user.username}
                </p>
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={onAddMember}
          className="mt-4 w-full border-2 border-foreground bg-foreground text-background shadow-retro"
        >
          <UserPlus className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Add Member
        </Button>
      </div>
    </div>
  );
}

function AddMemberModal({
  conversationId,
  existingParticipantIds,
  currentUserId,
  onClose,
  onAdded,
}: {
  conversationId: string;
  existingParticipantIds: string[];
  currentUserId?: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [users, setUsers] = useState<
    { id: string; full_name: string; username: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .not("id", "in", `(${existingParticipantIds.join(",")})`)
        .order("full_name");
      setUsers(data || []);
    };
    fetchUsers();
  }, [existingParticipantIds]);

  const filteredUsers = users.filter((u) => {
    const search = searchQuery.toLowerCase();
    if (!search) return true;
    return (
      u.full_name?.toLowerCase().includes(search) ||
      u.username.toLowerCase().includes(search)
    );
  });

  const addMember = async (userId: string) => {
    setIsAdding(userId);
    const supabase = createClient();

    const { error } = await supabase
      .from("conversation_participants")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
      });

    if (error) {
      console.error("Error adding participant:", error);
      setIsAdding(null);
      return;
    }

    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Add Member</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search team members..."
            className="w-full rounded-xl border-2 border-border bg-background py-3 pl-10 pr-4 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
          />
        </div>

        {/* User list */}
        <div className="mt-3 max-h-64 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="py-6 text-center font-mono text-xs text-muted-foreground">
              {searchQuery
                ? "No users found."
                : "All team members are already in this chat."}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-border bg-background font-mono text-xs font-bold">
                    {(u.full_name || u.username).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {u.full_name || u.username}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      @{u.username}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addMember(u.id)}
                    disabled={isAdding === u.id}
                    className="h-8 border-2 border-foreground bg-foreground px-3 text-background shadow-retro-sm disabled:opacity-50"
                  >
                    {isAdding === u.id ? "..." : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}