// DESTINATION: lib/hooks/use-crm-role.ts
// WHY: Central permission hook for CRM — checks crm_group_members + platform admin bypass
// MIRRORS: lib/hooks/use-radar-role.ts (same 3-tier cascade)

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";

export type CrmRole = "admin" | "editor" | "viewer";

interface UseCrmRoleReturn {
  role: CrmRole | null;
  isLoading: boolean;
  /** Can manage group members + export CSV */
  isAdmin: boolean;
  /** Can CRUD stakeholders, contacts, interactions */
  isEditor: boolean;
  /** Can read + add notes only */
  isViewer: boolean;
  /** Has any access at all */
  hasAccess: boolean;
}

export function useCrmRole(): UseCrmRoleReturn {
  const { profile, user } = useAuth();
  const [role, setRole] = useState<CrmRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile) {
      setIsLoading(false);
      return;
    }

    // Platform super_admin/admin always get CRM admin access
    if (profile.role === "super_admin" || profile.role === "admin") {
      setRole("admin");
      setIsLoading(false);
      return;
    }

    // Check crm_group_members
    const checkMembership = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("crm_group_members")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (data?.role) {
        setRole(data.role as CrmRole);
      } else {
        setRole(null);
      }
      setIsLoading(false);
    };

    checkMembership();
  }, [user, profile]);

  // Cascading permissions: admin > editor > viewer
  const isAdmin = role === "admin";
  const isEditor = isAdmin || role === "editor";
  const isViewer = isEditor || role === "viewer";
  const hasAccess = role !== null;

  return { role, isLoading, isAdmin, isEditor, isViewer, hasAccess };
}