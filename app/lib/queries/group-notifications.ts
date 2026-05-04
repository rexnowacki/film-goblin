import type { EnrichedNotification, NotificationFeedItem, NotificationGroup, NotificationKind } from "./notifications";

const GAP_MS = 30 * 60 * 1000;
const SPAN_MS = 24 * 60 * 60 * 1000;
const MIN_GROUP_SIZE_DEFAULT = 3;
const MIN_GROUP_SIZE_LIKE = 2;

// Kind-aware grouping key. Most kinds group per-actor; like_on_comment groups
// per-comment so multiple likers on the same comment fold into one row.
// reply_on_comment similarly groups per parent-comment so multiple repliers fold.
function groupKey(n: EnrichedNotification): string {
  if (n.kind === "like_on_comment") {
    const commentId = (n.payload as { comment_id?: string }).comment_id ?? "?";
    return `like_on_comment:${commentId}`;
  }
  if (n.kind === "reply_on_comment") {
    const parentCommentId = (n.payload as { parent_comment_id?: string }).parent_comment_id ?? "?";
    return `reply_on_comment:${parentCommentId}`;
  }
  return `${n.kind}:${n.actor?.id ?? "system"}`;
}

function minSize(kind: NotificationKind): number {
  if (kind === "like_on_comment" || kind === "reply_on_comment") return MIN_GROUP_SIZE_LIKE;
  return MIN_GROUP_SIZE_DEFAULT;
}

/**
 * Mirror of groupFeed for notifications. Walks newest-first, folds runs of
 * same-groupKey events that satisfy the 30-min event-to-event gap and 24-hr
 * span ceiling and meet the kind's minimum size into groups; otherwise emits
 * singles.
 *
 * Input MUST be sorted newest-first by created_at.
 */
export function groupNotifications(items: EnrichedNotification[]): NotificationFeedItem[] {
  const out: NotificationFeedItem[] = [];
  let i = 0;
  while (i < items.length) {
    const head = items[i];
    const headKey = groupKey(head);

    const run: EnrichedNotification[] = [head];
    let j = i + 1;
    while (j < items.length) {
      const cand = items[j];
      if (groupKey(cand) !== headKey) break;
      const prior = run[run.length - 1];
      const gapMs = new Date(prior.created_at).getTime() - new Date(cand.created_at).getTime();
      if (gapMs > GAP_MS) break;
      const spanMs = new Date(head.created_at).getTime() - new Date(cand.created_at).getTime();
      if (spanMs > SPAN_MS) break;
      run.push(cand);
      j++;
    }

    if (run.length >= minSize(head.kind)) {
      const oldestId = run[run.length - 1].id;
      const group: NotificationGroup = {
        key: `${headKey}:${oldestId}`,
        actor: head.actor,
        kind: head.kind,
        items: run,
        count: run.length,
        latestAt: head.created_at,
      };
      out.push({ type: "group", group });
    } else {
      for (const r of run) out.push({ type: "single", notification: r });
    }
    i = j;
  }
  return out;
}
