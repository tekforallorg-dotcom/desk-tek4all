// DESTINATION: app/(dashboard)/radar/pipeline/page.tsx
// WHY: Kanban board for opportunity pipeline — drag-and-drop stage transitions

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  AlertTriangle,
  Loader2,
  Lock,
  GripVertical,
  Radar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRadarRole } from "@/lib/hooks/use-radar-role";
import type {
  Opportunity,
  OpportunityStage,
} from "@/lib/types/opportunity";
import {
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  formatFundingRange,
  getDaysUntilDeadline,
  getDeadlineUrgency,
} from "@/lib/types/opportunity";

const PIPELINE_STAGES: OpportunityStage[] = [
  "new",
  "reviewing",
  "preparing",
  "submitted",
  "shortlisted",
  "awarded",
];

const ARCHIVE_STAGES: OpportunityStage[] = [
  "rejected",
  "expired",
  "archived",
];

export default function PipelinePage() {
  const { isLoading: roleLoading, isEditor, hasAccess } = useRadarRole();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<OpportunityStage | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────

  const fetchOpportunities = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false });
    setOpportunities(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!roleLoading) fetchOpportunities();
  }, [roleLoading, fetchOpportunities]);

  // ── Group by stage ──────────────────────────────────────────

  const grouped = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = opportunities.filter((o) => o.stage === stage);
      return acc;
    },
    {} as Record<OpportunityStage, Opportunity[]>
  );

  const archivedGrouped = ARCHIVE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = opportunities.filter((o) => o.stage === stage);
      return acc;
    },
    {} as Record<OpportunityStage, Opportunity[]>
  );

  const archivedCount = ARCHIVE_STAGES.reduce(
    (sum, stage) => sum + (archivedGrouped[stage]?.length || 0),
    0
  );

  // ── Drag & Drop ─────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, oppId: string) => {
    if (!isEditor) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", oppId);
    setDraggedId(oppId);
  };

  const handleDragOver = (e: React.DragEvent, stage: OpportunityStage) => {
    if (!isEditor) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, newStage: OpportunityStage) => {
    if (!isEditor) return;
    e.preventDefault();
    const oppId = e.dataTransfer.getData("text/plain");
    setDraggedId(null);
    setDragOverStage(null);

    if (!oppId) return;

    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stage === newStage) return;

    // Optimistic update
    setOpportunities((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, stage: newStage } : o))
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("opportunities")
      .update({ stage: newStage })
      .eq("id", oppId);

    if (error) {
      console.error("Stage update failed:", error.message);
      fetchOpportunities(); // Revert on error
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverStage(null);
  };

  // ── Loading / guards ────────────────────────────────────────

  if (roleLoading || isLoading) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-125 flex-col items-center justify-center text-center">
        <Lock className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Access Required</h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          You don&apos;t have access to the Opportunity Radar.
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/radar"
              className="flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              Radar
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Pipeline</h1>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {isEditor
              ? "Drag cards between columns to change stage."
              : "View-only — contact an editor to move cards."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider transition-all",
                showArchived
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:border-foreground"
              )}
            >
              Archived ({archivedCount})
            </button>
          )}
        </div>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: `${(PIPELINE_STAGES.length + (showArchived ? ARCHIVE_STAGES.length : 0)) * 280}px` }}>
          {/* Active pipeline columns */}
          {PIPELINE_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={grouped[stage] || []}
              isEditor={isEditor}
              isDragOver={dragOverStage === stage}
              draggedId={draggedId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Archived columns */}
          {showArchived &&
            ARCHIVE_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                opportunities={archivedGrouped[stage] || []}
                isEditor={isEditor}
                isDragOver={dragOverStage === stage}
                draggedId={draggedId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isArchive
              />
            ))}
        </div>
      </div>

      {/* Empty state */}
      {opportunities.length === 0 && (
        <div className="flex min-h-75 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
          <Radar className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          <h2 className="mt-4 text-lg font-bold text-foreground">No opportunities in pipeline</h2>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Add opportunities from the{" "}
            <Link href="/radar" className="underline underline-offset-2 hover:text-foreground">
              Radar dashboard
            </Link>{" "}
            to start building your pipeline.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────

function KanbanColumn({
  stage,
  opportunities,
  isEditor,
  isDragOver,
  draggedId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isArchive,
}: {
  stage: OpportunityStage;
  opportunities: Opportunity[];
  isEditor: boolean;
  isDragOver: boolean;
  draggedId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, stage: OpportunityStage) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, stage: OpportunityStage) => void;
  onDragEnd: () => void;
  isArchive?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-68 shrink-0 flex-col rounded-2xl border-2 bg-card transition-colors",
        isDragOver
          ? "border-foreground bg-muted/50 shadow-retro"
          : "border-border shadow-retro-sm",
        isArchive && "opacity-70"
      )}
      onDragOver={(e) => onDragOver(e, stage)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage)}
    >
      {/* Column header */}
      <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground">
          {OPPORTUNITY_STAGE_LABELS[stage]}
        </h3>
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] font-bold",
            opportunities.length > 0
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground"
          )}
        >
          {opportunities.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 p-3" style={{ minHeight: "120px" }}>
        {opportunities.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center rounded-xl border-2 border-dashed border-border p-4">
            <p className="font-mono text-[9px] text-muted-foreground text-center">
              {isDragOver ? "Drop here" : "No items"}
            </p>
          </div>
        ) : (
          opportunities.map((opp) => (
            <KanbanCard
              key={opp.id}
              opportunity={opp}
              isEditor={isEditor}
              isDragging={draggedId === opp.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Kanban Card ───────────────────────────────────────────────

function KanbanCard({
  opportunity: opp,
  isEditor,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  opportunity: Opportunity;
  isEditor: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}) {
  const deadlineUrgency = getDeadlineUrgency(opp.deadline);
  const daysLeft = getDaysUntilDeadline(opp.deadline);

  return (
    <Link href={`/radar/${opp.id}`}>
      <div
        draggable={isEditor}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(e, opp.id);
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group rounded-xl border-2 border-border bg-background p-3 transition-all",
          isEditor && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-40 shadow-none",
          !isDragging && "hover:border-foreground hover:shadow-retro-sm"
        )}
      >
        {/* Top: type + grip */}
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {OPPORTUNITY_TYPE_LABELS[opp.type] || opp.type}
          </span>
          {isEditor && (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>

        {/* Title */}
        <h4 className="mt-2 text-sm font-bold leading-tight text-foreground line-clamp-2">
          {opp.title}
        </h4>

        {/* Funder */}
        {opp.funder_org && (
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
            {opp.funder_org}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
          {(opp.amount_min || opp.amount_max) && (
            <span className="flex items-center gap-0.5 font-mono text-[10px] font-bold text-foreground">
              <DollarSign className="h-3 w-3" strokeWidth={1.5} />
              {formatFundingRange(opp.amount_min, opp.amount_max, opp.currency)}
            </span>
          )}
          {opp.deadline && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-mono text-[10px]",
                deadlineUrgency === "urgent" && "font-bold text-red-500",
                deadlineUrgency === "soon" && "text-foreground",
                deadlineUrgency === "passed" && "text-muted-foreground line-through"
              )}
            >
              {deadlineUrgency === "urgent" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" strokeWidth={1.5} />
              )}
              {deadlineUrgency === "passed" ? "Exp" : `${daysLeft}d`}
            </span>
          )}
        </div>

        {/* Tags preview */}
        {opp.sector.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {opp.sector.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {opp.sector.length > 2 && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
                +{opp.sector.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}