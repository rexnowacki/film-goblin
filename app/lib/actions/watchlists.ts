"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Adds a film to the user's watchlist. The threshold `max_price_usd` is
 * auto-captured from the film's current latest_price at add time — so the
 * watchlist IS the alert: drop below the add-time price and the user gets
 * notified. Callers may override via `maxPriceUsd`, but in practice the
 * UI doesn't.
 */
export async function _addToWatchlist(
  client: Client,
  filmId: string,
  maxPriceUsd?: number,
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  let threshold: number | null = null;
  if (maxPriceUsd != null) {
    threshold = maxPriceUsd;
  } else {
    // films_with_stats is a VIEW; Supabase's generated types don't include views,
    // so we cast to bypass the table-name literal check (same pattern as
    // lib/queries/films.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viewClient = (client as unknown as { from: (t: string) => any });
    const { data: filmRow } = await viewClient
      .from("films_with_stats")
      .select("latest_price")
      .eq("id", filmId)
      .maybeSingle();
    const raw = filmRow?.latest_price;
    const n = raw == null ? NaN : Number(raw);
    threshold = Number.isFinite(n) ? n : null;
  }

  const { data, error } = await client
    .from("watchlists")
    .insert({
      user_id: user.id,
      film_id: filmId,
      max_price_usd: threshold,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function _removeFromWatchlist(
  client: Client,
  filmId: string,
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToWatchlist(filmId: string, maxPriceUsd?: number) {
  const supabase = await createClient();
  const result = await _addToWatchlist(supabase, filmId, maxPriceUsd);
  revalidatePath("/home");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function removeFromWatchlist(filmId: string) {
  const supabase = await createClient();
  await _removeFromWatchlist(supabase, filmId);
  revalidatePath("/home");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
}
