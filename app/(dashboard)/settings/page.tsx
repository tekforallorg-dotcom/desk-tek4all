"use client";

import { useState } from "react";
import { User, Lock, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  const { profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          Manage your account and preferences.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-mono text-sm font-medium transition-all ${
            activeTab === "profile"
              ? "border-foreground bg-foreground text-background shadow-retro-sm"
              : "border-border bg-card text-muted-foreground hover:border-foreground"
          }`}
        >
          <User className="h-4 w-4" strokeWidth={1.5} />
          Profile
        </button>
        <button
          onClick={() => setActiveTab("password")}
          className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-mono text-sm font-medium transition-all ${
            activeTab === "password"
              ? "border-foreground bg-foreground text-background shadow-retro-sm"
              : "border-border bg-card text-muted-foreground hover:border-foreground"
          }`}
        >
          <Lock className="h-4 w-4" strokeWidth={1.5} />
          Password
        </button>
      </div>

      {activeTab === "profile" ? (
        <ProfileSection profile={profile} userEmail={user?.email} />
      ) : (
        <PasswordSection />
      )}
    </div>
  );
}

function ProfileSection({
  profile,
  userEmail,
}: {
  profile: { full_name: string | null; username: string; role: string } | null;
  userEmail?: string;
}) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    setSuccess(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setIsSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, username })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setIsSaving(false);
  };

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <h2 className="text-lg font-bold text-card-foreground">
        Profile Information
      </h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Update your personal details.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Profile updated successfully!
        </div>
      )}

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Full Name
          </label>
          <Input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border-2 border-border bg-background shadow-retro-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Username
          </label>
          <Input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border-2 border-border bg-background shadow-retro-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </label>
          <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-muted px-4 py-3 font-mono text-sm">
            {userEmail}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Email cannot be changed.
          </p>
        </div>

        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Role
          </label>
          <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-muted px-4 py-3 font-mono text-sm capitalize">
            {profile?.role?.replace("_", " ")}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="border-2 border-foreground bg-foreground text-background shadow-retro"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChangePassword = async () => {
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsSaving(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "password_changed",
          entity_type: "user",
          entity_id: user.id,
          details: {},
        });
      }
    }

    setIsSaving(false);
  };

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <h2 className="text-lg font-bold text-card-foreground">Change Password</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Update your password to keep your account secure.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Password changed successfully!
        </div>
      )}

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            New Password
          </label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="border-2 border-border bg-background shadow-retro-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Confirm New Password
          </label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="border-2 border-border bg-background shadow-retro-sm"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleChangePassword}
          disabled={isSaving || !newPassword || !confirmPassword}
          className="border-2 border-foreground bg-foreground text-background shadow-retro disabled:opacity-50"
        >
          {isSaving ? "Updating..." : "Update Password"}
        </Button>
      </div>
    </div>
  );
}