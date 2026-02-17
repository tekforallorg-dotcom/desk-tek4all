"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Plus,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Smile,
  Meh,
  Frown,
  ThumbsUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface Checkin {
  id: string;
  user_id: string;
  week_start: string;
  did: string | null;
  next: string | null;
  blockers: string | null;
  links: string | null;
  mood: string;
  submitted_at: string;
}

const MOOD_ICONS: Record<string, React.ElementType> = {
  great: ThumbsUp,
  good: Smile,
  neutral: Meh,
  struggling: Frown,
};

const MOOD_COLORS: Record<string, string> = {
  great: "text-green-600 bg-green-50 border-green-200",
  good: "text-blue-600 bg-blue-50 border-blue-200",
  neutral: "text-gray-600 bg-gray-50 border-gray-200",
  struggling: "text-orange-600 bg-orange-50 border-orange-200",
};

export default function CheckinsPage() {
  const { user, profile } = useAuth();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(() => getMonday(new Date()));

  const isManager = profile?.role === "manager" || profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    const fetchCheckins = async () => {
      if (!user?.id) return;

      const supabase = createClient();
      const { data, error } = await supabase
        .from("checkins")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Error fetching check-ins:", error);
      } else {
        setCheckins(data || []);
      }
      setIsLoading(false);
    };

    fetchCheckins();
  }, [user?.id]);

  const currentWeekCheckin = checkins.find(
    (c) => c.week_start === formatDate(currentWeek)
  );

  const goToPreviousWeek = () => {
    const prev = new Date(currentWeek);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeek(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + 7);
    if (next <= getMonday(new Date())) {
      setCurrentWeek(next);
    }
  };

  const isCurrentWeek = formatDate(currentWeek) === formatDate(getMonday(new Date()));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Weekly Check-ins
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Share your progress and blockers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Link href="/checkins/team">
              <Button variant="outline" className="border-2 shadow-retro-sm">
                Team View
              </Button>
            </Link>
          )}
          <Link href={`/checkins/new?week=${formatDate(currentWeek)}`}>
            <Button className="border-2 border-foreground bg-foreground text-background shadow-retro">
              <Plus className="mr-2 h-4 w-4" />
              {currentWeekCheckin ? "Edit Check-in" : "New Check-in"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPreviousWeek}
          className="border-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">
            Week of {formatDisplayDate(currentWeek)}
          </span>
          {isCurrentWeek && (
            <span className="rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] text-background">
              Current
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextWeek}
          disabled={isCurrentWeek}
          className="border-2"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Current Week Check-in */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      ) : currentWeekCheckin ? (
        <CheckinCard checkin={currentWeekCheckin} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground" strokeWidth={1} />
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            No check-in for this week yet.
          </p>
          <Link href={`/checkins/new?week=${formatDate(currentWeek)}`} className="mt-4">
            <Button className="border-2 border-foreground bg-foreground text-background shadow-retro">
              <Plus className="mr-2 h-4 w-4" />
              Submit Check-in
            </Button>
          </Link>
        </div>
      )}

      {/* Past Check-ins */}
      {checkins.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="font-bold">Past Check-ins</h2>
          <div className="mt-4 space-y-3">
            {checkins
              .filter((c) => c.week_start !== formatDate(currentWeek))
              .slice(0, 5)
              .map((checkin) => (
                <Link
                  key={checkin.id}
                  href={`/checkins/new?week=${checkin.week_start}`}
                >
                  <div className="flex items-center justify-between rounded-xl border-2 border-border p-4 transition-all hover:border-foreground">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm">
                        Week of {formatDisplayDate(new Date(checkin.week_start))}
                      </span>
                    </div>
                    <MoodBadge mood={checkin.mood} />
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckinCard({ checkin }: { checkin: Checkin }) {
  const MoodIcon = MOOD_ICONS[checkin.mood] || Meh;

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Your Check-in</h2>
        <MoodBadge mood={checkin.mood} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* What I Did */}
        <div className="space-y-2">
          <p className="font-mono text-xs font-medium uppercase text-muted-foreground">
            What I accomplished
          </p>
          <div className="rounded-xl border-2 border-border bg-background p-4">
            <p className="whitespace-pre-wrap font-mono text-sm">
              {checkin.did || "Nothing logged"}
            </p>
          </div>
        </div>

        {/* What's Next */}
        <div className="space-y-2">
          <p className="font-mono text-xs font-medium uppercase text-muted-foreground">
            What's next
          </p>
          <div className="rounded-xl border-2 border-border bg-background p-4">
            <p className="whitespace-pre-wrap font-mono text-sm">
              {checkin.next || "Nothing planned"}
            </p>
          </div>
        </div>

        {/* Blockers */}
        <div className="space-y-2">
          <p className="font-mono text-xs font-medium uppercase text-muted-foreground">
            Blockers
          </p>
          <div className={`rounded-xl border-2 p-4 ${checkin.blockers ? "border-orange-200 bg-orange-50" : "border-border bg-background"}`}>
            <p className="whitespace-pre-wrap font-mono text-sm">
              {checkin.blockers || "No blockers"}
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="space-y-2">
          <p className="font-mono text-xs font-medium uppercase text-muted-foreground">
            Relevant links
          </p>
          <div className="rounded-xl border-2 border-border bg-background p-4">
            <p className="whitespace-pre-wrap font-mono text-sm">
              {checkin.links || "No links"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Link href={`/checkins/new?week=${checkin.week_start}`}>
          <Button variant="outline" className="border-2">
            Edit Check-in
          </Button>
        </Link>
      </div>
    </div>
  );
}

function MoodBadge({ mood }: { mood: string }) {
  const MoodIcon = MOOD_ICONS[mood] || Meh;
  const colorClass = MOOD_COLORS[mood] || MOOD_COLORS.neutral;

  return (
    <span className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1 font-mono text-xs ${colorClass}`}>
      <MoodIcon className="h-3 w-3" />
      {mood}
    </span>
  );
}

// Helper functions
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}