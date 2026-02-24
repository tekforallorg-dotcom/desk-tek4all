// DESTINATION: components/crm/programme-linker.tsx
// WHY: Reusable component for linking stakeholders to programmes with roles, and tracking contributions for funders

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  FolderKanban,
  DollarSign,
  Loader2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  StakeholderProgrammeRole,
  ContributionType,
} from "@/lib/types/stakeholder";
import { PROGRAMME_ROLE_LABELS } from "@/lib/types/stakeholder";

// ── Types ─────────────────────────────────────────────────────

interface LinkedProgramme {
  id: string;
  programme_id: string;
  role: StakeholderProgrammeRole;
  notes: string | null;
  programme: { id: string; name: string; status: string } | null;
}

interface Contribution {
  id: string;
  stakeholder_programme_id: string;
  type: ContributionType;
  amount: number | null;
  currency: string;
  date: string | null;
  notes: string | null;
}

interface AvailableProgramme {
  id: string;
  name: string;
}

interface Props {
  stakeholderId: string;
  stakeholderType: string;
  isManager: boolean;
  onDataChange?: () => void;
}

// ── Component ─────────────────────────────────────────────────

export function ProgrammeLinker({ stakeholderId, stakeholderType, isManager, onDataChange }: Props) {
  const [linkedProgrammes, setLinkedProgrammes] = useState<LinkedProgramme[]>([]);
  const [contributions, setContributions] = useState<Record<string, Contribution[]>>({});
  const [availableProgrammes, setAvailableProgrammes] = useState<AvailableProgramme[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Link form state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedProgramme, setSelectedProgramme] = useState("");
  const [selectedRole, setSelectedRole] = useState<StakeholderProgrammeRole>("funder");
  const [linkNotes, setLinkNotes] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  // Contribution form state
  const [showContribForm, setShowContribForm] = useState<string | null>(null);
  const [contribType, setContribType] = useState<ContributionType>("disbursement");
  const [contribAmount, setContribAmount] = useState("");
  const [contribCurrency, setContribCurrency] = useState("USD");
  const [contribDate, setContribDate] = useState(new Date().toISOString().split("T")[0]);
  const [contribNotes, setContribNotes] = useState("");
  const [isSavingContrib, setIsSavingContrib] = useState(false);

  // ── Fetch data ──────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Linked programmes
    const { data: lp } = await supabase
      .from("stakeholder_programmes")
      .select("id, programme_id, role, notes, programme:programmes(id, name, status)")
      .eq("stakeholder_id", stakeholderId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const links = (lp || []) as any as LinkedProgramme[];
    setLinkedProgrammes(links);

    // Contributions for each link
    if (links.length > 0) {
      const linkIds = links.map((l) => l.id);
      const { data: contribs } = await supabase
        .from("stakeholder_contributions")
        .select("*")
        .in("stakeholder_programme_id", linkIds)
        .order("date", { ascending: false });

      const grouped: Record<string, Contribution[]> = {};
      (contribs || []).forEach((c) => {
        if (!grouped[c.stakeholder_programme_id]) {
          grouped[c.stakeholder_programme_id] = [];
        }
        grouped[c.stakeholder_programme_id].push(c);
      });
      setContributions(grouped);
    }

    // Available programmes (not already linked)
    const linkedIds = links.map((l) => l.programme_id);
    let query = supabase.from("programmes").select("id, name").order("name");
    if (linkedIds.length > 0) {
      // Supabase doesn't have "not in" directly, so we filter client-side
    }
    const { data: allProgs } = await query;
    setAvailableProgrammes(
      (allProgs || []).filter((p) => !linkedIds.includes(p.id))
    );

    setIsLoading(false);
  }, [stakeholderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Link programme ──────────────────────────────────────────

  const handleLink = async () => {
    if (!selectedProgramme) return;
    setIsLinking(true);

    const supabase = createClient();
    const { error } = await supabase.from("stakeholder_programmes").insert({
      stakeholder_id: stakeholderId,
      programme_id: selectedProgramme,
      role: selectedRole,
      notes: linkNotes.trim() || null,
    });

    if (error) {
      console.error("Error linking programme:", error);
    } else {
      setShowLinkForm(false);
      setSelectedProgramme("");
      setLinkNotes("");
      fetchData();
      onDataChange?.();
    }
    setIsLinking(false);
  };

  // ── Unlink programme ────────────────────────────────────────

  const handleUnlink = async (linkId: string) => {
    const supabase = createClient();
    await supabase.from("stakeholder_programmes").delete().eq("id", linkId);
    fetchData();
    onDataChange?.();
  };

  // ── Add contribution ────────────────────────────────────────

  const handleAddContribution = async (linkId: string) => {
    if (!contribAmount) return;
    setIsSavingContrib(true);

    const supabase = createClient();
    const { error } = await supabase.from("stakeholder_contributions").insert({
      stakeholder_programme_id: linkId,
      type: contribType,
      amount: parseFloat(contribAmount) || null,
      currency: contribCurrency,
      date: contribDate || null,
      notes: contribNotes.trim() || null,
    });

    if (error) {
      console.error("Error adding contribution:", error);
    } else {
      setShowContribForm(null);
      setContribAmount("");
      setContribNotes("");
      fetchData();
    }
    setIsSavingContrib(false);
  };

  // ── Delete contribution ─────────────────────────────────────

  const handleDeleteContribution = async (contribId: string) => {
    const supabase = createClient();
    await supabase.from("stakeholder_contributions").delete().eq("id", contribId);
    fetchData();
  };

  // ── Render ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const isDonor = stakeholderType === "donor";

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <FolderKanban className="h-5 w-5" strokeWidth={1.5} />
          Linked Programmes
        </h2>
        {isManager && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLinkForm(!showLinkForm)}
            className="border-2 shadow-retro-sm"
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Link Programme
          </Button>
        )}
      </div>

      {/* Link form */}
      {showLinkForm && (
        <div className="mt-4 rounded-xl border-2 border-border bg-background p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Programme *
              </label>
              <select
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
              >
                <option value="">Select a programme...</option>
                {availableProgrammes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as StakeholderProgrammeRole)}
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
              >
                {Object.entries(PROGRAMME_ROLE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Notes
              </label>
              <Input
                value={linkNotes}
                onChange={(e) => setLinkNotes(e.target.value)}
                placeholder="e.g. Lead funder for Year 1"
                className="border-2 shadow-retro-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowLinkForm(false)} className="border-2 shadow-retro-sm">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleLink}
              disabled={!selectedProgramme || isLinking}
              className="border-2 border-foreground bg-foreground text-background shadow-retro"
            >
              {isLinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Link
            </Button>
          </div>
        </div>
      )}

      {/* Linked programmes list */}
      {linkedProgrammes.length === 0 ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Not linked to any programmes yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {linkedProgrammes.map((lp) => {
            const linkContribs = contributions[lp.id] || [];
            const totalAmount = linkContribs
              .filter((c) => c.amount)
              .reduce((sum, c) => sum + (c.amount || 0), 0);

            return (
              <div key={lp.id} className="rounded-xl border-2 border-border bg-background p-4">
                {/* Programme header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/programmes/${lp.programme_id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {lp.programme?.name || "Unknown Programme"}
                    </Link>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {PROGRAMME_ROLE_LABELS[lp.role] || lp.role}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {lp.programme?.status || "—"}
                    </span>
                  </div>
                  {isManager && (
                    <button
                      onClick={() => handleUnlink(lp.id)}
                      className="text-muted-foreground hover:text-red-500"
                      title="Unlink programme"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {lp.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">{lp.notes}</p>
                )}

                {/* Contributions (show for donors or funder role) */}
                {(isDonor || lp.role === "funder") && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                        <span className="font-mono text-xs font-medium text-muted-foreground">
                          Contributions
                        </span>
                        {totalAmount > 0 && (
                          <span className="font-mono text-xs font-bold text-foreground">
                            {formatCurrency(totalAmount, linkContribs[0]?.currency || "USD")}
                          </span>
                        )}
                      </div>
                      {isManager && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setShowContribForm(showContribForm === lp.id ? null : lp.id)
                          }
                          className="h-7 border px-2 text-[10px]"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      )}
                    </div>

                    {/* Add contribution form */}
                    {showContribForm === lp.id && (
                      <div className="mt-3 rounded-lg border border-border bg-card p-3">
                        <div className="grid gap-2 md:grid-cols-4">
                          <div>
                            <label className="mb-1 block font-mono text-[9px] uppercase text-muted-foreground">
                              Type
                            </label>
                            <select
                              value={contribType}
                              onChange={(e) => setContribType(e.target.value as ContributionType)}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none"
                            >
                              <option value="pledge">Pledge</option>
                              <option value="disbursement">Disbursement</option>
                              <option value="in_kind">In-Kind</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block font-mono text-[9px] uppercase text-muted-foreground">
                              Amount
                            </label>
                            <Input
                              type="number"
                              value={contribAmount}
                              onChange={(e) => setContribAmount(e.target.value)}
                              placeholder="50000"
                              className="h-8 border text-xs"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block font-mono text-[9px] uppercase text-muted-foreground">
                              Currency
                            </label>
                            <select
                              value={contribCurrency}
                              onChange={(e) => setContribCurrency(e.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none"
                            >
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="GBP">GBP</option>
                              <option value="NGN">NGN</option>
                              <option value="CHF">CHF</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block font-mono text-[9px] uppercase text-muted-foreground">
                              Date
                            </label>
                            <Input
                              type="date"
                              value={contribDate}
                              onChange={(e) => setContribDate(e.target.value)}
                              className="h-8 border text-xs"
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <Input
                            value={contribNotes}
                            onChange={(e) => setContribNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            className="h-8 border text-xs"
                          />
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowContribForm(null)}
                            className="h-7 text-[10px]"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAddContribution(lp.id)}
                            disabled={!contribAmount || isSavingContrib}
                            className="h-7 bg-foreground text-[10px] text-background"
                          >
                            {isSavingContrib ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Contributions list */}
                    {linkContribs.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {linkContribs.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase",
                                  c.type === "disbursement"
                                    ? "bg-foreground text-background"
                                    : c.type === "pledge"
                                      ? "border border-border text-foreground"
                                      : "bg-muted text-muted-foreground"
                                )}
                              >
                                {c.type.replace("_", " ")}
                              </span>
                              <span className="font-mono text-sm font-bold text-foreground">
                                {c.amount ? formatCurrency(c.amount, c.currency) : "—"}
                              </span>
                              {c.date && (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {new Date(c.date).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              )}
                              {c.notes && (
                                <span className="text-xs text-muted-foreground">
                                  — {c.notes}
                                </span>
                              )}
                            </div>
                            {isManager && (
                              <button
                                onClick={() => handleDeleteContribution(c.id)}
                                className="text-muted-foreground hover:text-red-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}