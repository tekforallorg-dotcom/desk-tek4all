"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Plus, Trash2, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string;
  email: string;
  role: string;
}

interface HierarchyRelation {
  id: string;
  manager_id: string;
  report_id: string;
  report: UserProfile;
}

export default function HierarchyPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedManager, setSelectedManager] = useState<UserProfile | null>(null);
  const [reports, setReports] = useState<HierarchyRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddReport, setShowAddReport] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      // Get managers (managers, admins, super_admins)
      const { data: managersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email, role")
        .in("role", ["manager", "admin", "super_admin"])
        .order("full_name");

      setManagers(managersData || []);

      // Get all users
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, full_name, username, email, role")
        .order("full_name");

      setAllUsers(usersData || []);
      setIsLoading(false);
    };

    if (!authLoading && isAdmin) {
      fetchData();
    }
  }, [authLoading, isAdmin]);

  const fetchReports = async (managerId: string) => {
    const supabase = createClient();

    const { data: hierarchyData } = await supabase
      .from("hierarchy")
      .select("id, manager_id, report_id")
      .eq("manager_id", managerId);

    if (!hierarchyData || hierarchyData.length === 0) {
      setReports([]);
      return;
    }

    const reportIds = hierarchyData.map((h) => h.report_id);
    const { data: reportsData } = await supabase
      .from("profiles")
      .select("id, full_name, username, email, role")
      .in("id", reportIds);

    const reportsWithUsers: HierarchyRelation[] = hierarchyData.map((h) => ({
      id: h.id,
      manager_id: h.manager_id,
      report_id: h.report_id,
      report: reportsData?.find((r) => r.id === h.report_id) || {
        id: h.report_id,
        full_name: null,
        username: "",
        email: "",
        role: "",
      },
    }));

    setReports(reportsWithUsers);
  };

  const handleSelectManager = async (manager: UserProfile) => {
    setSelectedManager(manager);
    await fetchReports(manager.id);
  };

  const handleAddReport = async (userId: string) => {
    if (!selectedManager) return;

    const supabase = createClient();
    await supabase.from("hierarchy").insert({
      manager_id: selectedManager.id,
      report_id: userId,
    });

    await fetchReports(selectedManager.id);
    setShowAddReport(false);
  };

  const handleRemoveReport = async (hierarchyId: string) => {
    const supabase = createClient();
    await supabase.from("hierarchy").delete().eq("id", hierarchyId);

    if (selectedManager) {
      await fetchReports(selectedManager.id);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-border bg-card" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p>Access denied</p>
      </div>
    );
  }

  const existingReportIds = reports.map((r) => r.report_id);
  const availableReports = allUsers.filter(
    (u) => u.id !== selectedManager?.id && !existingReportIds.includes(u.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Team Tree
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Assign team members to their managers.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Managers List */}
        <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
          <h2 className="font-bold">Managers</h2>
          <div className="mt-4 space-y-2">
            {managers.map((manager) => (
              <button
                key={manager.id}
                onClick={() => handleSelectManager(manager)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  selectedManager?.id === manager.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground"
                }`}
              >
                <UserCog className="h-5 w-5" strokeWidth={1.5} />
                <div>
                  <p className="font-medium">
                    {manager.full_name || manager.username}
                  </p>
                  <p className="text-xs opacity-70">{manager.role}</p>
                </div>
              </button>
            ))}

            {managers.length === 0 && (
              <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                No managers found.
              </p>
            )}
          </div>
        </div>

        {/* Reports List */}
        {selectedManager && (
          <div className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">Direct Reports</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {selectedManager.full_name || selectedManager.username}
                </p>
              </div>
              <Button
                onClick={() => setShowAddReport(true)}
                size="sm"
                className="border-2 border-foreground bg-foreground text-background shadow-retro-sm"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {reports.length === 0 ? (
                <p className="py-8 text-center font-mono text-sm text-muted-foreground">
                  No direct reports assigned.
                </p>
              ) : (
                reports.map((relation) => (
                  <div
                    key={relation.id}
                    className="flex items-center justify-between rounded-xl border-2 border-border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {relation.report.full_name || relation.report.username}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {relation.report.email}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemoveReport(relation.id)}
                      className="h-8 w-8 border-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Report Modal */}
      {showAddReport && selectedManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/60"
            onClick={() => setShowAddReport(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-retro-lg">
            <h2 className="text-xl font-bold">Add Direct Report</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Assign someone to report to {selectedManager.full_name || selectedManager.username}
            </p>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {availableReports.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No available users to add.
                </p>
              ) : (
                availableReports.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAddReport(user.id)}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-3 text-left transition-all hover:border-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-muted font-mono text-xs">
                      {(user.full_name || user.email || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{user.full_name || "Unnamed"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAddReport(false)}
                className="border-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}