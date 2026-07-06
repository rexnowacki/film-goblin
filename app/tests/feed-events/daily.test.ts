import { describe, it, expect } from "vitest";
import { pickAnniversary, catalogThresholds, type AnniversaryCandidate } from "@/lib/feed-events/daily";

const c = (id: string, year: number, wl: number): AnniversaryCandidate =>
  ({ film_id: id, title: id, release_year: year, watchlist_count: wl });

describe("pickAnniversary", () => {
  it("prefers a round-number age (age % 5 === 0) over a higher watchlist count", () => {
    const picked = pickAnniversary([c("round", 2001, 1), c("popular", 2000, 99)], 2026);
    expect(picked?.film_id).toBe("round"); // 2026-2001 = 25
  });

  it("falls back to highest watchlist count when no round age exists", () => {
    const picked = pickAnniversary([c("a", 2002, 3), c("b", 2003, 7)], 2026);
    expect(picked?.film_id).toBe("b");
  });

  it("computes age and returns null for empty input", () => {
    expect(pickAnniversary([c("x", 1977, 0)], 2026)?.age).toBe(49);
    expect(pickAnniversary([], 2026)).toBe(null);
  });
});

describe("catalogThresholds", () => {
  it("lists every 50-threshold from 250 up to the count", () => {
    expect(catalogThresholds(322)).toEqual([250, 300]);
    expect(catalogThresholds(249)).toEqual([]);
    expect(catalogThresholds(250)).toEqual([250]);
  });
});
