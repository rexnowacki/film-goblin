export const COVEN_SUGGESTION_LIMIT = 5;
// PostgREST's configured page ceiling. The current community is well below it,
// so passive sampling sees the whole eligible pool instead of the first 60 names.
export const COVEN_FALLBACK_POOL_LIMIT = 1_000;
export type CovenDiscoveryMode = "search" | "compatibility" | "fallback";

export function getCovenDiscoveryMode(
  query: string | undefined,
  compatibilityCount: number,
): CovenDiscoveryMode {
  if (query?.trim()) return "search";
  return compatibilityCount > 0 ? "compatibility" : "fallback";
}

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/**
 * Pick a stable daily fallback when a member has no usable taste matches.
 * Hash-ranking by profile id makes the result independent of query order,
 * while the viewer/day seed keeps refreshes steady and rotates the set daily.
 */
export function pickDailyCovenSuggestions<T extends { id: string }>(
  profiles: T[],
  viewerId: string,
  now: Date,
  limit = COVEN_SUGGESTION_LIMIT,
): T[] {
  const count = Math.max(0, Math.floor(limit));
  if (count === 0) return [];

  const day = now.toISOString().slice(0, 10);
  const seed = `${viewerId}:${day}:`;
  return [...profiles]
    .sort((a, b) => hash(`${seed}${a.id}`) - hash(`${seed}${b.id}`) || a.id.localeCompare(b.id))
    .slice(0, count);
}

export function excludePassiveCovenSuggestions<T extends { id: string }>(
  profiles: T[],
  excludedUserIds: Iterable<string>,
): T[] {
  const excluded = new Set(excludedUserIds);
  return profiles.filter(profile => !excluded.has(profile.id));
}
