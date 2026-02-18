"use client";

import { useState, useEffect } from "react";
import { User, Lock, Check, Moon, Sun, Bell, Globe, Mail, Calendar, CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Preferences {
  theme: "light" | "dark" | "system";
  timezone: string;
  email_notifications: boolean;
  task_reminders: boolean;
  calendar_reminders: boolean;
}

const TIMEZONES = [
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Africa/Nairobi", label: "Nairobi (EAT)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
  { value: "Africa/Cairo", label: "Cairo (EET)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "America/New_York", label: "New York (EST)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
];

export default function SettingsPage() {
  const { profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "password" | "appearance" | "notifications">("profile");

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "password" as const, label: "Password", icon: Lock },
    { id: "appearance" as const, label: "Appearance", icon: Moon },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
  ];

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

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-mono text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "border-foreground bg-foreground text-background shadow-retro-sm"
                : "border-border bg-card text-muted-foreground hover:border-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" strokeWidth={1.5} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && (
        <ProfileSection profile={profile} userEmail={user?.email} />
      )}
      {activeTab === "password" && <PasswordSection />}
      {activeTab === "appearance" && <AppearanceSection />}
      {activeTab === "notifications" && <NotificationsSection />}
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

function AppearanceSection() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    async function loadPreferences() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single();

      if (data?.preferences) {
        setTheme(data.preferences.theme || "light");
        setTimezone(data.preferences.timezone || "Africa/Lagos");
      }
      setIsLoading(false);
    }
    loadPreferences();
  }, []);

  // Apply theme immediately when changed
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // System preference
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, [theme]);

  const handleSave = async () => {
    setIsSaving(true);
    setSuccess(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsSaving(false);
      return;
    }

    // Get current preferences first
    const { data: current } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .single();

    const updatedPreferences = {
      ...(current?.preferences || {}),
      theme,
      timezone,
    };

    await supabase
      .from("profiles")
      .update({ preferences: updatedPreferences })
      .eq("id", user.id);

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-4">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <h2 className="text-lg font-bold text-card-foreground">Appearance</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Customize how Desk looks and feels.
      </p>

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Appearance settings saved!
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Theme */}
        <div className="space-y-3">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Theme
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "light" as const, label: "Light", icon: Sun },
              { value: "dark" as const, label: "Dark", icon: Moon },
              { value: "system" as const, label: "System", icon: Globe },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                  theme === option.value
                    ? "border-foreground bg-foreground text-background shadow-retro-sm"
                    : "border-border bg-background hover:border-foreground"
                }`}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
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

function NotificationsSection() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [calendarReminders, setCalendarReminders] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    async function loadPreferences() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single();

      if (data?.preferences) {
        setEmailNotifications(data.preferences.email_notifications ?? true);
        setTaskReminders(data.preferences.task_reminders ?? true);
        setCalendarReminders(data.preferences.calendar_reminders ?? true);
      }
      setIsLoading(false);
    }
    loadPreferences();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSuccess(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsSaving(false);
      return;
    }

    // Get current preferences first
    const { data: current } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .single();

    const updatedPreferences = {
      ...(current?.preferences || {}),
      email_notifications: emailNotifications,
      task_reminders: taskReminders,
      calendar_reminders: calendarReminders,
    };

    await supabase
      .from("profiles")
      .update({ preferences: updatedPreferences })
      .eq("id", user.id);

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-4">
          <div className="h-16 animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <h2 className="text-lg font-bold text-card-foreground">Notifications</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Choose what notifications you receive.
      </p>

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Notification settings saved!
        </div>
      )}

      <div className="mt-6 space-y-4">
        <ToggleRow
          icon={Mail}
          label="Email notifications"
          description="Receive email updates for important events"
          checked={emailNotifications}
          onChange={setEmailNotifications}
        />
        <ToggleRow
          icon={CheckSquare}
          label="Task reminders"
          description="Get reminded about upcoming task deadlines"
          checked={taskReminders}
          onChange={setTaskReminders}
        />
        <ToggleRow
          icon={Calendar}
          label="Calendar reminders"
          description="Notifications for upcoming events and meetings"
          checked={calendarReminders}
          onChange={setCalendarReminders}
        />
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

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="font-mono text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-foreground" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}