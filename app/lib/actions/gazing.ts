"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { generateGazingToken } from "@/lib/gazing/token";

type Client = SupabaseClient<Database>;

const SITE_ORIGIN = "https://freshfromthepit.com";

interface ShowtimeSnapshot {
  id: string;
  film_id: string | null;
  starts_at: string;
  format_label: string | null;
  tickets_url: string;
  theater: { name: string } | { name: string }[] | null;
  film: { title: string; artwork_url: string | null } | { title: string; artwork_url: string | null }[] | null;
}

interface InviteSnapshot {
  showtime_id: string;
  film_id: string;
  film_title: string;
  poster_url: string | null;
  theater_name: string;
  starts_at: string;
  format_label: string | null;
  tickets_url: string;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

/** Loads a matched, active showtime and freezes its display fields. Shared by
 *  the SMS-share and summon paths. Throws if the showtime isn't film-matched. */
async function loadInviteSnapshot(showtimeId: string): Promise<InviteSnapshot> {
  const svc = serviceRoleClient();
  const { data, error } = await svc
    .from("theater_showtimes")
    .select("id, film_id, starts_at, format_label, tickets_url, theater:theaters(name), film:films(title, artwork_url)")
    .eq("id", showtimeId)
    .eq("is_active", true)
    .single();
  if (error) throw error;

  const showtime = data as ShowtimeSnapshot;
  const film = one(showtime.film);
  const theater = one(showtime.theater);
  if (!showtime.film_id || !film || !theater) {
    throw new Error("Showtime is not matched to a film yet");
  }

  return {
    showtime_id: showtime.id,
    film_id: showtime.film_id,
    film_title: film.title,
    poster_url: film.artwork_url,
    theater_name: theater.name,
    starts_at: showtime.starts_at,
    format_label: showtime.format_label,
    tickets_url: showtime.tickets_url,
  };
}

export interface CreateGazingResult {
  url: string;
}

async function insertInvite(
  client: Client,
  snapshot: InviteSnapshot,
  userId: string,
  broadcast: boolean,
): Promise<CreateGazingResult> {
  const token = generateGazingToken();
  const { error } = await client.from("gazing_invites").insert({
    token,
    created_by: userId,
    showtime_id: snapshot.showtime_id,
    film_id: snapshot.film_id,
    film_title: snapshot.film_title,
    poster_url: snapshot.poster_url,
    theater_name: snapshot.theater_name,
    starts_at: snapshot.starts_at,
    format_label: snapshot.format_label,
    tickets_url: snapshot.tickets_url,
    broadcast,
  });
  if (error) throw error;
  return { url: `${SITE_ORIGIN}/gazing/${token}` };
}

export async function _createGazingInvite(client: Client, showtimeId: string): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client);
  const snapshot = await loadInviteSnapshot(showtimeId);
  return insertInvite(client, snapshot, user.id, false);
}

export async function createGazingInvite(showtimeId: string): Promise<CreateGazingResult> {
  const supabase = await createClient();
  return _createGazingInvite(supabase, showtimeId);
}

export async function _summonCoven(client: Client, showtimeId: string): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client);
  const snapshot = await loadInviteSnapshot(showtimeId);
  return insertInvite(client, snapshot, user.id, true);
}

export async function summonCoven(showtimeId: string): Promise<CreateGazingResult> {
  const supabase = await createClient();
  const result = await _summonCoven(supabase, showtimeId);
  revalidatePath("/home");
  return result;
}

export interface ToggleRsvpResult {
  attending: boolean;
}

export async function _toggleGazingRsvp(client: Client, token: string): Promise<ToggleRsvpResult> {
  const user = await requireAuthUser(client);

  const svc = serviceRoleClient();
  const { data: invite, error: inviteErr } = await svc
    .from("gazing_invites")
    .select("id, created_by")
    .eq("token", token)
    .maybeSingle();
  if (inviteErr) throw inviteErr;
  if (!invite) throw new Error("That gazing has expired");
  if (invite.created_by === user.id) throw new Error("You're hosting this gazing");

  const { data: existing, error: existErr } = await client
    .from("gazing_attendees")
    .select("id")
    .eq("invite_id", invite.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existErr) throw existErr;

  if (existing) {
    const { error } = await client.from("gazing_attendees").delete().eq("id", existing.id);
    if (error) throw error;
    return { attending: false };
  }

  const { error } = await client.from("gazing_attendees").insert({ invite_id: invite.id, user_id: user.id });
  if (isUniqueViolation(error)) return { attending: true };
  if (error) throw error;
  return { attending: true };
}

export async function toggleGazingRsvp(token: string): Promise<ToggleRsvpResult> {
  const supabase = await createClient();
  const result = await _toggleGazingRsvp(supabase, token);
  revalidatePath("/home");
  revalidatePath(`/gazing/${token}`);
  return result;
}
