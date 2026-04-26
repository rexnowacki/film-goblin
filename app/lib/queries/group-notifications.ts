import type { EnrichedNotification, NotificationFeedItem, NotificationGroup } from "./notifications";

const GAP_MS = 30 * 60 * 1000;
const SPAN_MS = 24 * 60 * 60 * 1000;
const MIN_GROUP_SIZE = 3;

/**
 * Mirror of groupFeed for notifications. Walks newest-first, folds runs of
 * same-(kind, actor_user_id) events that satisfy the 30-min event-to-event
 * gap and 24-hr span ceiling and 3+ size into groups; otherwise emits singles.
 *
 * Null actor (price_drop) groups by (kind, NULL).
 */
export function groupNotifications(items: EnrichedNotification[]): NotificationFeedItem[] {
  const out: NotificationFeedItem[] = [];
  let i = 0;
  while (i < items.length) {
    const head = items[i];
    const headActorId = head.actor?.id ?? null;

    const run: EnrichedNotification[] = [head];
    let j = i + 1;
    while (j < items.length) {
      const cand = items[j];
      const candActorId = cand.actor?.id ?? null;
      if (cand.kind !== head.kind) break;
      if (candActorId !== headActorId) break;
      const prior = run[run.length - 1];
      const gapMs = new Date(prior.created_at).getTime() - new Date(cand.created_at).getTime();
      if (gapMs > GAP_MS) break;
      const spanMs = new Date(head.created_at).getTime() - new Date(cand.created_at).getTime();
      if (spanMs > SPAN_MS) break;
      run.push(cand);
      j++;
    }

    if (run.length >= MIN_GROUP_SIZE) {
      const oldestId = run[run.length - 1].id;
      const group: NotificationGroup = {
        key: `${headActorId ?? "system"}:${head.kind}:${oldestId}`,
        actor: head.actor,
        notifKind: head.kind,
        items: run,
        count: run.length,
        latestAt: head.created_at,
      };
      out.push({ kind: "group", group });
    } else {
      for (const r of run) out.push({ kind: "single", notification: r });
    }
    i = j;
  }
  return out;
}
