import { describe, it, expect } from "vitest";
import { dailySeed, mulberry32, pickOmen, buildShelves, diversityGuard, starterShelf, type ShelfFilmMeta } from "@/lib/queries/fyp/shelves";
import type { ScoredFilm, MatchBand } from "@/lib/queries/fyp/score";

const scoredFilm = (id: string, score = 1): ScoredFilm => ({
  filmId: id,
  score,
  topReason: { kind: "tag", tagName: "folk-horror", contribution: score },
  matchPercent: null,
  matchVerbal: null,
  matchBand: "hexed",
  covenFavorite: false,
});

const sf = (id: string, over: Partial<ScoredFilm> = {}): ScoredFilm => ({
  ...scoredFilm(id), ...over,
});
const meta = (director: string, addedAt = "2026-01-01", primarySubgenre: string | null = null): ShelfFilmMeta =>
  ({ director, addedAt, primarySubgenre });

describe("dailySeed", () => {
  it("is stable for the same user + UTC day", () => {
    expect(dailySeed("u1", new Date("2026-07-01T03:00:00Z")))
      .toBe(dailySeed("u1", new Date("2026-07-01T22:00:00Z")));
  });
  it("changes across days and across users", () => {
    expect(dailySeed("u1", new Date("2026-07-01T12:00:00Z")))
      .not.toBe(dailySeed("u1", new Date("2026-07-02T12:00:00Z")));
    expect(dailySeed("u1", new Date("2026-07-01T12:00:00Z")))
      .not.toBe(dailySeed("u2", new Date("2026-07-01T12:00:00Z")));
  });
});

describe("pickOmen", () => {
  const pool = Array.from({ length: 20 }, (_, i) => scoredFilm(`f${i}`));

  it("picks deterministically from the top 12 for a given seed", () => {
    const a = pickOmen(pool, mulberry32(42));
    const b = pickOmen(pool, mulberry32(42));
    expect(a!.filmId).toBe(b!.filmId);
    expect(Number(a!.filmId.slice(1))).toBeLessThan(12);
  });

  it("returns null on an empty pool", () => {
    expect(pickOmen([], mulberry32(42))).toBeNull();
  });
});

describe("diversityGuard", () => {
  it("caps films per primary subgenre at 3", () => {
    const m = new Map(["a", "b", "c", "d"].map(id => [id, meta("D" + id, "2026-01-01", "slasher")]));
    expect(diversityGuard(["a", "b", "c", "d"], m)).toEqual(["a", "b", "c"]);
  });

  it("breaks up consecutive same-director runs when possible", () => {
    const m = new Map<string, ShelfFilmMeta>([
      ["a", meta("Aster")], ["b", meta("Aster")], ["c", meta("Peele")],
    ]);
    const out = diversityGuard(["a", "b", "c"], m);
    expect(out).toEqual(["a", "c", "b"]);
  });
});

describe("buildShelves", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  function makePool() {
    // 20 films: 6 hexed, 6 strong_omen, 4 strange_pull, 4 good_omen
    const bands: MatchBand[] = [
      ...Array(6).fill("hexed"), ...Array(6).fill("strong_omen"),
      ...Array(4).fill("strange_pull"), ...Array(4).fill("good_omen"),
    ];
    const scored = bands.map((band, i) =>
      sf(`f${i}`, { matchBand: band, score: 20 - i }));
    const metaByFilm = new Map(scored.map((s, i) =>
      [s.filmId, meta(`Dir${i}`, "2026-01-01", null)]));
    return { scored, metaByFilm };
  }

  it("places each film in at most one shelf and excludes the omen", () => {
    const { scored, metaByFilm } = makePool();
    const { omen, shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 42, now,
    });
    const all = shelves.flatMap(s => s.filmIds);
    expect(new Set(all).size).toBe(all.length);
    expect(omen).not.toBeNull();
    expect(all).not.toContain(omen!.filmId);
  });

  it("drops shelves with fewer than 3 films", () => {
    const scored = [sf("f0", { matchBand: "strange_pull" }), sf("f1", { matchBand: "strange_pull" })];
    const metaByFilm = new Map(scored.map(s => [s.filmId, meta("D" + s.filmId)]));
    const { shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 1, now,
    });
    expect(shelves.find(s => s.kind === "strange")).toBeUndefined();
  });

  it("builds 'Because you loved [tag]' from the top affinity tags", () => {
    const scored = [
      sf("f0", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 5 } }),
      sf("f1", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 4 } }),
      sf("f2", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 3 } }),
      sf("f3", { matchBand: "good_omen", topReason: { kind: "tag", tagName: "gore", contribution: 2 } }),
      // 4th folk-horror film so the shelf survives SHELF_MIN even after the
      // omen claims one of the pool.
      sf("f4", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 2.5 } }),
    ];
    const metaByFilm = new Map(scored.map((s, i) => [s.filmId, meta(`D${i}`)]));
    const { shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: { "folk-horror": 20, gore: 5 } },
      covenRatingByFilm: new Map(), seed: 1, now,
    });
    const loved = shelves.find(s => s.id === "loved:folk-horror");
    expect(loved).toBeDefined();
    expect(loved!.title).toBe("Because you loved folk-horror");
  });

  it("New to the Pit contains only recent adds, newest first, no cursed band", () => {
    const scored = [
      sf("f0", { matchBand: "good_omen" }), sf("f1", { matchBand: "good_omen" }),
      sf("f2", { matchBand: "good_omen" }), sf("f3", { matchBand: "cursed_artifact" }),
      sf("f4", { matchBand: "good_omen" }),
      // 4th recent film so the shelf survives SHELF_MIN after the omen claim.
      sf("f5", { matchBand: "good_omen" }),
    ];
    const metaByFilm = new Map<string, ShelfFilmMeta>([
      ["f0", meta("D0", "2026-06-25")], ["f1", meta("D1", "2026-06-28")],
      ["f2", meta("D2", "2026-06-20")], ["f3", meta("D3", "2026-06-29")],
      ["f4", meta("D4", "2025-01-01")], // too old
      ["f5", meta("D5", "2026-06-22")],
    ]);
    const { shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 999999, now,
    });
    const shelf = shelves.find(s => s.kind === "new");
    expect(shelf).toBeDefined();
    const ids = shelf!.filmIds.filter(id => id !== undefined);
    expect(ids).not.toContain("f3");
    expect(ids).not.toContain("f4");
    // newest-first among survivors (omen may have claimed one)
    const order = ids.map(id => metaByFilm.get(id)!.addedAt);
    expect([...order].sort().reverse()).toEqual(order);
  });

  it("shelf composition is stable for the same seed", () => {
    const { scored, metaByFilm } = makePool();
    const run = () => buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 7, now,
    });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe("starterShelf", () => {
  it("wraps ids as the Starter Séance shelf", () => {
    const s = starterShelf(["a", "b", "c"]);
    expect(s).toEqual({ id: "starter", kind: "starter", title: "Starter Séance", filmIds: ["a", "b", "c"] });
  });
});
