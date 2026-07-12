import type { EnrichedActivity, FeedItem, ActivityGroup } from "./activity";

type GroupedUserFeedItem = Exclude<FeedItem, { type: "system" }>;

const GAP_MS = 30 * 60 * 1000;        // 30 minutes between consecutive same-kind events
const SPAN_MS = 24 * 60 * 60 * 1000;  // 24 hours total span ceiling
const MIN_GROUP_SIZE = 2;
const GROUPABLE_KINDS: ActivityGroup["kind"][] = [
  "watchlist_added",
  "watch_logged",
  "library_added",
];

function hasComments(activity: EnrichedActivity): boolean {
  return activity.comments.count > 0;
}

function makeFeedItem(run: EnrichedActivity[], kind: ActivityGroup["kind"]): GroupedUserFeedItem {
  if (run.length < MIN_GROUP_SIZE) {
    return { type: "single", activity: run[0] };
  }

  const head = run[0];
  const firstEventId = run[run.length - 1].id;
  return {
    type: "group",
    group: {
      key: `${head.actor.id}:${kind}:${firstEventId}`,
      actor: head.actor,
      kind,
      items: run,
      count: run.length,
      latestAt: head.created_at,
    },
  };
}

function groupActorBlock(block: EnrichedActivity[]): GroupedUserFeedItem[] {
  const groupedIds = new Set<string>();
  const out: GroupedUserFeedItem[] = [];

  for (const kind of GROUPABLE_KINDS) {
    const candidates = block.filter(item => item.kind === kind && !hasComments(item));
    let run: EnrichedActivity[] = [];

    function flushRun() {
      if (run.length === 0) return;
      for (const item of run) groupedIds.add(item.id);
      out.push(makeFeedItem(run, kind));
      run = [];
    }

    for (const candidate of candidates) {
      if (run.length === 0) {
        run.push(candidate);
        continue;
      }

      const prior = run[run.length - 1];
      const gapMs = new Date(prior.created_at).getTime() - new Date(candidate.created_at).getTime();
      const spanMs = new Date(run[0].created_at).getTime() - new Date(candidate.created_at).getTime();
      if (gapMs > GAP_MS || spanMs > SPAN_MS) flushRun();
      run.push(candidate);
    }
    flushRun();
  }

  for (const item of block) {
    if (!groupedIds.has(item.id)) out.push({ type: "single", activity: item });
  }

  return out.sort((a, b) => {
    const aTime = a.type === "group" ? a.group.latestAt : a.activity.created_at;
    const bTime = b.type === "group" ? b.group.latestAt : b.activity.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

/**
 * Single-pass grouping over a newest-first activity array. Activity from each
 * contiguous actor block is grouped independently by kind, so interleaved
 * watch logs, watchlist additions, and grimoire additions can each form their
 * own aggregate without consuming one another.
 *
 * Groups require two events, no more than 30 minutes between consecutive
 * same-kind events, and no more than 24 hours across the full run. Commented
 * activity stays standalone while nearby uncommented activity may still group.
 */
export function groupFeed(items: EnrichedActivity[]): FeedItem[] {
  const out: FeedItem[] = [];
  let i = 0;

  while (i < items.length) {
    const actorId = items[i].actor.id;
    let j = i + 1;
    while (j < items.length && items[j].actor.id === actorId) j++;
    out.push(...groupActorBlock(items.slice(i, j)));
    i = j;
  }

  return out;
}
