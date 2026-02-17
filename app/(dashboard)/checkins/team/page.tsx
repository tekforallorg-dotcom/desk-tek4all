"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  User,
  AlertCircle,
  Smile,
  Meh,
  Frown,
  ThumbsUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface TeamMember {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
}

interface Checkin {
  id: string;
  user_id: string;
  week_start: string;
  did: string | null;
  next: string | null;
  blockers: string | null;
  mood: string;
}

const MOOD_ICONS: Record<string, React.ElementType> = {
  great: ThumbsUp,
  good: Smile,
  neutral: Meh,
  struggling: Frown,
};

const MOOD_COLORS: Record<string, string> = {
  great: "text-green-600",
  good: "text-blue-600",
  neutral: "text-gray-600",
  struggling: "text-orange-600",
};

export default function TeamCheckinsPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(() => getMonday(new Date()));

  const isManager = profile?.role === "manager" || profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    const fetchTeamData = async () => {
      if (!user?.id || !isManager) {
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      // Get direct reports (or all users for admins)
      let memberIds: string[] = [];

      if (profile?.role === "admin" || profile?.role === "super_admin") {
        const { data: allUsers } = await supabase
          .from("profiles")
          .select("id, full_name, username, email")
          .neq("id", user.id)
          .order("full_name");
        setTeamMembers(allUsers || []);
        memberIds = (allUsers || []).map((u) => u.id);
      } else {
        const { data: hierarchyData } = await supabase
          .from("hierarchy")
          .select("report_id")
          .eq("manager_id", user.id);

        if (hierarchyData && hierarchyData.length > 0) {
          memberIds = hierarchyData.map((h) => h.report_id);
          const { data: membersData } = await supabase
            .from("profiles")
            .select("id, full_name, username, email")
            .in("id", memberIds);
          setTeamMembers(membersData || []);
        }
      }

      // Fetch check-ins for the current week
      if (memberIds.length > 0) {
        const weekStart = formatDate(currentWeek);
        const { data: checkinsData } = await supabase
          .from("checkins")
          .select("*")
          .in("user_id", memberIds)
          .eq("week_start", weekStart);
        setCheckins(checkinsData || []);
      }

      setIsLoading(false);
    };

    if (!authLoading) {
      fetchTeamData();
    }
  }, [user?.id, isManager, authLoading, profile?.role, currentWeek]);

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

  const getCheckinForMember = (memberId: string) => {
    return checkins.find((c) => c.user_id === memberId);
  };

  const blockersCount = checkins.filter((c) => c.blockers && c.blockers.trim().length > 0).length;
  const submittedCount = checkins.length;

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <p className="text-lg font-medium">Manager access required</p>
        <Link href="/checkins" className="mt-4">
          <Button variant="outline" className="border-2">
            Back to Check-ins
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/checkins">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Team Check-ins
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {teamMembers.length} team member{teamMembers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={goToPreviousWeek} className="border-2">
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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <p className="text-2xl font-bold">{submittedCount}/{teamMembers.length}</p>
          <p className="font-mono text-xs text-muted-foreground">Submitted</p>
        </div>
        <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <p className="text-2xl font-bold">{teamMembers.length - submittedCount}</p>
          <p className="font-mono text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4 shadow-retro-sm">
          <p className="text-2xl font-bold text-orange-600">{blockersCount}</p>
          <p className="font-mono text-xs text-orange-600">With Blockers</p>
        </div>
      </div>

      {/* Blockers Summary */}
      {blockersCount > 0 && (
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-6 shadow-retro">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <h2 className="font-bold text-orange-800">Blockers This Week</h2>
          </div>
          <div className="mt-4 space-y-3">
            {checkins
              .filter((c) => c.blockers && c.blockers.trim().length > 0)
              .map((checkin) => {
                const member = teamMembers.find((m) => m.id === checkin.user_id);
                return (
                  <div key={checkin.id} className="rounded-xl border-2 border-orange-200 bg-white p-4">
                    <p className="font-medium text-orange-800">
                      {member?.full_name || member?.username}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap font-mono text-sm text-orange-700">
                      {checkin.blockers}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <h2 className="font-bold">Team Members</h2>
        <div className="mt-4 space-y-3">
          {teamMembers.map((member) => {
            const checkin = getCheckinForMember(member.id);
            const MoodIcon = checkin ? MOOD_ICONS[checkin.mood] || Meh : null;
            const moodColor = checkin ? MOOD_COLORS[checkin.mood] : "";

            return (
              <div
                key={member.id}
                className="rounded-xl border-2 border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-sm">
                      {(member.full_name || member.username)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.full_name || member.username}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                  </div>
                  {checkin ? (
                    <div className={`flex items-center gap-2 ${moodColor}`}>
                      {MoodIcon && <MoodIcon className="h-5 w-5" />}
                      <span className="font-mono text-xs">Submitted</span>
                    </div>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      Not submitted
                    </span>
                  )}
                </div>

                {checkin && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                    <div>
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">
                        Accomplished
                      </p>
                      <p className="mt-1 line-clamp-3 font-mono text-xs">
                        {checkin.did || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">
                        Next
                      </p>
                      <p className="mt-1 line-clamp-3 font-mono text-xs">
                        {checkin.next || "—"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {teamMembers.length === 0 && (
            <p className="py-8 text-center font-mono text-sm text-muted-foreground">
              No team members assigned yet.
            </p>
          )}
        </div>
      </div>
    </div>
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