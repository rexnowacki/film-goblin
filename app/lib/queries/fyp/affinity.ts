import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";

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

// ---------------------------------------------------------------------------
// Lane affinity
// ---------------------------------------------------------------------------

export const LANE_WEIGHT = 1.5;

/**
 * Returns +1.5 for each tag in the user's lanes set. Lanes are a deliberate
 * editorial signal — the user picked these — so they get a flat bump rather
 * than the facet-multiplier treatment that own behavioral signals get.
 * Empty lanes = empty vector.
 */
export async function getLaneAffinity(
  client: Client,
  userId: string,
): Promise<AffinityVector> {
  const profile = await client
    .from("profiles")
    .select("lane_tag_ids")
    .eq("id", userId)
    .maybeSingle();
  const ids = (profile.data?.lane_tag_ids ?? []) as string[];
  if (ids.length === 0) return { byTag: {} };

  const tags = await client.from("tags").select("name").in("id", ids);
  const byTag: Record<string, number> = {};
  for (const t of tags.data ?? []) {
    byTag[t.name] = LANE_WEIGHT;
  }
  return { byTag };
}

// ---------------------------------------------------------------------------
// Coven-borrowed affinity
// ---------------------------------------------------------------------------

export const COVEN_PRIOR_SCALE = 0.3;

/**
 * Aggregates each coven mate's own-affinity vector, weighted by the user's
 * 90-day interaction score with that mate (from getRankedCovenfolk in #34).
 * Result is scaled by COVEN_PRIOR_SCALE (0.3) so behavior dominates lanes
 * which dominates the coven prior.
 *
 * NOTE: This calls getUserOwnAffinity per coven mate — the slow-path the
 * spec documents as the future cache target. A cache wrapper belongs here
 * at mid-scale: replace the per-mate getUserOwnAffinity call with a cached
 * read, keeping the rest of this function unchanged.
 */
export async function getCovenBorrowedAffinity(
  client: Client,
  userId: string,
): Promise<AffinityVector> {
  const ranked = await getRankedCovenfolk(client, userId);
  if (ranked.length === 0) return { byTag: {} };

  // Treat all-zero scores (a fresh user with covenfolk but no interactions)
  // as equal weights so the vector still surfaces something meaningful rather
  // than dividing by zero.
  const totalScore = ranked.reduce((s, r) => s + r.score, 0);
  const useEqualWeights = totalScore === 0;

  const accum: Record<string, number> = {};
  for (const mate of ranked) {
    // Future cache seam: replace this call with a cached affinity read.
    const mateAffinity = await getUserOwnAffinity(client, mate.id);
    const weight = useEqualWeights
      ? 1 / ranked.length
      : mate.score / totalScore;
    for (const [tag, val] of Object.entries(mateAffinity.byTag)) {
      accum[tag] = (accum[tag] ?? 0) + val * weight;
    }
  }

  for (const k of Object.keys(accum)) {
    accum[k] *= COVEN_PRIOR_SCALE;
  }

  return { byTag: accum };
}

// ---------------------------------------------------------------------------
// Composed user affinity (the public seam)
// ---------------------------------------------------------------------------

/**
 * Sums own + coven-borrowed + lanes, then floors per-tag at 0. This is the
 * single seam where a future cache wrapper drops in: getUserAffinity becomes
 * the call site downstream code uses, and a cache lookup (with a fallback to
 * recompute) sits here without touching any caller.
 */
export async function getUserAffinity(
  client: Client,
  userId: string,
): Promise<AffinityVector> {
  const [own, coven, lanes] = await Promise.all([
    getUserOwnAffinity(client, userId),
    getCovenBorrowedAffinity(client, userId),
    getLaneAffinity(client, userId),
  ]);

  const byTag: Record<string, number> = {};
  for (const src of [own, coven, lanes]) {
    for (const [tag, val] of Object.entries(src.byTag)) {
      byTag[tag] = (byTag[tag] ?? 0) + val;
    }
  }

  // Floor at 0 (defensive — getUserOwnAffinity already floors, but the
  // composed sum could in theory go negative if future sources contribute
  // negatives; keep a single authoritative floor here).
  for (const k of Object.keys(byTag)) {
    if (byTag[k] < 0) byTag[k] = 0;
  }

  return { byTag };
}
