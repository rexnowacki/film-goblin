// Pit tier/kicker resolution (spec 2026-07-07 "FROM THE PIT" three-tier
// treatment). Tier is a pure function of event_type — resolved ONCE here,
// never decided inside a component. Cadence-based demotion (feed-level,
// requires seeing neighboring items) lives in pitCadence.ts, not here.
import type { FeedEventType } from "./copy";
import type { SystemFeedEvent } from "./types";
import { isPitDigest } from "./pitDigest";

export type PitTier = "whisper" | "standard" | "full";

interface PitTypeConfig {
  tier: PitTier;
  kicker: string;
}

// FULL is reserved for event types carrying a genuine price ledger
// (price + old_price) — currently only all_time_low. This keeps full
// cards rare by construction, not just by the cadence window.
export const PIT_TYPE_CONFIG: Record<FeedEventType, PitTypeConfig> = {
  all_time_low: { tier: "full", kicker: "LEDGER OMEN" },
  price_drop: { tier: "standard", kicker: "TITHE LOWERED" },
  price_rise: { tier: "whisper", kicker: "WHISPER" },
  now_free: { tier: "standard", kicker: "NO TITHE" },
  left_free: { tier: "standard", kicker: "GRACE ENDED" },
  new_film: { tier: "standard", kicker: "NEW TO THE PIT" },
  now_on_apple: { tier: "standard", kicker: "CROSSED OVER" },
  now_at_theater: { tier: "standard", kicker: "NOW HAUNTING" },
  last_showing: { tier: "standard", kicker: "LAST RITES" },
  verdict_anointed: { tier: "standard", kicker: "ANOINTED" },
  goblin_pick: { tier: "standard", kicker: "GOBLIN'S COUNSEL" },
  anniversary: { tier: "whisper", kicker: "WHISPER" },
  milestone: { tier: "whisper", kicker: "WHISPER" },
  full_moon: { tier: "whisper", kicker: "WHISPER" },
  monthly_communion: { tier: "whisper", kicker: "WHISPER" },
};

export function getPitTier(event: SystemFeedEvent): PitTier {
  if (isPitDigest(event)) return "standard";
  return PIT_TYPE_CONFIG[event.event_type].tier;
}

// `tier` is the RESOLVED (possibly demoted) tier, not necessarily the
// type's natural one — a demoted full->standard event must not keep
// "LEDGER OMEN". Deliberately distinct wording from both "LEDGER OMEN"
// (full) and "WHISPER" (whisper tier) so it can't be mistaken for either.
export function getPitKicker(event: SystemFeedEvent, tier: PitTier): string {
  const natural = PIT_TYPE_CONFIG[event.event_type];
  // A digest sourced from a whisper type is deliberately promoted to standard;
  // it is not a cadence demotion and must never read as "LEDGER ECHO".
  if (isPitDigest(event)) return natural.tier === "whisper" ? "GATHERED OMEN" : natural.kicker;
  if (tier === natural.tier) return natural.kicker;
  return "LEDGER ECHO";
}

function rawVars(event: SystemFeedEvent): Record<string, unknown> {
  const raw = (event.payload as { vars?: unknown }).vars;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

// payload is `Record<string, unknown>` (JSON from the DB) — this is the
// only place that reaches into payload.vars, with runtime type guards
// since nothing enforces the shape at the type level.
export function getPitPriceVars(event: SystemFeedEvent): { price: number | null; oldPrice: number | null } {
  const vars = rawVars(event);
  const price = typeof vars.price === "number" ? vars.price : null;
  const oldPrice = typeof vars.old_price === "number" ? vars.old_price : null;
  return { price, oldPrice };
}

export interface PitBadge {
  label: string;
  filled?: boolean;
}

// Source/FREE/price badges for standard-tier rows (spec §"Standard row").
// Conservative by design: only render a badge when the underlying var is
// actually present — never fabricate a source (e.g. all_time_low has no
// distinct "source," it's implicitly Apple TV, so it gets no badge here).
export function getPitBadges(event: SystemFeedEvent): PitBadge[] {
  const vars = rawVars(event);
  const badges: PitBadge[] = [];
  const service = typeof vars.service === "string" ? vars.service : null;
  const theater = typeof vars.theater === "string" ? vars.theater : null;
  const price = typeof vars.price === "number" ? vars.price : null;

  if (event.event_type === "now_free") {
    badges.push({ label: "FREE", filled: true });
    if (service) badges.push({ label: service });
  } else if (event.event_type === "left_free") {
    if (service) badges.push({ label: service });
  } else if (event.event_type === "price_drop") {
    if (price != null) badges.push({ label: `$${price.toFixed(2)}`, filled: true });
  } else if (event.event_type === "last_showing" || event.event_type === "now_at_theater") {
    if (theater) badges.push({ label: theater });
  }
  return badges;
}
