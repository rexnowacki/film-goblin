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

  items.forEach((item) => {
    if (item.type !== "system") {
      result.push(item);
      userItemsSinceLastPit++;
      return;
    }

    // Measured against result.length (the item's position if kept next in
    // the OUTPUT array), not the item's index in the raw input array. A
    // dropped item shifts every later survivor left in the displayed feed,
    // so an input-index check can under-count how close to the top a later
    // item actually lands once earlier drops have happened -- e.g. input
    // [s0, u, u, s1(dropped), u, u, s2] shifts s2 from input index 6 to
    // displayed position 5, still inside the first-screen window, even
    // though 6 < PIT_FIRST_SCREEN_WINDOW was already false at drop-check
    // time. result.length is always the count of items already kept, i.e.
    // exactly this item's would-be displayed position.
    const withinFirstScreen = result.length < PIT_FIRST_SCREEN_WINDOW;
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
