// DESTINATION: components/radar/group-manager.tsx
// WHY: Management panel for Radar group members — add/remove with role assignment

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Shield,
  Pencil,
  Eye,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import type { RadarRole } from "@/lib/hooks/use-radar-role";

interface GroupMember {
  id: string;
  user_id: string;
  role: RadarRole;
  created_at: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
  } | null;
}

interface TeamProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

const ROLE_ICONS: Record<RadarRole, typeof Shield> = {
  admin: Shield,
  editor: Pencil,
  viewer: Eye,
};

const ROLE_LABELS: Record<RadarRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<RadarRole, string> = {
  admin: "Full access + sources + manage members",
  editor: "Create, edit, status changes",
  viewer: "Read + add notes only",
};

export function RadarGroupManager() {
  const { user } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<RadarRole>("viewer");
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Fetch members ───────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("radar_group_members")
      .select(`
        id,
        user_id,
        role,
        created_at,
        profile:profiles!radar_group_members_user_id_fkey (
          id, full_name, email, role
        )
      `)
      .order("created_at", { ascending: true });

    setMembers((data as unknown as GroupMember[]) || []);
    setIsLoading(false);
  }, []);

  // ── Fetch team profiles (for add dropdown) ──────────────────

  const fetchTeamProfiles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name");
    setTeamProfiles(data || []);
  }, []);

  useEffect(() => {
    fetchMembers();
    fetchTeamProfiles();
  }, [fetchMembers, fetchTeamProfiles]);

  // ── Available users (not already in group, not platform admins) ──

  const availableUsers = teamProfiles.filter(
    (p) =>
      !members.some((m) => m.user_id === p.id) &&
      !["admin", "super_admin"].includes(p.role) &&
      (searchQuery.trim() === "" ||
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ── Add member ──────────────────────────────────────────────

  const handleAddMember = async () => {
    if (!selectedUser || !user) return;
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("radar_group_members").insert({
      user_id: selectedUser,
      role: selectedRole,
      added_by: user.id,
    });
    if (error) {
      console.error("Error adding member:", error.message);
    } else {
      setSelectedUser("");
      setSelectedRole("viewer");
      setShowAddForm(false);
      setSearchQuery("");
      fetchMembers();
    }
    setIsSaving(false);
  };

  // ── Update role ─────────────────────────────────────────────

  const handleRoleChange = async (memberId: string, newRole: RadarRole) => {
    const supabase = createClient();
    await supabase
      .from("radar_group_members")
      .update({ role: newRole })
      .eq("id", memberId);
    fetchMembers();
  };

  // ── Remove member ───────────────────────────────────────────

  const handleRemove = async (memberId: string) => {
    const supabase = createClient();
    await supabase.from("radar_group_members").delete().eq("id", memberId);
    fetchMembers();
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Users className="h-5 w-5" strokeWidth={1.5} />
          Radar Group
          {members.length > 0 && (
            <span className="font-mono text-sm font-normal text-muted-foreground">
              ({members.length} member{members.length !== 1 ? "s" : ""})
            </span>
          )}
        </h2>
        {!showAddForm && (
          <Button
            onClick={() => setShowAddForm(true)}
            size="sm"
            className="border-2 border-foreground bg-foreground text-background shadow-retro-sm"
          >
            <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
            Add Member
          </Button>
        )}
      </div>

      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Platform admins automatically have full access. Add other team members below.
      </p>

      {/* Add member form */}
      {showAddForm && (
        <div className="mt-4 rounded-xl border-2 border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Add New Member
            </span>
            <button
              onClick={() => { setShowAddForm(false); setSearchQuery(""); setSelectedUser(""); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {/* User search + select */}
            <div className="sm:col-span-2">
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedUser(""); }}
                placeholder="Search team members..."
                className="border-2 shadow-retro-sm"
              />
              {searchQuery.trim() && availableUsers.length > 0 && !selectedUser && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border-2 border-border bg-background shadow-retro-sm">
                  {availableUsers.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedUser(p.id);
                        setSearchQuery(p.full_name || p.email || "");
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold text-muted-foreground">
                        {(p.full_name || p.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{p.full_name || "Unnamed"}</div>
                        {p.email && (
                          <div className="font-mono text-[10px] text-muted-foreground">{p.email}</div>
                        )}
                      </div>
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                        {p.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.trim() && availableUsers.length === 0 && !selectedUser && (
                <p className="mt-1 px-3 py-2 font-mono text-xs text-muted-foreground">
                  No matching team members available.
                </p>
              )}
            </div>

            {/* Role select */}
            <div className="flex gap-2">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RadarRole)}
                className="flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <Button
                onClick={handleAddMember}
                disabled={!selectedUser || isSaving}
                className="shrink-0 border-2 border-foreground bg-foreground text-background shadow-retro-sm"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Role descriptions */}
          <div className="mt-3 flex flex-wrap gap-3">
            {(["admin", "editor", "viewer"] as RadarRole[]).map((r) => {
              const Icon = ROLE_ICONS[r];
              return (
                <div key={r} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <Icon className="h-3 w-3" strokeWidth={1.5} />
                  <span className="font-bold uppercase">{ROLE_LABELS[r]}:</span>
                  <span>{ROLE_DESCRIPTIONS[r]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Members list */}
      {isLoading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border-2 border-border bg-background" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="mt-4 rounded-xl border-2 border-dashed border-border bg-background p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            No members added yet. Platform admins have automatic access.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {members.map((member) => {
            const profile = member.profile;
            const isSelf = member.user_id === user?.id;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-xl border-2 border-border bg-background p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold text-muted-foreground">
                    {(profile?.full_name || profile?.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {profile?.full_name || "Unnamed"}
                      </span>
                      {isSelf && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                          You
                        </span>
                      )}
                    </div>
                    {profile?.email && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {profile.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as RadarRole)}
                    disabled={isSelf}
                    className={cn(
                      "rounded-full border-0 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider focus:outline-none",
                      member.role === "admin"
                        ? "bg-foreground text-background"
                        : member.role === "editor"
                          ? "bg-foreground/80 text-background"
                          : "bg-muted text-muted-foreground",
                      isSelf && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {!isSelf && (
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}