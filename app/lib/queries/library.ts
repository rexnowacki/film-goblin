import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Returns the IDs of films owned by the given user. Used by /films
 * discovery to exclude these from the grid for the viewer.
 * Returns [] for unauthed callers.
 */
export async function getOwnedFilmIds(client: Client, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.film_id);
}

/**
 * Returns the user's library joined with film details, sorted by
 * recently-added by default. Powers the /library page.
 */
export async function getLibrary(client: Client, userId: string) {
  const { data, error } = await (client as any)
    .from("library")
    .select(`
      created_at,
      film:films_with_stats!inner(
        id, itunes_id, title, director, year, artwork_url, coven_rating_pct
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map(r => ({
    created_at: r.created_at as string,
    film: r.film as {
      id: string;
      itunes_id: number | null;
      title: string;
      director: string;
      year: number;
      artwork_url: string;
      coven_rating_pct: number | null;
    },
  }));
}

/**
 * Boolean: does this user own this film? Powers the OwnedButton's
 * initial state on /film/[id].
 */
export async function isInLibrary(client: Client, userId: string, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId)
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

/** Pure aggregation for the grimoire stat strip. Exported for tests. */
export function summarizeSavings(
  rows: { paid: number; peak: number | null }[],
): { claimedCount: number; totalPaid: number; totalSaved: number } {
  let totalPaid = 0;
  let totalSaved = 0;
  for (const r of rows) {
    totalPaid += r.paid;
    if (r.peak != null) totalSaved += Math.max(r.peak - r.paid, 0);
  }
  return { claimedCount: rows.length, totalPaid, totalSaved };
}

/**
 * Savings summary for the /library stat strip: films with a recorded
 * price_paid_usd, measured against each film's all-time price_history peak.
 * Savings are computed at read time — never stored (spec §Decision summary).
 * Scale note: pulls all history rows for claimed films; fine at current
 * catalog/user scale, aggregate in SQL if this ever shows up in timings.
 */
export async function getLibrarySavings(
  client: Client,
  userId: string,
): Promise<{ claimedCount: number; totalPaid: number; totalSaved: number }> {
  const { data, error } = await client
    .from("library")
    .select("film_id, price_paid_usd")
    .eq("user_id", userId)
    .not("price_paid_usd", "is", null);
  if (error) throw error;
  const owned = data ?? [];
  if (owned.length === 0) return { claimedCount: 0, totalPaid: 0, totalSaved: 0 };

  const { data: hist, error: histErr } = await client
    .from("price_history")
    .select("film_id, price_usd")
    .in("film_id", owned.map(r => r.film_id));
  if (histErr) throw histErr;

  const peaks = new Map<string, number>();
  for (const h of hist ?? []) {
    const p = Number(h.price_usd);
    const prev = peaks.get(h.film_id);
    if (prev == null || p > prev) peaks.set(h.film_id, p);
  }

  return summarizeSavings(
    owned.map(r => ({ paid: Number(r.price_paid_usd), peak: peaks.get(r.film_id) ?? null })),
  );
}
