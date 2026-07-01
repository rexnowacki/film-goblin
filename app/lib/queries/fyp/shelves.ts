import type { ScoredFilm } from "./score";

export type ShelfKind = "hexed" | "loved_tag" | "coven" | "new" | "strange" | "starter";

export interface Shelf {
  id: string;    // stable per kind (+tag), e.g. "loved:folk-horror"
  kind: ShelfKind;
  title: string;
  filmIds: string[];
}

/** Per-film metadata the shelf assembler needs beyond ScoredFilm. */
export interface ShelfFilmMeta {
  director: string;
  addedAt: string;                 // films.added_at ISO
  primarySubgenre: string | null;  // primary subgenre tag name, if tagged
}

/** Films eligible for the Daily Omen: the user's top-N by score. */
export const OMEN_POOL = 12;

/** Deterministic PRNG — standard mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over `userId:YYYY-MM-DD` (UTC) — same seed all day, new at midnight. */
export function dailySeed(userId: string, now: Date): number {
  const key = `${userId}:${now.toISOString().slice(0, 10)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * The Daily Omen: a seeded pick from the top OMEN_POOL scored films.
 * Deterministic within a UTC day (same seed). If the pool shrinks mid-day
 * (a film watched/dismissed), the pick re-lands deterministically on the
 * changed pool at next render.
 */
export function pickOmen(scored: ScoredFilm[], rand: () => number): ScoredFilm | null {
  const pool = scored.slice(0, OMEN_POOL);
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)];
}
