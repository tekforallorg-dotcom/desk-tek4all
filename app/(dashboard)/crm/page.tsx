// DESTINATION: app/(dashboard)/crm/page.tsx
// WHY: CRM directory — stakeholder list with search, type/status filters, engagement dots, mobile-responsive cards

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Handshake,
  Search,
  ArrowUpDown,
  Building2,
  Mail,
  Phone,
  ExternalLink,
  Filter,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { CRMExportButton } from "@/components/crm/csv-export";
import type {
  Stakeholder,
  StakeholderType,
  StakeholderStatus,
  EngagementLevel,
} from "@/lib/types/stakeholder";
import {
  STAKEHOLDER_TYPE_LABELS,
  STAKEHOLDER_STATUS_LABELS,
  ENGAGEMENT_LABELS,
  ENGAGEMENT_COLORS,
  getEngagementLevel,
} from "@/lib/types/stakeholder";

// ── Extended type with computed fields ────────────────────────

interface StakeholderRow extends Stakeholder {
  contact_count: number;
  programme_count: number;
  last_interaction_date: string | null;
}

// ── Page Component ────────────────────────────────────────────

export default function CRMPage() {
  const { profile } = useAuth();
  const [stakeholders, setStakeholders] = useState<StakeholderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<StakeholderType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<StakeholderStatus | "all">("all");
  const [filterEngagement, setFilterEngagement] = useState<EngagementLevel | "all">("all");
  const [sortBy, setSortBy] = useState<"latest" | "alphabetical" | "engagement">("latest");
  const [showFilters, setShowFilters] = useState(false);

  const isManager = profile?.role && ["manager", "admin", "super_admin"].includes(profile.role);

  // ── Fetch stakeholders ──────────────────────────────────────

  const fetchStakeholders = useCallback(async () => {
    const supabase = createClient();

    // Fetch all stakeholders
    const { data: stakeholderData, error } = await supabase
      .from("stakeholders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching stakeholders:", error);
      setIsLoading(false);
      return;
    }

    const ids = (stakeholderData || []).map((s) => s.id);

    if (ids.length === 0) {
      setStakeholders([]);
      setIsLoading(false);
      return;
    }

    // Batch fetch contacts count
    const { data: contactsData } = await supabase
      .from("stakeholder_contacts")
      .select("stakeholder_id")
      .in("stakeholder_id", ids);

    const contactCounts: Record<string, number> = {};
    (contactsData || []).forEach((c) => {
      contactCounts[c.stakeholder_id] = (contactCounts[c.stakeholder_id] || 0) + 1;
    });

    // Batch fetch programme links count
    const { data: progData } = await supabase
      .from("stakeholder_programmes")
      .select("stakeholder_id")
      .in("stakeholder_id", ids);

    const progCounts: Record<string, number> = {};
    (progData || []).forEach((p) => {
      progCounts[p.stakeholder_id] = (progCounts[p.stakeholder_id] || 0) + 1;
    });

    // Batch fetch latest interaction per stakeholder
    const { data: interactionsData } = await supabase
      .from("stakeholder_interactions")
      .select("stakeholder_id, date")
      .in("stakeholder_id", ids)
      .order("date", { ascending: false });

    const lastInteraction: Record<string, string> = {};
    (interactionsData || []).forEach((i) => {
      if (!lastInteraction[i.stakeholder_id]) {
        lastInteraction[i.stakeholder_id] = i.date;
      }
    });

    // Merge
    const rows: StakeholderRow[] = (stakeholderData || []).map((s) => ({
      ...s,
      contact_count: contactCounts[s.id] || 0,
      programme_count: progCounts[s.id] || 0,
      last_interaction_date: lastInteraction[s.id] || null,
    }));

    setStakeholders(rows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchStakeholders();
  }, [fetchStakeholders]);

  // ── Filter & sort ───────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...stakeholders];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Type filter
    if (filterType !== "all") {
      result = result.filter((s) => s.type === filterType);
    }

    // Status filter
    if (filterStatus !== "all") {
      result = result.filter((s) => s.status === filterStatus);
    }

    // Engagement filter
    if (filterEngagement !== "all") {
      result = result.filter(
        (s) => getEngagementLevel(s.last_interaction_date) === filterEngagement
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "alphabetical") return a.name.localeCompare(b.name);
      if (sortBy === "engagement") {
        const order: Record<EngagementLevel, number> = { hot: 0, warm: 1, cooling: 2, cold: 3 };
        return (
          order[getEngagementLevel(a.last_interaction_date)] -
          order[getEngagementLevel(b.last_interaction_date)]
        );
      }
      // latest
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [stakeholders, searchQuery, filterType, filterStatus, filterEngagement, sortBy]);

  // ── Active filter count (for badge) ─────────────────────────

  const activeFilterCount = [
    filterType !== "all",
    filterStatus !== "all",
    filterEngagement !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterType("all");
    setFilterStatus("all");
    setFilterEngagement("all");
    setSearchQuery("");
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            CRM
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CRMExportButton />
          {isManager && (
            <Link href="/crm/new">
              <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Add Stakeholder
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name, email, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-2 pl-10 shadow-retro-sm"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:shadow-retro focus:outline-none"
          >
            <option value="latest">Latest</option>
            <option value="alphabetical">A → Z</option>
            <option value="engagement">Engagement</option>
          </select>
        </div>

        {/* Filter toggle */}
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5",
            activeFilterCount > 0 && "border-foreground"
          )}
        >
          <Filter className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Expandable filter row */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          {/* Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as StakeholderType | "all")}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:outline-none"
          >
            <option value="all">All Types</option>
            {Object.entries(STAKEHOLDER_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StakeholderStatus | "all")}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STAKEHOLDER_STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          {/* Engagement */}
          <select
            value={filterEngagement}
            onChange={(e) => setFilterEngagement(e.target.value as EngagementLevel | "all")}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:outline-none"
          >
            <option value="all">All Engagement</option>
            {Object.entries(ENGAGEMENT_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="border-2 shadow-retro-sm"
            >
              <X className="mr-1 h-3 w-3" strokeWidth={1.5} />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Results count */}
      {!isLoading && (
        <p className="font-mono text-xs text-muted-foreground">
          {filtered.length} stakeholder{filtered.length !== 1 ? "s" : ""}
          {activeFilterCount > 0 && " (filtered)"}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-2xl border-2 border-border bg-card"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        stakeholders.length === 0 ? (
          <EmptyState isManager={!!isManager} />
        ) : (
          <NoResults onClear={clearFilters} />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((stakeholder) => (
            <StakeholderCard key={stakeholder.id} stakeholder={stakeholder} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stakeholder Card ──────────────────────────────────────────

function StakeholderCard({ stakeholder }: { stakeholder: StakeholderRow }) {
  const engagement = getEngagementLevel(stakeholder.last_interaction_date);

  return (
    <Link href={`/crm/${stakeholder.id}`}>
      <div className="group rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm transition-all hover-lift">
        {/* Top row: type badge + engagement dot */}
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-muted px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {STAKEHOLDER_TYPE_LABELS[stakeholder.type]}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {ENGAGEMENT_LABELS[engagement]}
            </span>
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                ENGAGEMENT_COLORS[engagement]
              )}
              title={`Engagement: ${ENGAGEMENT_LABELS[engagement]}`}
            />
          </div>
        </div>

        {/* Name */}
        <h3 className="mt-4 text-lg font-bold text-card-foreground group-hover:text-foreground">
          {stakeholder.name}
        </h3>

        {/* Category */}
        {stakeholder.category && (
          <p className="mt-1 text-sm text-muted-foreground">{stakeholder.category}</p>
        )}

        {/* Status badge */}
        <div className="mt-2">
          <span
            className={cn(
              "inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
              stakeholder.status === "active"
                ? "bg-foreground text-background"
                : stakeholder.status === "prospective"
                  ? "border border-border bg-background text-foreground"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {STAKEHOLDER_STATUS_LABELS[stakeholder.status]}
          </span>
        </div>

        {/* Quick contact info */}
        <div className="mt-4 space-y-1">
          {stakeholder.email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" strokeWidth={1.5} />
              <span className="truncate">{stakeholder.email}</span>
            </div>
          )}
          {stakeholder.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" strokeWidth={1.5} />
              <span>{stakeholder.phone}</span>
            </div>
          )}
          {stakeholder.website && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
              <span className="truncate">{stakeholder.website}</span>
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            {stakeholder.contact_count} contact{stakeholder.contact_count !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <Handshake className="h-3.5 w-3.5" strokeWidth={1.5} />
            {stakeholder.programme_count} programme{stakeholder.programme_count !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Tags */}
        {stakeholder.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stakeholder.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {stakeholder.tags.length > 3 && (
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                +{stakeholder.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Empty State (no stakeholders at all) ──────────────────────

function EmptyState({ isManager }: { isManager: boolean }) {
  return (
    <div className="flex min-h-400px flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
        <Handshake className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="mt-6 text-xl font-bold text-foreground">
        No stakeholders yet
      </h2>
      <p className="mt-2 max-w-sm font-mono text-sm text-muted-foreground">
        Start building your stakeholder directory — track partners, donors, and
        key relationships.
      </p>
      {isManager && (
        <Link href="/crm/new" className="mt-6">
          <Button className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5">
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Add Stakeholder
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── No Results (filters active but no match) ──────────────────

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-300px flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <Search className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
      <h2 className="mt-4 text-lg font-bold text-foreground">
        No matching stakeholders
      </h2>
      <p className="mt-2 font-mono text-sm text-muted-foreground">
        Try adjusting your search or filters.
      </p>
      <Button
        variant="outline"
        onClick={onClear}
        className="mt-4 border-2 shadow-retro-sm"
      >
        Clear Filters
      </Button>
    </div>
  );
}

// ── Local cn helper ───────────────────────────────────────────

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}