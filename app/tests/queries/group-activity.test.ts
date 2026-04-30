import { describe, it, expect } from "vitest";
import { groupFeed } from "@/lib/queries/group-activity";
import type { EnrichedActivity } from "@/lib/queries/activity";

function watchlist(opts: { id: string; actorId: string; minutesAgo: number }): EnrichedActivity {
  const created = new Date(Date.now() - opts.minutesAgo * 60 * 1000).toISOString();
  return {
    id: opts.id,
    created_at: created,
    actor: {
      id: opts.actorId,
      username: `user_${opts.actorId}`,
      display_name: `User ${opts.actorId}`,
      avatar_url: null,
    },
    reactions: { count: 0, likedByMe: false },
    comments: { count: 0, items: [] },
    kind: "watchlist_added",
    film: {
      id: `film_${opts.id}`,
      title: `Film ${opts.id}`,
      director: "Test Director",
      year: 2024,
      artwork_url: "https://example.test/poster.jpg",
      itunes_url: "https://itunes.apple.com/test",
    },
  };
}

function rec(opts: { id: string; actorId: string; minutesAgo: number }): EnrichedActivity {
  const created = new Date(Date.now() - opts.minutesAgo * 60 * 1000).toISOString();
  return {
    id: opts.id,
    created_at: created,
    actor: {
      id: opts.actorId,
      username: `user_${opts.actorId}`,
      display_name: `User ${opts.actorId}`,
      avatar_url: null,
    },
    reactions: { count: 0, likedByMe: false },
    comments: { count: 0, items: [] },
    kind: "recommendation_sent",
    film: {
      id: `film_${opts.id}`,
      title: `Film ${opts.id}`,
      director: "Test Director",
      year: 2024,
      artwork_url: "https://example.test/poster.jpg",
      itunes_url: "https://itunes.apple.com/test",
    },
    recipient: {
      id: "rec_target",
      username: "target",
      display_name: "Target",
      avatar_url: null,
    },
    note: "",
  };
}

function watchLog(opts: { id: string; actorId: string; minutesAgo: number }): EnrichedActivity {
  const created = new Date(Date.now() - opts.minutesAgo * 60 * 1000).toISOString();
  return {
    id: opts.id,
    created_at: created,
    actor: {
      id: opts.actorId,
      username: `user_${opts.actorId}`,
      display_name: `User ${opts.actorId}`,
      avatar_url: null,
    },
    reactions: { count: 0, likedByMe: false },
    comments: { count: 0, items: [] },
    kind: "watch_logged",
    film: {
      id: `film_${opts.id}`,
      title: `Film ${opts.id}`,
      director: "Test Director",
      year: 2024,
      artwork_url: "https://example.test/poster.jpg",
      itunes_url: "https://itunes.apple.com/test",
    },
    note: null,
  };
}

describe("groupFeed", () => {
  it("returns empty array for empty input", () => {
    expect(groupFeed([])).toEqual([]);
  });

  it("returns one single for one event", () => {
    const items = [watchlist({ id: "a", actorId: "u1", minutesAgo: 5 })];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("single");
  });

  it("returns two singles for 2 same-actor events in window (v1.0 walk-back)", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 15 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("single");
    expect(out[1].type).toBe("single");
  });

  it("returns one group of 3 for 3 same-actor events in window", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 15 }),
      watchlist({ id: "c", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.count).toBe(3);
      expect(out[0].group.items).toHaveLength(3);
      expect(out[0].group.key).toBe("u1:watchlist_added:c");
    }
  });

  it("returns one group of 5 for 5 same-actor events in window", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 10 }),
      watchlist({ id: "c", actorId: "u1", minutesAgo: 15 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.count).toBe(5);
    }
  });

  it("splits when interrupted by a different actor's event", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 10 }),
      watchlist({ id: "c", actorId: "u2", minutesAgo: 15 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(5);
    expect(out.every(i => i.type === "single")).toBe(true);
  });

  it("splits when interrupted by same actor's different kind", () => {
    const items: EnrichedActivity[] = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 10 }),
      rec({ id: "c", actorId: "u1", minutesAgo: 15 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(5);
    expect(out.every(i => i.type === "single")).toBe(true);
  });

  it("seals the run when 30-min gap rule fires", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "c", actorId: "u1", minutesAgo: 60 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 75 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 90 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe("single");
    expect(out[1].type).toBe("single");
    expect(out[2].type).toBe("group");
    if (out[2].type === "group") {
      expect(out[2].group.count).toBe(3);
    }
  });

  it("seals the run when 24-hour span ceiling fires", () => {
    // 60 events at 25-min intervals → spans ~24h35m total, but every gap
    // is well under 30 min, so only the span ceiling can split this run.
    const items: EnrichedActivity[] = [];
    for (let i = 0; i < 60; i++) {
      items.push(watchlist({ id: `a${i}`, actorId: "u1", minutesAgo: i * 25 }));
    }
    const out = groupFeed(items);
    // Span ceiling must trigger at least one split → more than one output item.
    expect(out.length).toBeGreaterThan(1);
  });

  it("non-groupable kinds always pass through as single", () => {
    const items = [
      rec({ id: "a", actorId: "u1", minutesAgo: 5 }),
      rec({ id: "b", actorId: "u1", minutesAgo: 10 }),
      rec({ id: "c", actorId: "u1", minutesAgo: 15 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(3);
    expect(out.every(i => i.type === "single")).toBe(true);
  });
});

describe("groupFeed: watch_logged", () => {
  it("groups 3+ same-actor watch_logged events within window", () => {
    const items: EnrichedActivity[] = [
      watchLog({ id: "3", actorId: "u1", minutesAgo: 0 }),
      watchLog({ id: "2", actorId: "u1", minutesAgo: 5 }),
      watchLog({ id: "1", actorId: "u1", minutesAgo: 10 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.kind).toBe("watch_logged");
      expect(out[0].group.count).toBe(3);
    }
  });

  it("doesn't group 2 events (below MIN_GROUP_SIZE)", () => {
    const items: EnrichedActivity[] = [
      watchLog({ id: "2", actorId: "u1", minutesAgo: 0 }),
      watchLog({ id: "1", actorId: "u1", minutesAgo: 5 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(2);
    expect(out.every(x => x.type === "single")).toBe(true);
  });

  it("doesn't group across kinds (watchlist_added + watch_logged interleave)", () => {
    const items: EnrichedActivity[] = [
      watchLog({ id: "3", actorId: "u1", minutesAgo: 0 }),
      watchlist({ id: "2", actorId: "u1", minutesAgo: 5 }),
      watchLog({ id: "1", actorId: "u1", minutesAgo: 10 }),
    ];
    const out = groupFeed(items);
    expect(out.every(x => x.type === "single")).toBe(true);
  });
});
