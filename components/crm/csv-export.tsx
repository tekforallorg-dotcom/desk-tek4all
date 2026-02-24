// DESTINATION: components/crm/csv-export.tsx
// WHY: Export stakeholder directory as CSV for reporting and sharing with external teams

"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  STAKEHOLDER_TYPE_LABELS,
  STAKEHOLDER_STATUS_LABELS,
  getEngagementLevel,
  ENGAGEMENT_LABELS,
} from "@/lib/types/stakeholder";
import type { StakeholderType, StakeholderStatus } from "@/lib/types/stakeholder";

export function CRMExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const supabase = createClient();

      // Fetch all stakeholders
      const { data: stakeholders, error } = await supabase
        .from("stakeholders")
        .select("*")
        .order("name");

      if (error || !stakeholders) {
        console.error("Export error:", error);
        setIsExporting(false);
        return;
      }

      // Fetch contact counts
      const ids = stakeholders.map((s) => s.id);
      const { data: contacts } = await supabase
        .from("stakeholder_contacts")
        .select("stakeholder_id")
        .in("stakeholder_id", ids);

      const contactCounts: Record<string, number> = {};
      (contacts || []).forEach((c) => {
        contactCounts[c.stakeholder_id] = (contactCounts[c.stakeholder_id] || 0) + 1;
      });

      // Fetch programme counts
      const { data: progs } = await supabase
        .from("stakeholder_programmes")
        .select("stakeholder_id")
        .in("stakeholder_id", ids);

      const progCounts: Record<string, number> = {};
      (progs || []).forEach((p) => {
        progCounts[p.stakeholder_id] = (progCounts[p.stakeholder_id] || 0) + 1;
      });

      // Fetch last interaction dates
      const { data: interactions } = await supabase
        .from("stakeholder_interactions")
        .select("stakeholder_id, date")
        .in("stakeholder_id", ids)
        .order("date", { ascending: false });

      const lastInt: Record<string, string> = {};
      (interactions || []).forEach((i) => {
        if (!lastInt[i.stakeholder_id]) {
          lastInt[i.stakeholder_id] = i.date;
        }
      });

      // Build CSV
      const headers = [
        "Name",
        "Type",
        "Category",
        "Status",
        "Email",
        "Phone",
        "Website",
        "Address",
        "Tags",
        "Contacts",
        "Programmes",
        "Engagement",
        "Last Interaction",
        "Created",
      ];

      const rows = stakeholders.map((s) => {
        const engagement = getEngagementLevel(lastInt[s.id] || null);
        return [
          escapeCsv(s.name),
          STAKEHOLDER_TYPE_LABELS[s.type as StakeholderType] || s.type,
          escapeCsv(s.category || ""),
          STAKEHOLDER_STATUS_LABELS[s.status as StakeholderStatus] || s.status,
          escapeCsv(s.email || ""),
          escapeCsv(s.phone || ""),
          escapeCsv(s.website || ""),
          escapeCsv(s.address || ""),
          escapeCsv((s.tags || []).join("; ")),
          String(contactCounts[s.id] || 0),
          String(progCounts[s.id] || 0),
          ENGAGEMENT_LABELS[engagement],
          lastInt[s.id]
            ? new Date(lastInt[s.id]).toLocaleDateString("en-GB")
            : "",
          new Date(s.created_at).toLocaleDateString("en-GB"),
        ];
      });

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      // Download
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `crm-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Unexpected export error:", err);
    }

    setIsExporting(false);
  };

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={isExporting}
      className="border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
    >
      {isExporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="mr-2 h-4 w-4" strokeWidth={1.5} />
      )}
      Export CSV
    </Button>
  );
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}