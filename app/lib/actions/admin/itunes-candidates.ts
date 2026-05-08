"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export async function adminConfirmItunesCandidate(
  candidateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);

  const sr = serviceRoleClient();

  const cand = await sr
    .from("itunes_candidates")
    .select("id, film_id, itunes_id, itunes_url, match_artwork_url, status")
    .eq("id", candidateId)
    .single();
  if (cand.error) return { ok: false, error: cand.error.message };
  if (cand.data.status !== "pending") return { ok: false, error: "Candidate is not pending." };

  const film = await sr
    .from("films")
    .select("artwork_url")
    .eq("id", cand.data.film_id)
    .single();
  if (film.error) return { ok: false, error: film.error.message };

  const patch: Record<string, unknown> = {
    itunes_id: cand.data.itunes_id,
    itunes_url: cand.data.itunes_url,
    tracking: true,
    available: true,
  };
  if (!film.data.artwork_url && cand.data.match_artwork_url) {
    patch.artwork_url = cand.data.match_artwork_url.replace(/100x100/, "600x600");
  }

  const upd = await sr
    .from("films")
    .update(patch as never)
    .eq("id", cand.data.film_id)
    .is("itunes_id", null);
  if (upd.error) return { ok: false, error: upd.error.message };

  const mark = await sr
    .from("itunes_candidates")
    .update({ status: "confirmed", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (mark.error) return { ok: false, error: mark.error.message };

  revalidatePath("/admin/itunes-candidates");
  revalidatePath(`/film/${cand.data.film_id}`);
  return { ok: true };
}

export async function adminRejectItunesCandidate(
  candidateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);

  const sr = serviceRoleClient();
  const upd = await sr
    .from("itunes_candidates")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", candidateId)
    .eq("status", "pending");
  if (upd.error) return { ok: false, error: upd.error.message };

  revalidatePath("/admin/itunes-candidates");
  return { ok: true };
}
