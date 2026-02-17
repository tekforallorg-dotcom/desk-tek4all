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
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Conversation {
  id: string;
  type: "dm" | "group" | "programme" | "task";
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
  participant_count?: number;
}

export default function MessagingPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewDM, setShowNewDM] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

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

          // Get all participants
          const { data: partData } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", conv.id);

          const participants: Conversation["participants"] = [];
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

          return {
            ...conv,
            last_message: lastMessage,
            participants,
            participant_count: partData?.length || 0,
          };
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
    if (conv.participants && conv.participants.length > 0) {
      if (conv.type === "dm" || conv.participants.length === 1) {
        return (
          conv.participants[0].user.full_name ||
          conv.participants[0].user.username
        );
      }
      // Group: show first 2 names + count
      const names = conv.participants.slice(0, 2).map(
        (p) => p.user.full_name?.split(" ")[0] || p.user.username
      );
      const remaining = conv.participants.length - 2;
      if (remaining > 0) {
        return `${names.join(", ")} +${remaining}`;
      }
      return names.join(", ");
    }
    return "Conversation";
  };

  const getConversationSubtitle = (conv: Conversation) => {
    if (conv.type === "group" && conv.participant_count) {
      return `${conv.participant_count} members`;
    }
    return null;
  };

  const getConversationIcon = (conv: Conversation) => {
    if (conv.type === "group" || (conv.participant_count && conv.participant_count > 2)) {
      return Users;
    }
    switch (conv.type) {
      case "dm":
        return MessageSquare;
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowNewGroup(true)}
            className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            <Users className="mr-2 h-4 w-4" strokeWidth={1.5} />
            New Group
          </Button>
          <Button
            onClick={() => setShowNewDM(true)}
            className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            New Message
          </Button>
        </div>
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
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowNewGroup(true)}
                  className="border-2 shadow-retro-sm"
                >
                  <Users className="mr-2 h-4 w-4" />
                  New Group
                </Button>
                <Button
                  onClick={() => setShowNewDM(true)}
                  className="border-2 border-foreground bg-foreground text-background shadow-retro"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Message
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y-2 divide-border">
            {filteredConversations.map((conv) => {
              const Icon = getConversationIcon(conv);
              const subtitle = getConversationSubtitle(conv);
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
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-card-foreground">
                            {getConversationTitle(conv)}
                          </p>
                          {subtitle && (
                            <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                              {subtitle}
                            </span>
                          )}
                        </div>
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

      {/* New DM Modal */}
      {showNewDM && (
        <NewMessageModal
          onClose={() => setShowNewDM(false)}
          currentUserId={user?.id}
          mode="dm"
        />
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <NewMessageModal
          onClose={() => setShowNewGroup(false)}
          currentUserId={user?.id}
          mode="group"
        />
      )}
    </div>
  );
}

function NewMessageModal({
  onClose,
  currentUserId,
  mode,
}: {
  onClose: () => void;
  currentUserId?: string;
  mode: "dm" | "group";
}) {
  const [users, setUsers] = useState<
    { id: string; full_name: string; username: string }[]
  >([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");

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

  const filteredUsers = users.filter((u) => {
    if (selectedUsers.includes(u.id)) return false;
    const search = userSearch.toLowerCase();
    if (!search) return true;
    return (
      u.full_name?.toLowerCase().includes(search) ||
      u.username.toLowerCase().includes(search)
    );
  });

  const toggleUser = (userId: string) => {
    if (mode === "dm") {
      // DM: single select
      setSelectedUsers([userId]);
    } else {
      // Group: multi select
      setSelectedUsers((prev) =>
        prev.includes(userId)
          ? prev.filter((id) => id !== userId)
          : [...prev, userId]
      );
    }
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((id) => id !== userId));
  };

  const getSelectedUserNames = () => {
    return selectedUsers.map((id) => {
      const u = users.find((u) => u.id === id);
      return u?.full_name || u?.username || "Unknown";
    });
  };

  const handleSend = async () => {
    if (selectedUsers.length === 0 || !message.trim()) return;
    if (mode === "group" && selectedUsers.length < 2) return;

    setIsLoading(true);
    const supabase = createClient();

    if (mode === "dm") {
      // Check if DM already exists
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
            .eq("user_id", selectedUsers[0])
            .single();

          if (otherParticipant) {
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

      if (existingConvId) {
        // Send to existing DM
        await supabase.from("messages").insert({
          conversation_id: existingConvId,
          sender_id: currentUserId,
          content: message.trim(),
        });
        window.location.href = `/messaging/${existingConvId}`;
        return;
      }
    }

    // Create new conversation
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        type: mode === "group" ? "group" : "dm",
        title: mode === "group" ? groupName.trim() || null : null,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (convError || !newConv) {
      console.error("Error creating conversation:", convError);
      setIsLoading(false);
      return;
    }

    // Add all participants (including self)
    const participantInserts = [
      { conversation_id: newConv.id, user_id: currentUserId },
      ...selectedUsers.map((uid) => ({
        conversation_id: newConv.id,
        user_id: uid,
      })),
    ];

    await supabase.from("conversation_participants").insert(participantInserts);

    // Send first message
    await supabase.from("messages").insert({
      conversation_id: newConv.id,
      sender_id: currentUserId,
      content: message.trim(),
    });

    window.location.href = `/messaging/${newConv.id}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
        <h2 className="text-xl font-bold">
          {mode === "group" ? "New Group Chat" : "New Message"}
        </h2>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {mode === "group"
            ? "Add members and start a group conversation."
            : "Start a conversation with a team member."}
        </p>

        <div className="mt-6 space-y-4">
          {/* Group name (group mode only) */}
          {mode === "group" && (
            <div className="space-y-2">
              <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Group Name (optional)
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Project Alpha Team"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
              />
            </div>
          )}

          {/* Selected users chips */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {getSelectedUserNames().map((name, i) => (
                <span
                  key={selectedUsers[i]}
                  className="flex items-center gap-1 rounded-full border-2 border-border bg-background px-3 py-1 font-mono text-xs"
                >
                  {name}
                  <button
                    onClick={() => removeUser(selectedUsers[i])}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3" strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* User search + select */}
          <div className="space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {mode === "group"
                ? `Add Members (${selectedUsers.length} selected)`
                : "To"}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search team members..."
                className="w-full rounded-xl border-2 border-border bg-background py-3 pl-10 pr-4 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
              />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-xl border-2 border-border">
              {filteredUsers.length === 0 ? (
                <p className="p-3 text-center font-mono text-xs text-muted-foreground">
                  No users found
                </p>
              ) : (
                filteredUsers.slice(0, 10).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-background font-mono text-xs font-bold">
                      {(u.full_name || u.username).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{u.full_name || u.username}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        @{u.username}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
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
            disabled={
              selectedUsers.length === 0 ||
              !message.trim() ||
              isLoading ||
              (mode === "group" && selectedUsers.length < 2)
            }
            className="border-2 border-foreground bg-foreground text-background shadow-retro disabled:opacity-50"
          >
            {isLoading
              ? "Creating..."
              : mode === "group"
                ? "Create Group"
                : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}