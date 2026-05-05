"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { createTheaterNotifications } from "@/lib/theaters/create-theater-notifications";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdminAndService() {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);
  return { user, service: serviceRoleClient() };
}

async function updateMatchStatus(matchId: string, status: "confirmed" | "rejected" | "ignored"): Promise<Result> {
  const { user, service } = await requireAdminAndService();
  const { data: match, error } = await service
    .from("theater_showing_matches")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", matchId)
    .select("showing_id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (status === "confirmed") await createTheaterNotifications(service, [match.showing_id]);
  revalidatePath("/admin/theater-showings");
  revalidatePath(`/local-haunts/${match.showing_id}`);
  return { ok: true };
}

export async function confirmTheaterMatch(matchId: string): Promise<Result> {
  return updateMatchStatus(matchId, "confirmed");
}

export async function rejectTheaterMatch(matchId: string): Promise<Result> {
  return updateMatchStatus(matchId, "rejected");
}

export async function ignoreTheaterMatch(matchId: string): Promise<Result> {
  return updateMatchStatus(matchId, "ignored");
}

export async function chooseTheaterFilm(showingId: string, filmId: string): Promise<Result> {
  const { user, service } = await requireAdminAndService();
  const { error } = await service
    .from("theater_showing_matches")
    .upsert({
      showing_id: showingId,
      film_id: filmId,
      match_type: "manual_admin",
      confidence: 1,
      status: "confirmed",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "showing_id,film_id" });
  if (error) return { ok: false, error: error.message };
  await createTheaterNotifications(service, [showingId]);
  revalidatePath("/admin/theater-showings");
  revalidatePath(`/local-haunts/${showingId}`);
  return { ok: true };
}
