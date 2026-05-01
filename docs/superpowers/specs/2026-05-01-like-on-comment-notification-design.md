# `like_on_comment` notification

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #27

## Background

Sub-project #25 shipped likes on comments (mig 0147, `activity_comment_reactions` + `like_count`). The deferred follow-up was generating a bell-row notification for the comment's author when someone else likes their comment. This spec adds that.

The pattern follows mig 0131's `comment_on_activity` trigger — a SECURITY DEFINER plpgsql function on AFTER INSERT of the reaction table, inserting a notification row for the recipient. Two new wrinkles:

1. **Per-recipient in-app opt-out** — like the rate-reminder pattern (mig 0146), gated by a new `profiles.notify_comment_likes` boolean. Disabled recipients get no row at all (not a row marked hidden — no row, period).
2. **Smarter grouping** — existing notification grouping is per-`(kind, actor_user_id)` with `MIN_GROUP_SIZE = 3`. Comment-likes need per-`(kind, comment_id)` grouping with threshold 2: 1 liker reads "<liker> liked your comment", 2+ likers read "N people liked your comment".

## Goal

Generate an in-app notification when user A likes user B's comment (where A ≠ B). Recipient B can opt out via /settings. Multiple likers on the same comment group as "N people liked your comment".

## Non-goals (deferred)

- **Email** for `like_on_comment`. Only `price_drop` actually emails today (per CLAUDE.md); `comment_on_activity` is in the deferred email queue. This kind goes in the same queue.
- Smarter time-window logic (e.g. longer span for comment likes than other kinds). Existing 30-min gap / 24-hr span / 2-min `MIN_GROUP_SIZE` for this kind only is enough.
- Un-like undoing the notification. Removing a reaction does not remove the bell row — same precedent as un-commenting.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| Recipient | Comment author | Self-likes filtered (`c.user_id <> NEW.user_id`) |
| Payload | Mirror `comment_on_activity` exactly: `activity_id`, `comment_id`, `body`, `film_id` | Bell-row mental model stays consistent; snippet helps when the user has multiple comments on the same activity |
| Deep link | `/home?activity=<activity_id>` (sheet auto-opens, same as `comment_on_activity`) | Lands the user in the comment thread context |
| Email | Skip wiring | Matches current state — only `price_drop` sends email |
| In-app opt-out | New `profiles.notify_comment_likes BOOLEAN NOT NULL DEFAULT TRUE` | User explicitly asked; mirrors `notify_rate_reminders` |
| Opt-out semantics | Trigger skips INSERT entirely (no row generated) | Matches rate-reminder cron precedent |
| Grouping key | `(kind, payload.comment_id)` for `like_on_comment`; everything else unchanged | Per-target grouping is what "N people liked X" requires |
| `MIN_GROUP_SIZE` | 2 for `like_on_comment`; 3 for everything else | User wants "<liker>" at 1 → "N people" at 2+ |
| Group-row avatar | Render `head.actor.avatar_url` (most recent liker) | Avatar is just a face; copy says "N people" |
| Un-like behavior | No-op on notifications | Matches un-commenting precedent |

## Architecture

### Database

Two migrations, split per the existing enum-add pattern (the trigger function in 0149 references the enum value, so the ADD VALUE must commit first):

**`db/migrations/0148_like_on_comment_kind.sql`** — additive, no functions:

```sql
ALTER TYPE notification_kind ADD VALUE 'like_on_comment';

ALTER TABLE profiles
  ADD COLUMN notify_comment_likes BOOLEAN NOT NULL DEFAULT TRUE;
```

`notify_comment_likes` defaults TRUE so existing users get the new notifications without action. They can opt out from /settings.

**`db/migrations/0149_like_on_comment_trigger.sql`** — the trigger:

```sql
CREATE OR REPLACE FUNCTION public.notify_like_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    c.user_id,
    'like_on_comment',
    NEW.user_id,
    jsonb_build_object(
      'activity_id', c.activity_id,
      'comment_id',  c.id,
      'body',        c.body,
      'film_id',     a.payload->>'film_id'
    )
  FROM activity_comments c
  JOIN activity a ON a.id = c.activity_id
  JOIN profiles p ON p.id = c.user_id
  WHERE c.id = NEW.comment_id
    AND c.user_id <> NEW.user_id
    AND p.notify_comment_likes = TRUE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_comment_reaction_insert_notify
AFTER INSERT ON activity_comment_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_like_on_comment();
```

The function runs as DEFINER (bypasses the recipient's RLS) — necessary because the liker has no INSERT privilege on someone else's `notifications` row.

### App: types

`app/lib/supabase/types.ts` (hand-edit):
- Add `'like_on_comment'` to the `notification_kind` enum union.
- Add `notify_comment_likes: boolean` to `profiles` Row, `notify_comment_likes?: boolean` to Insert + Update.

`app/lib/queries/notifications.ts`:
- Extend the discriminated union for `EnrichedNotification` (or whatever the type is called) with `kind: "like_on_comment"`. Payload shape is identical to `comment_on_activity` (activity_id, comment_id, body, film_id), so likely just add the kind to the existing case or a copy of it.

### App: rendering — single row

`app/components/notifications/NotificationRow.tsx`:

`copyFor` switch — new case (mirrors `comment_on_activity`):

```tsx
case "like_on_comment": {
  const raw = (n.payload as { body?: string }).body ?? "";
  const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
  const subject = n.film?.title ?? "your activity";
  return <><strong>{actorName}</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
}
```

`targetFor` switch — new case returning `/home?activity=<activity_id>`:

```tsx
case "like_on_comment": {
  const activityId = (n.payload as { activity_id?: string }).activity_id;
  return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
}
```

### App: rendering — group row

`app/components/notifications/NotificationGroupRow.tsx`:

`headerCopy` switch — new case:

```tsx
case "like_on_comment": {
  const raw = (group.items[0].payload as { body?: string }).body ?? "";
  const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
  const subject = group.items[0].film?.title ?? "your activity";
  return <><strong>{group.count} people</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
}
```

`headerHref` switch — new case (same `/home?activity=<id>` pattern as `comment_on_activity`):

```tsx
case "like_on_comment": {
  const activityId = (group.items[0].payload as { activity_id?: string }).activity_id;
  return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
}
```

The group-row Avatar uses `group.actor?.avatar_url` already — `head.actor` from `groupNotifications` is the most recent liker. No change needed.

### App: grouping logic

`app/lib/queries/group-notifications.ts` — kind-aware key + threshold:

```ts
const MIN_GROUP_SIZE = 3;
const MIN_GROUP_SIZE_LIKE = 2;

// Key extractor: per-comment for like_on_comment, per-actor otherwise
function groupKey(n: EnrichedNotification): string {
  if (n.kind === "like_on_comment") {
    const payload = n.payload as { comment_id?: string };
    return `like_on_comment:${payload.comment_id ?? "?"}`;
  }
  return `${n.kind}:${n.actor?.id ?? "system"}`;
}

function minSize(kind: NotificationKind): number {
  return kind === "like_on_comment" ? MIN_GROUP_SIZE_LIKE : MIN_GROUP_SIZE;
}
```

Inside the existing walk:
- Replace the inner `cand.kind !== head.kind || candActorId !== headActorId` break condition with a `groupKey(cand) !== groupKey(head)` break.
- Replace the `run.length >= MIN_GROUP_SIZE` threshold with `run.length >= minSize(head.kind)`.
- The 30-min event-to-event gap and 24-hr span ceilings stay unchanged. (24 hours is fine for v1; a viral comment getting steady likes over weeks just produces multiple rows, which is acceptable.)

The existing `NotificationGroup.key` field reads `${headActorId ?? "system"}:${head.kind}:${oldestId}`. For `like_on_comment` it becomes `${comment_id}:${head.kind}:${oldestId}` (use the same `groupKey` output prefix). Single, well-defined change.

### App: settings

`app/app/settings/SettingsForm.tsx`:
- New checkbox: `Notify me when someone likes my comment`.
- Place inline with the existing in-app toggles. (If there's no existing in-app section, place next to `notify_rate_reminders` if that has a UI control; if not, sit next to the email toggles section under a new "In-app notifications" sub-heading.)
- Wires through `_updateProfile`'s spread-field pattern — no new action needed.

`app/lib/actions/profile.ts`:
- Add `notify_comment_likes?: boolean` to the `ProfileFields` type.

`app/lib/queries/profiles.ts` (or wherever `getProfileForCurrentUser` is defined):
- Include `notify_comment_likes` in the SELECT list so SettingsForm can pre-fill the checkbox.

### Tests

**New: `db/tests/rls/like-on-comment-notification.test.ts`** (testcontainers Postgres):

Cases:
- userA comments on userB's activity. userC likes userA's comment. Assert one notification exists for userA with `kind = 'like_on_comment'`, `actor_user_id = userC`, payload contains `activity_id`, `comment_id`, `body`, `film_id`.
- userA likes their OWN comment. Assert ZERO notifications inserted.
- userA's `notify_comment_likes = FALSE`. userC likes userA's comment. Assert ZERO notifications inserted.
- After userC likes the comment and a notification exists, userC un-likes. Assert the notification still exists (un-like does NOT remove it).
- userA cannot SELECT the notification meant for userB even via RLS leak attempts.

**New: `app/tests/queries/group-notifications-like-on-comment.test.ts`** (or extend existing `group-notifications.test.ts` if there is one):

Cases:
- 1 like_on_comment item → emits as `single`.
- 2 like_on_comment items on the SAME comment within 30-min gap → emits as `group` of size 2 (note: existing kinds need 3+, this kind needs 2+).
- 2 like_on_comment items on DIFFERENT comments → emits as 2 singles (different group keys).
- 3 like_on_comment items on the same comment from 3 different actors → emits as a group of 3 with distinct actor identities preserved in `items` (the group's `actor` is the most recent).
- Existing-kind grouping behavior unchanged: 2 `comment_on_activity` items still emit as 2 singles (threshold still 3).

### Files affected

**New:**
- `db/migrations/0148_like_on_comment_kind.sql`
- `db/migrations/0149_like_on_comment_trigger.sql`
- `db/tests/rls/like-on-comment-notification.test.ts`
- `app/tests/queries/group-notifications-like-on-comment.test.ts` (or extension to existing)

**Modified:**
- `app/lib/supabase/types.ts` (enum union + `notify_comment_likes` column on profiles)
- `app/lib/queries/notifications.ts` (kind union; extend payload shape)
- `app/lib/queries/group-notifications.ts` (kind-aware key + threshold)
- `app/lib/queries/profiles.ts` (SELECT `notify_comment_likes` for settings)
- `app/lib/actions/profile.ts` (`ProfileFields.notify_comment_likes`)
- `app/components/notifications/NotificationRow.tsx` (two switch cases)
- `app/components/notifications/NotificationGroupRow.tsx` (two switch cases)
- `app/app/settings/SettingsForm.tsx` (new checkbox)
- `CLAUDE.md` (sub-project #27 row + close the deferred follow-up)

### Risks

- **Volume.** A viral comment can generate many likes. Per-comment grouping mitigates the bell flood — a comment liked by 50 people is one row, not 50. The 24-hr span ceiling still slices long-tail likes into separate rows; acceptable.
- **`MIN_GROUP_SIZE = 2` for likes only.** Two-item "groups" are a new shape — feed UI must render correctly with a count of 2. NotificationGroupRow already handles arbitrary `count` (the headerCopy interpolates `{group.count}`); no special-casing needed.
- **Notifier helper test patches.** Per CLAUDE.md, `notifier/tests/helpers/db.ts` inline-applies select profile-touching migrations because pg-mem can't parse `CREATE OR REPLACE FUNCTION`. This migration adds a column to `profiles` (`notify_comment_likes`). The helper either needs an inline patch for 0148 OR — better — the recommended one-time refactor to apply ALL `db/migrations/*.sql` through the same strip pass that `db/tests/helpers/pg-mem.ts` uses. Punting the refactor; will add the inline patch as part of this work and note the broader cleanup as a still-open thread.
- **Trigger fires under authenticated.** `acr_bump_count_trg` from sub-project #25 already runs as DEFINER (mig 0147 fix). New trigger uses the same pattern. Verified via the regression-test pattern from #25.

## Open questions

None. All scope decisions locked.
