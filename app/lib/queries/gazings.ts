import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getGazingRostersForTokens,
  type GazingRoster,
  type GazingRosterWithStatus,
} from "@/lib/queries/gazing-roster";

type Client = SupabaseClient<Database>;
type GazingInviteRow = Database["public"]["Tables"]["gazing_invites"]["Row"];

export type GazingListRow = Pick<
  GazingInviteRow,
  | "id"
  | "token"
  | "created_by"
  | "film_id"
  | "film_title"
  | "poster_url"
  | "theater_name"
  | "starts_at"
  | "format_label"
  | "tickets_url"
  | "venue_kind"
  | "status"
  | "timezone_label"
  | "created_at"
>;

export interface GazingHost {
  id: string;
  username: string;
  avatar_url: string | null;
}

export type GazingViewerRole = "hosting" | "attending" | "summoned";

export interface GazingListItem {
  id: string;
  token: string;
  filmId: string | null;
  filmTitle: string;
  posterUrl: string | null;
  theaterName: string | null;
  startsAt: string;
  formatLabel: string | null;
  ticketsUrl: string | null;
  venueKind: "theater" | "home";
  status: "scheduled" | "happened";
  timezoneLabel: string;
  createdAt: string;
  host: GazingHost | null;
  roster: GazingRoster;
  role: GazingViewerRole;
}

export interface GazingSections {
  open: GazingListItem[];
  aftermath: GazingListItem[];
}

const GAZING_LIST_COLUMNS = "id, token, created_by, film_id, film_title, poster_url, theater_name, starts_at, format_label, tickets_url, venue_kind, status, timezone_label, created_at" as const;

function itemTime(item: GazingListItem): number {
  return new Date(item.startsAt).getTime();
}

export function partitionGazings(
  rows: GazingListRow[],
  rosterByToken: ReadonlyMap<string, GazingRosterWithStatus>,
  hostById: ReadonlyMap<string, GazingHost>,
  viewerId: string,
  now: Date,
): GazingSections {
  const open: GazingListItem[] = [];
  const aftermath: GazingListItem[] = [];

  for (const row of rows) {
    // Keep this guard even though getGazings filters at the query boundary.
    // It makes cancelled exclusion an assembly invariant as well.
    if (row.status === "cancelled") continue;

    // The roster query is also the final live-status/RLS check. A missing
    // token means the invite was cancelled or became invisible between the
    // first list read and hydration, so stale input must not be rendered.
    const roster = rosterByToken.get(row.token);
    if (!roster) continue;
    const liveStatus = roster.status;
    const role: GazingViewerRole = row.created_by === viewerId || roster.viewerIsHost
      ? "hosting"
      : roster.viewerIsIn
        ? "attending"
        : "summoned";
    const item: GazingListItem = {
      id: row.id,
      token: row.token,
      filmId: row.film_id,
      filmTitle: row.film_title,
      posterUrl: row.poster_url,
      theaterName: row.theater_name,
      startsAt: row.starts_at,
      formatLabel: row.format_label,
      ticketsUrl: row.tickets_url,
      venueKind: row.venue_kind,
      status: liveStatus,
      timezoneLabel: row.timezone_label,
      createdAt: row.created_at,
      host: hostById.get(row.created_by) ?? null,
      roster,
      role,
    };

    if (liveStatus === "scheduled" && new Date(row.starts_at).getTime() > now.getTime()) {
      open.push(item);
    } else {
      aftermath.push(item);
    }
  }

  open.sort((a, b) => itemTime(a) - itemTime(b));
  aftermath.sort((a, b) => itemTime(b) - itemTime(a));
  return { open, aftermath };
}

export async function getGazings(
  client: Client,
  viewerId: string,
  now: Date,
): Promise<GazingSections> {
  const { data, error } = await client
    .from("gazing_invites")
    .select(GAZING_LIST_COLUMNS)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as GazingListRow[];
  if (rows.length === 0) return { open: [], aftermath: [] };

  const tokens = rows.map(row => row.token);
  const hostIds = Array.from(new Set(rows.map(row => row.created_by)));
  const [rosterByToken, hostResult] = await Promise.all([
    getGazingRostersForTokens(client, tokens, viewerId),
    client
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", hostIds),
  ]);
  if (hostResult.error) throw hostResult.error;

  const hostById = new Map<string, GazingHost>();
  for (const host of hostResult.data ?? []) hostById.set(host.id, host);
  return partitionGazings(rows, rosterByToken, hostById, viewerId, now);
}
