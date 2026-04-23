import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface PendingInvite {
  id: string;
  from_user_id: string;
  from: { handle: string; display_name: string | null; avatar_url: string | null };
  created_at: string;
}

export interface CovenMember {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type CovenState = "none" | "pending_outbound" | "pending_inbound" | "member";

export async function getPendingInvites(client: Client, userId: string): Promise<PendingInvite[]> {
  // Fetch pending requests first, then resolve sender profiles by id.
  // coven_requests has no FK to profiles (profiles.id references auth.users,
  // coven_requests.from_user_id also references auth.users) so we join in
  // two queries rather than a PostgREST embed.
  const { data: reqs, error } = await client
    .from("coven_requests")
    .select("id, from_user_id, created_at")
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!reqs || reqs.length === 0) return [];

  const senderIds = reqs.map(r => r.from_user_id);
  const { data: profiles } = await client
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", senderIds);
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return reqs
    .map(r => {
      const p = byId.get(r.from_user_id);
      if (!p) return null;
      return {
        id: r.id,
        from_user_id: r.from_user_id,
        from: { handle: p.handle, display_name: p.display_name, avatar_url: p.avatar_url },
        created_at: r.created_at,
      };
    })
    .filter((x): x is PendingInvite => x !== null);
}

export async function getMyCovenMembers(client: Client, userId: string): Promise<CovenMember[]> {
  const { data, error } = await client
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (error) throw error;
  const otherIds = (data ?? []).map(r => (r.user_a_id === userId ? r.user_b_id : r.user_a_id));
  if (otherIds.length === 0) return [];
  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", otherIds);
  if (pErr) throw pErr;
  return profiles ?? [];
}

export async function getPendingInviteCount(client: Client, userId: string): Promise<number> {
  const { count, error } = await client
    .from("coven_requests")
    .select("*", { count: "exact", head: true })
    .eq("to_user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function getCovenStateBetween(
  client: Client,
  viewerId: string,
  otherId: string,
): Promise<{ state: CovenState; requestId: string | null }> {
  if (viewerId === otherId) return { state: "none", requestId: null };
  const a = viewerId < otherId ? viewerId : otherId;
  const b = viewerId < otherId ? otherId : viewerId;
  const { data: member } = await client
    .from("coven_members")
    .select("user_a_id")
    .eq("user_a_id", a).eq("user_b_id", b).maybeSingle();
  if (member) return { state: "member", requestId: null };

  const { data: reqs } = await client
    .from("coven_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("status", "pending")
    .or(`and(from_user_id.eq.${viewerId},to_user_id.eq.${otherId}),and(from_user_id.eq.${otherId},to_user_id.eq.${viewerId})`);
  const r = (reqs ?? [])[0];
  if (!r) return { state: "none", requestId: null };
  if (r.from_user_id === viewerId) return { state: "pending_outbound", requestId: r.id };
  return { state: "pending_inbound", requestId: r.id };
}
