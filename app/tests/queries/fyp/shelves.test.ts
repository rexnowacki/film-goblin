import { describe, it, expect } from "vitest";
import { dailySeed, mulberry32, pickOmen } from "@/lib/queries/fyp/shelves";
import type { ScoredFilm } from "@/lib/queries/fyp/score";

const scoredFilm = (id: string, score = 1): ScoredFilm => ({
  filmId: id,
  score,
  topReason: { kind: "tag", tagName: "folk-horror", contribution: score },
  matchPercent: null,
  matchVerbal: null,
  matchBand: "hexed",
  covenFavorite: false,
});

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
