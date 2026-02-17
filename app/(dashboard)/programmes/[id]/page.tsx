"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  Users,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Programme } from "@/lib/types/programme";
import { PROGRAMME_STATUS_LABELS } from "@/lib/types/programme";
import { useAuth } from "@/lib/auth";

export default function ProgrammeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const programmeId = params.id as string;

  useEffect(() => {
    const fetchProgramme = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("programmes")
        .select("*")
        .eq("id", programmeId)
        .single();

      if (error) {
        console.error("Error fetching programme:", error);
      } else {
        setProgramme(data);
      }
      setIsLoading(false);
    };

    fetchProgramme();
  }, [programmeId]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this programme?")) return;

    setIsDeleting(true);
    const supabase = createClient();

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user?.id,
      action: "programme_deleted",
      entity_type: "programme",
      entity_id: programmeId,
      details: { name: programme?.name },
    });

    const { error } = await supabase
      .from("programmes")
      .delete()
      .eq("id", programmeId);

    if (error) {
      console.error("Error deleting programme:", error);
      alert("Failed to delete programme");
      setIsDeleting(false);
      return;
    }

    router.push("/programmes");
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!programme) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <h2 className="text-xl font-bold">Programme not found</h2>
        <Link href="/programmes" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Programmes
          </Button>
        </Link>
      </div>
    );
  }

  const statusLabel = PROGRAMME_STATUS_LABELS[programme.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/programmes">
            <Button
              variant="outline"
              size="icon"
              className="border-2 shadow-retro-sm"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {programme.name}
              </h1>
              <span
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider",
                  programme.status === "active"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Created {formatDate(programme.created_at)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href={`/programmes/${programme.id}/edit`}>
            <Button
              variant="outline"
              className="border-2 shadow-retro-sm"
            >
              <Edit className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={isDeleting}
            className="border-2 text-red-500 shadow-retro-sm hover:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
              Description
            </h2>
            <p className="mt-4 text-muted-foreground">
              {programme.description || "No description provided."}
            </p>
          </div>

          {/* Activity (placeholder) */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
              Recent Activity
            </h2>
            <p className="mt-4 font-mono text-sm text-muted-foreground">
              No activity yet.
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <h2 className="text-lg font-bold text-card-foreground">Details</h2>
            <dl className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" strokeWidth={1.5} />
                  Start Date
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {formatDate(programme.start_date)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" strokeWidth={1.5} />
                  End Date
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {formatDate(programme.end_date)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" strokeWidth={1.5} />
                  Last Updated
                </dt>
                <dd className="font-mono text-sm font-medium">
                  {formatDate(programme.updated_at)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Team */}
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-card-foreground">Team</h2>
              <Button
                variant="outline"
                size="sm"
                className="border-2 text-xs shadow-retro-sm"
              >
                <Users className="mr-1 h-3 w-3" strokeWidth={1.5} />
                Manage
              </Button>
            </div>
            <p className="mt-4 font-mono text-sm text-muted-foreground">
              No team members assigned yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}