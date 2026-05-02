"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";

export interface SetFilmTagsInput {
  filmId: string;
  subgenreTagId: string | null;
  vibeTagIds: string[];
}

export type SetFilmTagsResult =
  | { ok: true }
  | { ok: false; error: string };

const MAX_VIBES = 3;

/**
 * Replaces the film's tag set: deletes all existing film_tags rows for
 * filmId, then inserts the new (subgenre + 0–3 vibes) set. Validates tag
 * IDs against the `tags` table — sub-genre IDs must have type='subgenre',
 * vibe IDs must have type='vibe'. Calls requireAdmin first; uses
 * service-role for the write since film_tags has no client INSERT grant.
 */
export async function setFilmTags(input: SetFilmTagsInput): Promise<SetFilmTagsResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { filmId, subgenreTagId, vibeTagIds } = input;

  if (vibeTagIds.length > MAX_VIBES) {
    return { ok: false, error: `Up to ${MAX_VIBES} vibes only.` };
  }
  if (new Set(vibeTagIds).size !== vibeTagIds.length) {
    return { ok: false, error: "Duplicate vibe selected." };
  }

  const allIds = [
    ...(subgenreTagId ? [subgenreTagId] : []),
    ...vibeTagIds,
  ];

  const admin = serviceRoleClient();

  if (allIds.length > 0) {
    const { data: tagRows, error: tErr } = await admin
      .from("tags")
      .select("id, type")
      .in("id", allIds);
    if (tErr) return { ok: false, error: tErr.message };

    const byId = new Map((tagRows ?? []).map(t => [t.id, t.type]));
    if (subgenreTagId && byId.get(subgenreTagId) !== "subgenre") {
      return { ok: false, error: "Sub-genre ID must be type='subgenre'." };
    }
    for (const vId of vibeTagIds) {
      if (byId.get(vId) !== "vibe") {
        return { ok: false, error: "Vibe ID must be type='vibe'." };
      }
    }
  }

  const { error: delErr } = await admin
    .from("film_tags")
    .delete()
    .eq("film_id", filmId);
  if (delErr) return { ok: false, error: delErr.message };

  if (allIds.length > 0) {
    const rows = allIds.map(id => ({ film_id: filmId, tag_id: id }));
    const { error: insErr } = await admin.from("film_tags").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath(`/film/${filmId}`);
  revalidatePath(`/admin/films/${filmId}/edit`);
  revalidatePath(`/admin/films`);
  return { ok: true };
}
