import type { ScoredFilm } from "./score";
import type { AffinityVector } from "./affinity";

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
  addedAt: string;                 // ISO string from films.first_seen_at, aliased as added_at at the query boundary (see forYou.ts)
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

const SHELF_MIN = 3;
const HEXED_MAX = 12;
const LOVED_MAX = 10;
const LOVED_SHELVES = 2;
const COVEN_MAX = 10;
const NEW_MAX = 10;
const NEW_WINDOW_DAYS = 30;
const STRANGE_MAX = 8;
const MAX_PER_SUBGENRE = 3;

export interface BuildShelvesInput {
  scored: ScoredFilm[];
  metaByFilm: Map<string, ShelfFilmMeta>;
  affinity: AffinityVector;
  covenRatingByFilm: Map<string, number>;
  seed: number;
  now: Date;
}

/** Fisher–Yates-ish seeded sample without replacement. */
function seededSample<T>(items: T[], count: number, rand: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length > 0 && out.length < count) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}

/**
 * Within-shelf diversity: (1) at most MAX_PER_SUBGENRE films per primary
 * subgenre (overflow dropped, later films promoted); (2) no two consecutive
 * films by the same director, repaired by swapping forward — when no
 * different-director candidate remains, the adjacency stands (small pools).
 */
export function diversityGuard(filmIds: string[], meta: Map<string, ShelfFilmMeta>): string[] {
  const bySub = new Map<string, number>();
  const capped: string[] = [];
  for (const id of filmIds) {
    const sub = meta.get(id)?.primarySubgenre ?? null;
    if (sub !== null) {
      const n = bySub.get(sub) ?? 0;
      if (n >= MAX_PER_SUBGENRE) continue;
      bySub.set(sub, n + 1);
    }
    capped.push(id);
  }
  const out = [...capped];
  for (let i = 1; i < out.length; i++) {
    const prev = meta.get(out[i - 1])?.director;
    if (meta.get(out[i])?.director !== prev) continue;
    let j = i + 1;
    while (j < out.length && meta.get(out[j])?.director === prev) j++;
    if (j < out.length) [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Assembles the For You shelves from an already-scored (sorted) list.
 * Placement priority: Omen → Hexed → Because-you-loved ×2 → Coven → New →
 * Strange. Each film lands in at most one shelf (first claim wins); the
 * omen film is excluded from all shelves. Shelves with < SHELF_MIN films
 * after the diversity guard are dropped.
 */
export function buildShelves(input: BuildShelvesInput): { omen: ScoredFilm | null; shelves: Shelf[] } {
  const { scored, metaByFilm, affinity, covenRatingByFilm, seed, now } = input;
  const rand = mulberry32(seed);
  const claimed = new Set<string>();
  const shelves: Shelf[] = [];

  const omen = pickOmen(scored, rand);
  if (omen) claimed.add(omen.filmId);

  const unclaimed = (pred: (s: ScoredFilm) => boolean) =>
    scored.filter(s => !claimed.has(s.filmId) && pred(s));

  const push = (kind: ShelfKind, id: string, title: string, ids: string[]) => {
    const guarded = diversityGuard(ids, metaByFilm);
    if (guarded.length < SHELF_MIN) return;
    for (const fid of guarded) claimed.add(fid);
    shelves.push({ id, kind, title, filmIds: guarded });
  };

  push("hexed", "hexed", "Hexed for You",
    unclaimed(s => s.matchBand === "hexed").slice(0, HEXED_MAX).map(s => s.filmId));

  const topTags = Object.entries(affinity.byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LOVED_SHELVES)
    .map(([t]) => t);
  for (const tagName of topTags) {
    push("loved_tag", `loved:${tagName}`, `Because you loved ${tagName}`,
      unclaimed(s =>
        (s.topReason.kind === "tag" || s.topReason.kind === "lane") &&
        s.topReason.tagName === tagName,
      ).slice(0, LOVED_MAX).map(s => s.filmId));
  }

  push("coven", "coven", "Coven Favorites",
    unclaimed(s => s.covenFavorite)
      .sort((a, b) => (covenRatingByFilm.get(b.filmId) ?? 0) - (covenRatingByFilm.get(a.filmId) ?? 0))
      .slice(0, COVEN_MAX).map(s => s.filmId));

  const cutoff = now.getTime() - NEW_WINDOW_DAYS * 86_400_000;
  push("new", "new", "New to the Pit",
    unclaimed(s => {
      if (s.matchBand === "cursed_artifact") return false;
      const added = metaByFilm.get(s.filmId)?.addedAt;
      return added != null && Date.parse(added) >= cutoff;
    })
      .sort((a, b) =>
        Date.parse(metaByFilm.get(b.filmId)?.addedAt ?? "") -
        Date.parse(metaByFilm.get(a.filmId)?.addedAt ?? ""))
      .slice(0, NEW_MAX).map(s => s.filmId));

  push("strange", "strange", "Strange Pulls",
    seededSample(unclaimed(s => s.matchBand === "strange_pull"), STRANGE_MAX, rand)
      .map(s => s.filmId));

  return { omen, shelves };
}

/** Cold-start shelf wrapper (alphabetical starter pack, minus the omen). */
export function starterShelf(filmIds: string[]): Shelf {
  return { id: "starter", kind: "starter", title: "Starter Séance", filmIds };
}
