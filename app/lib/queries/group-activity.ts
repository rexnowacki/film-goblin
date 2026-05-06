import type { EnrichedActivity, FeedItem, ActivityGroup } from "./activity";

const GAP_MS = 30 * 60 * 1000;        // 30 minutes between consecutive same-kind events
const SPAN_MS = 24 * 60 * 60 * 1000;  // 24 hours total span ceiling
const MIN_GROUP_SIZE = 2;

function isGroupableKind(kind: EnrichedActivity["kind"]): boolean {
  return kind === "watchlist_added" || kind === "watch_logged";
}

/**
 * Single-pass O(N) grouping over a newest-first array of EnrichedActivity.
 * Folds runs of same-actor + same-kind events that fit within the 30-min
 * event-to-event window AND the 24-hr total span ceiling AND are 2+ in size
 * into a single FeedItem of type "group". Smaller runs and non-groupable
 * kinds emit as individual "single" FeedItems.
 *
 * Bridge rule: same-actor different-kind events are skipped over (not treated
 * as run-breakers) so that e.g. two watchlist adds separated by a library add
 * still collapse into one group. Skipped events emit as singles after the group.
 *
 * Input MUST be sorted newest-first by created_at (matches getEnrichedFeed).
 */
export function groupFeed(items: EnrichedActivity[]): FeedItem[] {
  const out: FeedItem[] = [];
  let i = 0;
  while (i < items.length) {
    const head = items[i];
    if (!isGroupableKind(head.kind)) {
      out.push({ type: "single", activity: head });
      i++;
      continue;
    }
    const run: EnrichedActivity[] = [head];
    const skipped: EnrichedActivity[] = [];
    let j = i + 1;
    while (j < items.length) {
      const candidate = items[j];
      if (candidate.actor.id !== head.actor.id) break;
      if (candidate.kind !== head.kind) {
        // Bridge over same-actor different-kind interruptions; emit them after.
        skipped.push(candidate);
        j++;
        continue;
      }
      const prior = run[run.length - 1];
      const gapMs = new Date(prior.created_at).getTime() - new Date(candidate.created_at).getTime();
      if (gapMs > GAP_MS) break;
      const spanMs = new Date(head.created_at).getTime() - new Date(candidate.created_at).getTime();
      if (spanMs > SPAN_MS) break;
      run.push(candidate);
      j++;
    }
    if (run.length >= MIN_GROUP_SIZE) {
      const firstEventId = run[run.length - 1].id;
      const group: ActivityGroup = {
        key: `${head.actor.id}:${head.kind}:${firstEventId}`,
        actor: head.actor,
        kind: head.kind as ActivityGroup["kind"],
        items: run,
        count: run.length,
        latestAt: head.created_at,
      };
      out.push({ type: "group", group });
      for (const item of skipped) out.push({ type: "single", activity: item });
    } else {
      // Merge run + skipped back into newest-first order.
      const all = [...run, ...skipped].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      for (const item of all) out.push({ type: "single", activity: item });
    }
    i = j;
  }
  return out;
}
