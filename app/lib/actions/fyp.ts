"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

const IMPRESSION_BATCH_CAP = 50;

export async function _recordFypImpressions(client: Client, filmIds: string[]): Promise<void> {
  if (filmIds.length === 0) return;
  const capped = filmIds.slice(0, IMPRESSION_BATCH_CAP);
  const { error } = await client.rpc("record_fyp_impressions", { p_film_ids: capped });
  if (error) throw error;
}

/** Fire-and-forget: impression loss is free, so all failures are swallowed. */
export async function recordFypImpressions(filmIds: string[]): Promise<void> {
  try {
    const client = await createClient();
    await _recordFypImpressions(client, filmIds);
  } catch (e) {
    console.warn("recordFypImpressions failed (dropped):", e);
  }
}

export async function _setNotInterested(client: Client, filmId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("fyp_not_interested")
    .insert({ user_id: user.id, film_id: filmId });
  if (error) throw error;
}

export async function setNotInterested(filmId: string): Promise<void> {
  const client = await createClient();
  await _setNotInterested(client, filmId);
  // Deliberately no revalidatePath here. The caller (ForYouShelves) tracks
  // the dismissal optimistically and shows an in-place "Hidden — undo" stub;
  // that optimistic set IS the in-session source of truth. Revalidating
  // would refresh the RSC payload out from under the still-mounted undo
  // stub, unmounting it mid-interaction and reshuffling the shelves. The
  // next natural navigation/request recomputes from the DB anyway.
}

export async function _undoNotInterested(client: Client, filmId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("fyp_not_interested")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function undoNotInterested(filmId: string): Promise<void> {
  const client = await createClient();
  await _undoNotInterested(client, filmId);
  revalidatePath("/films");
}
