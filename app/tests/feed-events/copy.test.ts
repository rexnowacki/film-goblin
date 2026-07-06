import { describe, it, expect } from "vitest";
import { renderCopy, pickVariant, variantCount, stripLeadingEmoji, EVENT_PRIORITY } from "@/lib/feed-events/copy";

describe("renderCopy", () => {
  it("price_drop variant 0 formats both prices", () => {
    expect(renderCopy("price_drop", { title: "Suspiria", price: 4.99, old_price: 14.99 }, 0)).toBe(
      "The blood price falls. **Suspiria** is now $4.99 — down from $14.99."
    );
  });

  it("all_time_low variant 0", () => {
    expect(renderCopy("all_time_low", { title: "Suspiria", price: 4.99 }, 0)).toBe(
      "ALL-TIME LOW: **Suspiria** at $4.99. The moon is right. The price is finally right too."
    );
  });

  it("anniversary variant 1 uses the release year", () => {
    expect(renderCopy("anniversary", { title: "Suspiria", year: 1977, age: 49 }, 1)).toBe(
      "On this night in 1977, **Suspiria** was released. Burn something."
    );
  });

  it("milestone monthly appends 'Appropriate.' only for 13/66/666", () => {
    expect(renderCopy("milestone", { n: 13, milestone_kind: "monthly" }, 0)).toBe(
      "The coven watched 13 films together this month. Appropriate."
    );
    expect(renderCopy("milestone", { n: 14, milestone_kind: "monthly" }, 0)).toBe(
      "The coven watched 14 films together this month."
    );
  });

  it("goblin_pick includes the one-liner", () => {
    expect(renderCopy("goblin_pick", { title: "Possession", year: 1981, one_line: "Do not watch with a spouse." }, 0)).toBe(
      "The goblin's counsel this week: **Possession** (1981). Do not watch with a spouse."
    );
  });
});

describe("stripLeadingEmoji", () => {
  it("grooms pre-2026-07-06 stored copy that opens with an emoji", () => {
    expect(stripLeadingEmoji("🎉 The pit now holds 300 films. The hoard grows.")).toBe(
      "The pit now holds 300 films. The hoard grows."
    );
    expect(stripLeadingEmoji("📈 The window closes. **It Comes At Night** climbs back to $12.99. You were warned.")).toBe(
      "The window closes. **It Comes At Night** climbs back to $12.99. You were warned."
    );
    expect(stripLeadingEmoji("🕯️ Summoned to the pit: **Suspiria** (1977).")).toBe(
      "Summoned to the pit: **Suspiria** (1977)."
    );
  });

  it("leaves emoji-free copy untouched", () => {
    expect(stripLeadingEmoji("The blood price falls.")).toBe("The blood price falls.");
  });
});

describe("pickVariant", () => {
  it("never repeats the previous variant when more than one exists", () => {
    for (let i = 0; i < 20; i++) {
      const v = pickVariant("price_drop", {}, 1, Math.random);
      expect(v).not.toBe(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(variantCount("price_drop"));
    }
  });

  it("returns 0 for single-variant types regardless of prev", () => {
    expect(pickVariant("goblin_pick", {}, 0, Math.random)).toBe(0);
  });
});

describe("EVENT_PRIORITY", () => {
  it("matches the spec ordering", () => {
    expect(EVENT_PRIORITY.all_time_low).toBeGreaterThan(EVENT_PRIORITY.price_drop);
    expect(EVENT_PRIORITY.price_drop).toBeGreaterThan(EVENT_PRIORITY.goblin_pick);
    expect(EVENT_PRIORITY.goblin_pick).toBeGreaterThan(EVENT_PRIORITY.new_film);
    expect(EVENT_PRIORITY.new_film).toBeGreaterThan(EVENT_PRIORITY.price_rise);
    expect(EVENT_PRIORITY.price_rise).toBeGreaterThan(EVENT_PRIORITY.milestone);
    expect(EVENT_PRIORITY.milestone).toBeGreaterThan(EVENT_PRIORITY.anniversary);
  });
});
