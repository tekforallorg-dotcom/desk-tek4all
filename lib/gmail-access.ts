import { SupabaseClient } from "@supabase/supabase-js";

export async function checkSharedMailAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<{ authorized: boolean; role: string | null }> {
  // 1. Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile && ["admin", "super_admin"].includes(profile.role)) {
    return { authorized: true, role: profile.role };
  }

  // 2. Fallback: check shared_mail_admin group membership
  const { data: groupMemberships } = await supabase
    .from("group_members")
    .select("group:groups(name)")
    .eq("user_id", userId);

  const groupNames: string[] = [];
  if (groupMemberships) {
    for (const gm of groupMemberships) {
      const group = gm.group as unknown;
      if (Array.isArray(group) && group[0]?.name) {
        groupNames.push(group[0].name);
      } else if (group && typeof group === "object" && "name" in group) {
        groupNames.push((group as { name: string }).name);
      }
    }
  }

  if (groupNames.includes("shared_mail_admin")) {
    return { authorized: true, role: profile?.role ?? null };
  }

  return { authorized: false, role: profile?.role ?? null };
}