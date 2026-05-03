# Threaded Replies

**Date:** 2026-05-03  
**Status:** Spec  
**Sub-project:** #38

## Background

Activity comments shipped in sub-project #17 as a flat list. Each `activity_comments` row has no parent reference — every comment sits at depth 0. The only deferred feature called out in the sub-project #25 spec was "threaded replies + 'View N replies' expander". This spec implements that.

## Goals

- Allow unlimited-depth threaded replies inside the existing `CommentSheet` bottom-sheet UI.
- Replies collapsed by default behind a `↳ View N replies` toggle; expanding inline shows the full thread.
- Bottom composer hijacks into reply mode when "Reply" is tapped — "Replying to @username ✕" banner, cancel returns to normal comment mode.
- Notify the parent comment's author via a new `reply_on_comment` notification kind.
- Likes on replies — same heart + `like_count` behaviour as top-level comments (already handled by the existing `activity_comment_reactions` table and `acr_bump_count` trigger; no new table needed).

## Non-goals

- Editing comments or replies.
- Pagination of comments/replies (fetch-all at open time remains the strategy).
- Emoji quick-react strip.
- @-mention autocomplete (reply author is implicitly tagged via the "Replying to" banner; body is plain text).

## Scope decisions

| Decision | Choice | Reason |
|---|---|---|
| Nesting depth | Unlimited | User preference |
| Visual style | Continuous indent + left border rail | Most readable in a narrow sheet |
| Collapse default | Collapsed — `↳ View N replies` toggle | Keeps sheet manageable on busy posts |
| Reply composer placement | Bottom composer hijacks with "Replying to @username ✕" banner | Reuses `CommentComposer` with minimal prop additions; consistent keyboard behaviour |
| Notification | `reply_on_comment` to parent comment's author | Same pattern as `comment_on_activity` |
| Likes on replies | Yes — reuses existing `activity_comment_reactions` table | No new table needed |
| Delete policy | Reply author + activity owner only | Same rule as top-level comments today |
| Schema approach | Self-referential `parent_id` + materialized `reply_count` on `activity_comments` | One table, follows `like_count` trigger pattern, JS tree build is trivial |

## Architecture

### 1. Database — migrations 0157, 0158, 0159

#### `0157_threaded_replies.sql`

```sql
ALTER TABLE activity_comments
  ADD COLUMN parent_id    UUID REFERENCES activity_comments(id) ON DELETE CASCADE,
  ADD COLUMN reply_count  INT NOT NULL DEFAULT 0;

CREATE INDEX activity_comments_parent_idx
  ON activity_comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ac_bump_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE activity_comments SET reply_count = reply_count + 1
     WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE activity_comments SET reply_count = GREATEST(reply_count - 1, 0)
     WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ac_bump_reply_count_trg
  AFTER INSERT OR DELETE ON activity_comments
  FOR EACH ROW EXECUTE FUNCTION ac_bump_reply_count();
```

Notes:
- Existing RLS policies cover replies automatically (`SELECT` / `INSERT` / `DELETE` rules reference `activity_comments` without a depth filter).
- Cascade behaviour: deleting a top-level comment cascades to replies via `ON DELETE CASCADE`; the `ac_bump_reply_count` trigger fires for each cascaded delete but the `UPDATE` is a no-op because the parent row is already gone — safe.
- `reply_count` defaults to `0`; no backfill needed for existing rows.

#### `0158_reply_on_comment_kind.sql`

```sql
ALTER TYPE notification_kind ADD VALUE 'reply_on_comment';
```

#### `0159_reply_on_comment_trigger.sql`

```sql
CREATE OR REPLACE FUNCTION public.notify_reply_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_author_id   UUID;
  activity_owner_id  UUID;
  film_id_val        TEXT;
BEGIN
  -- Only fires for replies (parent_id IS NOT NULL)
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO parent_author_id
    FROM activity_comments WHERE id = NEW.parent_id;

  -- NEW.activity_id references activity(id) directly — no join needed
  SELECT a.actor_user_id, a.payload->>'film_id'
    INTO activity_owner_id, film_id_val
    FROM activity a
    WHERE a.id = NEW.activity_id
    LIMIT 1;

  -- Skip self-replies and skip when parent author = activity owner
  -- (they already receive a comment_on_activity notification from the existing trigger)
  IF NEW.user_id = parent_author_id THEN RETURN NEW; END IF;
  IF parent_author_id = activity_owner_id THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    parent_author_id,
    'reply_on_comment',
    NEW.user_id,
    jsonb_build_object(
      'activity_id',       NEW.activity_id,
      'parent_comment_id', NEW.parent_id,
      'comment_id',        NEW.id,
      'body',              NEW.body,
      'film_id',           film_id_val
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_activity_comment_reply_notify
  AFTER INSERT ON activity_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_reply_on_comment();
```

### 2. Query layer

**`app/lib/queries/activity-comments.ts`**

`CommentItem` gains:
```ts
parent_id: string | null;
reply_count: number;
```

`getCommentSummariesForActivities` — add `parent_id, reply_count` to the SELECT. All rows (top-level + replies) are returned flat in `items`; tree building is client-side.

`CommentSummary.count` reflects total item count (top-level + replies) — matches the badge on `CommentButton`.

**Pure tree helper** (colocated in `CommentSheet.tsx`):
```ts
function buildChildrenMap(items: CommentItem[]): Map<string, CommentItem[]>
```
Groups items by `parent_id`. Top-level items: `items.filter(i => i.parent_id === null)`.

The "View N replies" badge count is derived live from `childrenMap.get(id)?.length ?? 0` rather than the DB `reply_count` column, so optimistic inserts/deletes are reflected immediately.

### 3. Actions

**`app/lib/actions/activity-comments.ts`**

`_addActivityComment` gains `parentId?: string`. Passes `parent_id: parentId ?? null` on INSERT. Returned `CommentItem` includes `parent_id` and `reply_count: 0`.

`deleteActivityComment` — no signature change. Client-side, `CommentSheet.removeComment` filters both the deleted item and any item whose `parent_id === id` in one pass (removes the entire subtree from local state).

### 4. Components

#### New: `app/components/CommentNode.tsx`

Recursive component. Renders one comment row and, when expanded, its direct children.

```ts
interface Props {
  comment: CommentItem;
  childrenMap: Map<string, CommentItem[]>;
  depth: number;
  viewerId: string | null;
  actorUserId: string;
  expandedIds: Set<string>;
  onExpand: (id: string) => void;
  onReply: (commentId: string, username: string) => void;
  onDelete: (id: string) => void;
}
```

Render structure:
1. Comment row (avatar + body + heart) — same markup as current `CommentList` rows
2. "Reply" link in the actions row (next to "Delete" when shown)
3. When `(childrenMap.get(comment.id) ?? []).length > 0`: a `.comment-view-replies` toggle button — "↳ View N replies" when collapsed, "↳ Hide replies" when expanded
4. When expanded: a `.comment-thread-rail` div wrapping each child as `<CommentNode depth={depth + 1} />`

Avatar size: 36px at depth 0, 24px at depth ≥ 1.

#### Updated: `app/components/CommentList.tsx`

Replaces the inline `items.map(…)` with `topLevelItems.map(c => <CommentNode … />)`. Accepts `childrenMap` and `expandedIds` as new props. Removes the direct import of heart/action row markup (moved into `CommentNode`).

#### Updated: `app/components/CommentComposer.tsx`

New props:
```ts
replyTo: { commentId: string; username: string } | null;
onCancelReply: () => void;
```

When `replyTo` is non-null, renders a `.composer-replying-to` banner above the pill:
```
Replying to @username  ✕
```
Tapping ✕ calls `onCancelReply`. Placeholder switches to "Reply…". Submit behaviour unchanged.

#### Updated: `app/components/CommentSheet.tsx`

New state:
```ts
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
const [replyTo, setReplyTo] = useState<{ commentId: string; username: string } | null>(null);
```

`postComment(body)`:
- If `replyTo` is set, calls `addActivityComment(activityId, body, replyTo.commentId)`
- On success, adds `replyTo.commentId` to `expandedIds` (auto-expands the thread)
- Clears `replyTo` after posting

`removeComment(id)` must remove the deleted comment and its entire descendant subtree from local state (not just direct children — a reply can itself have replies). Uses a recursive `collectDescendants(id, items)` helper that returns a `Set<string>` of all descendant IDs, then filters:
```ts
const toRemove = collectDescendants(id, prev); // includes id itself
const next = prev.filter(c => !toRemove.has(c.id));
```
The DB cascade handles the actual deletion server-side; the client mirrors it by removing the full subtree in one pass.

### 5. CSS additions — `app/app/globals.css`

```css
.comment-thread-rail {
  border-left: 1px solid var(--muted);
  margin-left: 16px;
  padding-left: 12px;
}
.comment-thread-rail .comment-thread-rail {
  margin-left: 12px;
}
.comment-thread-rail .comment-thread-rail .comment-thread-rail {
  margin-left: 8px;
  /* stops shrinking beyond 3 levels */
}

.comment-view-replies {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 4px 0;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}
.comment-view-replies::before {
  content: "↳";
  color: var(--muted);
  font-weight: 400;
}

.composer-replying-to {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
}
.composer-replying-to strong {
  color: var(--accent);
}
.composer-replying-to button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}
```

### 6. Notifications

**`app/lib/queries/notifications.ts` / `NotificationRow.tsx`**

Add `reply_on_comment` to:
- `targetFor`: deep-links to `/home?activity={activity_id}` (same as `comment_on_activity`)
- `copyFor`: `@username replied to your comment on {film}: "{snippet}"`

**`app/lib/queries/group-notifications.ts`**

Add `reply_on_comment` to `groupKey`: keyed on `payload.parent_comment_id` (multiple repliers to the same comment fold into one row). Add to `minSize`: `MIN_GROUP_SIZE_LIKE` (2), same as `like_on_comment`. Group copy in `NotificationGroupRow`: `N people replied to your comment on {film}`.

**`app/components/notifications/NotificationGroupRow.tsx`** — add `reply_on_comment` case.

### 7. Tests

**`db/tests/rls/activity_comments.test.ts`** (extend existing):
- Reply inherits existing SELECT RLS (any authed user can read)
- User cannot insert reply as another user (RLS INSERT denial)
- Cascade-delete of parent removes child reply
- `reply_count` bumps to 1 after reply insert, decrements to 0 after delete

**`db/tests/rls/reply-on-comment-notification.test.ts`** (new):
- Reply to another user's comment → `reply_on_comment` notification inserted for parent author
- Self-reply → no notification
- Reply where parent author = activity owner → no duplicate notification

**`app/tests/actions/activity-comments.test.ts`** (extend):
- `_addActivityComment` with `parentId` sets `parent_id` on the returned `CommentItem`
- `_addActivityComment` without `parentId` returns `parent_id: null`

**`app/tests/queries/group-notifications.test.ts`** (extend):
- `reply_on_comment` groups by `parent_comment_id`, emits single below `MIN_GROUP_SIZE_LIKE = 2`, groups above it
- Mirrors existing `like_on_comment` test cases

## Data flow

1. Feed renders → `getCommentSummariesForActivities` fetches all rows (flat) with `parent_id` and `reply_count`
2. `CommentSheet` initialises `items` (flat), `expandedIds` (empty set), `replyTo` (null)
3. `buildChildrenMap(items)` derived each render — top-level items filtered to `parent_id === null`
4. User taps "Reply" on a comment → `setReplyTo({ commentId, username })` → composer banner appears
5. User types and posts → `addActivityComment(activityId, body, replyTo.commentId)` → optimistic insert → real row returned → `expandedIds` gets `replyTo.commentId` added
6. User taps `↳ View N replies` → `expandedIds` gets id toggled → children rendered recursively via `CommentNode`
7. Delete → filters comment + all `parent_id === id` children from `items` in one pass

## Error handling

- Reply insert failures: optimistic row removed, error shown in composer (same as top-level comment failure path)
- Expand/collapse is pure client state — no async, no error path
- RLS denial on insert surfaces as existing 401/403 error path; composer shows the error string

## Files affected

**New:**
- `db/migrations/0157_threaded_replies.sql`
- `db/migrations/0158_reply_on_comment_kind.sql`
- `db/migrations/0159_reply_on_comment_trigger.sql`
- `app/components/CommentNode.tsx`
- `db/tests/rls/reply-on-comment-notification.test.ts`

**Modified:**
- `app/lib/queries/activity-comments.ts` (extend `CommentItem`, extend SELECT)
- `app/lib/actions/activity-comments.ts` (add `parentId?` param)
- `app/lib/supabase/types.ts` (hand-edit: `parent_id`, `reply_count` on `activity_comments`)
- `app/components/CommentList.tsx` (delegate to `CommentNode`)
- `app/components/CommentComposer.tsx` (add `replyTo` + `onCancelReply` props)
- `app/components/CommentSheet.tsx` (add state + tree-building)
- `app/app/globals.css` (three new rule blocks)
- `app/lib/queries/notifications.ts` (add `reply_on_comment` type if needed)
- `app/lib/queries/group-notifications.ts` (add grouping key + minSize)
- `app/components/notifications/NotificationRow.tsx` (add cases)
- `app/components/notifications/NotificationGroupRow.tsx` (add cases)
- `db/tests/rls/activity_comments.test.ts` (extend)
- `app/tests/actions/activity-comments.test.ts` (extend)
- `app/tests/queries/group-notifications.test.ts` (extend)

## Open questions

None. All scope decisions locked.
