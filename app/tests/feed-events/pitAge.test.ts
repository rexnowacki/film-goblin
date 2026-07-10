import { describe, it, expect } from "vitest";
import { classifyPitEventAge, filterPitByAge, PIT_FRESH_HOURS, PIT_AGING_HOURS } from "../../lib/feed-events/pitAge";
import type { SystemFeedEvent } from "../../lib/feed-events/types";

const NOW = new Date("2026-07-09T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function ev(id: string, filmId: string | null, createdAt: string): SystemFeedEvent {
  return { id, event_type: "price_drop", film_id: filmId, payload: {}, copy: "x", priority: 90, created_at: createdAt, film: null };
}

describe("classifyPitEventAge", () => {
  it("classifies a brand-new event as fresh", () => {
    expect(classifyPitEventAge(hoursAgo(0), NOW)).toBe("fresh");
  });

  it("classifies just under 24h as fresh", () => {
    expect(classifyPitEventAge(hoursAgo(23.9), NOW)).toBe("fresh");
  });

  it("classifies exactly PIT_FRESH_HOURS as aging (upper bound exclusive)", () => {
    expect(classifyPitEventAge(hoursAgo(PIT_FRESH_HOURS), NOW)).toBe("aging");
  });

  it("classifies just under 48h as aging", () => {
    expect(classifyPitEventAge(hoursAgo(47.9), NOW)).toBe("aging");
  });

  it("classifies exactly PIT_AGING_HOURS as stale (upper bound exclusive)", () => {
    expect(classifyPitEventAge(hoursAgo(PIT_AGING_HOURS), NOW)).toBe("stale");
  });

  it("classifies well past 48h as stale", () => {
    expect(classifyPitEventAge(hoursAgo(72), NOW)).toBe("stale");
  });
});

describe("filterPitByAge", () => {
  const watchlist = ["wl-film"];

  it("keeps a fresh event even when its film is not on the watchlist", () => {
    const events = [ev("a", "other-film", hoursAgo(1))];
    expect(filterPitByAge(events, watchlist, NOW).map(e => e.id)).toEqual(["a"]);
  });

  it("keeps an aging event whose film is on the watchlist", () => {
    const events = [ev("a", "wl-film", hoursAgo(36))];
    expect(filterPitByAge(events, watchlist, NOW).map(e => e.id)).toEqual(["a"]);
  });

  it("drops an aging event whose film is NOT on the watchlist", () => {
    const events = [ev("a", "other-film", hoursAgo(36))];
    expect(filterPitByAge(events, watchlist, NOW)).toEqual([]);
  });

  it("drops an aging event with a null film_id", () => {
    const events = [ev("a", null, hoursAgo(36))];
    expect(filterPitByAge(events, watchlist, NOW)).toEqual([]);
  });

  it("drops a stale event even when its film is on the watchlist (stale beats relevance)", () => {
    const events = [ev("a", "wl-film", hoursAgo(72))];
    expect(filterPitByAge(events, watchlist, NOW)).toEqual([]);
  });

  it("handles an empty input", () => {
    expect(filterPitByAge([], watchlist, NOW)).toEqual([]);
  });

  it("does not mutate the input array or its events", () => {
    const original = ev("a", "wl-film", hoursAgo(1));
    const events = [original];
    filterPitByAge(events, watchlist, NOW);
    expect(events).toHaveLength(1);
    expect(original.film_id).toBe("wl-film");
  });

  it("filters a mixed batch, keeping only the eligible events in order", () => {
    const events = [
      ev("fresh-any", "other", hoursAgo(2)),      // fresh -> keep
      ev("aging-wl", "wl-film", hoursAgo(30)),     // aging + watchlist -> keep
      ev("aging-other", "other", hoursAgo(30)),    // aging + not watchlist -> drop
      ev("stale-wl", "wl-film", hoursAgo(60)),     // stale -> drop
    ];
    expect(filterPitByAge(events, watchlist, NOW).map(e => e.id)).toEqual(["fresh-any", "aging-wl"]);
  });
});
