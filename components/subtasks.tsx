"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
} from "lucide-react";

interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
  completed_at: string | null;
}

interface SubtasksProps {
  taskId: string;
}

export default function Subtasks({ taskId }: SubtasksProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Fetch subtasks
  useEffect(() => {
    async function fetchSubtasks() {
      try {
        const res = await fetch(`/api/tasks/${taskId}/subtasks`);
        if (res.ok) {
          const data = await res.json();
          setSubtasks(data);
        }
      } catch (err) {
        console.error("Failed to fetch subtasks:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSubtasks();
  }, [taskId]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Add subtask
  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setIsAdding(true);

    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (res.ok) {
        const subtask = await res.json();
        setSubtasks([...subtasks, subtask]);
        setNewTitle("");
        inputRef.current?.focus();
      }
    } catch (err) {
      console.error("Failed to add subtask:", err);
    } finally {
      setIsAdding(false);
    }
  };

  // Toggle completion
  const handleToggle = async (subtask: Subtask) => {
    const newCompleted = !subtask.is_completed;

    // Optimistic update
    setSubtasks(
      subtasks.map((s) =>
        s.id === subtask.id ? { ...s, is_completed: newCompleted } : s
      )
    );

    try {
      await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtask_id: subtask.id,
          is_completed: newCompleted,
        }),
      });
    } catch (err) {
      // Revert on error
      setSubtasks(
        subtasks.map((s) =>
          s.id === subtask.id ? { ...s, is_completed: !newCompleted } : s
        )
      );
    }
  };

  // Start editing
  const handleStartEdit = (subtask: Subtask) => {
    setEditingId(subtask.id);
    setEditingTitle(subtask.title);
  };

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingId || !editingTitle.trim()) {
      setEditingId(null);
      return;
    }

    const originalSubtask = subtasks.find((s) => s.id === editingId);
    if (originalSubtask?.title === editingTitle.trim()) {
      setEditingId(null);
      return;
    }

    // Optimistic update
    setSubtasks(
      subtasks.map((s) =>
        s.id === editingId ? { ...s, title: editingTitle.trim() } : s
      )
    );
    setEditingId(null);

    try {
      await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtask_id: editingId,
          title: editingTitle.trim(),
        }),
      });
    } catch (err) {
      // Revert on error
      if (originalSubtask) {
        setSubtasks(
          subtasks.map((s) =>
            s.id === editingId ? { ...s, title: originalSubtask.title } : s
          )
        );
      }
    }
  };

  // Delete subtask
  const handleDelete = async (subtaskId: string) => {
    // Optimistic update
    const original = subtasks;
    setSubtasks(subtasks.filter((s) => s.id !== subtaskId));

    try {
      await fetch(`/api/tasks/${taskId}/subtasks?subtask_id=${subtaskId}`, {
        method: "DELETE",
      });
    } catch (err) {
      // Revert on error
      setSubtasks(original);
    }
  };

  // Calculate progress
  const completedCount = subtasks.filter((s) => s.is_completed).length;
  const totalCount = subtasks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (isLoading) {
    return (
      <div className="rounded-xl border-2 border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading subtasks...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-border bg-card p-4 shadow-retro-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-sm font-semibold">Subtasks</span>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({completedCount}/{totalCount})
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-4">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground transition-all duration-300 ease-out rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Subtask list */}
      <div className="space-y-1">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 ${
              subtask.is_completed ? "opacity-60" : ""
            }`}
          >
            {/* Drag handle (visual only for now) */}
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 cursor-grab" />

            {/* Checkbox */}
            <button
              onClick={() => handleToggle(subtask)}
              className="shrink-0 focus:outline-none"
            >
              {subtask.is_completed ? (
                <CheckSquare className="h-4 w-4 text-foreground" strokeWidth={1.5} />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground hover:text-foreground" strokeWidth={1.5} />
              )}
            </button>

            {/* Title (editable) */}
            {editingId === subtask.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 bg-transparent text-sm focus:outline-none border-b border-foreground"
              />
            ) : (
              <span
                onClick={() => handleStartEdit(subtask)}
                className={`flex-1 text-sm cursor-text ${
                  subtask.is_completed ? "line-through text-muted-foreground" : ""
                }`}
              >
                {subtask.title}
              </span>
            )}

            {/* Delete button */}
            <button
              onClick={() => handleDelete(subtask.id)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add subtask input */}
      <div className="mt-3 flex items-center gap-2">
        <Plus className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isAdding) handleAdd();
          }}
          placeholder="Add a subtask..."
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          disabled={isAdding}
        />
        {newTitle.trim() && (
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="px-2 py-1 text-xs font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {isAdding ? "Adding..." : "Add"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {totalCount === 0 && !newTitle && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Break this task into smaller steps
        </p>
      )}
    </div>
  );
}