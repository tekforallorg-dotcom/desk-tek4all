"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Plus,
  Search,
  Users,
  FolderKanban,
  CheckSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Conversation {
  id: string;
  type: "dm" | "programme" | "task";
  title: string | null;
  programme_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
  last_message?: {
    content: string;
    created_at: string;
    sender: { full_name: string; username: string } | null;
  } | null;
  participants?: {
    user_id: string;
    user: { full_name: string; username: string };
  }[];
}

export default function MessagingPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewMessage, setShowNewMessage] = useState(false);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      // Get conversations user is part of
      const { data: participantData } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (!participantData || participantData.length === 0) {
        setIsLoading(false);
        return;
      }

      const conversationIds = participantData.map((p) => p.conversation_id);

      // Get conversation details
      const { data: convData, error } = await supabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
        setIsLoading(false);
        return;
      }

      // Get last message and participants for each conversation
      const conversationsWithDetails = await Promise.all(
        (convData || []).map(async (conv) => {
          // Get last message
          const { data: messageData } = await supabase
            .from("messages")
            .select("content, created_at, sender_id")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          let lastMessage = null;
          if (messageData) {
            const { data: senderData } = await supabase
              .from("profiles")
              .select("full_name, username")
              .eq("id", messageData.sender_id)
              .single();

            lastMessage = {
              content: messageData.content,
              created_at: messageData.created_at,
              sender: senderData,
            };
          }

          // Get participants for DMs
          let participants: Conversation["participants"] = [];
          if (conv.type === "dm") {
            const { data: partData } = await supabase
              .from("conversation_participants")
              .select("user_id")
              .eq("conversation_id", conv.id);

            if (partData) {
              const otherParticipants = partData.filter(
                (p) => p.user_id !== user.id
              );
              for (const p of otherParticipants) {
                const { data: userData } = await supabase
                  .from("profiles")
                  .select("full_name, username")
                  .eq("id", p.user_id)
                  .single();
                if (userData) {
                  participants.push({ user_id: p.user_id, user: userData });
                }
              }
            }
          }

          return { ...conv, last_message: lastMessage, participants };
        })
      );

      setConversations(conversationsWithDetails);
      setIsLoading(false);
    };

    fetchConversations();
  }, [user]);

  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    if (conv.title?.toLowerCase().includes(searchLower)) return true;
    if (
      conv.participants?.some(
        (p) =>
          p.user.full_name?.toLowerCase().includes(searchLower) ||
          p.user.username.toLowerCase().includes(searchLower)
      )
    )
      return true;
    return false;
  });

  const getConversationTitle = (conv: Conversation) => {
    if (conv.title) return conv.title;
    if (conv.type === "dm" && conv.participants && conv.participants.length > 0) {
      return (
        conv.participants[0].user.full_name || conv.participants[0].user.username
      );
    }
    return "Conversation";
  };

  const getConversationIcon = (type: string) => {
    switch (type) {
      case "dm":
        return Users;
      case "programme":
        return FolderKanban;
      case "task":
        return CheckSquare;
      default:
        return MessageSquare;
    }
  };

  const formatTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Messages
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Team conversations and discussions.
          </p>
        </div>
        <Button
          onClick={() => setShowNewMessage(true)}
          className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
          New Message
        </Button>
      </div>

      {/* Search */}
      <div className="relative pb-4">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-2 pl-10 shadow-retro-sm"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto rounded-2xl border-2 border-border bg-card shadow-retro">
        {isLoading ? (
          <div className="space-y-0 divide-y-2 divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-muted">
              <MessageSquare
                className="h-8 w-8 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <p className="mt-4 text-center font-mono text-sm text-muted-foreground">
              {searchQuery
                ? "No conversations found."
                : "No messages yet. Start a conversation!"}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setShowNewMessage(true)}
                className="mt-4 border-2 border-foreground bg-foreground text-background shadow-retro"
              >
                <Plus className="mr-2 h-4 w-4" />
                Start Conversation
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y-2 divide-border">
            {filteredConversations.map((conv) => {
              const Icon = getConversationIcon(conv.type);
              return (
                <Link key={conv.id} href={`/messaging/${conv.id}`}>
                  <div className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50">
                    {/* Avatar */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-background">
                      <Icon
                        className="h-5 w-5 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-medium text-card-foreground">
                          {getConversationTitle(conv)}
                        </p>
                        {conv.last_message && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatTime(conv.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      {conv.last_message && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          <span className="font-medium">
                            {conv.last_message.sender?.full_name?.split(" ")[0] ||
                              conv.last_message.sender?.username}
                            :
                          </span>{" "}
                          {conv.last_message.content}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* New Message Modal */}
      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}

function NewMessageModal({
  onClose,
  currentUserId,
}: {
  onClose: () => void;
  currentUserId?: string;
}) {
  const [users, setUsers] = useState <
    { id: string; full_name: string; username: string }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .neq("id", currentUserId || "")
        .order("full_name");
      setUsers(data || []);
    };
    fetchUsers();
  }, [currentUserId]);

  const handleSend = async () => {
    if (!selectedUser || !message.trim()) return;

    setIsLoading(true);
    const supabase = createClient();

    // Check if DM already exists between these users
    const { data: existingParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", currentUserId);

    let existingConvId: string | null = null;

    if (existingParticipants) {
      for (const p of existingParticipants) {
        const { data: otherParticipant } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("conversation_id", p.conversation_id)
          .eq("user_id", selectedUser)
          .single();

        if (otherParticipant) {
          // Check if it's a DM
          const { data: conv } = await supabase
            .from("conversations")
            .select("type")
            .eq("id", p.conversation_id)
            .eq("type", "dm")
            .single();

          if (conv) {
            existingConvId = p.conversation_id;
            break;
          }
        }
      }
    }

    let conversationId = existingConvId;

    if (!conversationId) {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          type: "dm",
          created_by: currentUserId,
        })
        .select()
        .single();

      if (convError || !newConv) {
        console.error("Error creating conversation:", convError);
        setIsLoading(false);
        return;
      }

      conversationId = newConv.id;

      // Add participants
      await supabase.from("conversation_participants").insert([
        { conversation_id: conversationId, user_id: currentUserId },
        { conversation_id: conversationId, user_id: selectedUser },
      ]);
    }

    // Send message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: message.trim(),
    });

    if (msgError) {
      console.error("Error sending message:", msgError);
      setIsLoading(false);
      return;
    }

    // Navigate to conversation
    window.location.href = `/messaging/${conversationId}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
        <h2 className="text-xl font-bold">New Message</h2>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          Start a conversation with a team member.
        </p>

        <div className="mt-6 space-y-4">
          {/* User Select */}
          <div className="space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              To
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
            >
              <option value="">Select a person...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.username}
                </option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Type your message..."
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-2 shadow-retro-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedUser || !message.trim() || isLoading}
            className="border-2 border-foreground bg-foreground text-background shadow-retro disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}