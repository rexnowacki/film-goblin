import { describe, it, expect } from "vitest";
import { getPitTier, getPitKicker, getPitPriceVars, getPitBadges, PIT_TYPE_CONFIG } from "../../lib/feed-events/tier";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { FeedEventType } from "../../lib/feed-events/copy";

function ev(type: FeedEventType, payload: Record<string, unknown> = {}): SystemFeedEvent {
  return { id: `e-${type}`, event_type: type, film_id: null, payload, copy: "x", priority: 0, created_at: "2026-07-07T00:00:00Z", film: null };
}

const EXPECTED_TIERS: Record<FeedEventType, "whisper" | "standard" | "full"> = {
  all_time_low: "full",
  price_drop: "standard",
  price_rise: "whisper",
  now_free: "standard",
  left_free: "standard",
  new_film: "standard",
  now_on_apple: "standard",
  now_at_theater: "standard",
  last_showing: "standard",
  verdict_anointed: "standard",
  goblin_pick: "standard",
  anniversary: "whisper",
  milestone: "whisper",
  full_moon: "whisper",
  monthly_communion: "whisper",
};

describe("getPitTier", () => {
  it("returns the configured tier for every event type", () => {
    for (const type of Object.keys(EXPECTED_TIERS) as FeedEventType[]) {
      expect(getPitTier(ev(type)), type).toBe(EXPECTED_TIERS[type]);
    }
  });

  it("has exactly one full-tier type (all_time_low)", () => {
    const fullTypes = (Object.keys(PIT_TYPE_CONFIG) as FeedEventType[]).filter(
      t => PIT_TYPE_CONFIG[t].tier === "full",
    );
    expect(fullTypes).toEqual(["all_time_low"]);
  });
});

describe("getPitKicker", () => {
  it("returns the type's natural kicker when tier matches config", () => {
    expect(getPitKicker(ev("all_time_low"), "full")).toBe("LEDGER OMEN");
    expect(getPitKicker(ev("now_free"), "standard")).toBe("NO TITHE");
    expect(getPitKicker(ev("price_rise"), "whisper")).toBe("WHISPER");
  });

  it("falls back to LEDGER ECHO for a demoted full->standard event", () => {
    expect(getPitKicker(ev("all_time_low"), "standard")).toBe("LEDGER ECHO");
  });
});

describe("getPitPriceVars", () => {
  it("extracts price and old_price from payload.vars", () => {
    const e = ev("all_time_low", { vars: { title: "Suspiria", price: 4.99, old_price: 14.99 } });
    expect(getPitPriceVars(e)).toEqual({ price: 4.99, oldPrice: 14.99 });
  });

  it("returns nulls when vars is missing or malformed", () => {
    expect(getPitPriceVars(ev("all_time_low", {}))).toEqual({ price: null, oldPrice: null });
    expect(getPitPriceVars(ev("all_time_low", { vars: "not an object" }))).toEqual({ price: null, oldPrice: null });
    expect(getPitPriceVars(ev("all_time_low", { vars: { price: "4.99" } }))).toEqual({ price: null, oldPrice: null });
  });
});

describe("getPitBadges", () => {
  it("now_free returns a FREE badge (filled) and a service badge", () => {
    const e = ev("now_free", { vars: { title: "Lamb", service: "YouTube" } });
    expect(getPitBadges(e)).toEqual([
      { label: "FREE", filled: true },
      { label: "YouTube" },
    ]);
  });

  it("left_free returns only a service badge, no FREE badge", () => {
    const e = ev("left_free", { vars: { title: "Raw", service: "AMC+" } });
    expect(getPitBadges(e)).toEqual([{ label: "AMC+" }]);
  });

  it("price_drop returns a filled price badge", () => {
    const e = ev("price_drop", { vars: { title: "Suspiria", price: 4.99 } });
    expect(getPitBadges(e)).toEqual([{ label: "$4.99", filled: true }]);
  });

  it("last_showing and now_at_theater return a theater badge", () => {
    expect(getPitBadges(ev("last_showing", { vars: { theater: "The Loft" } }))).toEqual([{ label: "The Loft" }]);
    expect(getPitBadges(ev("now_at_theater", { vars: { theater: "The Loft" } }))).toEqual([{ label: "The Loft" }]);
  });

  it("returns no badges for types with no badge-worthy vars, or missing vars", () => {
    expect(getPitBadges(ev("verdict_anointed", { vars: { title: "Hereditary" } }))).toEqual([]);
    expect(getPitBadges(ev("now_free", {}))).toEqual([{ label: "FREE", filled: true }]); // service absent, FREE still shown
    expect(getPitBadges(ev("price_drop", {}))).toEqual([]); // no price, no badge
  });
});
