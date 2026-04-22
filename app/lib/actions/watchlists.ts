"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _addToWatchlist(
  client: Client,
  filmId: string,
  maxPriceUsd?: number
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { data, error } = await client
    .from("watchlists")
    .insert({
      user_id: user.id,
      film_id: filmId,
      max_price_usd: maxPriceUsd ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function _removeFromWatchlist(
  client: Client,
  filmId: string
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
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function removeFromWatchlist(filmId: string) {
  const supabase = await createClient();
  await _removeFromWatchlist(supabase, filmId);
  revalidatePath("/home");
  revalidatePath(`/film/${filmId}`);
}
