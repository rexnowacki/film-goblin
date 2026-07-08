"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { createTheaterNotificationsForUserFilm } from "@/lib/theaters/create-theater-notifications";

type Client = SupabaseClient<Database>;

/**
 * Marks a film as owned by the user. Side-effect: silently deletes any
 * watchlist row for the same (user, film) — owning supersedes wanting.
 * The two ops are not in a single SQL transaction, but both scope to
 * auth.uid() = user_id and conflicts are idempotent (re-mark = no-op
 * via PK; missing watchlist row = no-op delete).
 */
export async function _addToLibrary(client: Client, filmId: string): Promise<void> {
  const user = await requireAuthUser(client);

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
  const user = await requireAuthUser(client);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await createTheaterNotificationsForUserFilm(serviceRoleClient(), user.id, filmId);
  }
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

/**
 * The Claiming (spec 2026-07-07-buy-claim-loop): confirm a purchase from the
 * return-prompt. Fresh insert stores price_paid_usd and deletes any watchlist
 * row (owning supersedes wanting — same semantics as _addToLibrary; the
 * library_added activity comes from the DB insert trigger, mig 0134, so the
 * fill-price UPDATE path correctly emits nothing). An existing row only has a
 * NULL price filled — never overwritten.
 */
export async function _confirmPurchase(
  client: Client,
  filmId: string,
  pricePaid: number | null,
): Promise<{ alreadyOwnedWithPrice: boolean; peak: number | null }> {
  const user = await requireAuthUser(client);
  if (pricePaid != null && !(Number.isFinite(pricePaid) && pricePaid > 0 && pricePaid < 1000)) {
    throw new Error("invalid price");
  }

  let alreadyOwnedWithPrice = false;

  const { error: insertErr } = await client
    .from("library")
    .insert({ user_id: user.id, film_id: filmId, price_paid_usd: pricePaid });

  if (insertErr && insertErr.code !== "23505") throw insertErr;

  if (insertErr) {
    // Already owned — fill a NULL price only.
    const { data: row, error: selErr } = await client
      .from("library")
      .select("price_paid_usd")
      .eq("user_id", user.id)
      .eq("film_id", filmId)
      .single();
    if (selErr) throw selErr;
    if (row.price_paid_usd != null) {
      alreadyOwnedWithPrice = true;
    } else if (pricePaid != null) {
      const { error: updErr } = await client
        .from("library")
        .update({ price_paid_usd: pricePaid })
        .eq("user_id", user.id)
        .eq("film_id", filmId);
      if (updErr) throw updErr;
    }
  } else {
    // Fresh insert — owning supersedes wanting.
    await client
      .from("watchlists")
      .delete()
      .eq("user_id", user.id)
      .eq("film_id", filmId);
  }

  const { data: peakRow, error: peakErr } = await client
    .from("price_history")
    .select("price_usd")
    .eq("film_id", filmId)
    .order("price_usd", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (peakErr) throw peakErr;

  return { alreadyOwnedWithPrice, peak: peakRow ? Number(peakRow.price_usd) : null };
}

export async function confirmPurchase(filmId: string, pricePaid: number | null) {
  const supabase = await createClient();
  const result = await _confirmPurchase(supabase, filmId, pricePaid);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await createTheaterNotificationsForUserFilm(serviceRoleClient(), user.id, filmId);
  }
  revalidatePath("/library");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
  return result;
}
