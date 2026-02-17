"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewUserPage() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdUser, setCreatedUser] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const generateTempPassword = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const fullName = formData.get("full_name") as string;
    const username = formData.get("username") as string;
    const role = formData.get("role") as string;

    const tempPassword = generateTempPassword();

    const supabase = createClient();

    // Create auth user via Supabase Admin API
    // Note: In production, this should be done via a server action or edge function
    // For now, we'll use the client-side signUp (user will need to verify email)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: {
          full_name: fullName,
          username: username,
        },
      },
    });

    if (authError) {
      console.error("Auth error:", authError);
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    if (!authData.user) {
      setError("Failed to create user");
      setIsLoading(false);
      return;
    }

    // Create or update profile (upsert in case trigger already created it)
const { error: profileError } = await supabase.from("profiles").upsert({
  id: authData.user.id,
  email,
  full_name: fullName,
  username,
  role,
  status: "active",
  temp_password: true,
}, { onConflict: 'id' });

    if (profileError) {
      console.error("Profile error:", profileError);
      setError(profileError.message);
      setIsLoading(false);
      return;
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user?.id,
      action: "user_created",
      entity_type: "user",
      entity_id: authData.user.id,
      details: { email, role },
    });

    setCreatedUser({ email, tempPassword });
    setIsLoading(false);
  };

  const copyCredentials = () => {
    if (createdUser) {
      navigator.clipboard.writeText(
        `Email: ${createdUser.email}\nTemporary Password: ${createdUser.tempPassword}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p>Access denied</p>
      </div>
    );
  }

  // Success state
  if (createdUser) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="rounded-2xl border-2 border-border bg-card p-8 shadow-retro text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-foreground bg-foreground">
            <Check className="h-8 w-8 text-background" strokeWidth={2} />
          </div>

          <h1 className="mt-6 text-2xl font-bold">User Created!</h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Share these credentials with the new team member.
          </p>

          <div className="mt-6 rounded-xl border-2 border-border bg-muted p-4 text-left">
            <div className="space-y-3">
              <div>
                <p className="font-mono text-xs text-muted-foreground">EMAIL</p>
                <p className="font-mono text-sm font-medium">{createdUser.email}</p>
              </div>
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  TEMPORARY PASSWORD
                </p>
                <p className="font-mono text-sm font-medium">
                  {createdUser.tempPassword}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Button
              onClick={copyCredentials}
              className="w-full border-2 border-foreground bg-foreground text-background shadow-retro"
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Credentials
                </>
              )}
            </Button>

            <div className="flex gap-3">
              <Link href="/admin/users/new" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full border-2 shadow-retro-sm"
                  onClick={() => setCreatedUser(null)}
                >
                  Add Another
                </Button>
              </Link>
              <Link href="/admin" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full border-2 shadow-retro-sm"
                >
                  Done
                </Button>
              </Link>
            </div>
          </div>

          <p className="mt-6 font-mono text-xs text-muted-foreground">
            The user will need to check their email to verify their account
            before signing in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Add User
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Create a new team member account.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="text-lg font-bold text-card-foreground">
            User Details
          </h2>

          <div className="mt-6 space-y-5">
            {/* Full Name */}
            <div className="space-y-2">
              <label
                htmlFor="full_name"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Full Name *
              </label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Jane Doe"
                required
                className="border-2 border-border bg-background shadow-retro-sm"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Email Address *
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="jane@tekforall.org"
                required
                className="border-2 border-border bg-background shadow-retro-sm"
              />
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Username *
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="janedoe"
                required
                className="border-2 border-border bg-background shadow-retro-sm"
              />
            </div>

            {/* Role */}
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
                defaultValue="member"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <p className="font-mono text-xs text-muted-foreground">
                Members can view and work on assigned tasks. Managers can see
                team progress. Admins can manage users.
              </p>
            </div>
          </div>
        </div>

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
            disabled={isLoading}
            className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Create User
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}