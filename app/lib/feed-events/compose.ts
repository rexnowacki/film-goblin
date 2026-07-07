// Read-time feed composer (spec "Core rules"): ratio cap, no same-type
// stacking, priority selection, date-seeded determinism. Pure — no DB.

import type { SystemFeedEvent } from "./types";

export interface ComposeOptions {
  maxSystemWhenEmpty?: number; // default 6
}

export type ComposedItem<U> =
  | { type: "user"; item: U }
  | { type: "system"; event: SystemFeedEvent };

// mulberry32 — tiny deterministic PRNG; seeded from the date string so the
// feed does not reshuffle on refresh within a day.
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Tagged<U> {
  entry: ComposedItem<U>;
  recencyKey: string;
  tie: number;
}

export function composeFeed<U extends { created_at?: string }>(
  userItems: U[],
  systemEvents: SystemFeedEvent[],
  dateSeed: string,
  getCreatedAt: (u: U) => string,
  opts: ComposeOptions = {},
): Array<ComposedItem<U>> {
  const rng = seededRng(dateSeed);
  const maxWhenEmpty = opts.maxSystemWhenEmpty ?? 6;

  // Precompute every random tiebreak up front, in a fixed traversal order
  // (systemEvents for priority ties, then userItems + chosen for recency
  // ties). Because these values never depend on how a sort implementation
  // happens to sequence its comparisons, composeFeed(sameInputs) is
  // guaranteed byte-identical across runs/engines — calling rng() *inside*
  // a comparator would not be, since Array.prototype.sort's comparison
  // order for equal keys is not specified to be stable across engines.
  const priorityTiebreak = new Map<string, number>();
  for (const e of systemEvents) priorityTiebreak.set(e.id, rng());

  // Rule 4: priority weighting picks WHICH system events surface.
  const ranked = [...systemEvents].sort((a, b) =>
    b.priority - a.priority ||
    b.created_at.localeCompare(a.created_at) ||
    priorityTiebreak.get(b.id)! - priorityTiebreak.get(a.id)!);

  // Rule 1: ratio cap (system ≤ 2:1), Rule 3: floor of 1 when any exist and
  // there is at least one user item; when there is zero user activity fall
  // back to a flat cap so the feed isn't empty.
  const cap =
    userItems.length === 0
      ? Math.min(maxWhenEmpty, ranked.length)
      : Math.min(ranked.length, Math.max(1, userItems.length * 2));
  const chosen = ranked.slice(0, cap);

  // Merge into recency order (most recent first), with a precomputed
  // tiebreak for same-instant items — see note above on why this is
  // precomputed rather than called from inside the sort comparator.
  const tagged: Array<Tagged<U>> = [
    ...userItems.map((item) => ({
      entry: { type: "user" as const, item },
      recencyKey: getCreatedAt(item),
      tie: rng(),
    })),
    ...chosen.map((event) => ({
      entry: { type: "system" as const, event },
      recencyKey: event.created_at,
      tie: rng(),
    })),
  ];
  tagged.sort((a, b) => b.recencyKey.localeCompare(a.recencyKey) || b.tie - a.tie);

  // Rule 2 (stride cap, 2026-07-07 amendment): interleave, don't clump. A
  // cron run can emit several different-type system events seconds apart —
  // all newer than the last real user action when activity is quiet — so
  // recency-only merging stacked the whole burst above every user row.
  // Two guards, checked in priority order at each step:
  //   (a) hard: if the previous pick was ANY system event and a user item
  //       remains anywhere in the pool, the next pick MUST be a user item —
  //       even one older than the queued system events — so a burst can
  //       never sit adjacent to itself while there's something to break it
  //       up with.
  //   (b) soft (unchanged from v1): among system candidates, skip one that
  //       repeats the previous system event's exact type if a different
  //       type is available.
  // Once every user item has been placed, (a) no longer applies and any
  // remaining system events surface in recency order — stacking at that
  // point is unavoidable and acceptable (there is nothing left to spread
  // them across).
  const remaining = [...tagged];
  const result: Array<ComposedItem<U>> = [];
  let lastWasSystem = false;
  let lastSystemType: SystemFeedEvent["event_type"] | null = null;
  while (remaining.length > 0) {
    const forceUser = lastWasSystem && remaining.some(r => r.entry.type === "user");
    let pick = 0;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      if (forceUser) {
        if (cand.entry.type !== "user") continue;
      } else if (cand.entry.type === "system" && cand.entry.event.event_type === lastSystemType) {
        continue;
      }
      pick = i;
      break;
    }
    const [next] = remaining.splice(pick, 1);
    result.push(next.entry);
    lastWasSystem = next.entry.type === "system";
    lastSystemType = next.entry.type === "system" ? next.entry.event.event_type : null;
  }

  return result;
}
