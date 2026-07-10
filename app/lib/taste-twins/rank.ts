import { cosineSimilarity, type AffinityVector } from "@/lib/queries/fyp/affinity";

export type TraitFacet = "subgenre" | "subject" | "tone" | "theme" | "setting" | "content";
export interface SharedTrait { name: string; facet: TraitFacet; strength: number; }
export interface RankableTwin {
  userId: string; vector: AffinityVector; evidenceFilmCount: number;
  watchlistOverlap: number; secondDegree: boolean;
  sharedFilm: { id: string; title: string } | null;
}
export interface RankedTwin extends RankableTwin { source: "taste" | "second_degree" | "watchlist_overlap"; sharedTraits: SharedTrait[]; similarity: number; }

export function rankTasteTwins(viewer: AffinityVector, candidates: RankableTwin[], facets: Record<string, TraitFacet>, limit: number): RankedTwin[] {
  const viewerHasTaste = Object.values(viewer.byTag).some(value => value > 0);
  const ranked: RankedTwin[] = [];
  for (const candidate of candidates) {
    const similarity = viewerHasTaste ? cosineSimilarity(viewer, candidate.vector) : 0;
    const traits = Object.keys(viewer.byTag).filter(tag => (viewer.byTag[tag] ?? 0) > 0 && (candidate.vector.byTag[tag] ?? 0) > 0 && facets[tag])
      .map(tag => ({ name: tag, facet: facets[tag], strength: Math.min(viewer.byTag[tag], candidate.vector.byTag[tag]) }))
      .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
    const sharedTraits: SharedTrait[] = [];
    for (const trait of traits) if (!sharedTraits.some(item => item.facet === trait.facet)) sharedTraits.push(trait);
    if (viewerHasTaste && candidate.evidenceFilmCount >= 3 && sharedTraits.length >= 2 && similarity > 0) ranked.push({ ...candidate, source: "taste", sharedTraits: sharedTraits.slice(0, 3), similarity });
    else if (!viewerHasTaste && candidate.secondDegree) ranked.push({ ...candidate, source: "second_degree", sharedTraits: [], similarity: 0 });
    else if (!viewerHasTaste && candidate.watchlistOverlap >= 2) ranked.push({ ...candidate, source: "watchlist_overlap", sharedTraits: [], similarity: 0 });
  }
  return ranked.sort((a, b) => {
    const tier = { taste: 0, second_degree: 1, watchlist_overlap: 2 } as const;
    return tier[a.source] - tier[b.source] || b.similarity - a.similarity || b.watchlistOverlap - a.watchlistOverlap || a.userId.localeCompare(b.userId);
  }).slice(0, Math.max(0, limit));
}
