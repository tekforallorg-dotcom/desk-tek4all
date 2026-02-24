// DESTINATION: lib/hooks/use-radar-role.ts
// WHY: Central permission hook for Opportunity Radar — checks radar_group_members + platform admin bypass
// FIX: Waits for auth to fully load before resolving, prevents "Access Required" flash

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";

export type RadarRole = "admin" | "editor" | "viewer";

interface UseRadarRoleReturn {
  role: RadarRole | null;
  isLoading: boolean;
  /** Can manage group members + sources */
  isAdmin: boolean;
  /** Can CRUD opportunities + change status */
  isEditor: boolean;
  /** Can read + add notes/comments */
  isViewer: boolean;
  /** Has any access at all */
  hasAccess: boolean;
}

export function useRadarRole(): UseRadarRoleReturn {
  const { profile, user, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<RadarRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to fully resolve before checking access
    if (authLoading) return;

    if (!user || !profile) {
      setIsLoading(false);
      return;
    }

    // Platform super_admin/admin always get radar admin access
    if (profile.role === "super_admin" || profile.role === "admin") {
      setRole("admin");
      setIsLoading(false);
      return;
    }

    // Check radar_group_members
    const checkMembership = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("radar_group_members")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (data?.role) {
        setRole(data.role as RadarRole);
      } else {
        setRole(null);
      }
      setIsLoading(false);
    };

    checkMembership();
  }, [user, profile, authLoading]);

  // Cascading permissions: admin > editor > viewer
  const isAdmin = role === "admin";
  const isEditor = isAdmin || role === "editor";
  const isViewer = isEditor || role === "viewer";
  const hasAccess = role !== null;

  return { role, isLoading, isAdmin, isEditor, isViewer, hasAccess };
}