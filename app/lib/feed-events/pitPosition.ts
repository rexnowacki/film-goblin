// Position enforcement for FROM THE PIT (spec 2026-07-08-pit-cadence-caps).
// Runs between composeFeed (unchanged) and resolvePitTiers (unchanged) --
// a violator is DROPPED, never reordered or deferred: reordering would
// fight composeFeed's recency-ordering contract, and a dropped item isn't
// wasted (no impression is recorded for something that was never rendered,
// so it remains eligible on a later render).
import type { ComposedItem } from "./compose";

export const PIT_FIRST_SCREEN_WINDOW = 6;
export const PIT_MIN_GAP = 2;

export function enforcePitPositionRules<U>(
  items: Array<ComposedItem<U>>,
): Array<ComposedItem<U>> {
  const result: Array<ComposedItem<U>> = [];
  let pitItemsInFirstScreen = 0;
  let userItemsSinceLastPit = Infinity;

  items.forEach((item, index) => {
    if (item.type !== "system") {
      result.push(item);
      userItemsSinceLastPit++;
      return;
    }

    const withinFirstScreen = index < PIT_FIRST_SCREEN_WINDOW;
    const violatesFirstScreenCap = withinFirstScreen && pitItemsInFirstScreen >= 1;
    const violatesMinGap = userItemsSinceLastPit < PIT_MIN_GAP;

    if (violatesFirstScreenCap || violatesMinGap) {
      return; // drop -- omit from result, do not touch the counters
    }

    result.push(item);
    userItemsSinceLastPit = 0;
    if (withinFirstScreen) pitItemsInFirstScreen++;
  });

  return result;
}
