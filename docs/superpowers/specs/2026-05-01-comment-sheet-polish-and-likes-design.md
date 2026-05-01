# Comment sheet polish + likes on comments

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #25

## Background

The activity-comments feature shipped in sub-project #17 (PRs around mig 0129–0131) and was further polished in PR #80 (bottom-sheet UX, drop inline thread) and PR #71 (kept thread open after posting). Functionally it works — flat comments, 140 char limit, optimistic insert/delete, owner-or-author delete, deep-link from notifications. Visually it's bare-bones: 26px avatars, `@username body` runs together inline on one line, no engagement signal beyond raw text.

The user shared two prototypes (TikTok/IG-style comment sheets adapted to FilmGoblin's aesthetic) and wants the sheet to feel sleeker without changing what comments fundamentally are. Multiple features in the prototypes (threaded replies, emoji-react strip, send-icon header) are explicitly out of scope for this round and tracked as deferred follow-ups.

## Goals

- Restyle `CommentSheet` / `CommentList` / `CommentComposer` to match prototype 1's row layout, header treatment, and composer styling.
- Add likes-on-comments as a new lightweight reaction primitive (`activity_comment_reactions`).
- Keep the existing data model and behavior of comments (flat, 140 chars, owner-or-author delete) untouched.

## Non-goals (deferred)

These are noted now so they aren't lost:

- Threaded replies — "Reply" affordance + "View N replies" expander.
- Emoji quick-react strip above composer (prototype 2 only).
- Send-icon header variant (prototype 2 only).
- `LikersBottomSheet` for comment hearts (tap count → see who liked).
- Notification kind `like_on_comment` (mirror of `comment_on_activity`).
- Comment editing, pagination, @-mentions, markdown.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| Scope tier | Polish + likes on comments | Highest visual payoff; replies/emoji-strip carry additional design surface (notifications, depth limits) better handled separately |
| Likes data model | New `activity_comment_reactions` table, composite PK `(user_id, comment_id)` | Mirrors `activity_reactions`. Avoids reshaping a live table to add a `target_kind` discriminator |
| Heart visibility | Always show heart + count column (including `0`) | Matches prototype literally; keeps row alignment stable when likes land |
| Row layout | Faithful to prototype 1 | Familiar pattern reads cleanly at 13–14px on mobile; zine voice already carried by sheet header |
| "Reply" affordance | Dropped from row (not stubbed) | Phantom UI for deferred features is worse than slightly different spacing |
| Owner-delete affordance | Inline muted "Delete" text-link under timestamp | Reuses existing pattern, zero new primitives |
| Header title styling | Serif "Comments" + accent dot + sans count | Cheap CSS tweak; serif `<h2>` already in `BottomSheet` |
| Header close button | Standard `×` (no change) | Consistency across all bottom sheets |
| Composer | Viewer avatar (32px) + rounded-pill input + inline `N/140` counter + smart Post button (text-link disabled, solid pink pill enabled) | Single biggest "looks sleek" payoff in the redesign |
| Like animation | Reuse `HeartButton` styling — sibling component, not generalized | Tightly coupled to `activityId` + `LikersBottomSheet`; copying SVG + CSS classes is cheaper than refactoring |
| Like count storage | Materialized `like_count INT` column on `activity_comments`, maintained by trigger | Same pattern as existing `_count` aggregations; fast reads |
| Who can like | Any signed-in user | Matches existing reaction model |

## Architecture

### 1. Database — migration `0147_activity_comment_reactions.sql`

```sql
ALTER TABLE activity_comments
  ADD COLUMN like_count INT NOT NULL DEFAULT 0;

CREATE TABLE activity_comment_reactions (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES activity_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);

ALTER TABLE activity_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY acr_select ON activity_comment_reactions FOR SELECT USING (true);
CREATE POLICY acr_insert ON activity_comment_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY acr_delete ON activity_comment_reactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE FUNCTION acr_bump_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE activity_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE activity_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER acr_bump_count_trg
  AFTER INSERT OR DELETE ON activity_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION acr_bump_count();

CREATE INDEX idx_acr_comment ON activity_comment_reactions (comment_id);
```

Notes:
- `like_count` defaults to `0` so no backfill is needed for the ~existing comments.
- Composite PK `(user_id, comment_id)` saves a SELECT-then-INSERT race on toggle (same trick as `activity_reactions`, `library`).
- `ON DELETE CASCADE` on `comment_id` means deleting a comment cleans up its reactions; the trigger fires on each cascaded delete and decrements toward zero, but the parent row is gone before the trigger commits — that's fine, the `UPDATE` on a deleted row is a no-op.
- pg-mem can't parse `CREATE OR REPLACE FUNCTION` with PL/pgSQL bodies; `db/tests/helpers/pg-mem.ts` already strips function bodies. Verify this migration round-trips through the smoke suite; if not, extend the strip filters there.
- Notifier test helper (`notifier/tests/helpers/db.ts`) does NOT need an inline patch — the notifier doesn't read `activity_comments` or `activity_comment_reactions`.

### 2. Server actions + queries

**`app/lib/actions/comment-reactions.ts`** (new):
- `_toggleCommentReaction(client, commentId)` — private form, takes Supabase client.
- `toggleCommentReaction(commentId)` — public form, creates server client, calls private, calls `revalidatePath` for `/home` and any path the comments thread might be open on (likely just `/home` for v1; the sheet is mounted in `ActivityFooter`).
- Implementation: SELECT existence by `(user_id, comment_id)`, then INSERT or DELETE accordingly. The composite PK collapses the race; we don't need an upsert.

**`app/lib/queries/activity-comments.ts`** (extend):
- `CommentItem` gains two fields:
  ```ts
  like_count: number;
  liked_by_me: boolean;
  ```
- Reading: select `like_count` from `activity_comments` directly. For `liked_by_me`, do a left join on `activity_comment_reactions` filtered to `viewer.id` and project to a boolean (or post-process via a `Set<comment_id>` of viewer's reactions, which avoids a fat join — pick whichever the existing query style favors; the `activity_reactions` reads use the latter).
- Anonymous viewers always get `liked_by_me: false`.

**`app/lib/supabase/types.ts`** — hand-edit per the existing convention:
- Add `activity_comments.like_count: number`
- Add new `activity_comment_reactions` table type with `user_id`, `comment_id`, `created_at`.

### 3. Components

#### New: `app/components/CommentHeartButton.tsx`

Sibling of `HeartButton` — does NOT call `HeartButton` directly because:
- `HeartButton` is bound to `activityId` + `toggleReaction(activityId)` + `LikersBottomSheet`.
- We're showing `0` (vs. `HeartButton` hides count when 0).
- We have no likers sheet for comments in this scope.

Internally:
- Same SVG glyph and `.heart-btn`/`.heart-count` CSS classes for animation parity.
- Optional tiny refactor: lift `<HeartIcon filled>` into `app/components/HeartIcon.tsx` and import from both. Worth doing — the SVG path is identical and drift would be ugly.
- Props: `commentId`, `initialCount`, `initialLikedByMe`, `disabled` (when `viewerId == null`).
- Optimistic toggle via `useTransition`, dispatches to `toggleCommentReaction`.
- Always renders count (including `0`); count is non-clickable in v1 (no likers sheet).
- Stacked icon-over-count layout (vertical), unlike `HeartButton`'s horizontal layout.

#### Restyled: `app/components/CommentList.tsx`

Full row rewrite:

- Container: `display: flex; gap: 12px; align-items: flex-start; padding: 12px 0`.
- Avatar column: 36px round.
- Body column: `flex: 1; min-width: 0`.
  - Top line: `<Link>` username (sans, weight 700, void color, no `@` prefix) · 4px gap · `<span>` relative time (sans 11px, muted).
  - Body: own line, sans 14px, void color, `word-break: break-word`, line-height ~1.35.
  - For `canDelete`: small "Delete" link below body — sans 11px, muted, `cursor: pointer`, `text-decoration: none` (rule it transparent — let it read as a soft action).
- Right column: `<CommentHeartButton>` — fixed 40px width container, vertically stacked: 16px icon over 11px muted count.
- Inter-row gap: 16px.

Drop `relativeTime` import — already imported. Drop the existing pill-button "Delete" outline.

#### Restyled: `app/components/CommentComposer.tsx`

- Outer: `display: flex; gap: 10px; align-items: center; border-top: 1px solid var(--muted); padding: 12px 0; background: var(--bone)`.
- Viewer avatar: 32px round, leftmost.
- Pill wrapper: `flex: 1; display: flex; align-items: center; gap: 8px; border: 1px solid var(--muted); border-radius: 999px; padding: 8px 14px; background: transparent`.
  - `<input>`: `flex: 1; border: 0; background: transparent; outline: none; color: var(--void); font-size: 14px`.
  - Counter `<span>`: sans 11px, muted (or accent if `overLimit`).
- Post button:
  - When `!canPost`: render as a text link — sans 13px, accent color, `cursor: not-allowed; opacity: 0.55`. (Stays as a `<button disabled>` for a11y.)
  - When `canPost`: render as `.btn .btn-sm` (the existing solid pink pill).
- Pull viewer avatar URL from a new prop `viewerAvatarUrl: string | null`.
- Keep existing 140-char limit, optimistic submit, error-clear-on-resubmit semantics.
- Keep `paddingBottom: env(keyboard-inset-height, 0px)` for iOS keyboard.

#### Restyled: `app/components/CommentSheet.tsx`

- Pass new prop `viewerAvatarUrl` through to `CommentComposer`. Source: server-side `getCurrentUserAvatar()` in the parent (`ActivityFooter` likely) and threaded down.
- Title becomes a ReactNode:
  ```tsx
  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
    <span className="head" style={{ fontSize: 22 }}>Comments</span>
    <span className="dot-accent">•</span>
    <span style={{ fontSize: 18, color: "var(--muted)" }}>{items.length}</span>
  </span>
  ```
  Note: do NOT pre-format as `Comments · 24` string anymore.

#### Touch: `app/components/BottomSheet.tsx`

- Type widening only: `title: string | React.ReactNode`. `<h2>` continues to render `{title}` directly — strings and nodes both work; no logic change.

#### Touch: `app/components/activity/ActivityFooter.tsx`

- Pass `viewerAvatarUrl` into `CommentSheet`. Source it from the existing viewer-profile fetch (the component already has `viewerId`); query for viewer's `avatar_url` from `profiles` once and pass through. If the existing fetch shape doesn't include `avatar_url`, extend it.

### 4. CSS additions in `app/app/globals.css`

Minimal — most styling is inline since these are tightly localized:

```css
.dot-accent {
  color: var(--accent);
  font-weight: 700;
  line-height: 1;
}
```

The `.heart-btn` and `.heart-count` classes already exist from `HeartButton`. The new `CommentHeartButton` reuses them; if the stacked layout needs a wrapper, add `.comment-heart-stack { display: flex; flex-direction: column; align-items: center; gap: 2px; }`.

No `@media (max-width: 720px)` rules expected — the sheet is mobile-first; desktop renders fine at the 600px max-width set on `.bottom-sheet-panel`.

### 5. Tests

- **`db/tests/rls/activity-comment-reactions.test.ts`** (new) — copy `library.test.ts` shape:
  - `seedFixtures` once in `beforeAll` (userA/B + activityId + commentId via service_role).
  - `beforeEach` clears `activity_comment_reactions`.
  - Asserts: userA can insert own row; userA cannot insert as userB (RLS denial); userA can delete own row; userA cannot delete userB's row; deleting the parent comment cascades reactions; `like_count` increments to 2 after two distinct inserts and decrements to 0 after both deletes.

- **`app/tests/actions/comment-reactions.test.ts`** (new) — env-skipIf integration:
  - `describe.skipIf(!hasEnv)(...)` PLUS `if (!hasEnv) return;` in `beforeAll`/`beforeEach`/`afterAll` (per the gotcha in CLAUDE.md).
  - Toggle once → row exists, `like_count = 1`. Toggle again → row gone, `like_count = 0`.

- **Existing tests** — `app/tests/queries/group-activity.test.ts` and any other test that asserts the `CommentItem` shape needs the new fields added to fixtures. Likely just two fixture lines.

- **No notifier test changes** — comment likes don't generate notifications in this scope.

### 6. Type regen and conventions

- After applying mig 0147 locally, run `npm run gen:types` from `app/` if Supabase CLI is available; otherwise hand-edit `lib/supabase/types.ts` per the existing convention.
- Add the new column + table to the second machine's hand-edited types delta described in CLAUDE.md's open threads.

## Data flow

1. Server-side render of feed row → `getActivityCommentsForActivity(activityId, viewerId)` returns `CommentItem[]` with `like_count` and `liked_by_me` populated.
2. `CommentSheet` initialized with `initialItems`. State held client-side.
3. User taps heart on a row → `CommentHeartButton` flips local state optimistically → fires `toggleCommentReaction(commentId)` in `useTransition` → revalidates `/home` (or current path) on success → on failure, revert local state.
4. New comment posted → optimistic insert keeps `like_count: 0, liked_by_me: false` until the real insert returns the row from the server.
5. Comment deletion → existing flow unchanged; `ON DELETE CASCADE` on `comment_id` cleans up reactions.

## Error handling

- All comment-like toggles fail silently with console error + local revert (matches `HeartButton`).
- Composer errors continue to render via existing `error: string | null` flow.
- RLS denials on insert/delete surface as the existing 401/403 error path; user sees revert.

## Risk register

- **`HeartIcon` SVG drift** — if we don't extract a shared component, divergent edits to one of the two hearts will look broken side by side. Mitigation: extract `app/components/HeartIcon.tsx` as part of this work.
- **`like_count` row-level write contention** — every like toggle takes a row lock on the parent comment. Realistically fine for low-engagement v1; if a comment goes viral, bursty traffic could serialize. Mitigation: defer to a future "hot comment" pattern; don't preempt.
- **`canPost` style swap visual jank** — toggling between a text-link and a solid pill on the same coordinate may feel jumpy. Mitigation: ensure both forms occupy the same min-width; eyeball during dev-server check.
- **Type drift on second machine** — `lib/supabase/types.ts` already accumulates hand edits; this adds two more (`activity_comments.like_count`, `activity_comment_reactions` table). Document in the session-close so the other machine's regen preserves them.

## Files affected

**New:**
- `db/migrations/0147_activity_comment_reactions.sql`
- `app/lib/actions/comment-reactions.ts`
- `app/components/CommentHeartButton.tsx`
- `app/components/HeartIcon.tsx` (extracted shared SVG)
- `db/tests/rls/activity-comment-reactions.test.ts`
- `app/tests/actions/comment-reactions.test.ts`

**Modified:**
- `app/components/CommentSheet.tsx` (title ReactNode + avatar threading)
- `app/components/CommentList.tsx` (full row rewrite)
- `app/components/CommentComposer.tsx` (avatar + pill + inline counter + smart Post)
- `app/components/BottomSheet.tsx` (one-line type widening)
- `app/components/HeartButton.tsx` (import shared `HeartIcon`)
- `app/components/activity/ActivityFooter.tsx` (pass `viewerAvatarUrl` through)
- `app/lib/queries/activity-comments.ts` (extend `CommentItem`)
- `app/lib/supabase/types.ts` (hand-edit for new column + table)
- `app/app/globals.css` (`.dot-accent`, optional `.comment-heart-stack`)
- `app/tests/queries/group-activity.test.ts` (fixture extension if `CommentItem` is asserted)

## Open questions

None. All scope decisions are locked. Implementation plan to follow.
