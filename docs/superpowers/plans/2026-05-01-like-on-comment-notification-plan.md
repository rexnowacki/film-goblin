# `like_on_comment` Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When user A likes user B's comment (A ≠ B), insert a `like_on_comment` bell-row notification for B, gated by B's per-kind in-app opt-out. Single-liker reads "<liker> liked your comment on <film>"; 2+ likers on the same comment group as "N people liked your comment on <film>".

**Architecture:** Two migrations (`0148` enum + opt-out column, `0149` SECURITY DEFINER trigger on `activity_comment_reactions` AFTER INSERT). New per-kind grouping rule in `group-notifications.ts` keys on `payload.comment_id` with threshold 2 — every other kind keeps per-actor grouping with threshold 3. New /settings checkbox wires through the existing `_updateProfile` field-spread pattern.

**Tech Stack:** Supabase Postgres + RLS, Next.js 15 App Router, TypeScript, Vitest, testcontainers (RLS), pg-mem (smoke).

**Spec:** `docs/superpowers/specs/2026-05-01-like-on-comment-notification-design.md`

**Branch (already created):** `feature/like-on-comment-notification`

---

## File Structure

**Created:**
- `db/migrations/0148_like_on_comment_kind.sql` — `ALTER TYPE notification_kind ADD VALUE 'like_on_comment'` + `ALTER TABLE profiles ADD COLUMN notify_comment_likes`.
- `db/migrations/0149_like_on_comment_trigger.sql` — `notify_like_on_comment()` SECURITY DEFINER plpgsql + `on_comment_reaction_insert_notify` trigger.
- `db/tests/rls/like-on-comment-notification.test.ts` — testcontainers Postgres suite for the trigger + opt-out + RLS.
- `app/tests/queries/group-notifications.test.ts` (or extension if it already exists — Step 1 below confirms).

**Modified:**
- `app/lib/supabase/types.ts` (enum union + new profiles column)
- `app/lib/queries/group-notifications.ts` (kind-aware grouping key + threshold)
- `app/lib/actions/profile.ts` (`ProfileFields.notify_comment_likes`)
- `app/components/notifications/NotificationRow.tsx` (`copyFor` + `targetFor` switch cases)
- `app/components/notifications/NotificationGroupRow.tsx` (`headerCopy` + `headerHref` switch cases)
- `app/app/settings/SettingsForm.tsx` (new in-app toggle checkbox + form-data wiring)
- `CLAUDE.md` (sub-project #27 row + close the deferred follow-up)

**Untouched:**
- `app/lib/queries/notifications.ts` — `EnrichedNotification.payload` is `Record<string, unknown>`; new kinds need no payload-type extension. The `NotificationKind` type is auto-derived from `Database["public"]["Enums"]["notification_kind"]` so it picks up the enum value once types.ts is edited.
- `app/lib/queries/profiles.ts` — `getMyProfile` does `select("*")`; the new column flows through automatically once it exists in the DB + types.
- `notifier/tests/helpers/db.ts` — already applies all `db/migrations/*.sql` through a generic strip pass (per the helper at lines 79–101 of that file). No inline patch needed for 0148/0149.
- `RecommendModal.tsx`, etc. — irrelevant.

---

### Task 1: Migration `0148` — enum value + opt-out column

**Files:**
- Create: `db/migrations/0148_like_on_comment_kind.sql`

- [ ] **Step 1: Verify migration number is free**

Run: `ls /Users/christophernowacki/film-goblin/db/migrations/ | tail -5`
Expected: shows `0147_activity_comment_reactions.sql` as the last file. `0148` is free.

- [ ] **Step 2: Write the migration**

Create `/Users/christophernowacki/film-goblin/db/migrations/0148_like_on_comment_kind.sql` with this exact content:

```sql
-- 0148: like_on_comment notification kind + per-recipient in-app opt-out.
--
-- Mirrors the rate_reminder mig (0146): enum ADD VALUE + new profiles column
-- in one migration. The trigger function in 0149 references the new enum
-- value, so 0148 must commit first (PostgreSQL won't let a function in the
-- same transaction reference an enum value introduced in that transaction).
--
-- notify_comment_likes defaults TRUE so existing users get notifications by
-- default. Recipient can opt out from /settings; the trigger filters on this
-- column and skips the INSERT entirely (no row, not a hidden row).

ALTER TYPE notification_kind ADD VALUE 'like_on_comment';

ALTER TABLE profiles
  ADD COLUMN notify_comment_likes BOOLEAN NOT NULL DEFAULT TRUE;
```

- [ ] **Step 3: Run pg-mem smoke**

Run from `/Users/christophernowacki/film-goblin/db/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: PASS. Both `ALTER TYPE` and `ALTER TABLE ADD COLUMN` are simple DDL that pg-mem handles natively; the existing strip filters from sub-project #25 don't need extension.

- [ ] **Step 4: Commit**

```
git add db/migrations/0148_like_on_comment_kind.sql
git commit -m "feat(db): mig 0148 — like_on_comment enum + notify_comment_likes opt-out"
```

Use `git commit -F /tmp/msg.txt` if heredoc commits mangle the message (per CLAUDE.md gotcha).

---

### Task 2: Migration `0149` — trigger function + trigger

**Files:**
- Create: `db/migrations/0149_like_on_comment_trigger.sql`

- [ ] **Step 1: Write the migration**

Create `/Users/christophernowacki/film-goblin/db/migrations/0149_like_on_comment_trigger.sql` with this exact content:

```sql
-- 0149: trigger on activity_comment_reactions AFTER INSERT — fans into a
-- notification for the comment's author. Self-likes are filtered by the
-- WHERE clause. Recipient's notify_comment_likes = FALSE also skips the
-- INSERT entirely.
--
-- Payload mirrors comment_on_activity (mig 0131) so the bell row reads
-- "<liker> liked your comment on <film>: 'snippet'" symmetric to
-- "<commenter> commented on <film>: 'snippet'".
--
-- Depends on 0148 (enum value committed in its own transaction).

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

- [ ] **Step 2: Run pg-mem smoke**

Run from `db/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: PASS. The strip filters added in sub-project #25 (`db/tests/helpers/pg-mem.ts`) already handle plpgsql function bodies and `CREATE TRIGGER`. No helper changes needed.

- [ ] **Step 3: Commit**

```
git add db/migrations/0149_like_on_comment_trigger.sql
git commit -m "feat(db): mig 0149 — notify_like_on_comment trigger"
```

---

### Task 3: RLS + trigger tests

**Files:**
- Create: `db/tests/rls/like-on-comment-notification.test.ts`

- [ ] **Step 1: Write the test file**

Create `/Users/christophernowacki/film-goblin/db/tests/rls/like-on-comment-notification.test.ts` with this exact content:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let activityId: string;
let commentId: string;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);

  // userA owns the activity. userA also authors a comment on it (so the
  // recipient of the notification will be userA when someone else likes that
  // comment). userB will be the liker.
  await beginAs(db.client, null, "service_role");
  const a = await db.client.query<{ id: string }>(
    `INSERT INTO activity (kind, actor_user_id, payload)
     VALUES ('watchlist_added', $1, jsonb_build_object('film_id', $2::uuid))
     RETURNING id`,
    [fx.userA.id, fx.filmId],
  );
  activityId = a.rows[0].id;
  const c = await db.client.query<{ id: string }>(
    `INSERT INTO activity_comments (activity_id, user_id, body)
     VALUES ($1, $2, 'first')
     RETURNING id`,
    [activityId, fx.userA.id],
  );
  commentId = c.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM notifications`);
  await db.client.query(`DELETE FROM activity_comment_reactions`);
  await db.client.query(`UPDATE activity_comments SET like_count = 0 WHERE id = $1`, [commentId]);
  await db.client.query(`UPDATE profiles SET notify_comment_likes = TRUE`);
  await commit(db.client);
});

describe("trigger: notify_like_on_comment", () => {
  it("inserts one notification for the comment author when a different user likes", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{
      kind: string; user_id: string; actor_user_id: string;
      payload: { activity_id: string; comment_id: string; body: string; film_id: string };
    }>(
      `SELECT kind, user_id, actor_user_id, payload FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].user_id).toBe(fx.userA.id);
    expect(r.rows[0].actor_user_id).toBe(fx.userB.id);
    expect(r.rows[0].payload.activity_id).toBe(activityId);
    expect(r.rows[0].payload.comment_id).toBe(commentId);
    expect(r.rows[0].payload.body).toBe("first");
    expect(r.rows[0].payload.film_id).toBe(fx.filmId);
    await commit(db.client);
  });

  it("self-like does NOT generate a notification", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });

  it("recipient with notify_comment_likes = FALSE gets no notification", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `UPDATE profiles SET notify_comment_likes = FALSE WHERE id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });

  it("un-like (DELETE on activity_comment_reactions) does NOT remove the notification", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    let r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(1);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE user_id = $1 AND comment_id = $2`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    r = await db.client.query(
      `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
    );
    expect(r.rowCount).toBe(1);
    await commit(db.client);
  });

  it("liker cannot SELECT recipient's notification (RLS owner-only)", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    await commit(db.client);

    // Liker (userB) reads notifications: should see NONE because RLS scopes to user_id = auth.uid().
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }

    // Recipient (userA) reads: should see the row.
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM notifications WHERE kind = 'like_on_comment'`,
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test file standalone**

Run from `db/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH TESTCONTAINERS_RYUK_DISABLED=true DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" npm run test:rls -- tests/rls/like-on-comment-notification.test.ts
```
Expected: 5 specs PASS.

- [ ] **Step 3: Run the full RLS suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH TESTCONTAINERS_RYUK_DISABLED=true DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" npm run test:rls
```
Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```
git add db/tests/rls/like-on-comment-notification.test.ts
git commit -m "test(rls): like_on_comment trigger + opt-out + RLS"
```

---

### Task 4: Hand-edit `app/lib/supabase/types.ts`

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Add `'like_on_comment'` to the `notification_kind` enum union**

In `app/lib/supabase/types.ts`, find the `notification_kind` enum declaration. It's a string union like:

```typescript
notification_kind:
  | "coven_invite_pending"
  | "coven_invite_accepted"
  | "recommendation_received"
  | "price_drop"
  | "comment_on_activity"
  | "rate_reminder"
```

Add `"like_on_comment"` to the union. Order doesn't matter functionally, but place it after `"comment_on_activity"` to mirror its conceptual proximity:

```typescript
notification_kind:
  | "coven_invite_pending"
  | "coven_invite_accepted"
  | "recommendation_received"
  | "price_drop"
  | "comment_on_activity"
  | "like_on_comment"
  | "rate_reminder"
```

- [ ] **Step 2: Add `notify_comment_likes` to the `profiles` table type**

Find the `profiles` table block. Add `notify_comment_likes: boolean` to the Row, `notify_comment_likes?: boolean` to Insert, and `notify_comment_likes?: boolean` to Update. Place alphabetically near `notify_rate_reminders` for tidiness.

- [ ] **Step 3: Typecheck**

Run from `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: TypeScript will surface every place that exhaustively switches on `notification_kind` — those need the new case. Likely matches: `NotificationRow.tsx`, `NotificationGroupRow.tsx`. The errors look like:

```
NotificationRow.tsx: error TS7029 (or similar): not all code paths return a value
```

Or a "Type '"like_on_comment"' is not assignable" error in the switch return. These are EXPECTED — they'll be fixed by Task 9. As long as the only errors are about missing notification_kind cases in those two files, this task's edit is correct.

If typecheck fails OTHER than missing notification cases, investigate.

- [ ] **Step 4: Commit**

```
git add app/lib/supabase/types.ts
git commit -m "types(supabase): hand-edit for like_on_comment + notify_comment_likes"
```

---

### Task 5: Extend `ProfileFields` in `app/lib/actions/profile.ts`

**Files:**
- Modify: `app/lib/actions/profile.ts`

- [ ] **Step 1: Add the new field to `ProfileFields`**

Open `/Users/christophernowacki/film-goblin/app/lib/actions/profile.ts`. Find the `ProfileFields` interface (around line 11). Add `notify_comment_likes?: boolean` next to `notify_rate_reminders?: boolean`:

```typescript
export interface ProfileFields {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  broadcast_library?: boolean;
  broadcast_watched?: boolean;
  email_price_drops?: boolean;
  email_coven_recs?: boolean;
  email_comments?: boolean;
  email_coven_invites?: boolean;
  notify_rate_reminders?: boolean;
  notify_comment_likes?: boolean;
}
```

The `_updateProfile` function already does `const patch: ProfileUpdate = { ...fields };` (line 42), so the new field is auto-applied to the UPDATE — no other changes needed in this file.

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: same expected errors as Task 4 — only the two notification render files are missing cases. Nothing new should regress.

- [ ] **Step 3: Commit**

```
git add app/lib/actions/profile.ts
git commit -m "feat(actions): add notify_comment_likes to ProfileFields"
```

---

### Task 6: Add the in-app toggle to `SettingsForm.tsx`

**Files:**
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Wire the field through the submit handler**

Find the `updateProfile({...})` call (around line 116). Currently includes `notify_rate_reminders: fd.get("notify_rate_reminders") === "on"`. Add a sibling line for `notify_comment_likes`:

```typescript
      await updateProfile({
        username: String(fd.get("username")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        broadcast_library: fd.get("broadcast_library") === "on",
        broadcast_watched: fd.get("broadcast_watched") === "on",
        email_price_drops: fd.get("email_price_drops") === "on",
        email_coven_recs: fd.get("email_coven_recs") === "on",
        email_comments: fd.get("email_comments") === "on",
        email_coven_invites: fd.get("email_coven_invites") === "on",
        notify_rate_reminders: fd.get("notify_rate_reminders") === "on",
        notify_comment_likes: fd.get("notify_comment_likes") === "on",
      });
```

- [ ] **Step 2: Add the checkbox in the form**

Find the `notify_rate_reminders` checkbox (around line 211). Add a new checkbox right after it (before the email "Email me when…" sub-section that starts around line 216):

```tsx
      <label className="check-zine">
        <input type="checkbox" name="notify_comment_likes" defaultChecked={profile.notify_comment_likes ?? true} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Notify me when someone likes my comment</span>
      </label>
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: same expected errors as Task 4/5. `profile.notify_comment_likes` must resolve — `getMyProfile` does `select("*")` so the field is on the returned row, and Task 4 added it to the Database type.

- [ ] **Step 4: Commit**

```
git add app/app/settings/SettingsForm.tsx
git commit -m "feat(settings): in-app toggle for notify_comment_likes"
```

---

### Task 7: Kind-aware grouping in `group-notifications.ts`

**Files:**
- Modify: `app/lib/queries/group-notifications.ts`

- [ ] **Step 1: Replace the file**

Overwrite `/Users/christophernowacki/film-goblin/app/lib/queries/group-notifications.ts` with this exact content:

```typescript
import type { EnrichedNotification, NotificationFeedItem, NotificationGroup, NotificationKind } from "./notifications";

const GAP_MS = 30 * 60 * 1000;
const SPAN_MS = 24 * 60 * 60 * 1000;
const MIN_GROUP_SIZE_DEFAULT = 3;
const MIN_GROUP_SIZE_LIKE = 2;

// Kind-aware grouping key. Most kinds group per-actor; like_on_comment groups
// per-comment so multiple likers on the same comment fold into one row.
function groupKey(n: EnrichedNotification): string {
  if (n.kind === "like_on_comment") {
    const commentId = (n.payload as { comment_id?: string }).comment_id ?? "?";
    return `like_on_comment:${commentId}`;
  }
  return `${n.kind}:${n.actor?.id ?? "system"}`;
}

function minSize(kind: NotificationKind): number {
  return kind === "like_on_comment" ? MIN_GROUP_SIZE_LIKE : MIN_GROUP_SIZE_DEFAULT;
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
```

Key changes from the previous version:
- Added `groupKey()` and `minSize()` helpers.
- Replaced inline `cand.kind !== head.kind || candActorId !== headActorId` with `groupKey(cand) !== headKey`.
- Replaced inline `MIN_GROUP_SIZE` constant with `minSize(head.kind)`.
- `NotificationGroup.key` now reads `${headKey}:${oldestId}` (encoded form depends on kind, but always unique).
- Imports `NotificationKind` from `./notifications`.

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: same expected errors as Tasks 4–6 (only the two render files missing cases).

- [ ] **Step 3: Commit**

```
git add app/lib/queries/group-notifications.ts
git commit -m "feat(notifications): per-comment grouping for like_on_comment, threshold 2"
```

---

### Task 8: Tests for kind-aware grouping

**Files:**
- Create or modify: `app/tests/queries/group-notifications.test.ts`

- [ ] **Step 1: Check whether the file exists**

Run: `ls /Users/christophernowacki/film-goblin/app/tests/queries/group-notifications.test.ts 2>&1`
- If exists: extend it (add new specs to the existing describe).
- If missing: create it with the full content below.

- [ ] **Step 2: Write the test (CREATE — full file content)**

If creating from scratch, create `/Users/christophernowacki/film-goblin/app/tests/queries/group-notifications.test.ts` with this exact content:

```typescript
import { describe, it, expect } from "vitest";
import { groupNotifications } from "@/lib/queries/group-notifications";
import type { EnrichedNotification } from "@/lib/queries/notifications";

function mkNotif(opts: {
  id: string;
  kind: EnrichedNotification["kind"];
  actorId: string | null;
  createdAtMin: number;        // minutes ago (newest = smallest)
  payload?: Record<string, unknown>;
}): EnrichedNotification {
  const created = new Date(Date.now() - opts.createdAtMin * 60_000).toISOString();
  return {
    id: opts.id,
    kind: opts.kind,
    created_at: created,
    read_at: null,
    actor: opts.actorId
      ? { id: opts.actorId, username: opts.actorId, display_name: null, avatar_url: null }
      : null,
    payload: opts.payload ?? {},
    film: null,
  };
}

describe("groupNotifications: like_on_comment per-comment grouping", () => {
  it("1 like_on_comment item → emits as single", () => {
    const items = [mkNotif({ id: "n1", kind: "like_on_comment", actorId: "u1", createdAtMin: 0, payload: { comment_id: "c1" } })];
    const out = groupNotifications(items);
    expect(out).toEqual([{ type: "single", notification: items[0] }]);
  });

  it("2 like_on_comment items on the SAME comment → emits as a group of size 2", () => {
    const items = [
      mkNotif({ id: "n2", kind: "like_on_comment", actorId: "u2", createdAtMin: 0, payload: { comment_id: "c1" } }),
      mkNotif({ id: "n1", kind: "like_on_comment", actorId: "u1", createdAtMin: 5, payload: { comment_id: "c1" } }),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type !== "group") throw new Error("expected group");
    expect(out[0].group.count).toBe(2);
    expect(out[0].group.kind).toBe("like_on_comment");
    expect(out[0].group.items.map(i => i.id)).toEqual(["n2", "n1"]);
  });

  it("2 like_on_comment items on DIFFERENT comments → emits as 2 singles", () => {
    const items = [
      mkNotif({ id: "n2", kind: "like_on_comment", actorId: "u1", createdAtMin: 0, payload: { comment_id: "cA" } }),
      mkNotif({ id: "n1", kind: "like_on_comment", actorId: "u1", createdAtMin: 5, payload: { comment_id: "cB" } }),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("single");
    expect(out[1].type).toBe("single");
  });

  it("3 like_on_comment items on the same comment from 3 different actors → emits as a group of size 3", () => {
    const items = [
      mkNotif({ id: "n3", kind: "like_on_comment", actorId: "u3", createdAtMin: 0, payload: { comment_id: "c1" } }),
      mkNotif({ id: "n2", kind: "like_on_comment", actorId: "u2", createdAtMin: 5, payload: { comment_id: "c1" } }),
      mkNotif({ id: "n1", kind: "like_on_comment", actorId: "u1", createdAtMin: 10, payload: { comment_id: "c1" } }),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type !== "group") throw new Error("expected group");
    expect(out[0].group.count).toBe(3);
    // Group's `actor` is the most recent (head) — preserved for avatar render.
    expect(out[0].group.actor?.id).toBe("u3");
  });
});

describe("groupNotifications: existing kinds keep per-actor grouping with threshold 3", () => {
  it("2 comment_on_activity items from same actor → emits as 2 singles (threshold 3)", () => {
    const items = [
      mkNotif({ id: "c2", kind: "comment_on_activity", actorId: "u1", createdAtMin: 0 }),
      mkNotif({ id: "c1", kind: "comment_on_activity", actorId: "u1", createdAtMin: 5 }),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("single");
    expect(out[1].type).toBe("single");
  });

  it("3 comment_on_activity items from same actor → emits as a group of size 3", () => {
    const items = [
      mkNotif({ id: "c3", kind: "comment_on_activity", actorId: "u1", createdAtMin: 0 }),
      mkNotif({ id: "c2", kind: "comment_on_activity", actorId: "u1", createdAtMin: 5 }),
      mkNotif({ id: "c1", kind: "comment_on_activity", actorId: "u1", createdAtMin: 10 }),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
  });

  it("3 comment_on_activity items from same actor but on different activity_ids → still groups (per-actor key)", () => {
    const items = [
      mkNotif({ id: "c3", kind: "comment_on_activity", actorId: "u1", createdAtMin: 0, payload: { activity_id: "aZ" } }),
      mkNotif({ id: "c2", kind: "comment_on_activity", actorId: "u1", createdAtMin: 5, payload: { activity_id: "aY" } }),
      mkNotif({ id: "c1", kind: "comment_on_activity", actorId: "u1", createdAtMin: 10, payload: { activity_id: "aX" } }),
    ];
    const out = groupNotifications(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
  });
});
```

- [ ] **Step 3: Write the test (EXTEND — only if file already exists)**

If the file already exists (per Step 1's `ls`), open it and append both `describe(...)` blocks above (the `like_on_comment per-comment grouping` block and the `existing kinds keep per-actor grouping with threshold 3` block) at the end of the file, before the final closing brace if there's a wrapping `describe`. Don't reorder existing tests.

- [ ] **Step 4: Run the test file**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/group-notifications.test.ts
```
Expected: 7 specs PASS (4 like + 3 existing-kinds). NOTE: this test will fail until Task 4's types.ts edit is in place — `kind: "like_on_comment"` won't typecheck without the enum extension. Tasks should be executed in order.

- [ ] **Step 5: Commit**

```
git add app/tests/queries/group-notifications.test.ts
git commit -m "test(queries): kind-aware grouping for like_on_comment"
```

---

### Task 9: Render branches in `NotificationRow.tsx` + `NotificationGroupRow.tsx`

**Files:**
- Modify: `app/components/notifications/NotificationRow.tsx`
- Modify: `app/components/notifications/NotificationGroupRow.tsx`

- [ ] **Step 1: Edit `NotificationRow.tsx` — add `like_on_comment` to `copyFor` switch**

Open `/Users/christophernowacki/film-goblin/app/components/notifications/NotificationRow.tsx`. Find the `copyFor` function (around line 35). After the `case "comment_on_activity":` block (which ends with the snippet logic), add:

```tsx
    case "like_on_comment": {
      const raw = (n.payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = n.film?.title ?? "your activity";
      return <><strong>{actorName}</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
```

- [ ] **Step 2: Edit `NotificationRow.tsx` — add `like_on_comment` to `targetFor` switch**

Find the `targetFor` function (top of the file). After the `case "comment_on_activity":` branch, add:

```tsx
    case "like_on_comment": {
      const activityId = (n.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
```

- [ ] **Step 3: Edit `NotificationGroupRow.tsx` — add `like_on_comment` to `headerCopy` switch**

Open `/Users/christophernowacki/film-goblin/app/components/notifications/NotificationGroupRow.tsx`. Find the `headerCopy` function (around line 15). After the `case "comment_on_activity":` branch, add:

```tsx
    case "like_on_comment": {
      const raw = (group.items[0].payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      const subject = group.items[0].film?.title ?? "your activity";
      return <><strong>{group.count} people</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
```

- [ ] **Step 4: Edit `NotificationGroupRow.tsx` — add `like_on_comment` to `headerHref` switch**

Find the `headerHref` function (around line 33). After the `case "comment_on_activity":` branch, add:

```tsx
    case "like_on_comment": {
      const activityId = (group.items[0].payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
```

- [ ] **Step 5: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: PASS (clean). All previously-flagged exhaustiveness errors should resolve now.

- [ ] **Step 6: Run the full app test suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: PASS. The new grouping tests pass; nothing else regresses.

- [ ] **Step 7: Commit**

```
git add app/components/notifications/NotificationRow.tsx app/components/notifications/NotificationGroupRow.tsx
git commit -m "feat(notifications): render branches for like_on_comment (single + group)"
```

---

### Task 10: Apply migrations to prod Supabase

**Files:** none modified.

- [ ] **Step 1: Apply migrations**

Run from repo root `/Users/christophernowacki/film-goblin`:
```
set -a; source app/.env.local; set +a; cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```
Expected output includes:
```
Applied: 0148_like_on_comment_kind.sql
Applied: 0149_like_on_comment_trigger.sql
```

The migrations are additive — `ADD COLUMN ... NOT NULL DEFAULT TRUE` is a metadata-only operation in Postgres 11+ (no table rewrite). `ALTER TYPE ADD VALUE` is also fast. Total runtime: seconds.

- [ ] **Step 2: No commit needed.** This step modifies prod DB only.

---

### Task 11: Update CLAUDE.md + open PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add sub-project #27 row**

Open `/Users/christophernowacki/film-goblin/CLAUDE.md`. Find the Sub-project history table (look for `| 26 | Username on utility surfaces`). Add this row after #26:

```markdown
| 27 | `like_on_comment` notification — migs `0148` (enum + `notify_comment_likes` opt-out) + `0149` (`notify_like_on_comment` SECURITY DEFINER trigger). Recipient = comment author; self-likes filtered; opt-out skips the INSERT entirely. Bell row mirrors `comment_on_activity` payload and copy. New per-kind grouping: `like_on_comment` keys on `payload.comment_id` (not actor) with threshold 2. /settings adds "Notify me when someone likes my comment" checkbox. | `2026-05-01-like-on-comment-notification-design.md` |
```

- [ ] **Step 2: Update "Last updated" line + Open threads**

Replace the current `**Last updated:**` line with:

```markdown
**Last updated:** 2026-05-01 (sub-projects #25/#26/#27 — comment likes, username standardization, like_on_comment notification)
```

In Open threads, find the `Sub-project #25 deferred follow-ups` line and remove `notification kind 'like_on_comment'` from the list (it's now done). The remaining deferred items stay.

- [ ] **Step 3: Commit CLAUDE.md**

```
git add CLAUDE.md
git commit -m "docs(claude): note sub-project #27 — like_on_comment notification"
```

- [ ] **Step 4: Push branch**

```
git push -u origin feature/like-on-comment-notification
```

- [ ] **Step 5: Open PR**

Write the body to `/tmp/pr-body-27.md`:

```markdown
## Summary

Sub-project #27 — `like_on_comment` notification.

- **Mig 0148** adds `'like_on_comment'` to the `notification_kind` enum and a new `profiles.notify_comment_likes BOOLEAN NOT NULL DEFAULT TRUE` opt-out column.
- **Mig 0149** adds `notify_like_on_comment()` SECURITY DEFINER plpgsql + `on_comment_reaction_insert_notify` trigger on `activity_comment_reactions`. Skips self-likes; skips when recipient has opted out.
- Bell-row payload mirrors `comment_on_activity` (`activity_id`, `comment_id`, `body`, `film_id`). Copy reads `<liker> liked your comment on <film>: "snippet"` symmetric to `<commenter> commented on <film>: "snippet"`.
- **Smarter grouping:** `like_on_comment` groups per-`payload.comment_id` (not per-actor) with `MIN_GROUP_SIZE = 2`. Single liker reads `<liker> liked your comment`; 2+ likers read `N people liked your comment`. Other kinds keep per-actor grouping with threshold 3.
- /settings gets a new "Notify me when someone likes my comment" checkbox. Wired through the existing `_updateProfile` field-spread pattern.

## Test plan

- [x] `cd db && npm test` (pg-mem smoke includes 0148 + 0149)
- [x] `cd db && npm run test:rls` — 5 new specs cover trigger insert, self-like filter, opt-out filter, un-like no-op, and RLS owner-only read
- [x] `cd app && npm run typecheck`
- [x] `cd app && npm test` — 7 new grouping specs (4 like + 3 existing-kinds regression)
- [x] Migrations applied to prod Supabase
- [ ] Manual smoke on Vercel preview: like a coven mate's comment → bell shows on their account; toggle off the new /settings checkbox → next like generates no bell row; 2+ different users like the same comment → grouped header.
```

Then run:
```
gh pr create --title "feat: like_on_comment notification + opt-out + smarter grouping" --body-file /tmp/pr-body-27.md
```

- [ ] **Step 6: Done.** Report PR URL back.

---

## Self-Review

**1. Spec coverage:**
- DB: enum + opt-out column → Task 1; trigger → Task 2.
- RLS + trigger tests (5 cases including self-like, opt-out, un-like no-op, RLS) → Task 3.
- types.ts edits → Task 4.
- ProfileFields → Task 5.
- /settings checkbox + form-data → Task 6.
- Kind-aware grouping (per-comment key + threshold 2) → Task 7.
- Grouping tests (per-comment grouping at 2+, existing kinds keep threshold 3) → Task 8.
- NotificationRow + NotificationGroupRow render branches (single + group) → Task 9.
- Apply prod migrations → Task 10.
- CLAUDE.md + PR → Task 11.

All spec sections covered. The notifier helper (already refactored to apply all migs) needs no patches — confirmed by reading the helper.

**2. Placeholder scan:** Every code block contains the exact code. No "TBD" / "TODO" / "Similar to Task N" patterns.

**3. Type consistency:**
- `notify_comment_likes: boolean` declared in Task 4, referenced in Tasks 5/6 (matches).
- `like_on_comment` enum value declared in Task 4, referenced in Tasks 7/8/9 (matches).
- `groupKey` and `minSize` helper names consistent within Task 7's file replacement.
- Migration numbers `0148` + `0149` consistent across Tasks 1/2/3/10/11.
- `groupNotifications`'s `NotificationGroup.actor = head.actor` is preserved — Task 8's group-of-3 test asserts `out[0].group.actor?.id === "u3"` (the head), matching Task 7's implementation.
- Spec said tests for "2-item group" pass — Task 8's "2 like_on_comment items on the SAME comment" test explicitly asserts `count: 2`, exercising the threshold-2 path.
- Task 8's `mkNotif` constructs `kind: "like_on_comment"` literals — won't compile without Task 4 done, hence the explicit ordering note in Task 8 Step 4.

No drift detected.
