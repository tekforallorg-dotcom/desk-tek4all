// DESTINATION: components/crm/programme-stakeholders.tsx
// WHY: Reverse view — shows which stakeholders are linked to a programme, with roles and contribution totals

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Handshake, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PROGRAMME_ROLE_LABELS } from "@/lib/types/stakeholder";
import type { StakeholderProgrammeRole } from "@/lib/types/stakeholder";

interface LinkedStakeholder {
  id: string;
  stakeholder_id: string;
  role: StakeholderProgrammeRole;
  stakeholder: {
    id: string;
    name: string;
    type: string;
    status: string;
  } | null;
  total_contributed: number;
}

interface Props {
  programmeId: string;
}

export function ProgrammeStakeholders({ programmeId }: Props) {
  const [stakeholders, setStakeholders] = useState<LinkedStakeholder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Get linked stakeholders
    const { data: links } = await supabase
      .from("stakeholder_programmes")
      .select("id, stakeholder_id, role, stakeholder:stakeholders(id, name, type, status)")
      .eq("programme_id", programmeId);

    if (!links || links.length === 0) {
      setStakeholders([]);
      setIsLoading(false);
      return;
    }

    // Get contribution totals per link
    const linkIds = links.map((l) => l.id);
    const { data: contribs } = await supabase
      .from("stakeholder_contributions")
      .select("stakeholder_programme_id, amount")
      .in("stakeholder_programme_id", linkIds);

    const totals: Record<string, number> = {};
    (contribs || []).forEach((c) => {
      if (c.amount) {
        totals[c.stakeholder_programme_id] = (totals[c.stakeholder_programme_id] || 0) + c.amount;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (links as any[]).map((l) => ({
      ...l,
      total_contributed: totals[l.id] || 0,
    }));

    setStakeholders(result);
    setIsLoading(false);
  }, [programmeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro sm:p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
        <Handshake className="h-5 w-5" strokeWidth={1.5} />
        Stakeholders
        {stakeholders.length > 0 && (
          <span className="font-mono text-xs font-normal text-muted-foreground">
            ({stakeholders.length})
          </span>
        )}
      </h2>

      {stakeholders.length === 0 ? (
        <p className="mt-4 font-mono text-sm text-muted-foreground">
          No stakeholders linked yet. Link from the{" "}
          <Link href="/crm" className="underline hover:text-foreground">
            CRM
          </Link>
          .
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {stakeholders.map((s) => (
            <Link key={s.id} href={`/crm/${s.stakeholder_id}`}>
              <div className="flex items-center justify-between rounded-lg border border-border p-2 transition-all hover:border-foreground">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Handshake className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.stakeholder?.name || "Unknown"}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {PROGRAMME_ROLE_LABELS[s.role] || s.role}
                    </p>
                  </div>
                </div>
                {s.total_contributed > 0 && (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-foreground">
                    <DollarSign className="h-3 w-3" strokeWidth={1.5} />
                    {new Intl.NumberFormat("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(s.total_contributed)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}