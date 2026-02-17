"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Programme {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export default function EditProgrammePage() {
  const params = useParams();
  const router = useRouter();
  const programmeId = params.id as string;

  const [programme, setProgramme] = useState<Programme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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
        setError("Programme not found");
      } else {
        setProgramme(data);
      }
      setIsLoading(false);
    };

    fetchProgramme();
  }, [programmeId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const status = formData.get("status") as string;
    const startDate = formData.get("start_date") as string;
    const endDate = formData.get("end_date") as string;

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("programmes")
      .update({
        name,
        description: description || null,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
      })
      .eq("id", programmeId);

    if (updateError) {
      console.error("Error updating programme:", updateError);
      setError(updateError.message);
      setIsSaving(false);
      return;
    }

    // Log the action
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "programme_updated",
        entity_type: "programme",
        entity_id: programmeId,
        details: { name },
      });
    }

    router.push(`/programmes/${programmeId}`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!programme) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/programmes/${programmeId}`}>
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
            Edit Programme
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Update programme details.
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
            Programme Details
          </h2>

          <div className="mt-6 space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Programme Name *
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                defaultValue={programme.name}
                required
                className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label
                htmlFor="description"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={programme.description || ""}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm transition-shadow focus:shadow-retro focus:outline-none focus:ring-0"
              />
            </div>

            {/* Status */}
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
                defaultValue={programme.status}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="start_date"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Start Date
                </label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  defaultValue={programme.start_date || ""}
                  className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="end_date"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  End Date
                </label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  defaultValue={programme.end_date || ""}
                  className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href={`/programmes/${programmeId}`}>
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
    </div>
  );
}