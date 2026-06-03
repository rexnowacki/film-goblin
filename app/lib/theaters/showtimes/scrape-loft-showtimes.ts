import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { parseLoftShowtimes } from "./parse-loft-showtimes";
import { resolveShowtimeDate, detectFormatLabel } from "./resolve-datetime";
import { withinWindow } from "./filter-window";
import { upsertShowtimes } from "./upsert-showtimes";
import { matchShowtimes } from "./match-showtimes";
import type { ResolvedShowtime, ShowtimesRunSummary } from "./types";

type Client = SupabaseClient<Database>;

const SOURCE_URL = "https://loftcinema.org/showtimes/";

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "FilmGoblinBot/0.1 (+local-haunts)" },
    });
    if (!res.ok) throw new Error(`Loft showtimes fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLoftShowtimes(
  client: Client,
  now: Date = new Date(),
): Promise<ShowtimesRunSummary> {
  const html = await fetchText(SOURCE_URL);
  const scraped = parseLoftShowtimes(html);
  if (scraped.length < 1) {
    throw new Error("Loft showtimes returned suspiciously few slots");
  }

  const resolved: ResolvedShowtime[] = [];
  for (const showtime of scraped) {
    const startsAt = resolveShowtimeDate(showtime.rawDate, now);
    if (!startsAt || !withinWindow(startsAt, now)) continue;
    resolved.push({
      ...showtime,
      startsAt,
      formatLabel: detectFormatLabel(showtime.title, showtime.screenLabel),
    });
  }

  const upserted = await upsertShowtimes(client, "loft-cinema", resolved, now);
  const matched = await matchShowtimes(client, upserted.showtimeIds);

  return {
    scraped: scraped.length,
    inWindow: resolved.length,
    inserted: upserted.inserted,
    updated: upserted.updated,
    staleMarkedInactive: upserted.staleMarkedInactive,
    matched,
  };
}
