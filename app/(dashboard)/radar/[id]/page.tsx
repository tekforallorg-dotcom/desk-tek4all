// DESTINATION: app/(dashboard)/radar/[id]/page.tsx
// WHY: Opportunity detail — read/edit view with role-gated permissions

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Globe,
  ExternalLink,
  AlertTriangle,
  Zap,
  Target,
  Shield,
  Pencil,
  Trash2,
  Loader2,
  Save,
  X,
  Rss,
  StickyNote,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRadarRole } from "@/lib/hooks/use-radar-role";
import type {
  Opportunity,
  OpportunityStage,
  OpportunityType,
  MissionAlignment,
  QualificationStatus,
} from "@/lib/types/opportunity";
import {
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_COLORS,
  OPPORTUNITY_TYPE_LABELS,
  MISSION_ALIGNMENT_LABELS,
  QUALIFICATION_STATUS_LABELS,
  formatFundingRange,
  getDaysUntilDeadline,
  getDeadlineUrgency,
} from "@/lib/types/opportunity";

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { role, isLoading: roleLoading, isAdmin, isEditor, isViewer, hasAccess } = useRadarRole();

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Opportunity>>({});

  // Notes (editable by all roles)
  const [notes, setNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tag input for edit mode
  const [tagInput, setTagInput] = useState("");
  const [regionInput, setRegionInput] = useState("");

  // ── Fetch ───────────────────────────────────────────────────

  const fetchOpportunity = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      setNotFound(true);
    } else {
      setOpp(data as Opportunity);
      setNotes(data.notes || "");
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    if (!roleLoading) fetchOpportunity();
  }, [roleLoading, fetchOpportunity]);

  // ── Enter edit mode ─────────────────────────────────────────

  const startEditing = () => {
    if (!opp) return;
    setEditForm({
      title: opp.title,
      type: opp.type,
      funder_org: opp.funder_org || "",
      summary: opp.summary || "",
      amount_min: opp.amount_min,
      amount_max: opp.amount_max,
      currency: opp.currency,
      deadline: opp.deadline || "",
      source_url: opp.source_url || "",
      eligibility: opp.eligibility || "",
      sector: [...opp.sector],
      region: [...opp.region],
    });
    setRegionInput(opp.region.join(", "));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
    setTagInput("");
    setRegionInput("");
  };

  // ── Save edit ───────────────────────────────────────────────

  const handleSave = async () => {
    if (!opp) return;
    setIsSaving(true);
    const supabase = createClient();

    const regionArr = regionInput.trim()
      ? regionInput.split(",").map((r) => r.trim()).filter(Boolean)
      : [];

    const { error } = await supabase
      .from("opportunities")
      .update({
        title: (editForm.title || "").trim(),
        type: editForm.type,
        funder_org: (editForm.funder_org as string)?.trim() || null,
        summary: (editForm.summary as string)?.trim() || null,
        amount_min: editForm.amount_min || null,
        amount_max: editForm.amount_max || null,
        currency: editForm.currency,
        deadline: editForm.deadline || null,
        source_url: (editForm.source_url as string)?.trim() || null,
        eligibility: (editForm.eligibility as string)?.trim() || null,
        sector: editForm.sector || [],
        region: regionArr,
      })
      .eq("id", opp.id);

    if (error) {
      console.error("Error saving:", error.message);
    } else {
      setIsEditing(false);
      fetchOpportunity();
    }
    setIsSaving(false);
  };

  // ── Stage change ────────────────────────────────────────────

  const handleStageChange = async (newStage: OpportunityStage) => {
    if (!opp) return;
    const supabase = createClient();
    await supabase.from("opportunities").update({ stage: newStage }).eq("id", opp.id);
    fetchOpportunity();
  };

  // ── Save notes ──────────────────────────────────────────────

  const handleSaveNotes = async () => {
    if (!opp) return;
    setIsSavingNotes(true);
    const supabase = createClient();
    await supabase.from("opportunities").update({ notes: notes.trim() || null }).eq("id", opp.id);
    setNotesDirty(false);
    setIsSavingNotes(false);
    fetchOpportunity();
  };

  // ── Delete ──────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!opp) return;
    setIsDeleting(true);
    const supabase = createClient();
    await supabase.from("opportunities").delete().eq("id", opp.id);
    router.push("/radar");
  };

  // ── Tag helpers ─────────────────────────────────────────────

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !(editForm.sector || []).includes(trimmed)) {
      setEditForm({ ...editForm, sector: [...(editForm.sector || []), trimmed] });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setEditForm({ ...editForm, sector: (editForm.sector || []).filter((t) => t !== tag) });
  };

  // ── Loading / guards ────────────────────────────────────────

  if (roleLoading || isLoading) {
    return (
      <div className="flex min-h-400px items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-500px flex-col items-center justify-center text-center">
        <Lock className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Access Required</h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          You don&apos;t have access to the Opportunity Radar.
        </p>
      </div>
    );
  }

  if (notFound || !opp) {
    return (
      <div className="flex min-h-400px flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-bold text-foreground">Opportunity Not Found</h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          This opportunity may have been deleted or doesn&apos;t exist.
        </p>
        <Link href="/radar">
          <Button variant="outline" className="mt-4 border-2 shadow-retro-sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Radar
          </Button>
        </Link>
      </div>
    );
  }

  const deadlineUrgency = getDeadlineUrgency(opp.deadline);
  const daysLeft = getDaysUntilDeadline(opp.deadline);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link href="/radar" className="flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to Radar
        </Link>
        <div className="flex items-center gap-2">
          {isEditor && !isEditing && (
            <Button variant="outline" onClick={startEditing} className="border-2 shadow-retro-sm">
              <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Edit
            </Button>
          )}
          {isEditor && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-2 text-red-500 hover:bg-red-50 shadow-retro-sm"
            >
              <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <p className="font-medium text-red-800">
            Are you sure you want to delete &quot;{opp.title}&quot;? This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="border-2 border-red-500 bg-red-500 text-white shadow-retro-sm"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </Button>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="border-2 shadow-retro-sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border-2 border-border bg-card p-8 shadow-retro">
        {/* Type + Stage row */}
        <div className="flex items-center justify-between">
          {isEditing ? (
            <select
              value={editForm.type || opp.type}
              onChange={(e) => setEditForm({ ...editForm, type: e.target.value as OpportunityType })}
              className="rounded-full border-2 border-border bg-muted px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider focus:outline-none"
            >
              {Object.entries(OPPORTUNITY_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {OPPORTUNITY_TYPE_LABELS[opp.type] || opp.type}
            </span>
          )}

          {isEditor ? (
            <select
              value={opp.stage}
              onChange={(e) => handleStageChange(e.target.value as OpportunityStage)}
              className={cn("rounded-full border-0 px-4 py-1.5 font-mono text-xs font-medium uppercase tracking-wider focus:outline-none cursor-pointer", OPPORTUNITY_STAGE_COLORS[opp.stage])}
            >
              {Object.entries(OPPORTUNITY_STAGE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          ) : (
            <span className={cn("rounded-full px-4 py-1.5 font-mono text-xs font-medium uppercase tracking-wider", OPPORTUNITY_STAGE_COLORS[opp.stage])}>
              {OPPORTUNITY_STAGE_LABELS[opp.stage] || opp.stage}
            </span>
          )}
        </div>

        {/* Title */}
        {isEditing ? (
          <Input
            value={editForm.title || ""}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            className="mt-4 border-2 text-2xl font-bold shadow-retro-sm"
          />
        ) : (
          <h1 className="mt-4 text-2xl font-bold text-card-foreground">{opp.title}</h1>
        )}

        {/* Funder */}
        {isEditing ? (
          <div className="mt-3">
            <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Funder / Organisation</label>
            <Input
              value={(editForm.funder_org as string) || ""}
              onChange={(e) => setEditForm({ ...editForm, funder_org: e.target.value })}
              placeholder="e.g. Green Climate Fund"
              className="border-2 shadow-retro-sm"
            />
          </div>
        ) : opp.funder_org ? (
          <p className="mt-2 text-lg text-muted-foreground">{opp.funder_org}</p>
        ) : null}

        {/* Meta grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Funding */}
          {isEditing ? (
            <>
              <div>
                <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Min Amount</label>
                <Input type="number" value={editForm.amount_min ?? ""} onChange={(e) => setEditForm({ ...editForm, amount_min: e.target.value ? parseFloat(e.target.value) : null })} className="border-2 shadow-retro-sm" />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Max Amount</label>
                <Input type="number" value={editForm.amount_max ?? ""} onChange={(e) => setEditForm({ ...editForm, amount_max: e.target.value ? parseFloat(e.target.value) : null })} className="border-2 shadow-retro-sm" />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Currency</label>
                <select value={editForm.currency || "USD"} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none">
                  <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                  <option value="NGN">NGN</option><option value="CHF">CHF</option>
                </select>
              </div>
            </>
          ) : (opp.amount_min || opp.amount_max) ? (
            <MetaItem icon={DollarSign} label="Funding Range" value={formatFundingRange(opp.amount_min, opp.amount_max, opp.currency)} bold />
          ) : null}

          {/* Deadline */}
          {isEditing ? (
            <div>
              <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Deadline</label>
              <Input type="date" value={(editForm.deadline as string) || ""} onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} className="border-2 shadow-retro-sm" />
            </div>
          ) : opp.deadline ? (
            <MetaItem
              icon={deadlineUrgency === "urgent" ? AlertTriangle : Calendar}
              label="Deadline"
              value={`${new Date(opp.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (${deadlineUrgency === "passed" ? "Expired" : `${daysLeft}d left`})`}
              className={cn(
                deadlineUrgency === "urgent" && "text-red-500",
                deadlineUrgency === "passed" && "text-muted-foreground line-through"
              )}
            />
          ) : null}

          {/* Region */}
          {isEditing ? (
            <div>
              <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Region(s) — comma-separated</label>
              <Input value={regionInput} onChange={(e) => setRegionInput(e.target.value)} placeholder="Sub-Saharan Africa, East Africa" className="border-2 shadow-retro-sm" />
            </div>
          ) : opp.region.length > 0 ? (
            <MetaItem icon={Globe} label="Region" value={opp.region.join(", ")} />
          ) : null}

          {/* Source */}
          {isEditing ? (
            <div>
              <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source URL</label>
              <Input value={(editForm.source_url as string) || ""} onChange={(e) => setEditForm({ ...editForm, source_url: e.target.value })} placeholder="https://..." className="border-2 shadow-retro-sm" />
            </div>
          ) : opp.source_url ? (
            <div className="flex items-start gap-3">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <div>
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source</span>
                <a href={opp.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-sm text-foreground underline underline-offset-2 hover:no-underline truncate max-w-250px">
                  {opp.source_url}
                </a>
              </div>
            </div>
          ) : null}

          {/* Source label */}
          {!isEditing && opp.source && (
            <MetaItem icon={Rss} label="Source Type" value={opp.source} />
          )}
        </div>

        {/* Mission alignment + qualification badges */}
        {!isEditing && (opp.mission_alignment || opp.qualification_status) && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            {opp.mission_alignment && (
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] uppercase",
                opp.mission_alignment === "high" ? "bg-foreground text-background" :
                opp.mission_alignment === "medium" ? "border-2 border-border text-foreground" :
                "bg-muted text-muted-foreground")}>
                <Target className="h-3.5 w-3.5" strokeWidth={1.5} />
                {MISSION_ALIGNMENT_LABELS[opp.mission_alignment]}
              </span>
            )}
            {opp.qualification_status && (
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] uppercase",
                opp.qualification_status === "likely_qualify" ? "bg-foreground text-background" :
                opp.qualification_status === "partial_match" ? "border-2 border-border text-foreground" :
                "bg-muted text-muted-foreground")}>
                <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />
                {QUALIFICATION_STATUS_LABELS[opp.qualification_status]}
              </span>
            )}
            {opp.confidence !== null && opp.confidence > 0 && (
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.round(opp.confidence * 100)}%` }} />
                </div>
                <span className="font-mono text-[10px] font-bold">{Math.round(opp.confidence * 100)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Summary</h2>
          {isEditing ? (
            <textarea
              value={(editForm.summary as string) || ""}
              onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
              rows={4}
              placeholder="Opportunity details..."
              className="mt-2 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground leading-relaxed">
              {opp.summary || "No summary provided."}
            </p>
          )}
        </div>

        {/* Eligibility */}
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Eligibility</h2>
          {isEditing ? (
            <Input
              value={(editForm.eligibility as string) || ""}
              onChange={(e) => setEditForm({ ...editForm, eligibility: e.target.value })}
              placeholder="e.g. Registered NGOs in West Africa"
              className="mt-2 border-2 shadow-retro-sm"
            />
          ) : (
            <p className="mt-2 text-sm text-foreground">
              {opp.eligibility || "No eligibility criteria specified."}
            </p>
          )}
        </div>

        {/* Sector tags */}
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Sector Tags</h2>
          {isEditing ? (
            <div className="mt-2">
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag and press Enter" className="border-2 shadow-retro-sm" />
                <Button type="button" variant="outline" onClick={addTag} className="border-2 shadow-retro-sm">Add</Button>
              </div>
              {(editForm.sector || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(editForm.sector || []).map((tag) => (
                    <span key={tag} className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : opp.sector.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {opp.sector.map((tag) => (
                <span key={tag} className="rounded-md bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">{tag}</span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No tags.</p>
          )}
        </div>

        {/* Edit actions */}
        {isEditing && (
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-6">
            <Button variant="outline" onClick={cancelEditing} className="border-2 shadow-retro-sm">
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}
              className="border-2 border-foreground bg-foreground text-background shadow-retro">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* Notes section — editable by ALL roles */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <StickyNote className="h-5 w-5" strokeWidth={1.5} />
          Notes
        </h2>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          Visible to all group members. Anyone can edit.
        </p>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
          rows={4}
          placeholder="Add internal notes, follow-up actions, contacts..."
          className="mt-3 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
        />
        {notesDirty && (
          <div className="mt-3 flex justify-end">
            <Button onClick={handleSaveNotes} disabled={isSavingNotes}
              className="border-2 border-foreground bg-foreground text-background shadow-retro-sm">
              {isSavingNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" strokeWidth={1.5} />}
              Save Notes
            </Button>
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span>Created {new Date(opp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        <span>Updated {new Date(opp.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  );
}

// ── Meta Item ─────────────────────────────────────────────────

function MetaItem({
  icon: Icon,
  label,
  value,
  bold,
  className,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div>
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <p className={cn("mt-0.5 text-sm", bold ? "font-bold text-foreground" : "text-foreground", className)}>
          {value}
        </p>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}