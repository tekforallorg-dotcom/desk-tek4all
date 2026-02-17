export interface Programme {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProgrammeMember {
  id: string;
  programme_id: string;
  user_id: string;
  role: "owner" | "manager" | "member";
  created_at: string;
}

export type ProgrammeStatus = Programme["status"];

export const PROGRAMME_STATUS_LABELS: Record<ProgrammeStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export const PROGRAMME_STATUS_COLORS: Record<ProgrammeStatus, string> = {
  draft: "bg-muted-foreground",
  active: "bg-foreground",
  paused: "bg-muted-foreground",
  completed: "bg-foreground",
  archived: "bg-muted-foreground",
};