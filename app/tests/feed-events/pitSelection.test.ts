import { describe, it, expect } from "vitest";
import { rankPitCandidatesByWatchlist, PIT_WATCHLIST_BOOST } from "../../lib/feed-events/pitSelection";
import type { SystemFeedEvent } from "../../lib/feed-events/types";

function ev(id: string, filmId: string | null, priority: number): SystemFeedEvent {
  return { id, event_type: "price_drop", film_id: filmId, payload: {}, copy: "x", priority, created_at: "2026-07-08T00:00:00Z", film: null };
}

describe("rankPitCandidatesByWatchlist", () => {
  it("a low-priority watchlist match outranks a high-priority non-match", () => {
    const low = ev("low", "f1", 10);
    const high = ev("high", "f2", 100);
    const out = rankPitCandidatesByWatchlist([high, low], ["f1"]);
    expect(out.map(e => e.id)).toEqual(["low", "high"]);
  });

  it("preserves existing priority order within each group", () => {
    const wl1 = ev("wl1", "f1", 50);
    const wl2 = ev("wl2", "f2", 90);
    const other1 = ev("other1", "f3", 60);
    const other2 = ev("other2", "f4", 40);
    const out = rankPitCandidatesByWatchlist([other1, wl1, other2, wl2], ["f1", "f2"]);
    expect(out.map(e => e.id)).toEqual(["wl2", "wl1", "other1", "other2"]);
  });

  it("does not mutate the input events", () => {
    const original = ev("a", "f1", 10);
    rankPitCandidatesByWatchlist([original], ["f1"]);
    expect(original.priority).toBe(10);
  });

  it("is a no-op ordering-wise when the watchlist is empty", () => {
    const a = ev("a", "f1", 90);
    const b = ev("b", "f2", 10);
    const out = rankPitCandidatesByWatchlist([b, a], []);
    expect(out.map(e => e.id)).toEqual(["a", "b"]);
  });

  it("events with a null film_id are never boosted", () => {
    const noFilm = ev("nofilm", null, 10);
    const matched = ev("matched", "f1", 5);
    const out = rankPitCandidatesByWatchlist([noFilm, matched], ["f1"]);
    expect(out.map(e => e.id)).toEqual(["matched", "nofilm"]);
  });

  it("boosted priority is exactly priority + PIT_WATCHLIST_BOOST", () => {
    const e = ev("a", "f1", 10);
    const [out] = rankPitCandidatesByWatchlist([e], ["f1"]);
    expect(out.priority).toBe(10 + PIT_WATCHLIST_BOOST);
  });
});
