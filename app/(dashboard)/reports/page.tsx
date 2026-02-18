"use client";

import { useState } from "react";
import {
  FileDown,
  FileSpreadsheet,
  Users,
  FolderKanban,
  CheckSquare,
  Activity,
  Download,
  Loader2,
  Calendar,
  Filter,
} from "lucide-react";

type ExportType = "tasks" | "programmes" | "users" | "activity";
type ExportFormat = "csv" | "json";

interface ExportOption {
  id: ExportType;
  name: string;
  description: string;
  icon: React.ElementType;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: "tasks",
    name: "Tasks",
    description: "Export all tasks with status, priority, and assignments",
    icon: CheckSquare,
  },
  {
    id: "programmes",
    name: "Programmes",
    description: "Export all programmes with budgets and timelines",
    icon: FolderKanban,
  },
  {
    id: "users",
    name: "Users",
    description: "Export user directory with roles and status",
    icon: Users,
  },
  {
    id: "activity",
    name: "Activity Log",
    description: "Export audit trail and activity history",
    icon: Activity,
  },
];

const STATUS_OPTIONS: Record<ExportType, string[]> = {
  tasks: ["all", "todo", "in_progress", "done", "blocked"],
  programmes: ["all", "planning", "active", "completed", "on_hold"],
  users: [],
  activity: [],
};

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState<ExportType>("tasks");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setLastExport(null);

    try {
      const params = new URLSearchParams({
        type: selectedType,
        format,
      });

      if (status && status !== "all") params.set("status", status);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const res = await fetch(`/api/reports/export?${params.toString()}`);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }

      if (format === "csv") {
        // Download CSV file
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedType}_export_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // Download JSON file
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedType}_export_${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      setLastExport(
        `${EXPORT_OPTIONS.find((o) => o.id === selectedType)?.name} exported successfully!`
      );
    } catch (err) {
      console.error("Export error:", err);
      setLastExport(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedOption = EXPORT_OPTIONS.find((o) => o.id === selectedType);
  const hasStatusFilter = STATUS_OPTIONS[selectedType].length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
          <FileDown className="h-5 w-5 text-background" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Exports</h1>
          <p className="text-sm text-muted-foreground">
            Export your data in CSV or JSON format
          </p>
        </div>
      </div>

      {/* Export Type Selection */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <h2 className="text-lg font-bold mb-4">What to Export</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXPORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                setSelectedType(option.id);
                setStatus("all");
              }}
              className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                selectedType === option.id
                  ? "border-foreground bg-foreground/5 shadow-retro-sm"
                  : "border-border hover:border-foreground/50"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 ${
                  selectedType === option.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <option.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="font-semibold">{option.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-bold">Filters</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Status filter */}
          {hasStatusFilter && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              >
                {STATUS_OPTIONS[selectedType].map((s) => (
                  <option key={s} value={s}>
                    {s === "all"
                      ? "All Statuses"
                      : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Format */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Format
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("csv")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  format === "csv"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/50"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                CSV
              </button>
              <button
                onClick={() => setFormat("json")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  format === "json"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/50"
                }`}
              >
                <FileDown className="h-4 w-4" />
                JSON
              </button>
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              <Calendar className="inline h-3 w-3 mr-1" />
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              <Calendar className="inline h-3 w-3 mr-1" />
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>
      </div>

      {/* Export Preview & Action */}
      <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Export Summary</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedOption?.name} • {format.toUpperCase()} format
              {status !== "all" && ` • ${status.replace("_", " ")}`}
              {startDate && ` • From ${startDate}`}
              {endDate && ` • To ${endDate}`}
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background text-sm font-medium shadow-retro hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Exporting..." : "Download Export"}
          </button>
        </div>

        {lastExport && (
          <div
            className={`mt-4 rounded-xl border-2 px-4 py-3 text-sm ${
              lastExport.includes("failed")
                ? "border-red-200 bg-red-50 text-red-600"
                : "border-green-200 bg-green-50 text-green-600"
            }`}
          >
            {lastExport}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold mb-2">Export Tips</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• CSV files can be opened in Excel, Google Sheets, or any spreadsheet app</li>
          <li>• JSON format is useful for developers and data analysis tools</li>
          <li>• Use date filters to export data from a specific time period</li>
          <li>• Exports are logged in the activity audit trail</li>
        </ul>
      </div>
    </div>
  );
}