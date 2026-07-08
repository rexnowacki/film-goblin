// Feed-level cadence cap on full Pit cards (spec 2026-07-07 "FROM THE PIT").
// Runs once, after composeFeed (untouched) produces the final interleaved
// array. Cadence demotion is inherently feed-level: no single event can
// know its own final tier without seeing whether an earlier item already
// consumed the window — this is why it's a separate pass from getPitTier,
// not folded into it.
import { getPitTier, type PitTier } from "./tier";
import type { ComposedItem } from "./compose";

export const PIT_FULL_CARD_WINDOW = 8;

export function resolvePitTiers<U>(items: Array<ComposedItem<U>>): Map<string, PitTier> {
  const result = new Map<string, PitTier>();
  let indexSinceLastFull = Infinity;
  for (const item of items) {
    indexSinceLastFull++;
    if (item.type !== "system") continue;
    const natural = getPitTier(item.event);
    if (natural === "full" && indexSinceLastFull < PIT_FULL_CARD_WINDOW) {
      result.set(item.event.id, "standard");
    } else {
      result.set(item.event.id, natural);
      if (natural === "full") indexSinceLastFull = 0;
    }
  }
  return result;
}
