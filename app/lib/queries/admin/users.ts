import { serviceRoleClient } from "@/lib/supabase/service-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminUserRow {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  staff_role: "admin" | "reviewer" | null;
}

const PAGE_SIZE = 20;

export async function listUsersForAdmin(
  q: string,
  page: number,
): Promise<{ rows: AdminUserRow[]; total: number; pageSize: number }> {
  const sb = serviceRoleClient();
  const trimmed = q.trim();

  // profile filter based on input shape
  let profileQuery = sb
    .from("profiles")
    .select("id, username, display_name, avatar_url", { count: "exact" });

  if (trimmed) {
    if (UUID_RE.test(trimmed)) {
      profileQuery = profileQuery.eq("id", trimmed);
    } else if (!trimmed.includes("@")) {
      profileQuery = profileQuery.or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`);
    }
    // Email is handled below via auth.users admin API (cross-schema).
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: profiles, count, error } = await profileQuery.order("username").range(from, to);
  if (error) throw error;

  const ids = (profiles ?? []).map(p => p.id);
  if (ids.length === 0 && !(trimmed && trimmed.includes("@"))) {
    return { rows: [], total: count ?? 0, pageSize: PAGE_SIZE };
  }

  // Fetch auth metadata in bulk via admin listUsers; filter to the ids we have.
  // listUsers is paginated at 1000/page which is plenty for the test-volume sizes we care about.
  const { data: authList, error: authErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authErr) throw authErr;

  // Email-search path: if q is email-shaped, override profile filter with auth email matches.
  let authMap = new Map(authList.users.map(u => [u.id, u]));
  let effectiveProfiles = profiles ?? [];
  let effectiveCount = count ?? 0;

  if (trimmed && trimmed.includes("@")) {
    const matchingIds = new Set(authList.users.filter(u => (u.email ?? "").toLowerCase().includes(trimmed.toLowerCase())).map(u => u.id));
    effectiveCount = matchingIds.size;
    const { data: emailProfiles } = await sb
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", Array.from(matchingIds).slice(0, 1000));
    effectiveProfiles = (emailProfiles ?? []).slice(from, to + 1);
  }

  const staffRows = effectiveProfiles.length
    ? (await sb.from("staff").select("user_id, role").in("user_id", effectiveProfiles.map(p => p.id))).data ?? []
    : [];
  const staffMap = new Map(staffRows.map(s => [s.user_id, s.role as "admin" | "reviewer"]));

  const rows: AdminUserRow[] = effectiveProfiles.map(p => {
    const au = authMap.get(p.id);
    return {
      id: p.id,
      email: au?.email ?? null,
      username: p.username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      created_at: au?.created_at ?? "",
      last_sign_in_at: au?.last_sign_in_at ?? null,
      staff_role: staffMap.get(p.id) ?? null,
    };
  });

  return { rows, total: effectiveCount, pageSize: PAGE_SIZE };
}

export async function getUserForAdmin(id: string): Promise<AdminUserRow & { bio: string | null; identities: string[] } | null> {
  const sb = serviceRoleClient();
  const { data: profile } = await sb.from("profiles").select("id, username, display_name, avatar_url, bio").eq("id", id).maybeSingle();
  if (!profile) return null;
  const { data: authInfo } = await sb.auth.admin.getUserById(id);
  const { data: staffRow } = await sb.from("staff").select("role").eq("user_id", id).maybeSingle();
  return {
    id,
    email: authInfo?.user?.email ?? null,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    bio: profile.bio ?? null,
    created_at: authInfo?.user?.created_at ?? "",
    last_sign_in_at: authInfo?.user?.last_sign_in_at ?? null,
    identities: (authInfo?.user?.identities ?? []).map(i => i.provider),
    staff_role: (staffRow?.role as "admin" | "reviewer" | null) ?? null,
  };
}
