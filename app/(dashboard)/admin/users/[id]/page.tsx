// DESTINATION: app/(dashboard)/admin/users/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  User,
  UserCog,
  Shield,
  ShieldCheck,
  Mail,
  Calendar,
  Trash2,
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

const ROLE_ICONS: Record<string, React.ElementType> = {
  member: User,
  manager: UserCog,
  admin: Shield,
  super_admin: ShieldCheck,
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile: currentProfile, user: currentUser, isLoading: authLoading } = useAuth();
  const userId = params.id as string;

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Password reset states
  const [isResetting, setIsResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetError, setResetError] = useState("");
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Delete user states
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin =
    currentProfile?.role === "admin" || currentProfile?.role === "super_admin";
  const isSuperAdmin = currentProfile?.role === "super_admin";
  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching user:", error);
        setError("User not found");
      } else {
        setUserProfile(data);
      }
      setIsLoading(false);
    };

    fetchUser();
  }, [userId]);

  const handleResetPassword = async () => {
    setShowConfirmReset(false);

    setIsResetting(true);
    setNewPassword("");
    setResetError("");
    setShowPassword(false);

    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: params.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setNewPassword(data.password);
      setShowPassword(true);
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : "Failed to reset password"
      );
    } finally {
      setIsResetting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");

    const formData = new FormData(e.currentTarget);
    const fullName = formData.get("full_name") as string;
    const username = formData.get("username") as string;
    const role = formData.get("role") as string;
    const status = formData.get("status") as string;

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        role,
        status,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating user:", updateError);
      setError(updateError.message);
    } else {
      setSuccess("User updated successfully!");

      // Log the action
      await supabase.from("audit_logs").insert({
        user_id: currentUser?.id,
        action: "user_updated",
        entity_type: "user",
        entity_id: userId,
        details: { full_name: fullName, role },
      });

      // Update local state
      setUserProfile((prev) =>
        prev ? { ...prev, full_name: fullName, username, role, status } : null
      );
    }

    setIsSaving(false);
  };

  const handleDeleteUser = async () => {
    setShowConfirmDelete(false);
    setIsDeleting(true);

    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getInitials = () => {
    if (userProfile?.full_name) {
      return userProfile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return userProfile?.username.slice(0, 2).toUpperCase() || "??";
  };

  if (authLoading || (currentUser && !currentProfile)) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!isAdmin && !isOwnProfile) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p>Access denied</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <h2 className="text-xl font-bold">User not found</h2>
        <Link href="/admin" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button
            variant="outline"
            size="icon"
            className="border-2 shadow-retro-sm"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-muted font-mono text-lg font-bold">
            {getInitials()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {userProfile.full_name || userProfile.username}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              {userProfile.email}
            </p>
          </div>
        </div>
      </div>



      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
            {success}
          </div>
        )}

        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="text-lg font-bold text-card-foreground">
            Profile Details
          </h2>

          <div className="mt-6 space-y-5">
            {/* Full Name */}
            <div className="space-y-2">
              <label
                htmlFor="full_name"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Full Name
              </label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                defaultValue={userProfile.full_name || ""}
                className="border-2 border-border bg-background shadow-retro-sm"
              />
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                defaultValue={userProfile.username}
                className="border-2 border-border bg-background shadow-retro-sm"
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </label>
              <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-muted px-4 py-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm">{userProfile.email}</span>
              </div>
            </div>

            {/* Role */}
            {isAdmin && (
              <div className="space-y-2">
                <label
                  htmlFor="role"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue={userProfile.role}
                  disabled={isOwnProfile}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  {currentProfile?.role === "super_admin" && (
                    <option value="super_admin">Super Admin</option>
                  )}
                </select>
                {isOwnProfile && (
                  <p className="font-mono text-xs text-muted-foreground">
                    You cannot change your own role.
                  </p>
                )}
              </div>
            )}

            {/* Status */}
            {isAdmin && !isOwnProfile && (
              <div className="space-y-2">
                <label
                  htmlFor="status"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={userProfile.status}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            )}

            {/* Joined date */}
            <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Joined {formatDate(userProfile.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Password Reset Section */}
        {isAdmin && !isOwnProfile && (
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="text-lg font-bold text-card-foreground">
              Password Reset
            </h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Generate a new temporary password for this user.
            </p>

            {showPassword && newPassword && (
              <div className="mt-4 rounded-xl border-2 border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">
                  New password generated:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded border-2 border-green-200 bg-white px-3 py-2 font-mono text-lg">
                    {newPassword}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(newPassword);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="border-2"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-green-600">
                  Share this password securely with the user.
                </p>
              </div>
            )}

            {resetError && (
              <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {resetError}
              </div>
            )}

            <Button
              type="button"
              onClick={() => setShowConfirmReset(true)}
              disabled={isResetting}
              variant="outline"
              className="mt-4 border-2 border-red-200 text-red-600 hover:bg-red-50"
            >
              {isResetting ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        )}


        {/* Delete User — super_admin only */}
        {isSuperAdmin && !isOwnProfile && userProfile.role !== "super_admin" && (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 shadow-retro">
            <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
            <p className="mt-1 font-mono text-xs text-red-600">
              Permanently delete this user account and all associated data.
            </p>
            <Button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              disabled={isDeleting}
              variant="outline"
              className="mt-4 border-2 border-red-300 bg-white text-red-600 hover:bg-red-100"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/admin">
            <Button
              type="button"
              variant="outline"
              className="border-2 shadow-retro-sm"
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSaving}
            className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Confirm Reset Password Dialog */}
      <ConfirmDialog
        isOpen={showConfirmReset}
        onClose={() => setShowConfirmReset(false)}
        onConfirm={handleResetPassword}
        title="Reset Password?"
        description="This will generate a new temporary password. The user will need to use this new password to login."
        confirmText="Reset Password"
        cancelText="Cancel"
        variant="danger"
        isLoading={isResetting}
      />

      {/* Confirm Delete User Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleDeleteUser}
        title="Delete User?"
        description={`This will permanently delete ${userProfile.full_name || userProfile.username} and remove all their data. This action cannot be undone.`}
        confirmText="Delete User"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}