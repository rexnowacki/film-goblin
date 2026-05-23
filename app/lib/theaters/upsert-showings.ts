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

function hashesForScrapedShowings(scraped: ScrapedTheaterShowing[]): string[] {
  const baseHashes = scraped.map((showing) => sourceHash(showing));
  const baseCounts = new Map<string, number>();
  for (const hash of baseHashes) {
    baseCounts.set(hash, (baseCounts.get(hash) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return scraped.map((showing, index) => {
    const baseHash = baseHashes[index];
    const occurrence = seen.get(baseHash) ?? 0;
    seen.set(baseHash, occurrence + 1);
    if ((baseCounts.get(baseHash) ?? 0) < 2 || occurrence === 0) return baseHash;
    return sourceHash(showing, { includeShowtime: true });
  });
}

function todayIsoDate(timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

export async function upsertShowingsForTheater(
  client: Client,
  theaterSlug: string,
  scraped: ScrapedTheaterShowing[],
): Promise<UpsertShowingsResult> {
  const { data: theater, error: theaterErr } = await client
    .from("theaters")
    .select("id, timezone")
    .eq("slug", theaterSlug)
    .single();
  if (theaterErr) throw theaterErr;

  const hashes = hashesForScrapedShowings(scraped);
  const uniqueScraped: { showing: ScrapedTheaterShowing; hash: string }[] = [];
  const seenHashes = new Set<string>();
  for (let i = 0; i < scraped.length; i++) {
    const hash = hashes[i];
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    uniqueScraped.push({ showing: scraped[i], hash });
  }
  const uniqueHashes = uniqueScraped.map(item => item.hash);
  const existing = hashes.length
    ? await client
        .from("theater_showings")
        .select("id, source_hash")
        .eq("theater_id", theater.id)
        .in("source_hash", uniqueHashes)
    : { data: [], error: null };
  if (existing.error) throw existing.error;
  const existingHashes = new Set((existing.data ?? []).map((row) => row.source_hash));

  const rows = uniqueScraped.map(({ showing, hash }) => ({
    theater_id: theater.id,
    source_url: showing.sourceUrl,
    source_id: showing.sourceId ?? null,
    source_hash: hash,
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
  const today = todayIsoDate(theater.timezone);
  const active = await client
    .from("theater_showings")
    .select("id, source_hash, starts_on")
    .eq("theater_id", theater.id)
    .eq("is_active", true);
  if (active.error) throw active.error;
  const staleIds = (active.data ?? [])
    .filter((row) => !uniqueHashes.includes(row.source_hash))
    .filter((row) => row.starts_on == null || row.starts_on < today)
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
    inserted: uniqueHashes.filter((hash) => !existingHashes.has(hash)).length,
    updated: uniqueHashes.filter((hash) => existingHashes.has(hash)).length,
    staleMarkedInactive,
    showingIds,
  };
}
