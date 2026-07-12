import { describe, expect, it } from "vitest";
import {
  COVEN_SUGGESTION_LIMIT,
  excludePassiveCovenSuggestions,
  getCovenDiscoveryMode,
  pickDailyCovenSuggestions,
} from "@/lib/coven-suggestions";

const profiles = Array.from({ length: 12 }, (_, index) => ({
  id: `member-${index}`,
  username: `goblin_${index}`,
}));

describe("getCovenDiscoveryMode", () => {
  it("uses compatibility for passive discovery when matches exist", () => {
    expect(getCovenDiscoveryMode(undefined, 3)).toBe("compatibility");
    expect(getCovenDiscoveryMode("   ", 3)).toBe("compatibility");
  });

  it("falls back when passive discovery has no compatibility evidence", () => {
    expect(getCovenDiscoveryMode(undefined, 0)).toBe("fallback");
  });

  it("always preserves explicit search", () => {
    expect(getCovenDiscoveryMode("eldritch", 5)).toBe("search");
  });
});

describe("pickDailyCovenSuggestions", () => {
  it("caps passive discovery at five", () => {
    expect(
      pickDailyCovenSuggestions(profiles, "viewer", new Date("2026-07-12T18:00:00Z")),
    ).toHaveLength(COVEN_SUGGESTION_LIMIT);
  });

  it("is stable for a viewer throughout the UTC day and ignores input order", () => {
    const morning = pickDailyCovenSuggestions(
      profiles,
      "viewer",
      new Date("2026-07-12T01:00:00Z"),
    );
    const evening = pickDailyCovenSuggestions(
      [...profiles].reverse(),
      "viewer",
      new Date("2026-07-12T23:59:59Z"),
    );

    expect(evening).toEqual(morning);
  });

  it("rotates the fallback set on a new UTC day", () => {
    const firstDay = pickDailyCovenSuggestions(
      profiles,
      "viewer",
      new Date("2026-07-12T23:59:59Z"),
    );
    const nextDay = pickDailyCovenSuggestions(
      profiles,
      "viewer",
      new Date("2026-07-13T00:00:00Z"),
    );

    expect(nextDay).not.toEqual(firstDay);
  });

  it("returns every available profile when fewer than five exist", () => {
    expect(
      pickDailyCovenSuggestions(profiles.slice(0, 3), "viewer", new Date("2026-07-12T18:00:00Z")),
    ).toHaveLength(3);
  });
});

describe("excludePassiveCovenSuggestions", () => {
  it("removes pending and suppressed people from fallback without mutating the pool", () => {
    const original = [...profiles];
    const eligible = excludePassiveCovenSuggestions(profiles, ["member-1", "member-4"]);

    expect(eligible.map(profile => profile.id)).not.toContain("member-1");
    expect(eligible.map(profile => profile.id)).not.toContain("member-4");
    expect(profiles).toEqual(original);
  });
});
