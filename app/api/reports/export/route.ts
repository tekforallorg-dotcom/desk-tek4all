import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/reports/export?type=tasks|programmes|users&format=csv|json
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["admin", "super_admin", "manager"].includes(profile?.role || "")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "tasks";
  const format = searchParams.get("format") || "csv";
  const programmeId = searchParams.get("programme_id");
  const status = searchParams.get("status");
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  let data: any[] = [];
  let filename = "";

  try {
    switch (type) {
      case "tasks": {
        let query = supabase
          .from("tasks")
          .select("id, title, description, status, priority, due_date, created_at, updated_at, programme_id, created_by")
          .order("created_at", { ascending: false });

        if (programmeId) query = query.eq("programme_id", programmeId);
        if (status) query = query.eq("status", status);
        if (startDate) query = query.gte("created_at", startDate);
        if (endDate) query = query.lte("created_at", endDate);

        const { data: tasks, error } = await query;
        if (error) throw error;

        // Fetch programmes and creators separately
        const programmeIds = [...new Set((tasks || []).map((t) => t.programme_id).filter(Boolean))];
        const creatorIds = [...new Set((tasks || []).map((t) => t.created_by).filter(Boolean))];

        let programmesMap: Record<string, string> = {};
        let creatorsMap: Record<string, string> = {};

        if (programmeIds.length > 0) {
          const { data: programmes } = await supabase
            .from("programmes")
            .select("id, name")
            .in("id", programmeIds);
          if (programmes) {
            programmesMap = Object.fromEntries(programmes.map((p) => [p.id, p.name]));
          }
        }

        if (creatorIds.length > 0) {
          const { data: creators } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", creatorIds);
          if (creators) {
            creatorsMap = Object.fromEntries(creators.map((c) => [c.id, c.full_name || "Unknown"]));
          }
        }

        data = (tasks || []).map((t) => ({
          ID: t.id,
          Title: t.title,
          Description: t.description || "",
          Status: t.status,
          Priority: t.priority,
          "Due Date": t.due_date || "",
          Programme: programmesMap[t.programme_id] || "",
          "Created By": creatorsMap[t.created_by] || "",
          "Created At": t.created_at,
          "Updated At": t.updated_at,
        }));
        filename = `tasks_export_${new Date().toISOString().split("T")[0]}`;
        break;
      }

      case "programmes": {
        let query = supabase
          .from("programmes")
          .select("id, name, description, status, start_date, end_date, budget, created_at, manager_id")
          .order("created_at", { ascending: false });

        if (status) query = query.eq("status", status);
        if (startDate) query = query.gte("created_at", startDate);
        if (endDate) query = query.lte("created_at", endDate);

        const { data: programmes, error } = await query;
        if (error) throw error;

        // Fetch managers separately
        const managerIds = [...new Set((programmes || []).map((p) => p.manager_id).filter(Boolean))];
        let managersMap: Record<string, string> = {};

        if (managerIds.length > 0) {
          const { data: managers } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", managerIds);
          if (managers) {
            managersMap = Object.fromEntries(managers.map((m) => [m.id, m.full_name || "Unknown"]));
          }
        }

        data = (programmes || []).map((p) => ({
          ID: p.id,
          Name: p.name,
          Description: p.description || "",
          Status: p.status,
          "Start Date": p.start_date || "",
          "End Date": p.end_date || "",
          Budget: p.budget || "",
          Manager: managersMap[p.manager_id] || "",
          "Created At": p.created_at,
        }));
        filename = `programmes_export_${new Date().toISOString().split("T")[0]}`;
        break;
      }

      case "users": {
        const { data: users, error } = await supabase
          .from("profiles")
          .select("id, full_name, username, email, role, status, created_at")
          .order("created_at", { ascending: false });

        if (error) throw error;

        data = (users || []).map((u) => ({
          ID: u.id,
          "Full Name": u.full_name || "",
          Username: u.username,
          Email: u.email,
          Role: u.role,
          Status: u.status,
          "Created At": u.created_at,
        }));
        filename = `users_export_${new Date().toISOString().split("T")[0]}`;
        break;
      }

      case "activity": {
        let query = supabase
          .from("audit_logs")
          .select("id, action, entity_type, entity_id, details, created_at, user_id")
          .order("created_at", { ascending: false })
          .limit(1000);

        if (startDate) query = query.gte("created_at", startDate);
        if (endDate) query = query.lte("created_at", endDate);

        const { data: logs, error } = await query;
        if (error) throw error;

        // Fetch users separately
        const userIds = [...new Set((logs || []).map((l) => l.user_id).filter(Boolean))];
        let usersMap: Record<string, string> = {};

        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds);
          if (users) {
            usersMap = Object.fromEntries(users.map((u) => [u.id, u.full_name || "Unknown"]));
          }
        }

        data = (logs || []).map((l) => ({
          ID: l.id,
          Action: l.action,
          "Entity Type": l.entity_type,
          "Entity ID": l.entity_id,
          User: usersMap[l.user_id] || "",
          Details: JSON.stringify(l.details || {}),
          "Created At": l.created_at,
        }));
        filename = `activity_export_${new Date().toISOString().split("T")[0]}`;
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
    }

    // Audit the export
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "data_exported",
      entity_type: type,
      entity_id: user.id,
      details: { format, count: data.length },
    });

    if (format === "json") {
      return NextResponse.json(data);
    }

    // Generate CSV
    if (data.length === 0) {
      return new NextResponse("No data to export", {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      });
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            // Escape quotes and wrap in quotes if contains comma or newline
            const stringValue = String(value || "").replace(/"/g, '""');
            return stringValue.includes(",") || stringValue.includes("\n")
              ? `"${stringValue}"`
              : stringValue;
          })
          .join(",")
      ),
    ];

    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (err) {
    console.error("[Reports] Export error:", err);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}