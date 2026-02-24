// DESTINATION: app/(dashboard)/crm/[id]/page.tsx
// WHY: Stakeholder detail view — profile header, contacts, ProgrammeLinker component, interaction timeline

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  ExternalLink,
  MapPin,
  Building2,
  Star,
  Plus,
  Calendar,
  MessageSquare,
  PhoneCall,
  FileText,
  Users,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useCrmRole } from "@/lib/hooks/use-crm-role";
import { ProgrammeLinker } from "@/components/crm/programme-linker";
import type {
  Stakeholder,
  StakeholderContact,
  StakeholderInteraction,
  InteractionType,
} from "@/lib/types/stakeholder";
import {
  STAKEHOLDER_TYPE_LABELS,
  STAKEHOLDER_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
  ENGAGEMENT_LABELS,
  ENGAGEMENT_COLORS,
  getEngagementLevel,
} from "@/lib/types/stakeholder";

// ── Page Component ────────────────────────────────────────────

export default function StakeholderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { isEditor, hasAccess, isLoading: roleLoading } = useCrmRole();
  const stakeholderId = params.id as string;

  const [stakeholder, setStakeholder] = useState<Stakeholder | null>(null);
  const [contacts, setContacts] = useState<StakeholderContact[]>([]);
  const [interactions, setInteractions] = useState<StakeholderInteraction[]>([]);
  const [interactionProfiles, setInteractionProfiles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [linkerKey, setLinkerKey] = useState(0);

  // Interaction form state
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [intType, setIntType] = useState<InteractionType>("note");
  const [intTitle, setIntTitle] = useState("");
  const [intDescription, setIntDescription] = useState("");
  const [intDate, setIntDate] = useState(new Date().toISOString().split("T")[0]);
  const [intFollowUp, setIntFollowUp] = useState("");
  const [isSavingInt, setIsSavingInt] = useState(false);

  const isManager = profile?.role && ["manager", "admin", "super_admin"].includes(profile.role);
  const isAdmin = profile?.role && ["admin", "super_admin"].includes(profile.role);

  // ── Fetch all data ──────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Stakeholder
    const { data: s, error } = await supabase
      .from("stakeholders")
      .select("*")
      .eq("id", stakeholderId)
      .single();

    if (error || !s) {
      console.error("Error fetching stakeholder:", error);
      setIsLoading(false);
      return;
    }
    setStakeholder(s);

    // Contacts
    const { data: c } = await supabase
      .from("stakeholder_contacts")
      .select("*")
      .eq("stakeholder_id", stakeholderId)
      .order("is_primary", { ascending: false });
    setContacts(c || []);

    // Interactions
    const { data: ints } = await supabase
      .from("stakeholder_interactions")
      .select("*")
      .eq("stakeholder_id", stakeholderId)
      .order("date", { ascending: false });
    setInteractions(ints || []);

    // Fetch profile names for interactions
    if (ints && ints.length > 0) {
      const userIds = [...new Set(ints.map((i) => i.logged_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p) => {
        profileMap[p.id] = p.full_name || "Unknown";
      });
      setInteractionProfiles(profileMap);
    }

    setIsLoading(false);
  }, [stakeholderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Add interaction ─────────────────────────────────────────

  const handleAddInteraction = async () => {
    if (!intTitle.trim() || !profile) return;
    setIsSavingInt(true);

    const supabase = createClient();
    const { error } = await supabase.from("stakeholder_interactions").insert({
      stakeholder_id: stakeholderId,
      type: intType,
      title: intTitle.trim(),
      description: intDescription.trim() || null,
      date: intDate,
      follow_up_date: intFollowUp || null,
      follow_up_done: false,
      logged_by: profile.id,
    });

    if (error) {
      console.error("Error adding interaction:", error);
    } else {
      setIntTitle("");
      setIntDescription("");
      setIntFollowUp("");
      setShowAddInteraction(false);
      fetchData();
    }
    setIsSavingInt(false);
  };

  // ── Delete stakeholder ──────────────────────────────────────

  const handleDelete = async () => {
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("stakeholders")
      .delete()
      .eq("id", stakeholderId);

    if (error) {
      console.error("Error deleting stakeholder:", error);
      setIsDeleting(false);
    } else {
      router.push("/crm");
    }
  };

  // ── Loading / Not found ─────────────────────────────────────

if (isLoading || roleLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
        <div className="h-48 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!stakeholder) {
    return (
      <div className="flex min-h-400px flex-col items-center justify-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-bold">Stakeholder not found</h2>
        <Link href="/crm" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            Back to CRM
          </Button>
        </Link>
      </div>
    );
  }

  const engagement = getEngagementLevel(
    interactions.length > 0 ? interactions[0].date : null
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/crm">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {isManager && (
            <Link href={`/crm/${stakeholderId}/edit`}>
              <Button variant="outline" className="border-2 shadow-retro-sm">
                <Edit className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Edit
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-2 text-red-500 shadow-retro-sm hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">
          <h3 className="font-bold text-red-800">Delete this stakeholder?</h3>
          <p className="mt-1 text-sm text-red-700">
            This will permanently delete &quot;{stakeholder.name}&quot; and all associated contacts,
            interactions, and programme links. This action cannot be undone.
          </p>
          <div className="mt-4 flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              className="border-red-300"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Permanently
            </Button>
          </div>
        </div>
      )}

      {/* ── Profile Header ─────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            {/* Type + Engagement */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {STAKEHOLDER_TYPE_LABELS[stakeholder.type]}
              </span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider",
                  stakeholder.status === "active"
                    ? "bg-foreground text-background"
                    : stakeholder.status === "prospective"
                      ? "border border-border text-foreground"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {STAKEHOLDER_STATUS_LABELS[stakeholder.status]}
              </span>
              <div className="flex items-center gap-1.5">
                <div className={cn("h-2.5 w-2.5 rounded-full", ENGAGEMENT_COLORS[engagement])} />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {ENGAGEMENT_LABELS[engagement]}
                </span>
              </div>
            </div>

            {/* Name */}
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              {stakeholder.name}
            </h1>

            {/* Category */}
            {stakeholder.category && (
              <p className="mt-1 text-sm text-muted-foreground">{stakeholder.category}</p>
            )}

            {/* Contact info */}
            <div className="mt-4 space-y-1.5">
              {stakeholder.email && (
                <a
                  href={`mailto:${stakeholder.email}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-4 w-4" strokeWidth={1.5} />
                  {stakeholder.email}
                </a>
              )}
              {stakeholder.phone && (
                <a
                  href={`tel:${stakeholder.phone}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-4 w-4" strokeWidth={1.5} />
                  {stakeholder.phone}
                </a>
              )}
              {stakeholder.website && (
                <a
                  href={stakeholder.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                  {stakeholder.website}
                </a>
              )}
              {stakeholder.address && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" strokeWidth={1.5} />
                  {stakeholder.address}
                </div>
              )}
            </div>

            {/* Tags */}
            {stakeholder.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {stakeholder.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stats column */}
          <div className="flex flex-row gap-4 sm:flex-col sm:items-end sm:gap-2">
            <div className="rounded-xl border-2 border-border bg-background px-4 py-2 text-center shadow-retro-sm">
              <p className="font-mono text-2xl font-bold text-foreground">{contacts.length}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Contacts
              </p>
            </div>
            <div className="rounded-xl border-2 border-border bg-background px-4 py-2 text-center shadow-retro-sm">
              <p className="font-mono text-2xl font-bold text-foreground">
                {interactions.length}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Interactions
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {stakeholder.notes && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{stakeholder.notes}</p>
          </div>
        )}
      </div>

      {/* ── Contact Persons ─────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Building2 className="h-5 w-5" strokeWidth={1.5} />
          Contact Persons
        </h2>
        {contacts.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            No contact persons recorded.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border-2 border-border bg-background p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground">{c.name}</h3>
                  {c.is_primary && (
                    <span className="flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] text-background">
                      <Star className="h-3 w-3" />
                      Primary
                    </span>
                  )}
                </div>
                {c.role && (
                  <p className="mt-1 text-sm text-muted-foreground">{c.role}</p>
                )}
                <div className="mt-2 space-y-1">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="h-3 w-3" strokeWidth={1.5} />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" strokeWidth={1.5} />
                      {c.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Linked Programmes (ProgrammeLinker) ────────────── */}
      <ProgrammeLinker
        key={linkerKey}
        stakeholderId={stakeholderId}
        stakeholderType={stakeholder.type}
        isManager={!!isManager}
        onDataChange={() => setLinkerKey((k) => k + 1)}
      />

      {/* ── Interaction Timeline ────────────────────────────── */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Clock className="h-5 w-5" strokeWidth={1.5} />
            Interaction Timeline
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddInteraction(!showAddInteraction)}
            className="border-2 shadow-retro-sm"
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Log Interaction
          </Button>
        </div>

        {/* Add interaction form */}
        {showAddInteraction && (
          <div className="mt-4 rounded-xl border-2 border-border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Type
                </label>
                <select
                  value={intType}
                  onChange={(e) => setIntType(e.target.value as InteractionType)}
                  className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
                >
                  {Object.entries(INTERACTION_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Date
                </label>
                <Input
                  type="date"
                  value={intDate}
                  onChange={(e) => setIntDate(e.target.value)}
                  className="border-2 shadow-retro-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Title *
                </label>
                <Input
                  value={intTitle}
                  onChange={(e) => setIntTitle(e.target.value)}
                  placeholder="e.g. Quarterly review call"
                  className="border-2 shadow-retro-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <textarea
                  value={intDescription}
                  onChange={(e) => setIntDescription(e.target.value)}
                  rows={2}
                  placeholder="Notes about this interaction..."
                  className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Follow-up Date
                </label>
                <Input
                  type="date"
                  value={intFollowUp}
                  onChange={(e) => setIntFollowUp(e.target.value)}
                  className="border-2 shadow-retro-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddInteraction(false)}
                className="border-2 shadow-retro-sm"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddInteraction}
                disabled={isSavingInt || !intTitle.trim()}
                className="border-2 border-foreground bg-foreground text-background shadow-retro"
              >
                {isSavingInt ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {interactions.length === 0 ? (
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            No interactions logged yet. Click &quot;Log Interaction&quot; to record a meeting, call, or note.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {interactions.map((int) => (
              <div
                key={int.id}
                className="flex gap-3 rounded-xl border-2 border-border bg-background p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <InteractionIcon type={int.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{int.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {INTERACTION_TYPE_LABELS[int.type]}
                    </span>
                  </div>
                  {int.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{int.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(int.date)}
                    </span>
                    <span>
                      by {interactionProfiles[int.logged_by] || "Unknown"}
                    </span>
                    {int.follow_up_date && (
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          !int.follow_up_done &&
                            new Date(int.follow_up_date) < new Date() &&
                            "text-red-500"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        Follow-up: {formatDate(int.follow_up_date)}
                        {int.follow_up_done ? " ✓" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function InteractionIcon({ type }: { type: InteractionType }) {
  const iconClass = "h-4 w-4 text-muted-foreground";
  switch (type) {
    case "meeting":
      return <Users className={iconClass} strokeWidth={1.5} />;
    case "call":
      return <PhoneCall className={iconClass} strokeWidth={1.5} />;
    case "email":
      return <MessageSquare className={iconClass} strokeWidth={1.5} />;
    case "visit":
      return <MapPin className={iconClass} strokeWidth={1.5} />;
    case "event":
      return <Calendar className={iconClass} strokeWidth={1.5} />;
    case "note":
    default:
      return <FileText className={iconClass} strokeWidth={1.5} />;
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}