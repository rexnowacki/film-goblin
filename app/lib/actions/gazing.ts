"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { generateGazingToken } from "@/lib/gazing/token";
import { validateHomeGazingDraft, type HomeGazingDraft } from "@/lib/gazing/create-logic";
import { canConfirmAttendance, canTransitionGazing } from "@/lib/gazing/state";

type Client = SupabaseClient<Database>;

const SITE_ORIGIN = "https://freshfromthepit.com";
const GAZINGS_INDEX_PATH = "/coven/gazings";

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
  inviteId?: string;
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
  const result = await _createGazingInvite(supabase, showtimeId);
  revalidatePath(GAZINGS_INDEX_PATH);
  return result;
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
  revalidatePath(GAZINGS_INDEX_PATH);
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
    .select("id, created_by, status")
    .eq("token", token)
    .maybeSingle();
  if (inviteErr) throw inviteErr;
  if (!invite) throw new Error("That gazing has expired");
  if (invite.status !== "scheduled") throw new Error("Only scheduled gazings accept RSVP changes");
  if (invite.created_by === user.id) throw new Error("You're hosting this gazing");

  // A private shared link is a bearer capability. Materialize that capability
  // as an invitee before returning to the viewer-scoped client, whose attendee
  // INSERT remains subject to the scheduled-status RLS guard in migration 0220.
  const { error: claimErr } = await svc.from("gazing_invitees").upsert({
    invite_id: invite.id,
    user_id: user.id,
  }, { onConflict: "invite_id,user_id", ignoreDuplicates: true });
  if (claimErr) throw claimErr;

  const { data: existing, error: existErr } = await client
    .from("gazing_attendees")
    .select("id")
    .eq("invite_id", invite.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existErr) throw existErr;

  if (existing) {
    const { data: deleted, error } = await client.from("gazing_attendees").delete().eq("id", existing.id).select("id").maybeSingle();
    if (error) throw error;
    if (!deleted) throw new Error("That gazing changed and no longer accepts RSVP changes");
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
  revalidatePath(GAZINGS_INDEX_PATH);
  return result;
}

export async function _createHomeGazing(client: Client, input: HomeGazingDraft): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client); const valid = validateHomeGazingDraft(input);
  if (valid.inviteeIds.includes(user.id)) throw new Error("You are already the host");
  const filmRes = await client.from("films").select("id, title, artwork_url").eq("id", valid.filmId).single(); if (filmRes.error) throw filmRes.error;
  const token=generateGazingToken(); const inserted=await client.from("gazing_invites").insert({token,created_by:user.id,film_id:filmRes.data.id,film_title:filmRes.data.title,poster_url:filmRes.data.artwork_url,starts_at:valid.startsAt,broadcast:valid.broadcast,venue_kind:"home",timezone_label:valid.timezoneLabel,location_note:valid.locationNote}).select("id").single(); if(inserted.error) throw inserted.error;
  if(valid.inviteeIds.length){const invitees=await client.from("gazing_invitees").insert(valid.inviteeIds.map(userId=>({invite_id:inserted.data.id,user_id:userId})));if(invitees.error)throw invitees.error;}
  return {url:`${SITE_ORIGIN}/gazing/${token}`,inviteId:inserted.data.id};
}
export async function createHomeGazing(input: HomeGazingDraft): Promise<CreateGazingResult>{const client=await createClient();const result=await _createHomeGazing(client,input);revalidatePath("/home");revalidatePath("/coven");revalidatePath(GAZINGS_INDEX_PATH);revalidatePath(`/film/${input.filmId}`);return result;}

export async function _closeGazing(client:Client,token:string,next:"happened"|"cancelled",now=new Date()):Promise<string>{const user=await requireAuthUser(client);const current=await client.from("gazing_invites").select("id,created_by,status,starts_at,film_id").eq("token",token).maybeSingle();if(current.error||!current.data)throw current.error??new Error("Gazing not found");if(!canTransitionGazing({current:current.data.status,next,startsAt:current.data.starts_at,now,isHost:current.data.created_by===user.id}))throw new Error("That gazing cannot be closed this way");const updated=await client.from("gazing_invites").update({status:next,closed_at:now.toISOString(),closed_by:user.id}).eq("id",current.data.id).eq("status","scheduled").select("id").maybeSingle();if(updated.error)throw updated.error;if(!updated.data)throw new Error("That gazing changed or was already closed");return updated.data.id;}
export async function closeGazing(token:string,next:"happened"|"cancelled"):Promise<string>{const client=await createClient();const id=await _closeGazing(client,token,next);revalidatePath(`/gazing/${token}`);revalidatePath("/home");revalidatePath(GAZINGS_INDEX_PATH);return id;}

export async function _confirmAttendance(client: Client, token: string, now = new Date()): Promise<string> {
  const user = await requireAuthUser(client);
  const invite = await client
    .from("gazing_invites")
    .select("id,status,starts_at,created_by")
    .eq("token", token)
    .maybeSingle();
  if (invite.error || !invite.data) throw invite.error ?? new Error("Gazing not found");

  const attendee = await client
    .from("gazing_attendees")
    .select("id")
    .eq("invite_id", invite.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (attendee.error) throw attendee.error;
  const isHost = invite.data.created_by === user.id;
  if (!canConfirmAttendance({
    status: invite.data.status,
    startsAt: invite.data.starts_at,
    now,
    isHost,
    hasRsvp: Boolean(attendee.data),
  })) throw new Error("Attendance cannot be confirmed yet");

  // Serialize terminal state first. If cancellation won the scheduled-row
  // compare-and-swap, no attendance history is written to a cancelled gazing.
  // A later attendee-write failure is safe to retry against `happened`.
  if (invite.data.status === "scheduled") {
    const svc = serviceRoleClient();
    const result = await svc
      .from("gazing_invites")
      .update({ status: "happened", closed_at: now.toISOString(), closed_by: user.id })
      .eq("id", invite.data.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("That gazing changed or was cancelled before attendance closed it");
  }

  if (attendee.data) {
    const result = await client
      .from("gazing_attendees")
      .update({ attended_at: now.toISOString() })
      .eq("id", attendee.data.id)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("That gazing changed and attendance can no longer be confirmed");
  } else {
    const result = await client.from("gazing_attendees").insert({
      invite_id: invite.data.id,
      user_id: user.id,
      attended_at: now.toISOString(),
    });
    if (result.error) throw result.error;
  }
  return invite.data.id;
}
export async function confirmAttendance(token:string):Promise<string>{const client=await createClient();const id=await _confirmAttendance(client,token);revalidatePath(`/gazing/${token}`);revalidatePath("/home");revalidatePath(GAZINGS_INDEX_PATH);return id;}
