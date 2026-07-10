import { describe, expect, it } from "vitest";
import {
  bundlePitDigests,
  DIGEST_EXEMPT_TYPES,
  DIGEST_MAX_MEMBERS,
  getPitDigestPayload,
  isPitDigest,
} from "@/lib/feed-events/pitDigest";
import type { FeedEventType } from "@/lib/feed-events/copy";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

function event(id: string, eventType: FeedEventType, options: Partial<SystemFeedEvent> = {}): SystemFeedEvent {
  return {
    id,
    event_type: eventType,
    film_id: options.film_id ?? `film-${id}`,
    payload: {},
    copy: id,
    priority: options.priority ?? 50,
    created_at: options.created_at ?? "2026-07-10T12:00:00Z",
    film: options.film ?? { id: `film-${id}`, title: `Film ${id}`, artwork_url: null },
  };
}

const NOW = new Date("2026-07-10T16:00:00Z");

describe("bundlePitDigests", () => {
  it("leaves a singleton individual but combines two same-type members", () => {
    const singleton = event("single", "now_free");
    expect(bundlePitDigests([singleton], [], NOW)).toEqual([singleton]);

    const newer = event("newer", "now_free", { created_at: "2026-07-10T14:00:00Z", priority: 85 });
    const out = bundlePitDigests([singleton, newer], [], NOW);
    expect(out).toHaveLength(1);
    expect(isPitDigest(out[0]!)).toBe(true);
    expect(getPitDigestPayload(out[0]!)?.memberIds).toEqual(["newer", "single"]);
    expect(out[0]?.copy).toBe("The goblin heaped the free pile higher. **2 films** are free right now.");
  });

  it("keeps types separate and preserves personal/type-exempt events as individuals", () => {
    const watched = event("watched", "now_free", { film_id: "watchlisted" });
    const free = event("free", "now_free");
    const free2 = event("free2", "now_free");
    const allTime = event("atl", "all_time_low");
    const last = event("last", "last_showing");
    const out = bundlePitDigests([watched, free, free2, allTime, last], ["watchlisted"], NOW);

    expect(out).toEqual(expect.arrayContaining([watched, allTime, last]));
    const digest = out.find(isPitDigest);
    expect(digest?.event_type).toBe("now_free");
    expect(getPitDigestPayload(digest!)?.memberIds).toEqual(["free", "free2"]);
    expect(DIGEST_EXEMPT_TYPES).toEqual(new Set(["all_time_low", "last_showing"]));
  });

  it("caps a digest at ten newest members and gives overflow a different future batch key", () => {
    const members = Array.from({ length: DIGEST_MAX_MEMBERS + 2 }, (_, index) => event(`m${index}`, "price_drop", {
      created_at: `2026-07-10T${String(index).padStart(2, "0")}:00:00Z`,
      priority: index,
    }));
    const first = bundlePitDigests(members, [], NOW);
    const digest = first.find(isPitDigest)!;
    const payload = getPitDigestPayload(digest)!;
    expect(payload.memberIds).toHaveLength(DIGEST_MAX_MEMBERS);
    expect(payload.memberIds).toEqual(["m11", "m10", "m9", "m8", "m7", "m6", "m5", "m4", "m3", "m2"]);
    expect(digest.priority).toBe(11);

    const overflow = members.filter((member) => !payload.memberIds.includes(member.id));
    const second = bundlePitDigests(overflow, [], NOW).find(isPitDigest)!;
    expect(getPitDigestPayload(second)?.digestKey).not.toBe(payload.digestKey);
  });

  it("uses the full selected member signature, captures up to three film chips, and never mutates input", () => {
    const a = event("a", "new_film", { created_at: "2026-07-10T13:00:00Z" });
    const b = event("b", "new_film", { created_at: "2026-07-10T12:00:00Z" });
    const c = event("c", "new_film", { created_at: "2026-07-10T11:00:00Z" });
    const d = event("d", "new_film", { created_at: "2026-07-10T10:00:00Z" });
    const input = [a, b, c, d];
    const snapshot = structuredClone(input);
    const digest = bundlePitDigests(input, [], NOW)[0]!;
    const payload = getPitDigestPayload(digest)!;

    expect(digest.id).toBe("digest:new_film:2026-07-10:a,b,c,d");
    expect(digest.film_id).toBeNull();
    expect(payload.memberFilms.map((film) => film.id)).toEqual(["film-a", "film-b", "film-c"]);
    expect(payload.memberCount).toBe(4);
    expect(input).toEqual(snapshot);
  });
});
