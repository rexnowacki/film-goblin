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

  it("price_drop variant 2 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("price_drop", { title: "Suspiria", price: 4.99 }, 2)).toBe(
      "The goblin marked **Suspiria**'s fall to $4.99. Now you know too."
    );
  });

  it("all_time_low variant 1 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("all_time_low", { title: "Suspiria", price: 4.99 }, 1)).toBe(
      "**Suspiria** drops its guard to $4.99. The goblin strikes."
    );
  });

  it("new_film variant 0 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("new_film", { title: "Raw", year: 2016 }, 0)).toBe(
      "The goblin dragged **Raw** (2016) into the pit by the collar."
    );
  });

  it("left_free variant 1 leads with a goblin action, not a feeling", () => {
    expect(renderCopy("left_free", { title: "Raw", service: "AMC+" }, 1)).toBe(
      "The goblin let **Raw** slip back to AMC+'s vault. Still watching the price."
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

describe("v2 templates", () => {
  it("now_free / left_free name the service", () => {
    expect(renderCopy("now_free", { title: "Hokum", service: "Tubi" }, 0)).toBe(
      "**Hokum** is free on Tubi. No tithe required. Go."
    );
    expect(renderCopy("left_free", { title: "Hokum", service: "Tubi" }, 0)).toBe(
      "**Hokum** has left Tubi. The free ride is over — the goblin still tracks the price."
    );
  });

  it("now_on_apple crosses over", () => {
    expect(renderCopy("now_on_apple", { title: "Obsession" }, 0)).toBe(
      "The theatrical veil lifts. **Obsession** crosses over — now on Apple TV."
    );
  });

  it("theater events name the theater", () => {
    expect(renderCopy("now_at_theater", { title: "Suspiria", theater: "The Loft" }, 0)).toBe(
      "**Suspiria** haunts The Loft this week. The big screen is the proper altar."
    );
    expect(renderCopy("last_showing", { title: "Suspiria", theater: "The Loft" }, 0)).toBe(
      "Tonight is the last showing of **Suspiria** at The Loft. Then: the small screen, and regret."
    );
  });

  it("verdict, moon, communion", () => {
    expect(renderCopy("verdict_anointed", { title: "The Wailing" }, 0)).toBe(
      "The coven has spoken. **The Wailing** is Anointed."
    );
    expect(renderCopy("full_moon", { title: "Ginger Snaps" }, 0)).toBe(
      "The moon is full. The pit suggests **Ginger Snaps**. Lock the doors either way."
    );
    expect(renderCopy("monthly_communion", { title: "Nosferatu", n: 4 }, 0)).toBe(
      "The coven gathered around **Nosferatu** this month — 4 watchings."
    );
  });

  it("new_film summon variant overrides rotation", () => {
    expect(renderCopy("new_film", { title: "Backrooms", year: 2026, summoned: true }, 0)).toBe(
      "The summons was answered. **Backrooms** claws its way into the pit."
    );
    expect(renderCopy("new_film", { title: "Backrooms", year: 2026, summoned: true }, 1)).toBe(
      "The summons was answered. **Backrooms** claws its way into the pit."
    );
  });

  it("v2 priorities are exact", () => {
    expect(EVENT_PRIORITY.left_free).toBe(88);
    expect(EVENT_PRIORITY.now_free).toBe(85);
    expect(EVENT_PRIORITY.now_on_apple).toBe(82);
    expect(EVENT_PRIORITY.last_showing).toBe(78);
    expect(EVENT_PRIORITY.verdict_anointed).toBe(75);
    expect(EVENT_PRIORITY.now_at_theater).toBe(65);
    expect(EVENT_PRIORITY.full_moon).toBe(45);
    expect(EVENT_PRIORITY.monthly_communion).toBe(40);
  });
});
