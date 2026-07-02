"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_FACETS = new Set(["subgenre", "tone", "theme"]);

/**
 * Set the user's FYP lanes — a deliberate set of tag preferences that
 * adds a constant +1.5 affinity per picked tag in the recommender. Tags
 * must be type 'subgenre' | 'tone' | 'theme' (the personality-revealing
 * facets); subjects / settings / content are intentionally excluded
 * since they're less predictive of taste.
 */
export async function setLanes(tagIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (tagIds.length > 0) {
    const { data: tagRows, error: tagErr } = await supabase
      .from("tags")
      .select("id, type")
      .in("id", tagIds);
    if (tagErr) return { ok: false, error: tagErr.message };
    if ((tagRows ?? []).length !== tagIds.length) {
      return { ok: false, error: "Unknown tag id." };
    }
    for (const t of tagRows ?? []) {
      if (!ALLOWED_FACETS.has(t.type)) {
        return { ok: false, error: `Lane tags must be sub-genre, tone, or theme. Got '${t.type}'.` };
      }
    }
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ lane_tag_ids: tagIds })
    .eq("id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/settings");
  revalidatePath("/films");
  return { ok: true };
}
