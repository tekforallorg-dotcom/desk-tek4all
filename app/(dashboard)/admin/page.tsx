"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  User,
  UserCog,
  Settings,
  Network,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  member: "Member",
  manager: "Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  member: User,
  manager: UserCog,
  admin: Shield,
  super_admin: ShieldCheck,
};

export default function AdminPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    const fetchUsers = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching users:", error);
      } else {
        setUsers(data || []);
      }
      setIsLoading(false);
    };

    fetchUsers();
  }, [authLoading, isAdmin]);

  const filteredUsers = users.filter(
    (user) =>
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border-2 border-border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-muted">
          <Shield className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h2 className="mt-4 text-xl font-bold">Access Denied</h2>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          You don&apos;t have permission to access this page.
        </p>
        <Link href="/" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Admin
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Manage users, groups, and permissions.
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Add User
          </Button>
        </Link>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/groups">
          <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-muted">
              <Settings className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold">Groups</p>
              <p className="font-mono text-xs text-muted-foreground">
                Manage group memberships
              </p>
            </div>
          </div>
        </Link>

        <Link href="/admin/hierarchy">
          <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-muted">
              <Network className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold">Team Tree</p>
              <p className="font-mono text-xs text-muted-foreground">
                Assign direct reports
              </p>
            </div>
          </div>
        </Link>

        <Link href="/admin/users/new">
          <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-border bg-muted">
              <Plus className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold">New User</p>
              <p className="font-mono text-xs text-muted-foreground">
                Create a new account
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="font-mono text-xs text-muted-foreground">Total Users</p>
        </div>
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <p className="text-2xl font-bold">
            {users.filter((u) => u.status === "active").length}
          </p>
          <p className="font-mono text-xs text-muted-foreground">Active</p>
        </div>
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <p className="text-2xl font-bold">
            {users.filter((u) => u.role === "admin" || u.role === "super_admin").length}
          </p>
          <p className="font-mono text-xs text-muted-foreground">Admins</p>
        </div>
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <p className="text-2xl font-bold">
            {users.filter((u) => u.role === "manager").length}
          </p>
          <p className="font-mono text-xs text-muted-foreground">Managers</p>
        </div>
      </div>

      {/* User Management Section */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <h2 className="text-lg font-bold">Users</h2>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-2 pl-10 shadow-retro-sm"
          />
        </div>

        {/* Users List */}
        {isLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border-2 border-border bg-muted"
              />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="mt-4 flex min-h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8">
            <Users className="h-8 w-8 text-muted-foreground" strokeWidth={1} />
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {searchQuery ? "No users found matching your search." : "No users yet."}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {filteredUsers.map((user) => (
              <UserRow key={user.id} user={user} currentUserId={profile?.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
}: {
  user: UserProfile;
  currentUserId?: string;
}) {
  const RoleIcon = ROLE_ICONS[user.role] || User;
  const isCurrentUser = user.id === currentUserId;

  const getInitials = () => {
    if (user.full_name) {
      return user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user.username.slice(0, 2).toUpperCase();
  };

  return (
    <Link href={`/admin/users/${user.id}`}>
      <div className="group flex items-center gap-4 rounded-xl border-2 border-border bg-background p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-foreground hover:shadow-retro-sm">
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-sm font-bold">
          {getInitials()}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">
              {user.full_name || user.username}
            </p>
            {isCurrentUser && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                You
              </span>
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {user.email}
          </p>
        </div>

        {/* Role Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-medium ${
              user.role === "super_admin" || user.role === "admin"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <RoleIcon className="h-3 w-3" strokeWidth={2} />
            {ROLE_LABELS[user.role]}
          </span>

          {/* Status */}
          <span
            className={`h-2 w-2 rounded-full ${
              user.status === "active" ? "bg-green-500" : "bg-muted-foreground"
            }`}
          />
        </div>
      </div>
    </Link>
  );
}