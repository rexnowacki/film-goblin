import type { ActivityGroup, EnrichedActivity, FeedItem } from "./activity";

type GroupedUserFeedItem = Exclude<FeedItem, { type: "system" }>;

function digestKindFor(activity: EnrichedActivity): ActivityGroup["kind"] | null {
  if (activity.comments.count > 0) return null;
  if (activity.kind === "watch_logged") return "watch_logged";
  if (activity.kind === "watchlist_added" || activity.kind === "library_added") return "hoard_added";
  return null;
}

function utcDay(createdAt: string): string {
  return createdAt.slice(0, 10);
}

function itemTime(item: GroupedUserFeedItem): number {
  const createdAt = item.type === "group" ? item.group.latestAt : item.activity.created_at;
  return new Date(createdAt).getTime();
}

/**
 * Aggregates low-signal activity into stable actor/day digests. Watchlist and
 * grimoire additions share one hoard digest; watches use a separate digest.
 * Commented activity and every other activity kind remain standalone.
 *
 * Input must be newest-first. Buckets use UTC calendar days so membership and
 * React keys stay deterministic across clients, refreshes, and pagination.
 */
export function groupFeed(items: EnrichedActivity[]): FeedItem[] {
  const buckets = new Map<string, { kind: ActivityGroup["kind"]; day: string; items: EnrichedActivity[] }>();

  for (const item of items) {
    const kind = digestKindFor(item);
    if (!kind) continue;
    const day = utcDay(item.created_at);
    const key = `${item.actor.id}:${kind}:${day}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { kind, day, items: [item] });
  }

  const groupedIds = new Set<string>();
  const out: GroupedUserFeedItem[] = [];

  for (const [key, bucket] of buckets) {
    if (bucket.items.length < 2) continue;
    for (const item of bucket.items) groupedIds.add(item.id);
    const head = bucket.items[0];
    out.push({
      type: "group",
      group: {
        key,
        actor: head.actor,
        kind: bucket.kind,
        items: bucket.items,
        count: bucket.items.length,
        latestAt: head.created_at,
        utcDay: bucket.day,
      },
    });
  }

  for (const item of items) {
    if (!groupedIds.has(item.id)) out.push({ type: "single", activity: item });
  }

  return out.sort((a, b) => itemTime(b) - itemTime(a));
}
