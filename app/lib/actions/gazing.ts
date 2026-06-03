"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
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

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export interface CreateGazingResult {
  url: string;
}

export async function _createGazingInvite(client: Client, showtimeId: string): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client);
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

  const token = generateGazingToken();
  const { error: insertErr } = await client.from("gazing_invites").insert({
    token,
    created_by: user.id,
    showtime_id: showtime.id,
    film_id: showtime.film_id,
    film_title: film.title,
    poster_url: film.artwork_url,
    theater_name: theater.name,
    starts_at: showtime.starts_at,
    format_label: showtime.format_label,
    tickets_url: showtime.tickets_url,
  });
  if (insertErr) throw insertErr;

  return { url: `${SITE_ORIGIN}/gazing/${token}` };
}

export async function createGazingInvite(showtimeId: string): Promise<CreateGazingResult> {
  const supabase = await createClient();
  return _createGazingInvite(supabase, showtimeId);
}
