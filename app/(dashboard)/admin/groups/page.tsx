"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Plus, Trash2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface Group {
  id: string;
  name: string;
  description: string | null;
}

interface GroupMember {
  id: string;
  user_id: string;
  user: { full_name: string | null; email: string; username: string };
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  username: string;
}

export default function GroupsAdminPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    const fetchGroups = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("groups")
        .select("*")
        .order("name");
      setGroups(data || []);
      setIsLoading(false);
    };

    if (!authLoading && isAdmin) {
      fetchGroups();
    }
  }, [authLoading, isAdmin]);

  const fetchMembers = async (groupId: string) => {
    const supabase = createClient();

    // Get group members
    const { data: memberData } = await supabase
      .from("group_members")
      .select("id, user_id")
      .eq("group_id", groupId);

    if (!memberData || memberData.length === 0) {
      setMembers([]);
      return;
    }

    // Get user details for each member
    const userIds = memberData.map((m) => m.user_id);
    const { data: userData } = await supabase
      .from("profiles")
      .select("id, full_name, email, username")
      .in("id", userIds);

    const membersWithUsers: GroupMember[] = memberData.map((m) => {
      const user = userData?.find((u) => u.id === m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        user: user || { full_name: null, email: "", username: "" },
      };
    });

    setMembers(membersWithUsers);
  };

  const fetchAllUsers = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, username")
      .order("full_name");
    setAllUsers(data || []);
  };

  const handleSelectGroup = async (group: Group) => {
    setSelectedGroup(group);
    await fetchMembers(group.id);
    await fetchAllUsers();
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedGroup) return;

    const supabase = createClient();
    await supabase.from("group_members").insert({
      group_id: selectedGroup.id,
      user_id: userId,
    });

    await fetchMembers(selectedGroup.id);
    setShowAddMember(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    const supabase = createClient();
    await supabase.from("group_members").delete().eq("id", memberId);

    if (selectedGroup) {
      await fetchMembers(selectedGroup.id);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p>Access denied</p>
      </div>
    );
  }

  const nonMembers = allUsers.filter(
    (u) => !members.some((m) => m.user_id === u.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Groups
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Manage user group memberships.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Groups List */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="font-bold">Groups</h2>
          <div className="mt-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                No groups yet.
              </p>
            ) : (
              groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleSelectGroup(group)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                    selectedGroup?.id === group.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground"
                  }`}
                >
                  {group.name === "shared_mail_admin" ? (
                    <Mail className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Users className="h-5 w-5" strokeWidth={1.5} />
                  )}
                  <div>
                    <p className="font-medium">{group.name}</p>
                    {group.description && (
                      <p className="text-xs opacity-70">{group.description}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Members List */}
        {selectedGroup && (
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{selectedGroup.name} Members</h2>
              <Button
                onClick={() => setShowAddMember(true)}
                size="sm"
                className="border-2 border-foreground bg-foreground text-background shadow-retro-sm"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {members.length === 0 ? (
                <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                  No members yet.
                </p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-xl border-2 border-border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {member.user.full_name || member.user.username || "Unknown"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemoveMember(member.id)}
                      className="h-8 w-8 border-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMember && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/60"
            onClick={() => setShowAddMember(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-xl font-bold">Add Member</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Add a user to {selectedGroup.name}
            </p>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {nonMembers.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  All users are already members.
                </p>
              ) : (
                nonMembers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAddMember(user.id)}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-3 text-left transition-all hover:border-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                      {(user.full_name || user.email || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{user.full_name || "Unnamed"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAddMember(false)}
                className="border-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}