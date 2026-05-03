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

/**
 * Per-tag affinity ceiling. Prevents one runaway tag (e.g. `atmospheric`,
 * which appears on most horror films) from dominating the vector and
 * drowning out distinctive taste markers.
 */
export const AFFINITY_CAP = 30;

/**
 * Time-decay half-life in years. A 1-year-old signal contributes 0.5×; a
 * 2-year-old signal 0.25×. Recent signals dominate; ancient ones fade.
 * Tune up (longer half-life) if recent-bias feels too aggressive.
 */
export const DECAY_HALF_LIFE_YEARS = 1;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Returns the decay multiplier for a signal observed at `createdAt`.
 * `0.5 ^ (years_since_created / DECAY_HALF_LIFE_YEARS)`.
 * Future timestamps (clock skew etc.) clamp to 1.0.
 */
function timeDecay(createdAt: string | null | undefined, now: number = Date.now()): number {
  if (!createdAt) return 1.0;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return 1.0;
  const yearsOld = Math.max(0, (now - t) / MS_PER_YEAR);
  return Math.pow(0.5, yearsOld / DECAY_HALF_LIFE_YEARS);
}

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
      .select("film_id, recommended, created_at")
      .eq("user_id", userId),
    client
      .from("library")
      .select("film_id, created_at")
      .eq("user_id", userId),
    client
      .from("watchlists")
      .select("film_id, created_at")
      .eq("user_id", userId),
    client
      .from("activity")
      .select("payload, created_at")
      .eq("actor_user_id", userId)
      .eq("kind", "recommendation_sent"),
    client
      .from("activity_reactions")
      .select("created_at, activity:activity!inner(payload)")
      .eq("user_id", userId),
  ]);

  const now = Date.now();

  // watched: recommended === true → liked, === false → disliked, null → no signal
  // Apply time decay per row.
  for (const w of watched.data ?? []) {
    const decay = timeDecay(w.created_at, now);
    if (w.recommended === true) {
      addSignal(w.film_id, SIGNAL_WEIGHTS.watch_liked * decay);
    } else if (w.recommended === false) {
      addSignal(w.film_id, SIGNAL_WEIGHTS.watch_disliked * decay);
    }
    // recommended === null → unrated watch, no contribution
  }

  for (const l of library.data ?? []) {
    addSignal(l.film_id, SIGNAL_WEIGHTS.library_added * timeDecay(l.created_at, now));
  }

  for (const wl of watchlist.data ?? []) {
    addSignal(wl.film_id, SIGNAL_WEIGHTS.watchlist_added * timeDecay(wl.created_at, now));
  }

  for (const r of recsSent.data ?? []) {
    const filmId = (r.payload as { film_id?: string })?.film_id;
    if (filmId) addSignal(filmId, SIGNAL_WEIGHTS.recommendation_sent * timeDecay(r.created_at, now));
  }

  for (const rxn of reactions.data ?? []) {
    const r = rxn as unknown as {
      created_at: string;
      activity: { payload: { film_id?: string } };
    };
    const filmId = r.activity?.payload?.film_id;
    if (filmId) addSignal(filmId, SIGNAL_WEIGHTS.reaction * timeDecay(r.created_at, now));
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

  // 4. Floor at 0 + cap at AFFINITY_CAP, after full aggregation.
  for (const k of Object.keys(byTag)) {
    if (byTag[k] < 0) byTag[k] = 0;
    else if (byTag[k] > AFFINITY_CAP) byTag[k] = AFFINITY_CAP;
  }

  return { byTag };
}

// ---------------------------------------------------------------------------
// Aversion vector (explicit dislikes)
// ---------------------------------------------------------------------------

/**
 * Builds the user's aversion vector — per-tag accumulated MAGNITUDE of
 * negative-rated watch signals (recommended = false). Returned as POSITIVE
 * numbers (it's the magnitude of dislike, not a negative affinity).
 *
 * Same time decay + facet multiplier + cap as getUserOwnAffinity. Each
 * disliked watch contributes |watch_disliked weight| × decay × μ(facet)
 * to every tag on that film.
 *
 * Used by scoreOneFilm in v3 to subtract aversion mass from raw score.
 */
export async function getUserAversion(
  client: Client,
  userId: string,
): Promise<AffinityVector> {
  const { data: disliked } = await client
    .from("watched")
    .select("film_id, created_at")
    .eq("user_id", userId)
    .eq("recommended", false);

  if (!disliked || disliked.length === 0) return { byTag: {} };

  const now = Date.now();
  const filmWeights = new Map<string, number>();
  const aversionSignalWeight = Math.abs(SIGNAL_WEIGHTS.watch_disliked); // 4.0

  for (const w of disliked) {
    const decay = timeDecay(w.created_at, now);
    filmWeights.set(
      w.film_id,
      (filmWeights.get(w.film_id) ?? 0) + aversionSignalWeight * decay,
    );
  }

  const { data: filmTags, error } = await client
    .from("film_tags")
    .select("film_id, position, is_primary, tag:tags!inner(name, type)")
    .in("film_id", Array.from(filmWeights.keys()));
  if (error) throw error;

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

  // Floor at 0 (always non-negative) + cap at AFFINITY_CAP.
  for (const k of Object.keys(byTag)) {
    if (byTag[k] < 0) byTag[k] = 0;
    else if (byTag[k] > AFFINITY_CAP) byTag[k] = AFFINITY_CAP;
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
 * Cosine similarity between two affinity vectors (treating each as sparse
 * vectors over the tag vocabulary). Returns 0..1 for non-empty vectors,
 * 0 if either is empty, NaN-safe.
 */
export function cosineSimilarity(a: AffinityVector, b: AffinityVector): number {
  let dot = 0;
  let aMagSq = 0;
  let bMagSq = 0;
  // Sum a · b over a's tags (b's missing tags contribute 0)
  for (const [tag, va] of Object.entries(a.byTag)) {
    const vb = b.byTag[tag] ?? 0;
    dot += va * vb;
    aMagSq += va * va;
  }
  // Sum b's magnitude separately (over b's full tag set)
  for (const v of Object.values(b.byTag)) bMagSq += v * v;
  if (aMagSq === 0 || bMagSq === 0) return 0;
  return dot / (Math.sqrt(aMagSq) * Math.sqrt(bMagSq));
}

/**
 * Aggregates each coven mate's own-affinity vector, weighted by COSINE
 * SIMILARITY between the user's own vector and each mate's vector — close-
 * taste mates contribute more than distant ones. Negative or zero similarity
 * mates are excluded entirely. Result is scaled by COVEN_PRIOR_SCALE (0.3).
 *
 * Cold-start fallback: when the user's own vector is empty (brand-new user
 * with covenfolk but no behavioral history), revert to interaction-score
 * weighting from getRankedCovenfolk so the prior is still meaningful.
 *
 * NOTE: calls getUserOwnAffinity per coven mate — the slow-path the spec
 * documents as the future cache target. A cache wrapper belongs here at
 * mid-scale: replace the per-mate call with a cached read, keeping the
 * weighting math unchanged.
 */
export async function getCovenBorrowedAffinity(
  client: Client,
  userId: string,
): Promise<AffinityVector> {
  const ranked = await getRankedCovenfolk(client, userId);
  if (ranked.length === 0) return { byTag: {} };

  // Need the user's own vector to compute cosine similarity. Cold-start
  // (empty own vector) → fall back to interaction-score weighting.
  const ownVec = await getUserOwnAffinity(client, userId);
  const ownEmpty = Object.keys(ownVec.byTag).length === 0;

  // Pre-fetch all mates' vectors in serial (parallel would also work; serial
  // is fine at coven sizes ≤ a few dozen and keeps memory pressure low).
  const mateVecs: Array<{ mateId: string; score: number; vec: AffinityVector }> = [];
  for (const mate of ranked) {
    const vec = await getUserOwnAffinity(client, mate.id);
    mateVecs.push({ mateId: mate.id, score: mate.score, vec });
  }

  // Compute mate weights.
  let weights: Map<string, number>;
  if (ownEmpty) {
    // Cold-start: use interaction scores; equal weight if all zero.
    const totalScore = mateVecs.reduce((s, m) => s + m.score, 0);
    if (totalScore === 0) {
      const w = 1 / mateVecs.length;
      weights = new Map(mateVecs.map(m => [m.mateId, w]));
    } else {
      weights = new Map(mateVecs.map(m => [m.mateId, m.score / totalScore]));
    }
  } else {
    // Cosine-weighted: similarity to user's own vector. Negatives floored at 0.
    const sims = mateVecs.map(m => ({ mateId: m.mateId, sim: Math.max(0, cosineSimilarity(ownVec, m.vec)) }));
    const totalSim = sims.reduce((s, x) => s + x.sim, 0);
    if (totalSim === 0) {
      // No mate has any taste overlap with the user. Don't pull the vector
      // anywhere — return an empty borrow.
      return { byTag: {} };
    }
    weights = new Map(sims.map(x => [x.mateId, x.sim / totalSim]));
  }

  const accum: Record<string, number> = {};
  for (const m of mateVecs) {
    const w = weights.get(m.mateId) ?? 0;
    if (w === 0) continue;
    for (const [tag, val] of Object.entries(m.vec.byTag)) {
      accum[tag] = (accum[tag] ?? 0) + val * w;
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

  // Floor at 0 + cap at AFFINITY_CAP, after composing all sources.
  // Defensive — own/lane/coven layers each cap individually, but lane (1.5)
  // + coven prior + own (≤ cap) could in theory exceed the cap when summed;
  // re-clamp here so the composed vector matches the documented bound.
  for (const k of Object.keys(byTag)) {
    if (byTag[k] < 0) byTag[k] = 0;
    else if (byTag[k] > AFFINITY_CAP) byTag[k] = AFFINITY_CAP;
  }

  return { byTag };
}
