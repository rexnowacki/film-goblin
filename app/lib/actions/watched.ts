"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

interface LogWatchOpts {
  watched_at?: string; // ISO YYYY-MM-DD; defaults to today
  note?: string | null;
  recommended?: boolean | null;
}

interface EditWatchPatch {
  watched_at?: string;
  note?: string | null;
  recommended?: boolean | null;
}

/**
 * Logs a watch entry. When called with no opts, inserts today's date and no note.
 * Side-effect: silently deletes any matching (user, film) watchlist row — watching
 * supersedes wanting. Mirrors _addToLibrary's two-statement shape; the two ops are
 * not in a single SQL transaction, but both scope to auth.uid() = user_id and
 * neither is destructive on conflict.
 */
export async function _logWatch(
  client: Client,
  filmId: string,
  opts?: LogWatchOpts,
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const insertRow: { user_id: string; film_id: string; watched_at?: string; note?: string | null; recommended?: boolean | null } = {
    user_id: user.id,
    film_id: filmId,
  };
  if (opts?.watched_at) insertRow.watched_at = opts.watched_at;
  if (opts?.note !== undefined) insertRow.note = opts.note;
  if (opts?.recommended !== undefined) insertRow.recommended = opts.recommended;

  const { data, error } = await client
    .from("watched")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");

  // Enforce single verdict per film: a user gets one vote, not one per watch.
  // When the new watch carries a verdict, clear it from all prior rows.
  if (opts?.recommended != null) {
    await client
      .from("watched")
      .update({ recommended: null })
      .eq("user_id", user.id)
      .eq("film_id", filmId)
      .neq("id", data.id);
  }

  // Auto-remove from watchlist (silent — no error if it wasn't there).
  await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);

  return { id: data.id };
}

export async function _editWatch(
  client: Client,
  watchId: string,
  patch: EditWatchPatch,
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const update: { watched_at?: string; note?: string | null; recommended?: boolean | null } = {};
  if (patch.watched_at !== undefined) update.watched_at = patch.watched_at;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.recommended !== undefined) update.recommended = patch.recommended;

  // Enforce single verdict: when setting a non-null verdict, clear it from
  // all other watched rows for this (user, film) first.
  if (patch.recommended != null) {
    const { data: row } = await client
      .from("watched")
      .select("film_id")
      .eq("id", watchId)
      .single();
    if (row) {
      await client
        .from("watched")
        .update({ recommended: null })
        .eq("user_id", user.id)
        .eq("film_id", row.film_id)
        .neq("id", watchId);
    }
  }

  const { error } = await client
    .from("watched")
    .update(update)
    .eq("id", watchId);
  if (error) throw error;
}

export async function _deleteWatch(client: Client, watchId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const { error } = await client
    .from("watched")
    .delete()
    .eq("id", watchId);
  if (error) throw error;
}

export async function logWatch(filmId: string, opts?: LogWatchOpts): Promise<{ id: string }> {
  const supabase = await createClient();
  const result = await _logWatch(supabase, filmId, opts);
  revalidatePath("/watched");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function editWatch(watchId: string, patch: EditWatchPatch): Promise<void> {
  const supabase = await createClient();
  await _editWatch(supabase, watchId, patch);
  revalidatePath("/watched");
}

export async function deleteWatch(watchId: string, filmId?: string): Promise<void> {
  const supabase = await createClient();
  await _deleteWatch(supabase, watchId);
  revalidatePath("/watched");
  if (filmId) revalidatePath(`/film/${filmId}`);
}
