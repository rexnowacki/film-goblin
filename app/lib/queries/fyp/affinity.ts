import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface AffinityVector {
  // Map of tag name → cumulative affinity score (floored at 0).
  // Tags absent from the map have implicit affinity 0.
  byTag: Record<string, number>;
}

export const SIGNAL_WEIGHTS = {
  watch_liked: 3.0,
  recommendation_sent: 2.5,
  library_added: 1.5,
  watchlist_added: 0.75,
  reaction: 0.20,
  watch_disliked: -4.0,
} as const;

export const FACET_MULTIPLIERS = {
  subgenre_primary: 3.0,
  subgenre_secondary: 1.5,
  tone: 1.5,
  theme: 1.5,
  subject: 1.0,
  setting: 0.75,
  content: 0.5,
} as const;

type TagFacet = "subgenre" | "subject" | "tone" | "theme" | "setting" | "content";

interface FilmTagRowRaw {
  film_id: string;
  position: number;
  is_primary: boolean;
  tag_name: string;
  tag_type: TagFacet;
}

function facetMultiplier(row: FilmTagRowRaw): number {
  switch (row.tag_type) {
    case "subgenre":
      return row.is_primary
        ? FACET_MULTIPLIERS.subgenre_primary
        : FACET_MULTIPLIERS.subgenre_secondary;
    case "tone":
      return FACET_MULTIPLIERS.tone;
    case "theme":
      return FACET_MULTIPLIERS.theme;
    case "subject":
      return FACET_MULTIPLIERS.subject;
    case "setting":
      return FACET_MULTIPLIERS.setting;
    case "content":
      return FACET_MULTIPLIERS.content;
  }
}

/**
 * Builds a per-tag affinity vector from the user's own behavioral signals.
 *
 * Pulls film-id-keyed signal weights from 5 sources (watched, library,
 * watchlists, recommendation_sent activity, activity_reactions joined to
 * parent activity payload). Then fetches all film_tags for the involved
 * film set in ONE round trip. Multiplies each tag's signal weight by its
 * facet multiplier, accumulates per tag, then floors each tag's score at 0.
 *
 * Floor happens AFTER all aggregation — a user with one liked watch and one
 * disliked watch of the same tag's films nets to 0, not re-floored per signal.
 */
export async function getUserOwnAffinity(
  client: Client,
  userId: string,
): Promise<AffinityVector> {
  // 1. Collect (filmId, signalWeight) pairs from all sources in parallel.
  const filmWeights = new Map<string, number>(); // film_id → cumulative signal weight
  function addSignal(filmId: string, weight: number) {
    filmWeights.set(filmId, (filmWeights.get(filmId) ?? 0) + weight);
  }

  const [watched, library, watchlist, recsSent, reactions] = await Promise.all([
    client
      .from("watched")
      .select("film_id, recommended")
      .eq("user_id", userId),
    client
      .from("library")
      .select("film_id")
      .eq("user_id", userId),
    client
      .from("watchlists")
      .select("film_id")
      .eq("user_id", userId),
    client
      .from("activity")
      .select("payload")
      .eq("actor_user_id", userId)
      .eq("kind", "recommendation_sent"),
    client
      .from("activity_reactions")
      .select("activity:activity!inner(payload)")
      .eq("user_id", userId),
  ]);

  // watched: recommended === true → liked, === false → disliked, null → no signal
  for (const w of watched.data ?? []) {
    if (w.recommended === true) {
      addSignal(w.film_id, SIGNAL_WEIGHTS.watch_liked);
    } else if (w.recommended === false) {
      addSignal(w.film_id, SIGNAL_WEIGHTS.watch_disliked);
    }
    // recommended === null → unrated watch, no contribution
  }

  for (const l of library.data ?? []) {
    addSignal(l.film_id, SIGNAL_WEIGHTS.library_added);
  }

  for (const wl of watchlist.data ?? []) {
    addSignal(wl.film_id, SIGNAL_WEIGHTS.watchlist_added);
  }

  for (const r of recsSent.data ?? []) {
    const filmId = (r.payload as { film_id?: string })?.film_id;
    if (filmId) addSignal(filmId, SIGNAL_WEIGHTS.recommendation_sent);
  }

  for (const rxn of reactions.data ?? []) {
    const filmId = (
      rxn as unknown as { activity: { payload: { film_id?: string } } }
    ).activity?.payload?.film_id;
    if (filmId) addSignal(filmId, SIGNAL_WEIGHTS.reaction);
  }

  if (filmWeights.size === 0) return { byTag: {} };

  // 2. Fetch tags for every involved film in one round trip.
  const { data: filmTags, error } = await client
    .from("film_tags")
    .select("film_id, position, is_primary, tag:tags!inner(name, type)")
    .in("film_id", Array.from(filmWeights.keys()));
  if (error) throw error;

  // 3. Aggregate per-tag affinity.
  const byTag: Record<string, number> = {};
  for (const row of filmTags ?? []) {
    const r = row as unknown as {
      film_id: string;
      position: number;
      is_primary: boolean;
      tag: { name: string; type: TagFacet };
    };
    const signalWeight = filmWeights.get(r.film_id);
    if (signalWeight == null) continue;
    const mult = facetMultiplier({
      film_id: r.film_id,
      position: r.position,
      is_primary: r.is_primary,
      tag_name: r.tag.name,
      tag_type: r.tag.type,
    });
    byTag[r.tag.name] = (byTag[r.tag.name] ?? 0) + signalWeight * mult;
  }

  // 4. Floor each tag's running score at 0 (after full aggregation).
  for (const k of Object.keys(byTag)) {
    if (byTag[k] < 0) byTag[k] = 0;
  }

  return { byTag };
}
