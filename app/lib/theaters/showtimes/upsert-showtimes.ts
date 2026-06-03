import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/supabase/types";
import { normalizeTitle } from "../normalize-title";
import type { ResolvedShowtime } from "./types";

type Client = SupabaseClient<Database>;
type ShowtimeInsert = TablesInsert<"theater_showtimes">;

export interface UpsertShowtimesResult {
  inserted: number;
  updated: number;
  staleMarkedInactive: number;
  showtimeIds: string[];
  theaterName: string;
}

export function buildShowtimeRows(
  theaterId: string,
  scraped: ResolvedShowtime[],
  seenAt: Date = new Date(),
): ShowtimeInsert[] {
  const nowIso = seenAt.toISOString();
  return scraped.map((showtime) => ({
    theater_id: theaterId,
    source_sid: showtime.sid,
    title: showtime.title,
    normalized_title: normalizeTitle(showtime.title),
    starts_at: showtime.startsAt,
    screen_label: showtime.screenLabel || null,
    format_label: showtime.formatLabel,
    tickets_url: showtime.filmUrl,
    source_url: showtime.filmUrl,
    is_active: true,
    last_seen_at: nowIso,
    updated_at: nowIso,
  }));
}

export function selectStaleIds(
  existing: Array<{ id: string; source_sid: string; starts_at: string }>,
  keptSids: Set<string>,
  now: Date,
): string[] {
  return existing
    .filter((row) => !keptSids.has(row.source_sid))
    .filter((row) => new Date(row.starts_at).getTime() >= now.getTime())
    .map((row) => row.id);
}

function dedupeRows(rows: ShowtimeInsert[]): ShowtimeInsert[] {
  const bySid = new Map<string, ShowtimeInsert>();
  for (const row of rows) bySid.set(row.source_sid, row);
  return [...bySid.values()];
}

export async function upsertShowtimes(
  client: Client,
  theaterSlug: string,
  scraped: ResolvedShowtime[],
  now: Date = new Date(),
): Promise<UpsertShowtimesResult> {
  const { data: theater, error: theaterErr } = await client
    .from("theaters")
    .select("id, name")
    .eq("slug", theaterSlug)
    .single();
  if (theaterErr) throw theaterErr;

  const rows = dedupeRows(buildShowtimeRows(theater.id, scraped, now));
  const sids = rows.map((row) => row.source_sid);

  const existingForSids = sids.length > 0
    ? await client
        .from("theater_showtimes")
        .select("source_sid")
        .eq("theater_id", theater.id)
        .in("source_sid", sids)
    : { data: [], error: null };
  if (existingForSids.error) throw existingForSids.error;
  const existingSids = new Set((existingForSids.data ?? []).map((row) => row.source_sid));

  let showtimeIds: string[] = [];
  if (rows.length > 0) {
    const { data, error } = await client
      .from("theater_showtimes")
      .upsert(rows, { onConflict: "theater_id,source_sid" })
      .select("id");
    if (error) throw error;
    showtimeIds = (data ?? []).map((row) => row.id);
  }

  const keptSids = new Set(sids);
  const active = await client
    .from("theater_showtimes")
    .select("id, source_sid, starts_at")
    .eq("theater_id", theater.id)
    .eq("is_active", true);
  if (active.error) throw active.error;

  const staleIds = selectStaleIds(active.data ?? [], keptSids, now);
  if (staleIds.length > 0) {
    const { error } = await client
      .from("theater_showtimes")
      .update({ is_active: false, updated_at: now.toISOString() })
      .in("id", staleIds);
    if (error) throw error;
  }

  return {
    inserted: sids.filter((sid) => !existingSids.has(sid)).length,
    updated: sids.filter((sid) => existingSids.has(sid)).length,
    staleMarkedInactive: staleIds.length,
    showtimeIds,
    theaterName: theater.name,
  };
}
