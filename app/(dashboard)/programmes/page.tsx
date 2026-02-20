// DESTINATION: app/(dashboard)/programmes/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderKanban, Calendar, Users, ArrowUpDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Programme } from "@/lib/types/programme";
import { PROGRAMME_STATUS_LABELS } from "@/lib/types/programme";

interface ProgrammeWithCount extends Programme {
  member_count: number;
}

export default function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<ProgrammeWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"latest" | "alphabetical" | "updated">("latest");

  useEffect(() => {
    const fetchProgrammes = async () => {
      const supabase = createClient();

      // Fetch programmes
      const { data: programmesData, error } = await supabase
        .from("programmes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching programmes:", error);
        setIsLoading(false);
        return;
      }

      // Fetch member counts for all programmes
      const programmeIds = (programmesData || []).map((p) => p.id);

      if (programmeIds.length > 0) {
        const { data: memberCounts } = await supabase
          .from("programme_members")
          .select("programme_id")
          .in("programme_id", programmeIds);

        // Count members per programme
        const countMap: Record<string, number> = {};
        (memberCounts || []).forEach((m) => {
          countMap[m.programme_id] = (countMap[m.programme_id] || 0) + 1;
        });

        // Merge counts with programmes
        const programmesWithCounts = (programmesData || []).map((p) => ({
          ...p,
          member_count: countMap[p.id] || 0,
        }));

        setProgrammes(programmesWithCounts);
      } else {
        setProgrammes([]);
      }

      setIsLoading(false);
    };

    fetchProgrammes();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Programmes
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Manage all Tek4All programmes and initiatives.
          </p>
        </div>
        <Link href="/programmes/new">
          <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            New Programme
          </Button>
        </Link>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
        >
          <option value="latest">Latest</option>
          <option value="alphabetical">Alphabetical</option>
          <option value="updated">Recently Updated</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl border-2 border-border bg-card"
            />
          ))}
        </div>
      ) : programmes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...programmes]
            .sort((a, b) => {
              if (sortBy === "alphabetical") return a.name.localeCompare(b.name);
              if (sortBy === "updated")
                return (
                  new Date(b.updated_at || b.created_at).getTime() -
                  new Date(a.updated_at || a.created_at).getTime()
                );
              return (
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
              );
            })
            .map((programme) => (
              <ProgrammeCard key={programme.id} programme={programme} />
            ))}
        </div>
      )}
    </div>
  );
}

function ProgrammeCard({ programme }: { programme: ProgrammeWithCount }) {
  const statusLabel = PROGRAMME_STATUS_LABELS[programme.status];

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Link href={`/programmes/${programme.id}`}>
      <div className="group rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm transition-all hover-lift">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider",
              programme.status === "active"
                ? "bg-foreground text-background"
                : programme.status === "completed"
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {statusLabel}
          </span>
          <FolderKanban
            className="h-5 w-5 text-muted-foreground"
            strokeWidth={1.5}
          />
        </div>

        {/* Title */}
        <h3 className="mt-4 text-lg font-bold text-card-foreground group-hover:text-foreground">
          {programme.name}
        </h3>

        {/* Description */}
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {programme.description || "No description"}
        </p>

        {/* Meta */}
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
            {formatDate(programme.start_date)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
            {programme.member_count} member
            {programme.member_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-400px flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
        <FolderKanban
          className="h-8 w-8 text-muted-foreground"
          strokeWidth={1.5}
        />
      </div>
      <h2 className="mt-6 text-xl font-bold text-foreground">
        No programmes yet
      </h2>
      <p className="mt-2 max-w-sm font-mono text-sm text-muted-foreground">
        Create your first programme to start organizing your initiatives.
      </p>
      <Link href="/programmes/new" className="mt-6">
        <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
          <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Create Programme
        </Button>
      </Link>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}