// DESTINATION: lib/types/opportunity.ts
// WHY: Shared types for Opportunity Radar — aligned to actual DB CHECK constraints

// DB CHECK: stage IN (new, reviewing, preparing, submitted, shortlisted, awarded, rejected, expired, archived)
export type OpportunityStage =
  | "new"
  | "reviewing"
  | "preparing"
  | "submitted"
  | "shortlisted"
  | "awarded"
  | "rejected"
  | "expired"
  | "archived";

// DB CHECK: type IN (grant, partnership, corporate_training, rfp, award, fellowship, other)
export type OpportunityType =
  | "grant"
  | "partnership"
  | "corporate_training"
  | "rfp"
  | "award"
  | "fellowship"
  | "other";

// DB CHECK: mission_alignment IN (high, medium, low)
export type MissionAlignment = "high" | "medium" | "low";

// DB CHECK: qualification_status IN (likely_qualify, partial_match, unlikely)
export type QualificationStatus = "likely_qualify" | "partial_match" | "unlikely";

export type SourceType = "rss" | "api" | "scrape" | "email" | "manual";

export interface Opportunity {
  id: string;
  title: string;
  source: string;                   // NOT NULL
  source_url: string | null;
  type: OpportunityType;
  funder_org: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string;
  deadline: string | null;
  region: string[];                 // text[]
  sector: string[];                 // text[]
  eligibility: string | null;
  summary: string | null;
  mission_alignment: MissionAlignment | null;
  qualification_status: QualificationStatus | null;
  action_recommended: string | null;
  confidence: number | null;        // numeric 0-1 (default 0.50)
  raw_content: string | null;
  stage: OpportunityStage;
  notes: string | null;
  stakeholder_id: string | null;
  discovered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RadarSource {
  id: string;
  name: string;
  type: SourceType;
  url: string | null;
  scrape_config: Record<string, unknown>;
  is_active: boolean;
  frequency: string | null;
  last_fetched_at: string | null;
  error_count: number;
  last_error: string | null;
  created_at: string;
}

// ── Display helpers ──────────────────────────────────────────

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  preparing: "Preparing",
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  awarded: "Awarded",
  rejected: "Rejected",
  expired: "Expired",
  archived: "Archived",
};

export const OPPORTUNITY_STAGE_COLORS: Record<OpportunityStage, string> = {
  new: "bg-foreground text-background",
  reviewing: "bg-foreground/80 text-background",
  preparing: "bg-foreground/70 text-background",
  submitted: "border border-foreground text-foreground",
  shortlisted: "bg-foreground/60 text-background",
  awarded: "bg-foreground text-background",
  rejected: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  grant: "Grant",
  partnership: "Partnership",
  corporate_training: "Corporate Training",
  rfp: "RFP",
  award: "Award",
  fellowship: "Fellowship",
  other: "Other",
};

export const MISSION_ALIGNMENT_LABELS: Record<MissionAlignment, string> = {
  high: "High Alignment",
  medium: "Medium Alignment",
  low: "Low Alignment",
};

export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  likely_qualify: "Likely Qualify",
  partial_match: "Partial Match",
  unlikely: "Unlikely",
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  rss: "RSS Feed",
  api: "API",
  scrape: "Web Scrape",
  email: "Email",
  manual: "Manual",
};

// ── Helpers ──────────────────────────────────────────────────

export function formatFundingRange(
  min: number | null,
  max: number | null,
  currency: string
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return "—";
}

export function getDaysUntilDeadline(deadline: string | null): number | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getDeadlineUrgency(deadline: string | null): "urgent" | "soon" | "normal" | "passed" | null {
  const days = getDaysUntilDeadline(deadline);
  if (days === null) return null;
  if (days < 0) return "passed";
  if (days <= 7) return "urgent";
  if (days <= 21) return "soon";
  return "normal";
}