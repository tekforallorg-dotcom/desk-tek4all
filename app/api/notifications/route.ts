import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications
 * 
 * Get notifications for current user
 * Query params:
 *   - unread_only: "true" to filter only unread
 *   - limit: number of notifications (default 20, max 50)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get("unread_only") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    let query = supabase
      .from("notifications")
      .select(`
        id,
        type,
        title,
        body,
        href,
        entity_type,
        entity_id,
        actor_id,
        is_read,
        created_at
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error("Error fetching notifications:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    // Get actor profiles
    const actorIds = [...new Set(
      notifications
        .filter((n) => n.actor_id)
        .map((n) => n.actor_id as string)
    )];

    let actors: Record<string, { full_name: string | null; username: string }> = {};

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", actorIds);

      if (profiles) {
        profiles.forEach((p) => {
          actors[p.id] = { full_name: p.full_name, username: p.username };
        });
      }
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    // Attach actor info
    const notificationsWithActors = notifications.map((n) => ({
      ...n,
      actor: n.actor_id ? actors[n.actor_id] || null : null,
    }));

    return NextResponse.json({
      notifications: notificationsWithActors,
      unread_count: unreadCount || 0,
    });

  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications
 * 
 * Mark notifications as read
 * Body: { notification_ids: string[] } or { mark_all_read: true }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notification_ids, mark_all_read } = body;

    if (mark_all_read) {
      // Mark all as read
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        console.error("Error marking all as read:", error);
        return NextResponse.json(
          { error: "Failed to mark notifications as read" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, marked_count: "all" });
    }

    if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
      return NextResponse.json(
        { error: "notification_ids array or mark_all_read required" },
        { status: 400 }
      );
    }

    // Mark specific notifications as read
    const { error, count } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", notification_ids);

    if (error) {
      console.error("Error marking as read:", error);
      return NextResponse.json(
        { error: "Failed to mark notifications as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, marked_count: count });

  } catch (error) {
    console.error("Notifications PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications
 * 
 * Delete notifications
 * Body: { notification_ids: string[] } or { delete_all_read: true }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notification_ids, delete_all_read } = body;

    if (delete_all_read) {
      // Delete all read notifications
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .eq("is_read", true);

      if (error) {
        console.error("Error deleting read notifications:", error);
        return NextResponse.json(
          { error: "Failed to delete notifications" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
      return NextResponse.json(
        { error: "notification_ids array or delete_all_read required" },
        { status: 400 }
      );
    }

    // Delete specific notifications
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id)
      .in("id", notification_ids);

    if (error) {
      console.error("Error deleting notifications:", error);
      return NextResponse.json(
        { error: "Failed to delete notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Notifications DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}