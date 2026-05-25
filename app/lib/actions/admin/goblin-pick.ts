"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";

type Result = { ok: true } | { ok: false; error: string };
type GoblinPickUpdate = Database["public"]["Tables"]["goblin_pick"]["Update"];

function isValidIso(s: string): boolean {
  const d = new Date(s);
  return !isNaN(d.getTime());
}

export async function scheduleGoblinPick(
  filmId: string,
  effectiveAtIso: string,
  whisperText: string,
): Promise<Result> {
  if (!isValidIso(effectiveAtIso)) return { ok: false, error: "Invalid date" };
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);

  const { error } = await supabase.from("goblin_pick").insert({
    film_id: filmId,
    effective_at: effectiveAtIso,
    whisper_text: whisperText.trim() || null,
    set_by: user.id,
  });

  if (error) return { ok: false, error: error.message };
  revalidateTag("goblin-pick");
  revalidatePath("/home");
  revalidatePath("/admin/goblin-pick");
  return { ok: true };
}

export async function updateGoblinPick(
  id: number,
  fields: { film_id?: string; effective_at?: string; whisper_text?: string | null },
): Promise<Result> {
  const supabase = await createClient();
  await requireAdminUser(supabase);

  const patch: GoblinPickUpdate = {};
  if (fields.film_id !== undefined) patch.film_id = fields.film_id;
  if (fields.effective_at !== undefined) {
    if (!isValidIso(fields.effective_at)) return { ok: false, error: "Invalid date" };
    patch.effective_at = fields.effective_at;
  }
  if (fields.whisper_text !== undefined) {
    const trimmed = (fields.whisper_text ?? "").trim();
    patch.whisper_text = trimmed || null;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase.from("goblin_pick").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateTag("goblin-pick");
  revalidatePath("/home");
  revalidatePath("/admin/goblin-pick");
  return { ok: true };
}

export async function deleteGoblinPick(id: number): Promise<Result> {
  const supabase = await createClient();
  await requireAdminUser(supabase);

  const { error } = await supabase.from("goblin_pick").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateTag("goblin-pick");
  revalidatePath("/home");
  revalidatePath("/admin/goblin-pick");
  return { ok: true };
}

export async function clearGoblinPickChat(id: number): Promise<Result> {
  const supabase = await createClient();
  await requireAdminUser(supabase);

  const service = serviceRoleClient();
  const { error: notificationError } = await service
    .from("notifications")
    .delete()
    .eq("kind", "goblin_summon")
    .contains("payload", { pick_id: id });
  if (notificationError) return { ok: false, error: notificationError.message };

  const { error } = await service
    .from("goblin_pick_messages")
    .delete()
    .eq("pick_id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/home");
  revalidatePath("/ritual");
  revalidatePath(`/ritual/${id}`);
  revalidatePath("/ritual/archive");
  revalidatePath("/admin/goblin-pick");
  return { ok: true };
}
