"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

interface Programme {
  id: string;
  name: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
}

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const defaultProgrammeId = searchParams.get("programme") || "";

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      // Fetch programmes
      const { data: programmesData } = await supabase
        .from("programmes")
        .select("id, name")
        .order("name");
      setProgrammes(programmesData || []);

      // Fetch users for assignment
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("status", "active")
        .order("full_name");
      setUsers(usersData || []);
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const status = formData.get("status") as string;
    const priority = formData.get("priority") as string;
    const dueDate = formData.get("due_date") as string;
    const programmeId = formData.get("programme_id") as string;
    const assigneeId = formData.get("assignee_id") as string;

    const supabase = createClient();

    const { data, error: insertError } = await supabase
      .from("tasks")
      .insert({
        title,
        description: description || null,
        status,
        priority,
        due_date: dueDate || null,
        programme_id: programmeId || null,
        assignee_id: assigneeId || user?.id,
        created_by: user?.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating task:", insertError);
      setError(insertError.message);
      setIsLoading(false);
      return;
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user?.id,
      action: "task_created",
      entity_type: "task",
      entity_id: data.id,
      details: { title, assignee_id: assigneeId || user?.id },
    });

    router.push(`/tasks/${data.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/tasks">
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
            New Task
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Create a new task to track.
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
            Task Details
          </h2>

          <div className="mt-6 space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <label
                htmlFor="title"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Task Title *
              </label>
              <Input
                id="title"
                name="title"
                type="text"
                placeholder="e.g., Review quarterly report"
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
                rows={3}
                placeholder="Add more details about this task..."
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm transition-shadow focus:shadow-retro focus:outline-none focus:ring-0"
              />
            </div>

            {/* Assignee */}
            <div className="space-y-2">
              <label
                htmlFor="assignee_id"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Assign To
              </label>
              <select
                id="assignee_id"
                name="assignee_id"
                defaultValue={user?.id || ""}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Status & Priority */}
            <div className="grid gap-4 sm:grid-cols-2">
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
                  defaultValue="todo"
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="priority"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Priority
                </label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue="medium"
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Due Date & Programme */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="due_date"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Due Date
                </label>
                <Input
                  id="due_date"
                  name="due_date"
                  type="date"
                  className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="programme_id"
                  className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Programme (Optional)
                </label>
                <select
                  id="programme_id"
                  name="programme_id"
                  defaultValue={defaultProgrammeId}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
                >
                  <option value="">No programme</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/tasks">
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
                Create Task
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}