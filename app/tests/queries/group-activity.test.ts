import { describe, expect, it } from "vitest";
import { groupFeed } from "@/lib/queries/group-activity";
import type { EnrichedActivity } from "@/lib/queries/activity";

function actor(id: string) {
  return {
    id,
    username: `user_${id}`,
    display_name: `User ${id}`,
    avatar_url: null,
  };
}

function film(id: string) {
  return {
    id: `film_${id}`,
    title: `Film ${id}`,
    director: "Test Director",
    year: 2024,
    artwork_url: "https://example.test/poster.jpg",
    itunes_url: "https://itunes.apple.com/test",
  };
}

function watchlist(id: string, actorId: string, createdAt: string, commentCount = 0): EnrichedActivity {
  return {
    id,
    created_at: createdAt,
    actor: actor(actorId),
    reactions: { count: 0, likedByMe: false },
    comments: { count: commentCount, items: [] },
    kind: "watchlist_added",
    film: film(id),
  };
}

function library(id: string, actorId: string, createdAt: string, commentCount = 0): EnrichedActivity {
  return {
    id,
    created_at: createdAt,
    actor: actor(actorId),
    reactions: { count: 0, likedByMe: false },
    comments: { count: commentCount, items: [] },
    kind: "library_added",
    film: film(id),
  };
}

function watchLog(id: string, actorId: string, createdAt: string, commentCount = 0): EnrichedActivity {
  return {
    id,
    created_at: createdAt,
    actor: actor(actorId),
    reactions: { count: 0, likedByMe: false },
    comments: { count: commentCount, items: [] },
    kind: "watch_logged",
    film: film(id),
    note: null,
    recommended: null,
    spoiler: false,
    viewerHasWatched: true,
  };
}

function recommendation(id: string, actorId: string, createdAt: string): EnrichedActivity {
  return {
    id,
    created_at: createdAt,
    actor: actor(actorId),
    reactions: { count: 0, likedByMe: false },
    comments: { count: 0, items: [] },
    kind: "recommendation_sent",
    film: film(id),
    recipient: actor("recipient"),
    note: "",
  };
}

describe("groupFeed daily digests", () => {
  it("returns an empty feed unchanged", () => {
    expect(groupFeed([])).toEqual([]);
  });

  it("keeps a lone save as a standalone activity", () => {
    const out = groupFeed([watchlist("a", "u1", "2026-07-11T12:00:00.000Z")]);
    expect(out).toEqual([{ type: "single", activity: expect.objectContaining({ id: "a" }) }]);
  });

  it("combines same-day watchlist and grimoire additions into one hoard digest", () => {
    const out = groupFeed([
      watchlist("watchlist", "u1", "2026-07-11T22:00:00.000Z"),
      library("library", "u1", "2026-07-11T04:00:00.000Z"),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "group",
      group: {
        key: "u1:hoard_added:2026-07-11",
        kind: "hoard_added",
        count: 2,
        utcDay: "2026-07-11",
      },
    });
  });

  it("groups same-day watches even when they are many hours apart", () => {
    const out = groupFeed([
      watchLog("late", "u1", "2026-07-11T23:30:00.000Z"),
      watchLog("early", "u1", "2026-07-11T00:15:00.000Z"),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "group", group: { kind: "watch_logged", count: 2 } });
  });

  it("does not group activity across a UTC-day boundary", () => {
    const out = groupFeed([
      watchlist("new-day", "u1", "2026-07-12T00:01:00.000Z"),
      library("old-day", "u1", "2026-07-11T23:59:00.000Z"),
    ]);

    expect(out).toHaveLength(2);
    expect(out.every(item => item.type === "single")).toBe(true);
  });

  it("groups an actor's daily activity despite other actors interleaving", () => {
    const out = groupFeed([
      watchlist("u1-new", "u1", "2026-07-11T12:05:00.000Z"),
      recommendation("u2-rec", "u2", "2026-07-11T12:04:00.000Z"),
      library("u1-old", "u1", "2026-07-11T12:03:00.000Z"),
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "group", group: { kind: "hoard_added", count: 2 } });
    expect(out[1]).toMatchObject({ type: "single", activity: { id: "u2-rec" } });
  });

  it("keeps high-signal activity standalone while digesting saves", () => {
    const out = groupFeed([
      watchlist("save-new", "u1", "2026-07-11T12:05:00.000Z"),
      recommendation("rec", "u1", "2026-07-11T12:04:00.000Z"),
      library("save-old", "u1", "2026-07-11T12:03:00.000Z"),
    ]);

    expect(out.map(item => item.type === "group" ? item.group.kind : item.type === "single" ? item.activity.kind : "system")).toEqual([
      "hoard_added",
      "recommendation_sent",
    ]);
  });

  it("keeps a commented save standalone while grouping the other same-day saves", () => {
    const out = groupFeed([
      watchlist("newest", "u1", "2026-07-11T12:05:00.000Z"),
      library("commented", "u1", "2026-07-11T12:04:00.000Z", 1),
      library("oldest", "u1", "2026-07-11T12:03:00.000Z"),
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "group", group: { count: 2 } });
    expect(out[1]).toMatchObject({ type: "single", activity: { id: "commented" } });
  });

  it("collapses the observed 43-watch, 8-watchlist, 6-grimoire burst to two cards", () => {
    const items: EnrichedActivity[] = [];
    for (let i = 0; i < 43; i++) {
      items.push(watchLog(`watch-${i}`, "el", `2026-07-11T23:${String(59 - i).padStart(2, "0")}:00.000Z`));
    }
    for (let i = 0; i < 8; i++) {
      items.push(watchlist(`watchlist-${i}`, "el", `2026-07-11T22:${String(59 - i).padStart(2, "0")}:00.000Z`));
    }
    for (let i = 0; i < 6; i++) {
      items.push(library(`library-${i}`, "el", `2026-07-11T21:${String(59 - i).padStart(2, "0")}:00.000Z`));
    }
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const out = groupFeed(items);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "group", group: { kind: "watch_logged", count: 43 } });
    expect(out[1]).toMatchObject({ type: "group", group: { kind: "hoard_added", count: 14 } });
  });
});
