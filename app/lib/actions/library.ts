"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Marks a film as owned by the user. Side-effect: silently deletes any
 * watchlist row for the same (user, film) — owning supersedes wanting.
 * The two ops are not in a single SQL transaction, but both scope to
 * auth.uid() = user_id and conflicts are idempotent (re-mark = no-op
 * via PK; missing watchlist row = no-op delete).
 */
export async function _addToLibrary(client: Client, filmId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const { error: insertErr } = await client
    .from("library")
    .insert({ user_id: user.id, film_id: filmId });
  // Swallow "already in library" duplicates (PK violation, code 23505).
  if (insertErr && insertErr.code !== "23505") throw insertErr;

  // Auto-remove from watchlist (silent — no error if it wasn't there).
  await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
}

export async function _removeFromLibrary(client: Client, filmId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("library")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToLibrary(filmId: string) {
  const supabase = await createClient();
  await _addToLibrary(supabase, filmId);
  revalidatePath("/library");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
}

export async function removeFromLibrary(filmId: string) {
  const supabase = await createClient();
  await _removeFromLibrary(supabase, filmId);
  revalidatePath("/library");
  revalidatePath(`/film/${filmId}`);
}
