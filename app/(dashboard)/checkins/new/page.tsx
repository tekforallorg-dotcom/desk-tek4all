"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Smile, Meh, Frown, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const MOODS = [
  { value: "great", label: "Great", icon: ThumbsUp, color: "border-green-500 bg-green-50 text-green-700" },
  { value: "good", label: "Good", icon: Smile, color: "border-blue-500 bg-blue-50 text-blue-700" },
  { value: "neutral", label: "Okay", icon: Meh, color: "border-gray-500 bg-gray-50 text-gray-700" },
  { value: "struggling", label: "Struggling", icon: Frown, color: "border-orange-500 bg-orange-50 text-orange-700" },
];

function CheckinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const weekParam = searchParams.get("week");
  const weekStart = weekParam || getMonday(new Date()).toISOString().split("T")[0];

  const [did, setDid] = useState("");
  const [next, setNext] = useState("");
  const [blockers, setBlockers] = useState("");
  const [links, setLinks] = useState("");
  const [mood, setMood] = useState("neutral");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchExisting = async () => {
      if (!user?.id) return;

      const supabase = createClient();
      const { data } = await supabase
        .from("checkins")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .single();

      if (data) {
        setExistingId(data.id);
        setDid(data.did || "");
        setNext(data.next || "");
        setBlockers(data.blockers || "");
        setLinks(data.links || "");
        setMood(data.mood || "neutral");
      }
      setIsFetching(false);
    };

    fetchExisting();
  }, [user?.id, weekStart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsLoading(true);
    setError("");

    const supabase = createClient();

    const checkinData = {
      user_id: user.id,
      week_start: weekStart,
      did: did || null,
      next: next || null,
      blockers: blockers || null,
      links: links || null,
      mood,
      submitted_at: new Date().toISOString(),
    };

    let result;
    if (existingId) {
      result = await supabase
        .from("checkins")
        .update(checkinData)
        .eq("id", existingId);
    } else {
      result = await supabase.from("checkins").insert(checkinData);
    }

    if (result.error) {
      setError(result.error.message);
      setIsLoading(false);
      return;
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: existingId ? "checkin_updated" : "checkin_submitted",
      entity_type: "checkin",
      entity_id: existingId || "new",
      details: { week_start: weekStart, mood },
    });

    router.push("/checkins");
  };

  const formatWeekDisplay = () => {
    const date = new Date(weekStart);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (isFetching) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/checkins">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {existingId ? "Edit" : "New"} Check-in
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Week of {formatWeekDisplay()}
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
          {/* Mood Selection */}
          <div className="space-y-3">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              How was your week?
            </label>
            <div className="grid grid-cols-4 gap-3">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    mood === m.value
                      ? m.color + " border-2"
                      : "border-border bg-background hover:border-foreground"
                  }`}
                >
                  <m.icon className="h-6 w-6" strokeWidth={1.5} />
                  <span className="font-mono text-xs">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* What I Did */}
          <div className="mt-6 space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What I accomplished this week
            </label>
            <textarea
              value={did}
              onChange={(e) => setDid(e.target.value)}
              rows={4}
              placeholder="- Completed the quarterly report&#10;- Reviewed 3 proposals&#10;- Met with partners"
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
            />
          </div>

          {/* What's Next */}
          <div className="mt-6 space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What I'm focusing on next week
            </label>
            <textarea
              value={next}
              onChange={(e) => setNext(e.target.value)}
              rows={4}
              placeholder="- Finalize budget proposal&#10;- Start new programme planning&#10;- Team training session"
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
            />
          </div>

          {/* Blockers */}
          <div className="mt-6 space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Blockers or challenges
            </label>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={3}
              placeholder="Waiting on approval from finance team..."
              className="w-full rounded-xl border-2 border-orange-200 bg-orange-50 px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
            />
          </div>

          {/* Links */}
          <div className="mt-6 space-y-2">
            <label className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Relevant links (optional)
            </label>
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={2}
              placeholder="https://docs.google.com/..."
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/checkins">
            <Button type="button" variant="outline" className="border-2 shadow-retro-sm">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isLoading}
            className="border-2 border-foreground bg-foreground text-background shadow-retro"
          >
            {isLoading ? "Saving..." : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {existingId ? "Update" : "Submit"} Check-in
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
    </div>
  );
}

export default function NewCheckinPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CheckinForm />
    </Suspense>
  );
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}