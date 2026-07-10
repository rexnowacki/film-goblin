import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { AFFINITY_CAP, FACET_MULTIPLIERS, SIGNAL_WEIGHTS, type AffinityVector } from "@/lib/queries/fyp/affinity";
import { rankTasteTwins, type TraitFacet } from "@/lib/taste-twins/rank";

type Client = SupabaseClient<Database>;
type SignalRow = { user_id: string; film_id: string; weight: number };
type TagRow = { film_id: string; name: string; facet: TraitFacet; isPrimary: boolean };
export interface TasteTwinSuggestion {
  user: { id: string; username: string; avatar_url: string | null };
  sharedTraits: Array<{ name: string; facet: TraitFacet }>;
  sharedFilm: { id: string; title: string } | null;
  source: "taste" | "second_degree" | "watchlist_overlap";
}

export function buildBulkAffinityVectors(signals: SignalRow[], tags: TagRow[]): Map<string, { vector: AffinityVector; evidenceFilmCount: number }> {
  const tagsByFilm = new Map<string, TagRow[]>();
  for (const tag of tags) tagsByFilm.set(tag.film_id, [...(tagsByFilm.get(tag.film_id) ?? []), tag]);
  const weights = new Map<string, Map<string, number>>();
  for (const signal of signals) {
    const user = weights.get(signal.user_id) ?? new Map<string, number>();
    user.set(signal.film_id, (user.get(signal.film_id) ?? 0) + signal.weight);
    weights.set(signal.user_id, user);
  }
  const out = new Map<string, { vector: AffinityVector; evidenceFilmCount: number }>();
  for (const [userId, films] of weights) {
    const byTag: Record<string, number> = {};
    let evidenceFilmCount = 0;
    for (const [filmId, weight] of films) {
      if (weight > 0) evidenceFilmCount += 1;
      for (const tag of tagsByFilm.get(filmId) ?? []) {
        const multiplier = tag.facet === "subgenre"
          ? (tag.isPrimary ? FACET_MULTIPLIERS.subgenre_primary : FACET_MULTIPLIERS.subgenre_secondary)
          : FACET_MULTIPLIERS[tag.facet];
        byTag[tag.name] = (byTag[tag.name] ?? 0) + weight * multiplier;
      }
    }
    for (const tag of Object.keys(byTag)) byTag[tag] = Math.min(AFFINITY_CAP, Math.max(0, byTag[tag]));
    out.set(userId, { vector: { byTag }, evidenceFilmCount });
  }
  return out;
}

export async function getTasteTwinSuggestions(client: Client, viewerId: string, limit = 6): Promise<TasteTwinSuggestion[]> {
  const now = new Date().toISOString();
  const [profilesRes, edgesRes, requestsRes, suppressionsRes] = await Promise.all([
    client.from("profiles").select("id, username, avatar_url").eq("discoverable", true).neq("id", viewerId).limit(100),
    client.from("coven_members").select("user_a_id, user_b_id").or(`user_a_id.eq.${viewerId},user_b_id.eq.${viewerId}`),
    client.from("coven_requests").select("from_user_id, to_user_id").eq("status", "pending").or(`from_user_id.eq.${viewerId},to_user_id.eq.${viewerId}`),
    client.from("taste_twin_suppressions").select("candidate_id").eq("viewer_id", viewerId).gt("suppressed_until", now),
  ]);
  const firstError = profilesRes.error ?? edgesRes.error ?? requestsRes.error ?? suppressionsRes.error;
  if (firstError) throw firstError;
  const excluded = new Set<string>([viewerId]);
  for (const edge of edgesRes.data ?? []) excluded.add(edge.user_a_id === viewerId ? edge.user_b_id : edge.user_a_id);
  for (const req of requestsRes.data ?? []) excluded.add(req.from_user_id === viewerId ? req.to_user_id : req.from_user_id);
  for (const row of suppressionsRes.data ?? []) excluded.add(row.candidate_id);
  const profiles = (profilesRes.data ?? []).filter(profile => !excluded.has(profile.id));
  if (!profiles.length) return [];
  const userIds = [viewerId, ...profiles.map(profile => profile.id)];

  const [watchedRes, libraryRes, watchlistRes, recsRes] = await Promise.all([
    client.from("watched").select("user_id, film_id, recommended").in("user_id", userIds),
    client.from("library").select("user_id, film_id").in("user_id", userIds),
    client.from("watchlists").select("user_id, film_id").in("user_id", userIds),
    client.from("recommendations").select("from_user_id, film_id").in("from_user_id", userIds),
  ]);
  const signalError = watchedRes.error ?? libraryRes.error ?? watchlistRes.error ?? recsRes.error;
  if (signalError) throw signalError;
  const signals: SignalRow[] = [];
  for (const row of watchedRes.data ?? []) if (row.recommended != null) signals.push({ user_id: row.user_id, film_id: row.film_id, weight: row.recommended ? SIGNAL_WEIGHTS.watch_liked : SIGNAL_WEIGHTS.watch_disliked });
  for (const row of libraryRes.data ?? []) signals.push({ user_id: row.user_id, film_id: row.film_id, weight: SIGNAL_WEIGHTS.library_added });
  for (const row of watchlistRes.data ?? []) signals.push({ user_id: row.user_id, film_id: row.film_id, weight: SIGNAL_WEIGHTS.watchlist_added });
  for (const row of recsRes.data ?? []) signals.push({ user_id: row.from_user_id, film_id: row.film_id, weight: SIGNAL_WEIGHTS.recommendation_sent });
  const filmIds = [...new Set(signals.map(signal => signal.film_id))];
  const tagRes = filmIds.length ? await client.from("film_tags").select("film_id, is_primary, tag:tags!inner(name, type)").in("film_id", filmIds) : { data: [], error: null };
  if (tagRes.error) throw tagRes.error;
  const tags: TagRow[] = (tagRes.data ?? []).map(row => {
    const tag = row.tag as unknown as { name: string; type: TraitFacet };
    return { film_id: row.film_id, name: tag.name, facet: tag.type, isPrimary: row.is_primary };
  });
  const vectors = buildBulkAffinityVectors(signals, tags);
  const facets = Object.fromEntries(tags.map(tag => [tag.name, tag.facet])) as Record<string, TraitFacet>;

  const viewerWatchlist = new Set((watchlistRes.data ?? []).filter(row => row.user_id === viewerId).map(row => row.film_id));
  const candidateWatchlists = new Map<string, string[]>();
  for (const row of watchlistRes.data ?? []) if (row.user_id !== viewerId && viewerWatchlist.has(row.film_id)) candidateWatchlists.set(row.user_id, [...(candidateWatchlists.get(row.user_id) ?? []), row.film_id]);
  const sharedIds = [...new Set([...candidateWatchlists.values()].flat())];
  const sharedFilmsRes = sharedIds.length ? await client.from("films").select("id, title").in("id", sharedIds) : { data: [], error: null };
  if (sharedFilmsRes.error) throw sharedFilmsRes.error;
  const filmById = new Map((sharedFilmsRes.data ?? []).map(film => [film.id, film]));

  const memberIds = (edgesRes.data ?? []).map(edge => edge.user_a_id === viewerId ? edge.user_b_id : edge.user_a_id);
  const secondEdgesRes = memberIds.length ? await client.from("coven_members").select("user_a_id, user_b_id").or(`user_a_id.in.(${memberIds.join(",")}),user_b_id.in.(${memberIds.join(",")})`) : { data: [], error: null };
  const secondDegree = new Set<string>();
  for (const edge of secondEdgesRes.data ?? []) {
    if (memberIds.includes(edge.user_a_id)) secondDegree.add(edge.user_b_id);
    if (memberIds.includes(edge.user_b_id)) secondDegree.add(edge.user_a_id);
  }

  const viewer = vectors.get(viewerId)?.vector ?? { byTag: {} };
  const ranked = rankTasteTwins(viewer, profiles.map(profile => {
    const overlap = candidateWatchlists.get(profile.id) ?? [];
    const shared = overlap[0] ? filmById.get(overlap[0]) : null;
    const built = vectors.get(profile.id) ?? { vector: { byTag: {} }, evidenceFilmCount: 0 };
    return { userId: profile.id, ...built, watchlistOverlap: overlap.length, secondDegree: secondDegree.has(profile.id), sharedFilm: shared ? { id: shared.id, title: shared.title } : null };
  }), facets, limit);
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  return ranked.flatMap(item => {
    const profile = profileById.get(item.userId); if (!profile) return [];
    return [{ user: profile, sharedTraits: item.sharedTraits.map(({ name, facet }) => ({ name, facet })), sharedFilm: item.sharedFilm, source: item.source }];
  });
}
