// DESTINATION: lib/types/stakeholder.ts
// WHY: Shared types for CRM module — stakeholders, contacts, interactions, contributions

export type StakeholderType =
  | "donor"
  | "partner"
  | "beneficiary"
  | "government"
  | "media"
  | "academic"
  | "corporate"
  | "other";

export type StakeholderStatus = "active" | "inactive" | "prospective";

export type InteractionType =
  | "meeting"
  | "call"
  | "email"
  | "note"
  | "visit"
  | "event";

export type ContributionType = "pledge" | "disbursement" | "in_kind";

export type StakeholderProgrammeRole =
  | "funder"
  | "technical_partner"
  | "implementing_partner"
  | "evaluator"
  | "beneficiary"
  | "advisor";

export interface Stakeholder {
  id: string;
  name: string;
  type: StakeholderType;
  category: string | null;
  status: StakeholderStatus;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  tags: string[];
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StakeholderContact {
  id: string;
  stakeholder_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

export interface StakeholderProgramme {
  id: string;
  stakeholder_id: string;
  programme_id: string;
  role: StakeholderProgrammeRole;
  notes: string | null;
  created_at: string;
}

export interface StakeholderContribution {
  id: string;
  stakeholder_programme_id: string;
  type: ContributionType;
  amount: number | null;
  currency: string;
  date: string | null;
  notes: string | null;
  created_at: string;
}

export interface StakeholderInteraction {
  id: string;
  stakeholder_id: string;
  type: InteractionType;
  title: string;
  description: string | null;
  date: string;
  follow_up_date: string | null;
  follow_up_done: boolean;
  attachments: Record<string, unknown>[];
  logged_by: string;
  created_at: string;
}

// ── Display helpers ──────────────────────────────────────────

export const STAKEHOLDER_TYPE_LABELS: Record<StakeholderType, string> = {
  donor: "Donor",
  partner: "Partner",
  beneficiary: "Beneficiary",
  government: "Government",
  media: "Media",
  academic: "Academic",
  corporate: "Corporate",
  other: "Other",
};

export const STAKEHOLDER_STATUS_LABELS: Record<StakeholderStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  prospective: "Prospective",
};

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  meeting: "Meeting",
  call: "Call",
  email: "Email",
  note: "Note",
  visit: "Visit",
  event: "Event",
};

export const PROGRAMME_ROLE_LABELS: Record<StakeholderProgrammeRole, string> = {
  funder: "Funder",
  technical_partner: "Technical Partner",
  implementing_partner: "Implementing Partner",
  evaluator: "Evaluator",
  beneficiary: "Beneficiary",
  advisor: "Advisor",
};

// ── Engagement score (based on last interaction) ─────────────

export type EngagementLevel = "hot" | "warm" | "cooling" | "cold";

export function getEngagementLevel(lastInteractionDate: string | null): EngagementLevel {
  if (!lastInteractionDate) return "cold";
  const days = Math.floor(
    (Date.now() - new Date(lastInteractionDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 14) return "hot";
  if (days <= 30) return "warm";
  if (days <= 60) return "cooling";
  return "cold";
}

export const ENGAGEMENT_LABELS: Record<EngagementLevel, string> = {
  hot: "Hot",
  warm: "Warm",
  cooling: "Cooling",
  cold: "Cold",
};

export const ENGAGEMENT_COLORS: Record<EngagementLevel, string> = {
  hot: "bg-foreground",
  warm: "bg-foreground/70",
  cooling: "bg-foreground/40",
  cold: "bg-foreground/15",
};