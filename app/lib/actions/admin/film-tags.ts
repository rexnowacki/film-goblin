"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface SetFilmTagsInput {
  filmId: string;
  primarySubgenreId: string;
  secondarySubgenreIds: string[];
  subjectIds: string[];
  toneIds: string[];
  themeIds: string[];
  settingIds: string[];
  contentIds: string[];
  orderedTagIds: string[];
}

export type SetFilmTagsResult = { ok: true } | { ok: false; error: string };

const CAPS = {
  secondary: 2,
  subject: 3,
  toneMin: 1,
  toneMax: 3,
  theme: 3,
  setting: 2,
} as const;

/**
 * Tagging system v2. Replaces sub-project #32's setFilmTags. See spec at
 * docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md.
 *
 * Validates per-facet caps, the "Secondary in tail (position 5+)" rule,
 * the "exactly one Primary, must be subgenre" invariant, and the
 * orderedTagIds ↔ picker output set-equality. On commit, deletes all
 * existing film_tags rows for the film and re-inserts at positions 1..N
 * with is_primary set on the Primary subgenre row. In the same logical
 * transaction sets films.horror_adjacent based on Primary tag name.
 */
export async function _setFilmTags(client: Client, input: SetFilmTagsInput): Promise<SetFilmTagsResult> {
  // 1. Primary required.
  if (!input.primarySubgenreId) {
    return { ok: false, error: "Primary sub-genre is required." };
  }

  // 2. Cap checks.
  if (input.secondarySubgenreIds.length > CAPS.secondary) {
    return { ok: false, error: `At most ${CAPS.secondary} Secondary sub-genres.` };
  }
  if (input.subjectIds.length > CAPS.subject) {
    return { ok: false, error: `At most ${CAPS.subject} subject tags.` };
  }
  if (input.toneIds.length < CAPS.toneMin) {
    return { ok: false, error: `At least ${CAPS.toneMin} tone tag is required.` };
  }
  if (input.toneIds.length > CAPS.toneMax) {
    return { ok: false, error: `At most ${CAPS.toneMax} tone tags.` };
  }
  if (input.themeIds.length > CAPS.theme) {
    return { ok: false, error: `At most ${CAPS.theme} theme tags.` };
  }
  if (input.settingIds.length > CAPS.setting) {
    return { ok: false, error: `At most ${CAPS.setting} setting tags.` };
  }

  // 3. No duplicates within or across facets, no Primary in Secondaries.
  const allPickedIds = [
    input.primarySubgenreId,
    ...input.secondarySubgenreIds,
    ...input.subjectIds, ...input.toneIds, ...input.themeIds,
    ...input.settingIds, ...input.contentIds,
  ];
  if (new Set(allPickedIds).size !== allPickedIds.length) {
    return { ok: false, error: "Duplicate tags across facets." };
  }
  if (input.secondarySubgenreIds.includes(input.primarySubgenreId)) {
    return { ok: false, error: "Primary cannot also be a Secondary." };
  }

  // 4. orderedTagIds set-equals union of picked tags.
  if (input.orderedTagIds.length !== allPickedIds.length) {
    return { ok: false, error: "Ordered list does not match picked tags." };
  }
  const orderedSet = new Set(input.orderedTagIds);
  if (allPickedIds.some(id => !orderedSet.has(id))) {
    return { ok: false, error: "Ordered list is missing a picked tag." };
  }

  // 5. Slot 1 must be Primary.
  if (input.orderedTagIds[0] !== input.primarySubgenreId) {
    return { ok: false, error: "First slot must be the Primary sub-genre." };
  }

  // 6. Secondaries at index >= 4 (= film_tags position 5+ = staff guide position 6+).
  for (const sec of input.secondarySubgenreIds) {
    const idx = input.orderedTagIds.indexOf(sec);
    if (idx < 4) {
      return { ok: false, error: "Secondary sub-genres must live in the tail (slot 5+)." };
    }
  }

  // 7. Server-side type defense — verify every picked tag has the expected facet type.
  const tagRows = await client
    .from("tags")
    .select("id, name, type")
    .in("id", allPickedIds);
  if (tagRows.error) return { ok: false, error: tagRows.error.message };
  const byId = new Map((tagRows.data ?? []).map(r => [r.id, r] as const));
  if (byId.size !== allPickedIds.length) {
    return { ok: false, error: "Unknown tag id." };
  }

  function expectType(id: string, want: string, label: string): string | null {
    const row = byId.get(id);
    if (!row) return `${label} tag not found.`;
    if (row.type !== want) return `${label} must be type '${want}', got '${row.type}'.`;
    return null;
  }
  const typeErrors: (string | null)[] = [
    expectType(input.primarySubgenreId, "subgenre", "Primary"),
    ...input.secondarySubgenreIds.map(id => expectType(id, "subgenre", "Secondary")),
    ...input.subjectIds.map(id => expectType(id, "subject", "Subject")),
    ...input.toneIds.map(id => expectType(id, "tone", "Tone")),
    ...input.themeIds.map(id => expectType(id, "theme", "Theme")),
    ...input.settingIds.map(id => expectType(id, "setting", "Setting")),
    ...input.contentIds.map(id => expectType(id, "content", "Content")),
  ];
  const firstTypeErr = typeErrors.find(e => e !== null);
  if (firstTypeErr) return { ok: false, error: firstTypeErr };

  // 8. Commit: delete then insert, then update horror_adjacent.
  const del = await client.from("film_tags").delete().eq("film_id", input.filmId);
  if (del.error) return { ok: false, error: del.error.message };

  const inserts = input.orderedTagIds.map((tagId, i) => ({
    film_id: input.filmId,
    tag_id: tagId,
    position: i + 1,
    is_primary: tagId === input.primarySubgenreId,
  }));
  const ins = await client.from("film_tags").insert(inserts);
  if (ins.error) return { ok: false, error: ins.error.message };

  const primaryRow = byId.get(input.primarySubgenreId)!;
  const upd = await client.from("films").update({
    horror_adjacent: primaryRow.name === "thriller",
  }).eq("id", input.filmId);
  if (upd.error) return { ok: false, error: upd.error.message };

  return { ok: true };
}

export async function setFilmTags(input: SetFilmTagsInput): Promise<SetFilmTagsResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const service = serviceRoleClient();
  const result = await _setFilmTags(service, input);
  if (result.ok) {
    revalidatePath(`/film/${input.filmId}`);
    revalidatePath(`/admin/films`);
    revalidatePath(`/admin/films/${input.filmId}/edit`);
  }
  return result;
}
