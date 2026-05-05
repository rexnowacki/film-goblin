import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ScrapedTheaterShowing } from "./types";
import { normalizeTitle } from "./normalize-title";
import { sourceHash } from "./source-hash";

type Client = SupabaseClient<Database>;

export interface UpsertShowingsResult {
  inserted: number;
  updated: number;
  staleMarkedInactive: number;
  showingIds: string[];
}

export async function upsertShowingsForTheater(
  client: Client,
  theaterSlug: string,
  scraped: ScrapedTheaterShowing[],
): Promise<UpsertShowingsResult> {
  const { data: theater, error: theaterErr } = await client
    .from("theaters")
    .select("id")
    .eq("slug", theaterSlug)
    .single();
  if (theaterErr) throw theaterErr;

  const hashes = scraped.map(sourceHash);
  const existing = hashes.length
    ? await client
        .from("theater_showings")
        .select("id, source_hash")
        .eq("theater_id", theater.id)
        .in("source_hash", hashes)
    : { data: [], error: null };
  if (existing.error) throw existing.error;
  const existingHashes = new Set((existing.data ?? []).map((row) => row.source_hash));

  const rows = scraped.map((showing) => ({
    theater_id: theater.id,
    source_url: showing.sourceUrl,
    source_id: showing.sourceId ?? null,
    source_hash: sourceHash(showing),
    title: showing.title,
    normalized_title: normalizeTitle(showing.title),
    starts_at: showing.startsAt ?? null,
    starts_on: showing.startsOn ?? null,
    date_precision: showing.datePrecision,
    date_label: showing.dateLabel ?? null,
    runtime_label: showing.runtimeLabel ?? null,
    rating_label: showing.ratingLabel ?? null,
    category_labels: showing.categoryLabels,
    poster_url: showing.posterUrl ?? null,
    description: showing.description ?? null,
    showtime_label: showing.showtimeLabel ?? null,
    last_seen_at: new Date().toISOString(),
    is_active: true,
  }));

  let showingIds: string[] = [];
  if (rows.length > 0) {
    const { data, error } = await client
      .from("theater_showings")
      .upsert(rows, { onConflict: "theater_id,source_hash" })
      .select("id");
    if (error) throw error;
    showingIds = (data ?? []).map((row) => row.id);
  }

  let staleMarkedInactive = 0;
  const active = await client
    .from("theater_showings")
    .select("id, source_hash")
    .eq("theater_id", theater.id)
    .eq("is_active", true);
  if (active.error) throw active.error;
  const staleIds = (active.data ?? [])
    .filter((row) => !hashes.includes(row.source_hash))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    const { error } = await client
      .from("theater_showings")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", staleIds);
    if (error) throw error;
    staleMarkedInactive = staleIds.length;
  }

  return {
    inserted: hashes.filter((hash) => !existingHashes.has(hash)).length,
    updated: hashes.filter((hash) => existingHashes.has(hash)).length,
    staleMarkedInactive,
    showingIds,
  };
}
