"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderKanban, Calendar, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Programme } from "@/lib/types/programme";
import { PROGRAMME_STATUS_LABELS } from "@/lib/types/programme";

export default function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProgrammes = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("programmes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching programmes:", error);
      } else {
        setProgrammes(data || []);
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
          {programmes.map((programme) => (
            <ProgrammeCard key={programme.id} programme={programme} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgrammeCard({ programme }: { programme: Programme }) {
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
          <FolderKanban className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
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
            <Users className="h-3.5 w-3.5" strokeWidth={1.5} />0 members
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
        <FolderKanban className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="mt-6 text-xl font-bold text-foreground">No programmes yet</h2>
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