// app/lib/queries/invite-codes.ts
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface InviteCodeRow {
  code: string;
  owner_user_id: string | null;
  label: string | null;
  max_uses: number;
  use_count: number;
  revoked: boolean;
  created_at: string;
}

export interface InviteCodeWithOwner extends InviteCodeRow {
  owner_username: string | null;
}

export async function getMyInviteCode(userId: string): Promise<InviteCodeRow | null> {
  const sr = serviceRoleClient();
  const { data, error } = await (sr.from("invite_codes") as any)
    .select("code, owner_user_id, label, max_uses, use_count, revoked, created_at")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getAllInviteCodes(): Promise<InviteCodeWithOwner[]> {
  const sr = serviceRoleClient();
  const { data: codes, error } = await (sr.from("invite_codes") as any)
    .select("code, owner_user_id, label, max_uses, use_count, revoked, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!codes?.length) return [];

  const ownerIds: string[] = [...new Set(
    (codes as InviteCodeRow[]).filter(c => c.owner_user_id).map(c => c.owner_user_id as string)
  )];

  let usernameMap = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profiles } = await sr
      .from("profiles")
      .select("id, username")
      .in("id", ownerIds);
    if (profiles) {
      usernameMap = new Map(profiles.map(p => [p.id, p.username]));
    }
  }

  return (codes as InviteCodeRow[]).map(c => ({
    ...c,
    owner_username: c.owner_user_id ? (usernameMap.get(c.owner_user_id) ?? null) : null,
  }));
}
