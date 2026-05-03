# Threaded Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unlimited-depth threaded replies to activity comment threads, with collapsed-by-default expand toggles, a reply-mode bottom composer, and a `reply_on_comment` notification.

**Architecture:** Self-referential `parent_id` on `activity_comments` + materialized `reply_count` maintained by a trigger. All comments (top-level + replies) are fetched flat at sheet-open time and a `buildChildrenMap` helper builds the tree client-side. A new recursive `CommentNode` component renders each node and its children when expanded.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres (RLS + PL/pgSQL triggers), Vitest, testcontainers (RLS tests)

---

## File Map

**New:**
- `db/migrations/0157_threaded_replies.sql` — `parent_id` + `reply_count` columns + trigger
- `db/migrations/0158_reply_on_comment_kind.sql` — enum extension
- `db/migrations/0159_reply_on_comment_trigger.sql` — notification trigger
- `app/components/CommentNode.tsx` — recursive comment + replies renderer
- `db/tests/rls/reply-on-comment-notification.test.ts` — trigger RLS specs

**Modified:**
- `app/lib/supabase/types.ts` — add `parent_id`, `reply_count` to `activity_comments`; add `reply_on_comment` to `notification_kind` enum
- `app/lib/queries/activity-comments.ts` — extend `CommentItem`; extend SELECT
- `app/lib/actions/activity-comments.ts` — add `parentId?` to `_addActivityComment` / `addActivityComment`
- `app/components/CommentList.tsx` — delegate to `CommentNode`
- `app/components/CommentComposer.tsx` — add `replyTo` + `onCancelReply` props
- `app/components/CommentSheet.tsx` — add state, tree helpers, reply flow, subtree delete
- `app/app/globals.css` — three new rule blocks
- `app/lib/queries/group-notifications.ts` — add `reply_on_comment` grouping key + minSize
- `app/components/notifications/NotificationRow.tsx` — add `reply_on_comment` cases
- `app/components/notifications/NotificationGroupRow.tsx` — add `reply_on_comment` cases
- `db/tests/rls/activity_comments.test.ts` — extend with reply cases
- `app/tests/actions/activity-comments.test.ts` — extend with parentId cases
- `app/tests/queries/group-notifications.test.ts` — extend with `reply_on_comment` cases

---

### Task 1: Write the three DB migrations

**Files:**
- Create: `db/migrations/0157_threaded_replies.sql`
- Create: `db/migrations/0158_reply_on_comment_kind.sql`
- Create: `db/migrations/0159_reply_on_comment_trigger.sql`

- [ ] **Step 1: Write 0157_threaded_replies.sql**

```sql
-- 0157_threaded_replies.sql
-- Adds self-referential threading to activity_comments.
-- parent_id NULL = top-level comment; non-null = reply.
-- reply_count is maintained by the ac_bump_reply_count trigger.
-- ON DELETE CASCADE means deleting a parent removes its replies;
-- the trigger fires for each cascaded delete but the UPDATE on a
-- deleted parent is a no-op — safe.

ALTER TABLE activity_comments
  ADD COLUMN parent_id   UUID REFERENCES activity_comments(id) ON DELETE CASCADE,
  ADD COLUMN reply_count INT NOT NULL DEFAULT 0;

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

- [ ] **Step 2: Write 0158_reply_on_comment_kind.sql**

```sql
-- 0158_reply_on_comment_kind.sql
-- Extends notification_kind enum. Must be committed in its own
-- transaction before 0159 (which references the new value).
ALTER TYPE notification_kind ADD VALUE 'reply_on_comment';
```

- [ ] **Step 3: Write 0159_reply_on_comment_trigger.sql**

```sql
-- 0159_reply_on_comment_trigger.sql
-- Notifies the parent comment's author when a reply is inserted.
-- Skip conditions:
--   1. Not a reply (parent_id IS NULL)
--   2. Self-reply (replier = parent comment author)
--   3. Parent author = activity owner (they already get comment_on_activity)

CREATE OR REPLACE FUNCTION public.notify_reply_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_author_id  UUID;
  activity_owner_id UUID;
  film_id_val       TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO parent_author_id
    FROM activity_comments WHERE id = NEW.parent_id;

  -- NEW.activity_id references activity(id) directly
  SELECT a.actor_user_id, a.payload->>'film_id'
    INTO activity_owner_id, film_id_val
    FROM activity a
    WHERE a.id = NEW.activity_id
    LIMIT 1;

  IF NEW.user_id = parent_author_id   THEN RETURN NEW; END IF;
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

- [ ] **Step 4: Apply migrations to prod DB**

From repo root:
```bash
set -a; source app/.env.local; set +a
cd db && npm run migrate
```

Expected: migrations applied in order; no errors.

- [ ] **Step 5: Run DB smoke tests**

```bash
cd db && npm test
```

Expected: all pass (pg-mem strips PL/pgSQL function bodies; if the new migrations cause failures, extend the strip filter in `db/tests/helpers/pg-mem.ts` to include `ac_bump_reply_count` patterns).

- [ ] **Step 6: Commit**

Write commit message to `/tmp/msg.txt` (avoids heredoc mangling — see CLAUDE.md gotcha):
```
db(migrations): threaded replies — parent_id, reply_count, reply_on_comment notification

0157: parent_id + reply_count + ac_bump_reply_count trigger
0158: reply_on_comment notification_kind
0159: notify_reply_on_comment trigger

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add db/migrations/0157_threaded_replies.sql db/migrations/0158_reply_on_comment_kind.sql db/migrations/0159_reply_on_comment_trigger.sql
git commit -F /tmp/msg.txt
```

---

### Task 2: Hand-edit Supabase types

**Files:**
- Modify: `app/lib/supabase/types.ts`

The `activity_comments` block (around line 76) and the `notification_kind` enum (around line 1078) need updating. The Supabase CLI is not available locally — hand-edit per the project convention.

- [ ] **Step 1: Add parent_id and reply_count to activity_comments Row/Insert/Update**

In `activity_comments.Row`, add after `like_count: number`:
```ts
parent_id: string | null
reply_count: number
```

In `activity_comments.Insert`, add after `like_count?: number`:
```ts
parent_id?: string | null
reply_count?: number
```

In `activity_comments.Update`, add after `like_count?: number`:
```ts
parent_id?: string | null
reply_count?: number
```

- [ ] **Step 2: Add reply_on_comment to notification_kind enum**

Around line 1085 (after `"rate_reminder"`):
```ts
notification_kind:
  | "coven_invite_pending"
  | "coven_invite_accepted"
  | "recommendation_received"
  | "price_drop"
  | "comment_on_activity"
  | "like_on_comment"
  | "rate_reminder"
  | "reply_on_comment"
```

- [ ] **Step 3: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
chore(types): add parent_id, reply_count, reply_on_comment to Supabase types

Hand-edit per convention (no local Supabase CLI).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/lib/supabase/types.ts && git commit -F /tmp/msg.txt
```

---

### Task 3: Extend CommentItem and query

**Files:**
- Modify: `app/lib/queries/activity-comments.ts`

- [ ] **Step 1: Extend the CommentItem interface**

In `app/lib/queries/activity-comments.ts`, update `CommentItem`:
```ts
export interface CommentItem {
  id: string;
  user_id: string;
  user: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  body: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  parent_id: string | null;
  reply_count: number;
}
```

- [ ] **Step 2: Update the SELECT in getCommentSummariesForActivities**

Change the `.select(...)` call to include the two new columns:
```ts
.select("id, activity_id, user_id, body, created_at, like_count, parent_id, reply_count")
```

- [ ] **Step 3: Update the items.push call in getCommentSummariesForActivities**

```ts
entry.items.push({
  id: row.id,
  user_id: row.user_id,
  user: { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url },
  body: row.body,
  created_at: row.created_at,
  like_count: row.like_count,
  liked_by_me: likedSet.has(row.id),
  parent_id: row.parent_id,
  reply_count: row.reply_count,
});
```

- [ ] **Step 4: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors. (TypeScript will flag any call site that constructs a `CommentItem` without the new fields — fix those now.)

- [ ] **Step 5: Commit**

```
feat(queries): extend CommentItem with parent_id + reply_count

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/lib/queries/activity-comments.ts && git commit -F /tmp/msg.txt
```

---

### Task 4: Extend addActivityComment action

**Files:**
- Modify: `app/lib/actions/activity-comments.ts`

- [ ] **Step 1: Add parentId param to _addActivityComment**

Replace the existing `_addActivityComment` signature and INSERT:

```ts
export async function _addActivityComment(
  client: Client,
  activityId: string,
  rawBody: string,
  parentId?: string,
): Promise<AddResult> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return { ok: false, error: "unauthenticated" };

  const body = (rawBody ?? "").trim();
  if (body.length === 0) return { ok: false, error: "Comment is empty." };
  if (body.length > MAX_LEN) return { ok: false, error: `Comment is over ${MAX_LEN} characters.` };

  const { data, error } = await client
    .from("activity_comments")
    .insert({ activity_id: activityId, user_id: user.id, body, parent_id: parentId ?? null })
    .select("id, activity_id, user_id, body, created_at, parent_id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { data: profile, error: pErr } = await client
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .single();
  if (pErr) return { ok: false, error: pErr.message };

  return {
    ok: true,
    comment: {
      id: data.id,
      user_id: data.user_id,
      user: {
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
      body: data.body,
      created_at: data.created_at,
      like_count: 0,
      liked_by_me: false,
      parent_id: data.parent_id,
      reply_count: 0,
    },
  };
}
```

- [ ] **Step 2: Update the public addActivityComment wrapper**

```ts
export async function addActivityComment(
  activityId: string,
  body: string,
  parentId?: string,
): Promise<AddResult> {
  const supabase = await createClient();
  const result = await _addActivityComment(supabase, activityId, body, parentId);
  if (result.ok) revalidatePath("/home");
  return result;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
feat(actions): addActivityComment accepts optional parentId for replies

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/lib/actions/activity-comments.ts && git commit -F /tmp/msg.txt
```

---

### Task 5: CSS — add thread rail, view-replies, and composer banner styles

**Files:**
- Modify: `app/app/globals.css`

- [ ] **Step 1: Add three new CSS blocks near the existing `.comment-*` rules (around line 1168)**

```css
/* ── threaded reply rail ── */
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
  /* indentation stops tapering beyond depth 3 */
}

/* ── view / hide replies toggle ── */
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

/* ── reply mode banner inside CommentComposer ── */
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

- [ ] **Step 2: Commit**

```
style: add comment-thread-rail, comment-view-replies, composer-replying-to CSS

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/app/globals.css && git commit -F /tmp/msg.txt
```

---

### Task 6: New CommentNode recursive component

**Files:**
- Create: `app/components/CommentNode.tsx`

- [ ] **Step 1: Write CommentNode.tsx**

```tsx
"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import CommentHeartButton from "./CommentHeartButton";
import { relativeTime } from "./activity/relativeTime";
import type { CommentItem } from "@/lib/queries/activity-comments";

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

export default function CommentNode({
  comment, childrenMap, depth, viewerId, actorUserId,
  expandedIds, onExpand, onReply, onDelete,
}: Props) {
  const canDelete = viewerId !== null && (viewerId === comment.user_id || viewerId === actorUserId);
  const children = childrenMap.get(comment.id) ?? [];
  const replyCount = children.length;
  const isExpanded = expandedIds.has(comment.id);
  const avatarSize = depth === 0 ? 36 : 24;

  return (
    <div>
      <div className="comment-row">
        <Avatar
          name={comment.user.display_name ?? comment.user.username}
          color="var(--accent)"
          size={avatarSize}
          url={comment.user.avatar_url}
        />
        <div className="comment-row-body">
          <div className="comment-row-meta">
            <Link
              href={`/p/${encodeURIComponent(comment.user.username)}`}
              className="comment-row-username"
            >
              {comment.user.username}
            </Link>
            <span className="comment-row-time">{relativeTime(comment.created_at)}</span>
          </div>
          <div className="comment-row-text">{comment.body}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
            {viewerId !== null && (
              <button
                type="button"
                style={{
                  background: "none", border: "none", padding: 0,
                  fontFamily: "var(--font-ui)", fontSize: 11,
                  color: "var(--muted)", cursor: "pointer",
                }}
                onClick={() => onReply(comment.id, comment.user.username)}
              >
                Reply
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="comment-row-delete"
                aria-label="Delete comment"
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <CommentHeartButton
          commentId={comment.id}
          initialCount={comment.like_count}
          initialLikedByMe={comment.liked_by_me}
          disabled={viewerId === null}
        />
      </div>

      {replyCount > 0 && (
        <div style={{ marginLeft: depth === 0 ? 46 : 34 }}>
          <button
            type="button"
            className="comment-view-replies"
            onClick={() => onExpand(comment.id)}
          >
            {isExpanded
              ? "Hide replies"
              : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </button>
        </div>
      )}

      {isExpanded && replyCount > 0 && (
        <div className="comment-thread-rail">
          {children.map(child => (
            <CommentNode
              key={child.id}
              comment={child}
              childrenMap={childrenMap}
              depth={depth + 1}
              viewerId={viewerId}
              actorUserId={actorUserId}
              expandedIds={expandedIds}
              onExpand={onExpand}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
feat(components): CommentNode — recursive threaded reply renderer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/components/CommentNode.tsx && git commit -F /tmp/msg.txt
```

---

### Task 7: Update CommentList to delegate to CommentNode

**Files:**
- Modify: `app/components/CommentList.tsx`

- [ ] **Step 1: Rewrite CommentList.tsx**

```tsx
"use client";

import CommentNode from "./CommentNode";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  items: CommentItem[];
  childrenMap: Map<string, CommentItem[]>;
  viewerId: string | null;
  actorUserId: string;
  expandedIds: Set<string>;
  onExpand: (id: string) => void;
  onReply: (commentId: string, username: string) => void;
  onDelete: (id: string) => void;
}

export default function CommentList({
  items, childrenMap, viewerId, actorUserId,
  expandedIds, onExpand, onReply, onDelete,
}: Props) {
  const topLevel = items.filter(i => i.parent_id === null);
  if (topLevel.length === 0) {
    return (
      <div style={{
        padding: "24px 0",
        fontFamily: "var(--font-serif)",
        fontStyle: "italic",
        color: "var(--muted)",
        textAlign: "center",
      }}>
        No comments yet. Be the first.
      </div>
    );
  }
  return (
    <div>
      {topLevel.map(c => (
        <CommentNode
          key={c.id}
          comment={c}
          childrenMap={childrenMap}
          depth={0}
          viewerId={viewerId}
          actorUserId={actorUserId}
          expandedIds={expandedIds}
          onExpand={onExpand}
          onReply={onReply}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors. TypeScript will catch the updated prop surface on `CommentList`; any call sites that pass the old props will error — fix them as part of Task 9.

- [ ] **Step 3: Commit**

```
refactor(CommentList): delegate rendering to CommentNode

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/components/CommentList.tsx && git commit -F /tmp/msg.txt
```

---

### Task 8: Update CommentComposer — reply mode

**Files:**
- Modify: `app/components/CommentComposer.tsx`

- [ ] **Step 1: Add replyTo and onCancelReply props and render the banner**

Replace the entire file:

```tsx
"use client";

import { useState } from "react";
import Avatar from "./Avatar";

const MAX_LEN = 140;

interface Props {
  pending: boolean;
  error: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  replyTo: { commentId: string; username: string } | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => void;
}

export default function CommentComposer({
  pending,
  error,
  viewerAvatarUrl,
  viewerDisplayName,
  replyTo,
  onCancelReply,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending;

  function submit() {
    if (!canPost) return;
    onSubmit(trimmed);
    setDraft("");
  }

  // .composer-row is display:flex — the banner must live outside it, in a
  // wrapping div that also carries the iOS keyboard padding.
  return (
    <div style={{ paddingBottom: "env(keyboard-inset-height, 0px)" }}>
      {replyTo && (
        <div className="composer-replying-to">
          <span>Replying to <strong>@{replyTo.username}</strong></span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">✕</button>
        </div>
      )}
      {error && (
        <div style={{
          fontSize: 11, color: "var(--blood)", marginBottom: 8,
          fontFamily: "var(--font-serif)", fontStyle: "italic",
        }}>
          {error}
        </div>
      )}
      <div className="composer-row">
        <Avatar
          name={viewerDisplayName ?? "you"}
          color="var(--accent)"
          size={32}
          url={viewerAvatarUrl}
        />
        <div className="composer-pill">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canPost) { e.preventDefault(); submit(); } }}
            placeholder={replyTo ? "Reply…" : "Add a comment…"}
            maxLength={MAX_LEN + 1}
          />
          <span className={`composer-counter ${overLimit ? "over" : ""}`}>
            {trimmed.length}/{MAX_LEN}
          </span>
        </div>
        {canPost ? (
          <button type="button" className="btn btn-sm" onClick={submit}>
            {pending ? "…" : "Post"}
          </button>
        ) : (
          <button
            type="button"
            className="composer-post-link"
            disabled
            aria-label="Post (disabled)"
          >
            Post
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: TypeScript flags the call site in `CommentSheet` which doesn't pass the new props yet — that is fixed in Task 9.

- [ ] **Step 3: Commit**

```
feat(CommentComposer): reply mode — replyTo banner + cancel affordance

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/components/CommentComposer.tsx && git commit -F /tmp/msg.txt
```

---

### Task 9: Update CommentSheet — thread state and reply flow

**Files:**
- Modify: `app/components/CommentSheet.tsx`

- [ ] **Step 1: Rewrite CommentSheet.tsx**

```tsx
"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";
import CommentList from "./CommentList";
import CommentComposer from "./CommentComposer";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

// ── pure helpers ────────────────────────────────────────────────

function buildChildrenMap(items: CommentItem[]): Map<string, CommentItem[]> {
  const map = new Map<string, CommentItem[]>();
  for (const item of items) {
    if (item.parent_id) {
      const arr = map.get(item.parent_id) ?? [];
      arr.push(item);
      map.set(item.parent_id, arr);
    }
  }
  return map;
}

function collectDescendants(id: string, items: CommentItem[]): Set<string> {
  const result = new Set<string>([id]);
  for (const item of items) {
    if (item.parent_id === id) {
      for (const desc of collectDescendants(item.id, items)) {
        result.add(desc);
      }
    }
  }
  return result;
}

// ── component ───────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  activityId: string;
  actorUserId: string;
  viewerId: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  initialItems: CommentItem[];
  onCountChange: (n: number) => void;
}

export default function CommentSheet({
  open, onClose, activityId, actorUserId,
  viewerId, viewerAvatarUrl, viewerDisplayName,
  initialItems, onCountChange,
}: Props) {
  const [items, setItems] = useState<CommentItem[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<{ commentId: string; username: string } | null>(null);

  const childrenMap = buildChildrenMap(items);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function postComment(body: string) {
    if (!viewerId) return;
    setError(null);
    const parentId = replyTo?.commentId ?? null;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { username: "...", display_name: null, avatar_url: viewerAvatarUrl },
      body,
      created_at: new Date().toISOString(),
      like_count: 0,
      liked_by_me: false,
      parent_id: parentId,
      reply_count: 0,
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange(next.length);
      return next;
    });
    if (parentId) {
      setExpandedIds(prev => new Set([...prev, parentId]));
    }
    setReplyTo(null);
    startTransition(async () => {
      const result = await addActivityComment(activityId, body, parentId ?? undefined);
      if (result.ok) {
        setItems(prev => prev.map(c => c.id === tempId ? result.comment : c));
      } else {
        setItems(prev => {
          const next = prev.filter(c => c.id !== tempId);
          onCountChange(next.length);
          return next;
        });
        setError(result.error);
      }
    });
  }

  function removeComment(id: string) {
    const prev = items;
    setItems(p => {
      const toRemove = collectDescendants(id, p);
      const next = p.filter(c => !toRemove.has(c.id));
      onCountChange(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await deleteActivityComment(id);
      if (!result.ok) {
        setItems(prev);
        onCountChange(prev.length);
        setError(result.error);
      }
    });
  }

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span>Comments</span>
      <span className="dot-accent">•</span>
      <span style={{ fontSize: 18, color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 400 }}>
        {items.length}
      </span>
    </span>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div style={{ display: "flex", flexDirection: "column", height: "70dvh" }}>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <CommentList
            items={items}
            childrenMap={childrenMap}
            viewerId={viewerId}
            actorUserId={actorUserId}
            expandedIds={expandedIds}
            onExpand={toggleExpand}
            onReply={(commentId, username) => setReplyTo({ commentId, username })}
            onDelete={removeComment}
          />
        </div>
        {viewerId !== null ? (
          <CommentComposer
            pending={pending}
            error={error}
            viewerAvatarUrl={viewerAvatarUrl}
            viewerDisplayName={viewerDisplayName}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSubmit={postComment}
          />
        ) : (
          <div style={{ padding: "12px 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", borderTop: "1px solid var(--muted)" }}>
            Sign in to comment.
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Start dev server and verify in browser**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000, navigate to `/home`, open a comment thread. Verify:
- Existing comments display correctly
- Tapping "Reply" shows "Replying to @username ✕" banner
- Posting a reply adds it under the parent with "View 1 reply" toggle
- Toggling expands/collapses the reply
- Cancelling reply resets the composer
- Deleting a parent removes it and any replies from the list

- [ ] **Step 4: Commit**

```
feat(CommentSheet): threaded replies — expand state, reply flow, subtree delete

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/components/CommentSheet.tsx && git commit -F /tmp/msg.txt
```

---

### Task 10: Notifications — grouping + display

**Files:**
- Modify: `app/lib/queries/group-notifications.ts`
- Modify: `app/components/notifications/NotificationRow.tsx`
- Modify: `app/components/notifications/NotificationGroupRow.tsx`

- [ ] **Step 1: Update groupKey and minSize in group-notifications.ts**

```ts
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
```

- [ ] **Step 2: Add reply_on_comment to NotificationRow.tsx**

In `targetFor`, add after the `like_on_comment` case:
```ts
case "reply_on_comment": {
  const activityId = (n.payload as { activity_id?: string }).activity_id;
  return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
}
```

In `copyFor`, add after the `like_on_comment` case:
```ts
case "reply_on_comment": {
  const raw = (n.payload as { body?: string }).body ?? "";
  const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
  const subject = n.film?.title ?? "your comment";
  return <><strong>{actorName}</strong> replied to your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
}
```

- [ ] **Step 3: Add reply_on_comment to NotificationGroupRow.tsx**

In `headerCopy`, add after the `like_on_comment` case:
```ts
case "reply_on_comment": {
  const raw = (group.items[0].payload as { body?: string }).body ?? "";
  const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
  const subject = group.items[0].film?.title ?? "your comment";
  return <><strong>{group.count} people</strong> replied to your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
}
```

In `headerHref`, add after the `like_on_comment` case:
```ts
case "reply_on_comment": {
  const activityId = (first.payload as { activity_id?: string }).activity_id;
  return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
}
```

- [ ] **Step 4: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors. TypeScript exhaustive switch checks will catch any missed cases.

- [ ] **Step 5: Commit**

```
feat(notifications): reply_on_comment — grouping, single row, group row

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/lib/queries/group-notifications.ts app/components/notifications/NotificationRow.tsx app/components/notifications/NotificationGroupRow.tsx && git commit -F /tmp/msg.txt
```

---

### Task 11: DB RLS tests — replies and notification trigger

**Files:**
- Modify: `db/tests/rls/activity_comments.test.ts`
- Create: `db/tests/rls/reply-on-comment-notification.test.ts`

- [ ] **Step 1: Extend activity_comments.test.ts with 4 reply cases**

Add to the `"RLS: activity_comments"` describe block, after the existing tests:

```ts
it("reply INSERT sets parent_id and bumps parent reply_count to 1", async () => {
  await beginAs(db.client, null, "service_role");
  const parent = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body)
     VALUES ($1, $2, 'parent') RETURNING id`,
    [activityId, fx.userB.id]
  );
  await commit(db.client);
  const parentId = parent.rows[0].id;

  await beginAs(db.client, fx.userC.id, "authenticated");
  await db.client.query(
    `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
     VALUES ($1, $2, 'reply', $3)`,
    [activityId, fx.userC.id, parentId]
  );
  await commit(db.client);

  await beginAs(db.client, null, "service_role");
  const r = await db.client.query<{ reply_count: number }>(
    `SELECT reply_count FROM activity_comments WHERE id = $1`,
    [parentId]
  );
  await commit(db.client);
  expect(r.rows[0].reply_count).toBe(1);
});

it("reply DELETE decrements parent reply_count back to 0", async () => {
  await beginAs(db.client, null, "service_role");
  const parent = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body)
     VALUES ($1, $2, 'parent') RETURNING id`,
    [activityId, fx.userB.id]
  );
  await commit(db.client);
  const parentId = parent.rows[0].id;

  await beginAs(db.client, null, "service_role");
  const reply = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
     VALUES ($1, $2, 'reply', $3) RETURNING id`,
    [activityId, fx.userC.id, parentId]
  );
  const replyId = reply.rows[0].id;
  await commit(db.client);

  await beginAs(db.client, fx.userC.id, "authenticated");
  await db.client.query(`DELETE FROM activity_comments WHERE id = $1`, [replyId]);
  await commit(db.client);

  await beginAs(db.client, null, "service_role");
  const r = await db.client.query<{ reply_count: number }>(
    `SELECT reply_count FROM activity_comments WHERE id = $1`,
    [parentId]
  );
  await commit(db.client);
  expect(r.rows[0].reply_count).toBe(0);
});

it("deleting parent cascades and removes its reply", async () => {
  await beginAs(db.client, null, "service_role");
  const parent = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body)
     VALUES ($1, $2, 'parent') RETURNING id`,
    [activityId, fx.userB.id]
  );
  const parentId = parent.rows[0].id;
  const reply = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
     VALUES ($1, $2, 'child', $3) RETURNING id`,
    [activityId, fx.userC.id, parentId]
  );
  const replyId = reply.rows[0].id;
  await commit(db.client);

  await beginAs(db.client, fx.userB.id, "authenticated");
  await db.client.query(`DELETE FROM activity_comments WHERE id = $1`, [parentId]);
  await commit(db.client);

  await beginAs(db.client, null, "service_role");
  const r = await db.client.query(
    `SELECT id FROM activity_comments WHERE id = $1`,
    [replyId]
  );
  await commit(db.client);
  expect(r.rowCount).toBe(0);
});

it("reply INSERT as another user is blocked by RLS", async () => {
  await beginAs(db.client, null, "service_role");
  const parent = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body)
     VALUES ($1, $2, 'parent') RETURNING id`,
    [activityId, fx.userB.id]
  );
  await commit(db.client);
  const parentId = parent.rows[0].id;

  await beginAs(db.client, fx.userC.id, "authenticated");
  try {
    await expect(
      db.client.query(
        `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
         VALUES ($1, $2, 'spoof', $3)`,
        [activityId, fx.userB.id, parentId]   // userC inserting as userB
      )
    ).rejects.toThrow();
  } finally { await rollback(db.client); }
});
```

- [ ] **Step 2: Write reply-on-comment-notification.test.ts**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let activityId: string; // owned by userA

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);

  await beginAs(db.client, null, "service_role");
  const res = await db.client.query<{ id: string }>(
    `INSERT INTO activity (actor_user_id, kind, payload)
     VALUES ($1, 'watchlist_added', $2) RETURNING id`,
    [fx.userA.id, JSON.stringify({ film_id: fx.filmId })]
  );
  activityId = res.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM notifications`);
  await db.client.query(`DELETE FROM activity_comments WHERE activity_id = $1`, [activityId]);
  await commit(db.client);
});

describe("RLS: reply_on_comment notification trigger", () => {
  it("reply by userC on userB comment → notifies userB with reply_on_comment", async () => {
    // Seed parent comment by userB
    await beginAs(db.client, null, "service_role");
    const parent = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'parent') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const parentId = parent.rows[0].id;

    // userC replies
    await beginAs(db.client, fx.userC.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
       VALUES ($1, $2, 'a reply', $3)`,
      [activityId, fx.userC.id, parentId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query<{
      kind: string; user_id: string; actor_user_id: string; payload: Record<string, unknown>;
    }>(
      `SELECT kind, user_id, actor_user_id, payload
       FROM notifications WHERE kind = 'reply_on_comment'`
    );
    await commit(db.client);

    expect(n.rowCount).toBe(1);
    expect(n.rows[0].user_id).toBe(fx.userB.id);         // notified: parent comment author
    expect(n.rows[0].actor_user_id).toBe(fx.userC.id);   // actor: replier
    expect(n.rows[0].payload.parent_comment_id).toBe(parentId);
    expect(n.rows[0].payload.body).toBe("a reply");
  });

  it("self-reply → no notification", async () => {
    await beginAs(db.client, null, "service_role");
    const parent = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'mine') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const parentId = parent.rows[0].id;

    // userB replies to own comment
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
       VALUES ($1, $2, 'self-reply', $3)`,
      [activityId, fx.userB.id, parentId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query(
      `SELECT id FROM notifications WHERE kind = 'reply_on_comment'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(0);
  });

  it("reply to activity owner's comment → no reply_on_comment (owner already gets comment_on_activity)", async () => {
    // Seed parent comment by userA (the activity owner)
    await beginAs(db.client, null, "service_role");
    const parent = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'owner comment') RETURNING id`,
      [activityId, fx.userA.id]
    );
    await commit(db.client);
    const parentId = parent.rows[0].id;

    // userB replies
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body, parent_id)
       VALUES ($1, $2, 'reply to owner', $3)`,
      [activityId, fx.userB.id, parentId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query(
      `SELECT id FROM notifications WHERE kind = 'reply_on_comment'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run RLS tests**

```bash
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls
```

Expected: all new and existing tests pass.

- [ ] **Step 4: Commit**

```
test(rls): threaded replies — reply_count trigger + reply_on_comment notification specs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add db/tests/rls/activity_comments.test.ts db/tests/rls/reply-on-comment-notification.test.ts && git commit -F /tmp/msg.txt
```

---

### Task 12: group-notifications unit tests + action integration tests

**Files:**
- Modify: `app/tests/queries/group-notifications.test.ts`
- Modify: `app/tests/actions/activity-comments.test.ts`

- [ ] **Step 1: Write failing group-notifications tests first**

Add a new describe block to `app/tests/queries/group-notifications.test.ts`:

```ts
describe("groupNotifications: reply_on_comment per-parent grouping (threshold 2)", () => {
  function rep(
    id: string,
    actor: typeof ACTOR_A | null,
    createdAt: string,
    parentCommentId: string,
  ): EnrichedNotification {
    return {
      id,
      kind: "reply_on_comment",
      created_at: createdAt,
      read_at: null,
      actor,
      payload: {
        activity_id: "act1",
        parent_comment_id: parentCommentId,
        comment_id: id,
        body: "a reply",
        film_id: FILM.id,
      },
      film: FILM,
    };
  }

  it("1 reply_on_comment → emits as single", () => {
    const out = groupNotifications([rep("1", ACTOR_A, "2026-05-03T12:00:00Z", "pc1")]);
    expect(out[0].type).toBe("single");
  });

  it("2 reply_on_comment on SAME parent → emits as group of 2", () => {
    const items = [
      rep("2", ACTOR_B, "2026-05-03T12:00:00Z", "pc1"),
      rep("1", ACTOR_A, "2026-05-03T11:50:00Z", "pc1"),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.count).toBe(2);
      expect(out[0].group.kind).toBe("reply_on_comment");
    }
  });

  it("2 reply_on_comment on DIFFERENT parents → emits as 2 singles", () => {
    const items = [
      rep("2", ACTOR_A, "2026-05-03T12:00:00Z", "pcA"),
      rep("1", ACTOR_A, "2026-05-03T11:55:00Z", "pcB"),
    ];
    const out = groupNotifications(items);
    expect(out.map(o => o.type)).toEqual(["single", "single"]);
  });
});
```

- [ ] **Step 2: Run group-notifications tests (expect 3 new failures)**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- tests/queries/group-notifications.test.ts
```

Expected: existing tests pass, 3 new tests FAIL (groupKey doesn't handle `reply_on_comment` yet).

- [ ] **Step 3: Verify Task 10's implementation already passes the tests**

The grouping changes were made in Task 10. Confirm by running the tests again:

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- tests/queries/group-notifications.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Write failing action integration tests**

Add to the `describe.skipIf(!hasEnv)` block in `app/tests/actions/activity-comments.test.ts`:

Also update `beforeEach` to clear `reply_on_comment` notifications too:
```ts
beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("activity_comments" as never).delete().eq("activity_id", activityId);
  await admin.from("notifications").delete().eq("kind", "comment_on_activity");
  await admin.from("notifications").delete().eq("kind", "reply_on_comment");
});
```

Add these tests:
```ts
it("_addActivityComment with parentId returns comment with parent_id set", async () => {
  const c = await signedInClient(bob.email, bob.password);
  const parent = await _addActivityComment(c, activityId, "parent comment");
  if (!parent.ok) throw new Error("parent insert failed");

  const reply = await _addActivityComment(c, activityId, "reply body", parent.comment.id);
  expect(reply.ok).toBe(true);
  if (!reply.ok) return;
  expect(reply.comment.parent_id).toBe(parent.comment.id);
  expect(reply.comment.reply_count).toBe(0);
});

it("_addActivityComment without parentId returns comment with parent_id null", async () => {
  const c = await signedInClient(bob.email, bob.password);
  const r = await _addActivityComment(c, activityId, "top-level");
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.comment.parent_id).toBeNull();
});
```

- [ ] **Step 5: Run all app tests**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test
```

Expected: integration tests skip (no live Supabase env), unit tests pass.

- [ ] **Step 6: Final typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```
test: threaded replies — group-notifications + action integration specs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
```bash
git add app/tests/queries/group-notifications.test.ts app/tests/actions/activity-comments.test.ts && git commit -F /tmp/msg.txt
```

---

### Task 13: Deploy

- [ ] **Step 1: Sync from master and verify clean state**

```bash
git fetch origin
git merge --ff-only origin/master
```

- [ ] **Step 2: Deploy from repo root**

```bash
npx vercel deploy --prod --yes
```

Expected: build succeeds; deployment URL printed.

- [ ] **Step 3: Smoke-test on prod**

Open https://film-goblin.vercel.app, log in, open a comment thread:
- Post a reply — verify "Replying to @username" banner, reply appears nested under the parent with "View 1 reply"
- Expand/collapse the reply
- Cancel reply mid-compose — verify composer resets
- Delete a reply — verify it disappears from the thread
- Check the notification bell after another user replies to your comment
