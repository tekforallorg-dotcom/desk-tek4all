"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

export default function NewProgrammePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const status = formData.get("status") as string;
    const startDate = formData.get("start_date") as string;
    const endDate = formData.get("end_date") as string;

    const supabase = createClient();

    const { data, error: insertError } = await supabase
      .from("programmes")
      .insert({
        name,
        description: description || null,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
        created_by: user?.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating programme:", insertError);
      setError(insertError.message);
      setIsLoading(false);
      return;
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user?.id,
      action: "programme_created",
      entity_type: "programme",
      entity_id: data.id,
      details: { name },
    });

    router.push(`/programmes/${data.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            New Programme
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Create a new programme or initiative.
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
                placeholder="e.g., Youth Tech Training"
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
                placeholder="Describe the programme objectives and scope..."
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
                defaultValue="draft"
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
                  className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/programmes">
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
                <Save className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Create Programme
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}