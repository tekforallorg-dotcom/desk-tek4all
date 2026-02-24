// DESTINATION: app/(dashboard)/radar/page.tsx
// WHY: Opportunity Radar — group-gated, onClick card navigation (no nested <a>)

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Radar,
  Search,
  ArrowUpDown,
  Filter,
  X,
  Calendar,
  DollarSign,
  Globe,
  AlertTriangle,
  Zap,
  Settings,
  Rss,
  Loader2,
  Trash2,
  ExternalLink,
  Target,
  Shield,
  Users,
  Lock,
  TrendingUp,
  Clock,
  BarChart3,
  Sparkles,
  ScanLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRadarRole } from "@/lib/hooks/use-radar-role";
import { RadarGroupManager } from "@/components/radar/group-manager";
import type {
  Opportunity,
  OpportunityStage,
  OpportunityType,
  RadarSource,
  SourceType,
} from "@/lib/types/opportunity";
import {
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_COLORS,
  OPPORTUNITY_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  MISSION_ALIGNMENT_LABELS,
  QUALIFICATION_STATUS_LABELS,
  formatFundingRange,
  getDaysUntilDeadline,
  getDeadlineUrgency,
} from "@/lib/types/opportunity";

// ── Page ──────────────────────────────────────────────────────

export default function RadarPage() {
  const { role, isLoading: roleLoading, isAdmin, isEditor, isViewer, hasAccess } = useRadarRole();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<OpportunityStage | "all">("all");
  const [filterType, setFilterType] = useState<OpportunityType | "all">("all");
  const [sortBy, setSortBy] = useState<"latest" | "deadline" | "amount">("latest");
  const [showFilters, setShowFilters] = useState(false);

  // Panels
  const [showSources, setShowSources] = useState(false);
  const [showAddOpp, setShowAddOpp] = useState(false);
  const [showGroup, setShowGroup] = useState(false);

  // Add source form
  const [srcName, setSrcName] = useState("");
  const [srcType, setSrcType] = useState<SourceType>("rss");
  const [srcUrl, setSrcUrl] = useState("");
  const [isSavingSrc, setIsSavingSrc] = useState(false);

  // Add opportunity form
  const [oppTitle, setOppTitle] = useState("");
  const [oppType, setOppType] = useState<OpportunityType>("grant");
  const [oppFunder, setOppFunder] = useState("");
  const [oppSummary, setOppSummary] = useState("");
  const [oppAmountMin, setOppAmountMin] = useState("");
  const [oppAmountMax, setOppAmountMax] = useState("");
  const [oppCurrency, setOppCurrency] = useState("USD");
  const [oppDeadline, setOppDeadline] = useState("");
  const [oppRegion, setOppRegion] = useState("");
  const [oppUrl, setOppUrl] = useState("");
  const [oppEligibility, setOppEligibility] = useState("");
  const [oppTagInput, setOppTagInput] = useState("");
  const [oppTags, setOppTags] = useState<string[]>([]);
  const [isSavingOpp, setIsSavingOpp] = useState(false);
  const [oppErrors, setOppErrors] = useState<Record<string, string>>({});

  // Scan engine
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    stats?: { sources: number; fetched: number; new: number; classified: number; inserted: number; errors: number; duration_ms: number };
    error?: string;
  } | null>(null);

  // ── Scan handler ────────────────────────────────────────────

  const handleScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setScanResult({ success: false, error: "Not authenticated" });
        setIsScanning(false);
        return;
      }

      const res = await fetch("/api/radar/scan", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setScanResult(data);
      if (data.success) fetchData(); // Refresh opportunities
    } catch (err) {
      setScanResult({ success: false, error: String(err) });
    }
    setIsScanning(false);
  };

  // ── Fetch ───────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!hasAccess && !roleLoading) {
      setIsLoading(false);
      return;
    }
    const supabase = createClient();
    const [{ data: oppData }, { data: srcData }] = await Promise.all([
      supabase.from("opportunities").select("*").order("created_at", { ascending: false }),
      supabase.from("radar_sources").select("*").order("name"),
    ]);
    setOpportunities(oppData || []);
    setSources(srcData || []);
    setIsLoading(false);
  }, [hasAccess, roleLoading]);

  useEffect(() => {
    if (!roleLoading) fetchData();
  }, [roleLoading, fetchData]);

  // ── Filter & sort ───────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...opportunities];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.funder_org?.toLowerCase().includes(q) ||
          o.summary?.toLowerCase().includes(q) ||
          o.sector.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (filterStage !== "all") result = result.filter((o) => o.stage === filterStage);
    if (filterType !== "all") result = result.filter((o) => o.type === filterType);

    result.sort((a, b) => {
      if (sortBy === "deadline") {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === "amount") {
        return (b.amount_max || b.amount_min || 0) - (a.amount_max || a.amount_min || 0);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [opportunities, searchQuery, filterStage, filterType, sortBy]);

  const activeFilterCount = [filterStage !== "all", filterType !== "all"].filter(Boolean).length;
  const clearFilters = () => { setFilterStage("all"); setFilterType("all"); setSearchQuery(""); };

  // ── Add source ──────────────────────────────────────────────

  const handleAddSource = async () => {
    if (!srcName.trim()) return;
    setIsSavingSrc(true);
    const supabase = createClient();
    const { error } = await supabase.from("radar_sources").insert({
      name: srcName.trim(),
      type: srcType,
      url: srcUrl.trim() || null,
      scrape_config: {},
      is_active: true,
      frequency: "daily",
      error_count: 0,
    });
    if (error) console.error("Error adding source:", error.message);
    else { setSrcName(""); setSrcUrl(""); }
    setIsSavingSrc(false);
    fetchData();
  };

  const handleDeleteSource = async (id: string) => {
    const supabase = createClient();
    await supabase.from("radar_sources").delete().eq("id", id);
    fetchData();
  };

  const handleToggleSource = async (id: string, currentActive: boolean) => {
    const supabase = createClient();
    await supabase.from("radar_sources").update({ is_active: !currentActive }).eq("id", id);
    fetchData();
  };

  // ── Add opportunity ─────────────────────────────────────────

  const addOppTag = () => {
    const trimmed = oppTagInput.trim().toLowerCase();
    if (trimmed && !oppTags.includes(trimmed)) setOppTags([...oppTags, trimmed]);
    setOppTagInput("");
  };

  const handleAddOpportunity = async () => {
    const errs: Record<string, string> = {};
    if (!oppTitle.trim()) errs.title = "Title is required";
    setOppErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsSavingOpp(true);
    const supabase = createClient();

    const regionArr = oppRegion.trim()
      ? oppRegion.split(",").map((r) => r.trim()).filter(Boolean)
      : [];

    const { error } = await supabase.from("opportunities").insert({
      title: oppTitle.trim(),
      type: oppType,
      stage: "new",
      funder_org: oppFunder.trim() || null,
      summary: oppSummary.trim() || null,
      amount_min: oppAmountMin ? parseFloat(oppAmountMin) : null,
      amount_max: oppAmountMax ? parseFloat(oppAmountMax) : null,
      currency: oppCurrency,
      deadline: oppDeadline || null,
      region: regionArr,
      source: "manual",
      source_url: oppUrl.trim() || null,
      eligibility: oppEligibility.trim() || null,
      sector: oppTags,
    });

    if (error) {
      console.error("Error creating opportunity:", error.message, error.details, error.hint);
    } else {
      setOppTitle(""); setOppFunder(""); setOppSummary("");
      setOppAmountMin(""); setOppAmountMax(""); setOppDeadline("");
      setOppRegion(""); setOppUrl(""); setOppEligibility("");
      setOppTags([]); setShowAddOpp(false);
      fetchData();
    }
    setIsSavingOpp(false);
  };

  // ── Pipeline stats ──────────────────────────────────────────

  const pipelineStats = useMemo(() => {
    const counts: Partial<Record<OpportunityStage, number>> = {};
    opportunities.forEach((o) => { counts[o.stage] = (counts[o.stage] || 0) + 1; });
    return counts;
  }, [opportunities]);

  const pipelineStages: OpportunityStage[] = ["new", "reviewing", "preparing", "submitted", "shortlisted", "awarded"];

  // ── Dashboard stats ─────────────────────────────────────────

  const dashboardStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const total = opportunities.length;

    const newToday = opportunities.filter((o) => {
      const created = o.created_at?.split("T")[0];
      return created === todayStr;
    }).length;

    const closingSoon = opportunities.filter((o) => {
      if (!o.deadline) return false;
      const days = getDaysUntilDeadline(o.deadline);
      return days !== null && days >= 0 && days <= 7;
    }).length;

    const highMatch = opportunities.filter(
      (o) => o.mission_alignment === "high"
    ).length;

    const activeStages: OpportunityStage[] = ["new", "reviewing", "preparing", "submitted", "shortlisted"];
    const pipelineValue = opportunities
      .filter((o) => activeStages.includes(o.stage))
      .reduce((sum, o) => sum + (o.amount_max || o.amount_min || 0), 0);

    const pipelineCurrency = opportunities.find(
      (o) => activeStages.includes(o.stage) && (o.amount_max || o.amount_min)
    )?.currency || "USD";

    return { total, newToday, closingSoon, highMatch, pipelineValue, pipelineCurrency };
  }, [opportunities]);

  // ── Loading state ───────────────────────────────────────────

  if (roleLoading) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── No access state ─────────────────────────────────────────

  if (!hasAccess) {
    return (
      <div className="flex min-h-125 flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
          <Lock className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-foreground">Access Required</h1>
        <p className="mt-2 max-w-sm font-mono text-sm text-muted-foreground">
          You don&apos;t have access to the Opportunity Radar. Ask a radar admin or platform administrator to add you to the group.
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Opportunity Radar</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Funding opportunities, grants, and partnerships.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/radar/pipeline">
            <Button variant="outline" className="border-2 shadow-retro-sm">
              <Radar className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Pipeline
            </Button>
          </Link>
          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => { setShowGroup(!showGroup); if (!showGroup) { setShowSources(false); } }}
                className={cn("border-2 shadow-retro-sm", showGroup && "border-foreground")}
              >
                <Users className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Group
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowSources(!showSources); if (!showSources) { setShowGroup(false); } }}
                className="border-2 shadow-retro-sm"
              >
                <Settings className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Sources
                {sources.length > 0 && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">({sources.length})</span>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleScan}
                disabled={isScanning || sources.length === 0}
                className={cn("border-2 shadow-retro-sm", isScanning && "animate-pulse")}
              >
                {isScanning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <ScanLine className="mr-2 h-4 w-4" strokeWidth={1.5} />
                )}
                {isScanning ? "Scanning..." : "Scan Now"}
              </Button>
            </>
          )}
          {isEditor && (
            <Button
              onClick={() => setShowAddOpp(!showAddOpp)}
              className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Add Opportunity
            </Button>
          )}
        </div>
      </div>

      {/* Role indicator */}
      <div className="flex items-center gap-2">
        <span className={cn(
          "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider",
          role === "admin" ? "bg-foreground text-background" :
          role === "editor" ? "bg-foreground/80 text-background" :
          "bg-muted text-muted-foreground"
        )}>
          {role === "admin" && <Shield className="mr-1 inline h-3 w-3" strokeWidth={1.5} />}
          {role}
        </span>
      </div>

      {/* Group management panel */}
      {showGroup && isAdmin && <RadarGroupManager />}

      {/* Scan result banner */}
      {scanResult && (
        <div className={cn(
          "flex items-center justify-between rounded-2xl border-2 p-4",
          scanResult.success
            ? "border-foreground/20 bg-muted"
            : "border-red-300 bg-red-50"
        )}>
          <div className="flex items-center gap-3">
            {scanResult.success ? (
              <ScanLine className="h-5 w-5 text-foreground" strokeWidth={1.5} />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" strokeWidth={1.5} />
            )}
            <div>
              {scanResult.success && scanResult.stats ? (
                <p className="text-sm font-medium text-foreground">
                  Scan complete — {scanResult.stats.inserted || 0} new opportunit{(scanResult.stats.inserted || 0) !== 1 ? "ies" : "y"} added
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    ({scanResult.stats.fetched} fetched, {scanResult.stats.classified} classified, {(scanResult.stats.duration_ms / 1000).toFixed(1)}s)
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium text-red-600">
                  Scan failed: {scanResult.error || "Unknown error"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setScanResult(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Stats dashboard */}
      {opportunities.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <button
            onClick={() => { setFilterStage("all"); setFilterType("all"); setSearchQuery(""); }}
            className={cn(
              "rounded-2xl border-2 border-border bg-card p-4 text-left shadow-retro-sm transition-all hover-lift",
              filterStage === "all" && filterType === "all" && !searchQuery && "border-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{dashboardStats.total}</p>
          </button>

          <button
            onClick={() => { clearFilters(); setSortBy("latest"); }}
            className={cn(
              "rounded-2xl border-2 border-border bg-card p-4 text-left shadow-retro-sm transition-all hover-lift",
              dashboardStats.newToday > 0 && "border-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">New Today</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{dashboardStats.newToday}</p>
          </button>

          <button
            onClick={() => { clearFilters(); setSortBy("deadline"); }}
            className={cn(
              "rounded-2xl border-2 bg-card p-4 text-left shadow-retro-sm transition-all hover-lift",
              dashboardStats.closingSoon > 0
                ? "border-red-300 bg-red-50"
                : "border-border"
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className={cn("h-4 w-4", dashboardStats.closingSoon > 0 ? "text-red-500" : "text-muted-foreground")} strokeWidth={1.5} />
              <span className={cn("font-mono text-[10px] font-medium uppercase tracking-wider", dashboardStats.closingSoon > 0 ? "text-red-500" : "text-muted-foreground")}>
                Closing Soon
              </span>
            </div>
            <p className={cn("mt-2 text-2xl font-bold", dashboardStats.closingSoon > 0 ? "text-red-600" : "text-foreground")}>
              {dashboardStats.closingSoon}
            </p>
            <p className="font-mono text-[9px] text-muted-foreground">≤ 7 days</p>
          </button>

          <button
            onClick={() => { /* Would filter to high-match — future enhancement */ }}
            className="rounded-2xl border-2 border-border bg-card p-4 text-left shadow-retro-sm transition-all hover-lift"
          >
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">High Match</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{dashboardStats.highMatch}</p>
          </button>

          <button
            onClick={() => { clearFilters(); setSortBy("amount"); }}
            className="col-span-2 rounded-2xl border-2 border-border bg-card p-4 text-left shadow-retro-sm transition-all hover-lift sm:col-span-1"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pipeline Value</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {dashboardStats.pipelineValue > 0
                ? new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: dashboardStats.pipelineCurrency,
                    maximumFractionDigits: 0,
                  }).format(dashboardStats.pipelineValue)
                : "$0"
              }
            </p>
            <p className="font-mono text-[9px] text-muted-foreground">Active stages</p>
          </button>
        </div>
      )}

      {/* Pipeline pills */}
      {opportunities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pipelineStages.map(
            (stage) =>
              (pipelineStats[stage] || 0) > 0 && (
                <button
                  key={stage}
                  onClick={() => setFilterStage(filterStage === stage ? "all" : stage)}
                  className={cn(
                    "rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider transition-all",
                    filterStage === stage
                      ? "bg-foreground text-background shadow-retro-sm"
                      : "border border-border text-muted-foreground hover:border-foreground"
                  )}
                >
                  {OPPORTUNITY_STAGE_LABELS[stage]} ({pipelineStats[stage]})
                </button>
              )
          )}
        </div>
      )}

      {/* Sources panel */}
      {showSources && isAdmin && (
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Rss className="h-5 w-5" strokeWidth={1.5} />
            Radar Sources
          </h2>

          {sources.length > 0 && (
            <div className="mt-4 space-y-2">
              {sources.map((src) => (
                <div key={src.id} className="flex items-center justify-between rounded-xl border-2 border-border bg-background p-3">
                  <div className="flex items-center gap-3">
                    <Rss className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <div>
                      <span className="font-medium text-foreground">{src.name}</span>
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                        {SOURCE_TYPE_LABELS[src.type] || src.type}
                      </span>
                      {src.url && (
                        <span className="ml-2 max-w-50 truncate align-bottom text-xs text-muted-foreground inline-block">
                          {src.url}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleSource(src.id, src.is_active)}
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase",
                        src.is_active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {src.is_active ? "Active" : "Paused"}
                    </button>
                    <button onClick={() => handleDeleteSource(src.id)} className="text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Input value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="Source name" className="border-2 shadow-retro-sm" />
            <select value={srcType} onChange={(e) => setSrcType(e.target.value as SourceType)}
              className="rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none">
              {Object.entries(SOURCE_TYPE_LABELS).map(([val, label]) => (<option key={val} value={val}>{label}</option>))}
            </select>
            <div className="flex gap-2">
              <Input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="URL (optional)" className="border-2 shadow-retro-sm" />
              <Button onClick={handleAddSource} disabled={!srcName.trim() || isSavingSrc}
                className="shrink-0 border-2 border-foreground bg-foreground text-background shadow-retro">
                {isSavingSrc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add opportunity form */}
      {showAddOpp && isEditor && (
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
          <h2 className="text-lg font-bold text-foreground">Add Opportunity</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Title *</label>
              <Input value={oppTitle} onChange={(e) => setOppTitle(e.target.value)}
                placeholder="e.g. Climate Adaptation Fund — Round 3"
                className={cn("border-2 shadow-retro-sm", oppErrors.title && "border-red-400")} />
              {oppErrors.title && <p className="mt-1 text-xs text-red-500">{oppErrors.title}</p>}
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</label>
              <select value={oppType} onChange={(e) => setOppType(e.target.value as OpportunityType)}
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none">
                {Object.entries(OPPORTUNITY_TYPE_LABELS).map(([val, label]) => (<option key={val} value={val}>{label}</option>))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Funder / Organisation</label>
              <Input value={oppFunder} onChange={(e) => setOppFunder(e.target.value)} placeholder="e.g. Green Climate Fund" className="border-2 shadow-retro-sm" />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Min Amount</label>
              <Input type="number" value={oppAmountMin} onChange={(e) => setOppAmountMin(e.target.value)} placeholder="10000" className="border-2 shadow-retro-sm" />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Max Amount</label>
              <Input type="number" value={oppAmountMax} onChange={(e) => setOppAmountMax(e.target.value)} placeholder="100000" className="border-2 shadow-retro-sm" />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Currency</label>
              <select value={oppCurrency} onChange={(e) => setOppCurrency(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none">
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                <option value="NGN">NGN</option><option value="CHF">CHF</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Deadline</label>
              <Input type="date" value={oppDeadline} onChange={(e) => setOppDeadline(e.target.value)} className="border-2 shadow-retro-sm" />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Region(s) — comma-separated</label>
              <Input value={oppRegion} onChange={(e) => setOppRegion(e.target.value)} placeholder="e.g. Sub-Saharan Africa, East Africa" className="border-2 shadow-retro-sm" />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Source URL</label>
              <Input value={oppUrl} onChange={(e) => setOppUrl(e.target.value)} placeholder="https://..." className="border-2 shadow-retro-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Summary</label>
              <textarea value={oppSummary} onChange={(e) => setOppSummary(e.target.value)} rows={3}
                placeholder="Opportunity details, focus areas, key requirements..."
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Eligibility</label>
              <Input value={oppEligibility} onChange={(e) => setOppEligibility(e.target.value)} placeholder="e.g. Registered NGOs in West Africa" className="border-2 shadow-retro-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">Sector Tags</label>
              <div className="flex gap-2">
                <Input value={oppTagInput} onChange={(e) => setOppTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOppTag(); } }}
                  placeholder="Add tag and press Enter" className="border-2 shadow-retro-sm" />
                <Button type="button" variant="outline" onClick={addOppTag} className="border-2 shadow-retro-sm">Add</Button>
              </div>
              {oppTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {oppTags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                      {tag}
                      <button onClick={() => setOppTags(oppTags.filter((t) => t !== tag))} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddOpp(false)} className="border-2 shadow-retro-sm">Cancel</Button>
            <Button onClick={handleAddOpportunity} disabled={isSavingOpp}
              className="border-2 border-foreground bg-foreground text-background shadow-retro">
              {isSavingOpp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Opportunity
            </Button>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" placeholder="Search opportunities..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="border-2 pl-10 shadow-retro-sm" />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:outline-none">
            <option value="latest">Latest</option><option value="deadline">Deadline</option><option value="amount">Highest Amount</option>
          </select>
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}
          className={cn("border-2 shadow-retro-sm", activeFilterCount > 0 && "border-foreground")}>
          <Filter className="mr-2 h-4 w-4" strokeWidth={1.5} />Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">{activeFilterCount}</span>
          )}
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as OpportunityType | "all")}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:outline-none">
            <option value="all">All Types</option>
            {Object.entries(OPPORTUNITY_TYPE_LABELS).map(([val, label]) => (<option key={val} value={val}>{label}</option>))}
          </select>
          <select value={filterStage} onChange={(e) => setFilterStage(e.target.value as OpportunityStage | "all")}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-mono text-sm shadow-retro-sm focus:outline-none">
            <option value="all">All Stages</option>
            {Object.entries(OPPORTUNITY_STAGE_LABELS).map(([val, label]) => (<option key={val} value={val}>{label}</option>))}
          </select>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="border-2 shadow-retro-sm"><X className="mr-1 h-3 w-3" /> Clear</Button>
          )}
        </div>
      )}

      {/* Results count */}
      {!isLoading && (
        <p className="font-mono text-xs text-muted-foreground">
          {filtered.length} opportunit{filtered.length !== 1 ? "ies" : "y"}
          {activeFilterCount > 0 && " (filtered)"}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (<div key={i} className="h-48 animate-pulse rounded-2xl border-2 border-border bg-card" />))}
        </div>
      ) : filtered.length === 0 ? (
        opportunities.length === 0 ? <EmptyState /> : <NoResults onClear={clearFilters} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((opp) => (
            <OpportunityCard key={opp.id} opportunity={opp} isEditor={isEditor} onUpdate={fetchData} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Opportunity Card ──────────────────────────────────────────

function OpportunityCard({
  opportunity: opp,
  isEditor,
  onUpdate,
}: {
  opportunity: Opportunity;
  isEditor: boolean;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const deadlineUrgency = getDeadlineUrgency(opp.deadline);
  const daysLeft = getDaysUntilDeadline(opp.deadline);

  const handleStageChange = async (newStage: OpportunityStage) => {
    setIsUpdating(true);
    const supabase = createClient();
    await supabase.from("opportunities").update({ stage: newStage }).eq("id", opp.id);
    setIsUpdating(false);
    onUpdate();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest("select") || target.closest("button") || target.closest("[data-interactive]")) return;
    router.push(`/radar/${opp.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className="group cursor-pointer rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm transition-all hover-lift"
    >
      {/* Top: type + stage */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-muted px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {OPPORTUNITY_TYPE_LABELS[opp.type] || opp.type}
        </span>
        {isEditor ? (
          <select value={opp.stage} onChange={(e) => handleStageChange(e.target.value as OpportunityStage)}
            disabled={isUpdating}
            className={cn("rounded-full border-0 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider focus:outline-none cursor-pointer", OPPORTUNITY_STAGE_COLORS[opp.stage])}>
            {Object.entries(OPPORTUNITY_STAGE_LABELS).map(([val, label]) => (<option key={val} value={val}>{label}</option>))}
          </select>
        ) : (
          <span className={cn("rounded-full px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider", OPPORTUNITY_STAGE_COLORS[opp.stage])}>
            {OPPORTUNITY_STAGE_LABELS[opp.stage] || opp.stage}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-3 text-lg font-bold text-card-foreground">{opp.title}</h3>

      {/* Funder */}
      {opp.funder_org && <p className="mt-1 text-sm text-muted-foreground">{opp.funder_org}</p>}

      {/* Summary snippet */}
      {opp.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{opp.summary}</p>}

      {/* Meta */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {(opp.amount_min || opp.amount_max) && (
          <span className="flex items-center gap-1 font-mono font-bold text-foreground">
            <DollarSign className="h-3.5 w-3.5" strokeWidth={1.5} />
            {formatFundingRange(opp.amount_min, opp.amount_max, opp.currency)}
          </span>
        )}
        {opp.deadline && (
          <span className={cn("flex items-center gap-1 font-mono",
            deadlineUrgency === "urgent" && "font-bold text-red-500",
            deadlineUrgency === "soon" && "text-foreground",
            deadlineUrgency === "passed" && "text-muted-foreground line-through")}>
            {deadlineUrgency === "urgent" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {deadlineUrgency === "passed" ? "Expired" : `${daysLeft}d left`}
          </span>
        )}
        {opp.region.length > 0 && (
          <span className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5" strokeWidth={1.5} />
            {opp.region.join(", ")}
          </span>
        )}
      </div>

      {/* Mission alignment + qualification */}
      {(opp.mission_alignment || opp.qualification_status) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {opp.mission_alignment && (
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase",
              opp.mission_alignment === "high" ? "bg-foreground text-background" :
              opp.mission_alignment === "medium" ? "border border-border text-foreground" :
              "bg-muted text-muted-foreground")}>
              <Target className="h-3 w-3" strokeWidth={1.5} />
              {MISSION_ALIGNMENT_LABELS[opp.mission_alignment]}
            </span>
          )}
          {opp.qualification_status && (
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase",
              opp.qualification_status === "likely_qualify" ? "bg-foreground text-background" :
              opp.qualification_status === "partial_match" ? "border border-border text-foreground" :
              "bg-muted text-muted-foreground")}>
              <Shield className="h-3 w-3" strokeWidth={1.5} />
              {QUALIFICATION_STATUS_LABELS[opp.qualification_status]}
            </span>
          )}
        </div>
      )}

      {/* Source link — uses <span> with onClick to avoid nested <a> */}
      {opp.source_url && (
        <span
          data-interactive
          onClick={(e) => { e.stopPropagation(); window.open(opp.source_url!, "_blank", "noopener,noreferrer"); }}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} /> View Source
        </span>
      )}

      {/* Sector tags */}
      {opp.sector.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {opp.sector.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{tag}</span>
          ))}
          {opp.sector.length > 4 && (
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">+{opp.sector.length - 4}</span>
          )}
        </div>
      )}

      {/* Confidence score */}
      {opp.confidence !== null && opp.confidence > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${Math.round(opp.confidence * 100)}%` }} />
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold text-foreground">{Math.round(opp.confidence * 100)}%</span>
        </div>
      )}
    </div>
  );
}

// ── Empty / No Results ────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex min-h-100 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-background shadow-retro-sm">
        <Radar className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="mt-6 text-xl font-bold text-foreground">No opportunities yet</h2>
      <p className="mt-2 max-w-sm font-mono text-sm text-muted-foreground">
        Add funding opportunities manually or set up RSS sources to start tracking grants and partnerships.
      </p>
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-75 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <Search className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
      <h2 className="mt-4 text-lg font-bold text-foreground">No matching opportunities</h2>
      <p className="mt-2 font-mono text-sm text-muted-foreground">Try adjusting your filters.</p>
      <Button variant="outline" onClick={onClear} className="mt-4 border-2 shadow-retro-sm">Clear Filters</Button>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}