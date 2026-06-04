import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface AttendeeLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface GazingRoster {
  count: number;
  avatars: AttendeeLite[];
  viewerIsIn: boolean;
  viewerIsHost: boolean;
}

interface InviteRef {
  id: string;
  token: string;
  created_by: string;
}

export const EMPTY_ROSTER: GazingRoster = { count: 0, avatars: [], viewerIsIn: false, viewerIsHost: false };

export function buildRosterMap(
  invites: InviteRef[],
  attendees: { invite_id: string; user_id: string }[],
  profilesById: Map<string, AttendeeLite>,
  viewerId: string | null,
  maxAvatars: number,
): Map<string, GazingRoster> {
  const byInvite = new Map<string, { user_id: string }[]>();
  for (const attendee of attendees) {
    const rows = byInvite.get(attendee.invite_id) ?? [];
    rows.push(attendee);
    byInvite.set(attendee.invite_id, rows);
  }

  const out = new Map<string, GazingRoster>();
  for (const invite of invites) {
    const rows = byInvite.get(invite.id) ?? [];
    const avatars = rows
      .map(row => profilesById.get(row.user_id))
      .filter((profile): profile is AttendeeLite => Boolean(profile))
      .slice(0, maxAvatars);
    out.set(invite.token, {
      count: rows.length,
      avatars,
      viewerIsIn: viewerId != null && rows.some(row => row.user_id === viewerId),
      viewerIsHost: viewerId != null && invite.created_by === viewerId,
    });
  }
  return out;
}

async function fetchRosters(client: Client, invites: InviteRef[], viewerId: string | null): Promise<Map<string, GazingRoster>> {
  if (invites.length === 0) return new Map();
  const inviteIds = invites.map(invite => invite.id);

  const { data: attendeeRows, error } = await client
    .from("gazing_attendees")
    .select("invite_id, user_id")
    .in("invite_id", inviteIds);
  if (error) throw error;
  const attendees = attendeeRows ?? [];

  const userIds = Array.from(new Set(attendees.map(attendee => attendee.user_id)));
  const profilesById = new Map<string, AttendeeLite>();
  if (userIds.length > 0) {
    const { data: profiles, error: profileErr } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    if (profileErr) throw profileErr;
    for (const profile of profiles ?? []) profilesById.set(profile.id, profile as AttendeeLite);
  }

  return buildRosterMap(invites, attendees, profilesById, viewerId, 5);
}

export async function getGazingRostersForTokens(
  client: Client,
  tokens: string[],
  viewerId: string | null,
): Promise<Map<string, GazingRoster>> {
  const unique = Array.from(new Set(tokens));
  if (unique.length === 0) return new Map();

  const { data: inviteRows, error } = await client
    .from("gazing_invites")
    .select("id, token, created_by")
    .in("token", unique);
  if (error) throw error;
  return fetchRosters(client, (inviteRows ?? []) as InviteRef[], viewerId);
}

export async function getGazingRoster(client: Client, invite: InviteRef, viewerId: string | null): Promise<GazingRoster> {
  const map = await fetchRosters(client, [invite], viewerId);
  return map.get(invite.token) ?? EMPTY_ROSTER;
}
