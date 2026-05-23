# Activity comments — design

**Status:** Approved 2026-04-27
**Owner:** This session
**Replaces:** none (additive)
**Related:**
- Coven feed hearts (`2026-04-24-coven-feed-hearts-design.md`) — `activity_reactions` is the precedent pattern this spec mirrors.
- Activity feed grouping (D1) — comments are scoped to single-event rows; grouped rows are non-commentable in v1.
- Notifications badge (`2026-04-26-notifications-badge-design.md`) — extends the existing `notification_kind` enum and trigger pattern.

## Problem

Hearts let coven members react to activity rows but the signal is binary — there's no way to say "banger" or "finally watching it??" or "I rewatched and changed my mind." Threads on a friend's watchlist add or watched-log are conspicuously missing whenever a row prompts more than a tap.

## Goal

Let any authed user leave a short (≤140 char) text comment on a single-event activity row. Render the thread inline under the row in feeds and on profile pages. Notify the activity actor in-app when a non-self comment lands. Keep schema/UX scoped tightly to "quick takes" — no replies, no edit, no email.

## Non-goals (v1)

- **Threaded replies / nested comments.** Flat list only; replies-to-replies deferred.
- **Editing comments.** Delete-and-repost is the only path.
- **Email notifications.** In-app only; Settings toggle for email deferred.
- **Comments on grouped feed rows.** Grouped rows (e.g., "Alice added 4 films") hide the 💬 affordance. Profile pages show single events ungrouped, so commenters can drop down a level.
- **@-mentions, markdown, link parsing, rich text.** Plain text rendered through React's auto-escape.
- **Spam reporting / abuse flow.** Activity owner's delete is the only moderation hatch.
- **Pagination of long threads.** Inline panel scrolls; "load older" link deferred.
- **Coven-only write scope.** Write scope matches activity read scope: any authed user.

## Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Conversation shape | Flat list of one-shot reactions per activity row. No replies. |
| 2 | Display surface | Inline expand-down under the activity row in feed. No bottom sheet, no dedicated `/activity/[id]` page. |
| 3 | Grouped rows | No comments on grouped rows. 💬 only on single-event rows. |
| 4 | Notifications | New `comment_on_activity` notification kind. In-app bell only; no email. |
| 5 | Write scope | Any authed user. Self-comments allowed. |
| 6 | Edit / delete | No edit. Author can delete. Activity owner can also delete from their own row (moderation hatch). |

## Schema

New migration `db/migrations/0129_activity_comments.sql`:

```sql
CREATE TABLE activity_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_comments_activity_created_idx
  ON activity_comments (activity_id, created_at);
CREATE INDEX activity_comments_user_id_idx
  ON activity_comments (user_id);

ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_comments_select
  ON activity_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY activity_comments_insert
  ON activity_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY activity_comments_delete
  ON activity_comments FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT actor_user_id FROM activity WHERE id = activity_comments.activity_id)
  );

GRANT SELECT, INSERT, DELETE ON activity_comments TO authenticated;
-- No UPDATE policy (no edit).
```

**Differences from `activity_reactions`:**
- Surrogate `id` PK (multiple comments per `(activity, user)` are valid).
- `body` column with `1..140` CHECK.
- Two-disjunct DELETE policy: comment author OR activity owner.

## Notification trigger

New migration `db/migrations/0130_comment_notification.sql`:

```sql
ALTER TYPE notification_kind ADD VALUE 'comment_on_activity';

CREATE OR REPLACE FUNCTION public.notify_comment_on_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID;
BEGIN
  SELECT actor_user_id INTO v_actor FROM activity WHERE id = NEW.activity_id;
  IF v_actor IS NULL OR v_actor = NEW.user_id THEN
    RETURN NEW;  -- self-comments don't notify
  END IF;
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  VALUES (
    v_actor,
    'comment_on_activity',
    NEW.user_id,
    jsonb_build_object(
      'activity_id', NEW.activity_id,
      'comment_id', NEW.id,
      'body', NEW.body
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_activity_comment_insert_notify
AFTER INSERT ON activity_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_on_activity();
```

**Why two migrations:** `ALTER TYPE … ADD VALUE` cannot run in the same transaction as the trigger that references the new value on older Postgres. Splitting keeps the apply order deterministic.

## Read path

New file `app/lib/queries/activity-comments.ts`:

```ts
export interface CommentItem {
  id: string;
  user_id: string;
  user: { handle: string; display_name: string | null; avatar_url: string | null };
  body: string;
  created_at: string;
}

export interface CommentSummary {
  count: number;
  items: CommentItem[];
}

export async function getCommentSummariesForActivities(
  client: Client,
  activityIds: string[],
): Promise<Map<string, CommentSummary>>;
```

Single batched SELECT joining `activity_comments` to `profiles` (PostgREST nested embed), `WHERE activity_id IN (...)`, `ORDER BY created_at`. Aggregate into `Map<activity_id, CommentSummary>` in JS — same shape as `getReactionsForActivities`.

**Feed integration:** `getEnrichedFeed` (`app/lib/queries/activity.ts`) calls `getCommentSummariesForActivities` in parallel with `getReactionsForActivities` for the set of `single` feed items. Group items skip the call (decision #3). The summary attaches as `comments` on each `single` item, alongside `reactions`.

**Profile integration:** `enrichOwnActivity` in `app/app/p/[handle]/page.tsx` makes the same call (profile rows are always single-event — no grouping pass on this surface).

**`canDelete` decision** is computed at render time, not in the query: viewer id matches `comment.user_id` OR viewer id matches the parent activity's `actor_user_id`.

**Payload size:** worst case ~20 rows × ~10 comments × 140 chars ≈ 30KB body + profile JSON. Acceptable for v1; per-row pagination ("load older") deferred.

## Write path

### Server actions — `app/lib/actions/activity-comments.ts`

```ts
async function _addActivityComment(
  client: Client, activityId: string, body: string,
): Promise<{ ok: true; comment: CommentItem } | { ok: false; error: string }>;

export async function addActivityComment(
  activityId: string, body: string,
): Promise<{ ok: true; comment: CommentItem } | { ok: false; error: string }>;

async function _deleteActivityComment(
  client: Client, commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }>;

export async function deleteActivityComment(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }>;
```

Public wrappers create the SSR Supabase client, call the private form, then `revalidatePath("/home")` and (for the actor's profile) `revalidatePath("/p/[handle]")`.

**Validation order:**
1. Server-side `body.trim()`, reject if empty or > 140 chars (action returns a string error before hitting the DB).
2. RLS enforces `auth.uid() = user_id` on insert.
3. CHECK constraint is the backstop on body length.
4. RLS enforces `auth.uid() = user_id OR auth.uid() = activity.actor_user_id` on delete.

### Components

- **`app/components/CommentButton.tsx`** (client) — renders `💬 N` to the LEFT of the heart on every `single` activity row. Tapping toggles inline thread expansion via parent state in the row dispatcher. Always renders, even at count 0, so a fresh composer is one tap away.
- **`app/components/ActivityCommentThread.tsx`** (client) — receives `items: CommentItem[]`, `activityId: string`, `viewerId: string | null`, `actorUserId: string`. Renders:
  - **Comment list** — small avatar, `@handle`, body, relative time per row. `✕` delete affordance shown only when `viewerId === comment.user_id || viewerId === actorUserId`.
  - **Composer** — `<input maxLength={140}>` plus live `N/140` counter. "Post" button disabled when body is empty or over limit. Hidden when `viewerId === null`.
  - **Optimistic insert** — append a local row, fire `addActivityComment`, swap in the server-returned row on success / roll back + show inline error string on failure.
  - **Delete** — instant (no undo toast), matches the heart-toggle UX.
  - **Scroll** — vertical scroll inside the panel; max-height ~240px desktop, ~50vh mobile. Older comments scroll up.
- **`ActivityRow` dispatcher** wires `CommentButton` + `ActivityCommentThread` once. Per-kind activity components don't change. The thread renders only when the feed item is `single` and `comments` is attached.

## Notification UX

- **Bell row copy:** `@bob commented on your add of Midsommar: "banger"` — truncate body to ~60 chars, ellipsis if longer.
- **Click target:** `/home?activity=<id>`. The home page reads the `activity` query param on mount, scrolls to that row, and auto-expands its comment thread.
- **`NotificationsList`** (or wherever the bell renders rows today) gains a new branch for `comment_on_activity` mirroring the existing `recommendation_received` shape.

## Edge cases

- **Account deletion:** comments cascade via `user_id` FK.
- **Activity deletion:** comments cascade via `activity_id` FK.
- **Unicode / emoji:** `char_length` counts codepoints, not graphemes. Multi-codepoint emoji (e.g., 👨‍👩‍👧‍👦) cost ~7 chars. The client-side counter uses the same metric so the limit feels consistent.
- **XSS:** body is plain text; React's default escaping is the only sanitization. No markdown, no link parsing, no `dangerouslySetInnerHTML`.
- **Anon viewer on `/p/<handle>`:** RLS public-reads the thread; the composer is hidden when no session.
- **Optimistic insert failure:** local row is removed and an inline error string surfaces under the composer. No retry UX in v1.
- **Spam / abuse:** none beyond the activity-owner moderation hatch. Reporting flow deferred.
- **Concurrent commenters:** surrogate UUID PK avoids races; multiple comments per `(activity, user)` are valid.
- **Comment-then-grouped:** if a watchlist-add activity has a comment and is *later* pulled into a group (because the actor adds more films within the 30-min window), the row's individual rendering disappears from the feed; comments survive in the DB and remain visible on the actor's profile (which doesn't run the grouping pass). Notifications for those comments still resolve to `/home?activity=<id>`; if the row is now grouped, the page falls back to scrolling to the group containing it without auto-expanding (no thread to expand). Acceptable for v1; revisit if it shows up in usage.

## Testing

### `db/tests/rls/activity-comments.test.ts`
- Author insert succeeds.
- Insert with `user_id ≠ auth.uid()` blocked by RLS.
- Insert with body length 0 or > 140 rejected by CHECK.
- Author delete succeeds.
- Activity-owner delete succeeds (deleting someone else's comment from their own row).
- Random third-party delete blocked.
- Public read by any authed user.
- Cascade: delete activity → its comments removed.
- Cascade: delete user → that user's comments removed.

### Trigger tests (same file or `db/tests/triggers/activity-comments.test.ts`)
- Comment by user A on user B's activity → notification row created for B with payload `{activity_id, comment_id, body}` and `actor_user_id = A`.
- Self-comment by user A on user A's activity → no notification row.

### `app/tests/actions/activity-comments.test.ts`
- Env-gated (`describe.skipIf(!hasEnv)` + `if (!hasEnv) return;` in lifecycle hooks per existing convention).
- `addActivityComment` happy path (returns `{ok: true, comment}`).
- 140-char rejection at the action layer (no DB round-trip).
- Empty / whitespace body rejected.
- `deleteActivityComment` by author succeeds.
- `deleteActivityComment` by activity owner succeeds.
- `deleteActivityComment` by random user fails.

### pg-mem smoke (`db/tests/migrations.test.ts`)
- Should pass without filter changes — CHECK constraints, surrogate UUID PKs, and `ALTER TYPE … ADD VALUE` are already-supported patterns in the strip filter (the migration helper at `db/tests/helpers/pg-mem.ts` strips RLS / GRANT / DROP VIEW; nothing in this spec adds a new unsupported pattern).
- Verify after writing migrations; if `ALTER TYPE` causes a parse issue under pg-mem, extend the strip filter rather than rewriting the migration.

## Migration plan

1. Write `db/migrations/0129_activity_comments.sql` (table, indexes, RLS, grants).
2. Write `db/migrations/0130_comment_notification.sql` (`ALTER TYPE` + trigger function + trigger).
3. Verify `db/ npm test` (pg-mem smoke) passes.
4. Apply to prod via `db/ npm run migrate` using the session-mode pooler URL from `passwords.txt`.
5. Regenerate types: `app/ npm run gen:types`. Commit `app/lib/supabase/types.ts` alongside the migrations.
6. Implementation PRs follow the schema PR — query helper, server actions, components, feed integration, profile integration, notification rendering. Plan author will sequence these.

## Out of scope / deferred

- Threaded replies (single-level or tree).
- Comment editing.
- Email notifications for comments.
- Settings toggle to opt into email.
- Comments on grouped feed rows.
- @-mentions, markdown, link parsing.
- Spam reporting / abuse flow.
- Comment pagination beyond inline scroll.
- Comments on hearts or other reaction surfaces.
- Comments anchored to film pages, lists, or reviews directly (this is activity-row-scoped only).
