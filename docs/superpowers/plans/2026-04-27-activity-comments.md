# Activity Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 140-char comments on single-event activity rows: schema + RLS, in-app notification trigger, query helper, server actions, inline-expand UI in feed and on profile pages, plus notification rendering and auto-expand from notification clicks.

**Architecture:** New `activity_comments` table mirrors `activity_reactions` with a surrogate id + 1..140 CHECK + an OR-disjunct DELETE policy (author or activity owner). A SECURITY DEFINER trigger fans inserts into `notifications` under a new `comment_on_activity` enum value. App-side: a `getCommentSummariesForActivities` batch query attaches per-row threads to `single` feed items; a shared `ActivityCommentThread` component renders inline under `ActivityFooter`, optimistic on insert, instant on delete.

**Tech Stack:** Postgres 15+ (Supabase), TypeScript, Next.js 15 App Router, Supabase SSR client, Vitest + testcontainers (RLS) + pg-mem (smoke).

**Spec:** `docs/superpowers/specs/2026-04-27-activity-comments-design.md`

---

### Task 0: Branch off fresh master

**Files:**
- (no source changes)

- [ ] **Step 1: Sync master and branch**

```bash
git fetch origin
git checkout master
git merge --ff-only origin/master
git checkout -b feature/activity-comments
```

Expected: `Switched to a new branch 'feature/activity-comments'`.

---

### Task 1: Migration 0129 — `activity_comments` table + RLS

**Files:**
- Create: `db/migrations/0129_activity_comments.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0129_activity_comments.sql
-- Flat 140-char comments on activity rows. Surrogate id (vs activity_reactions'
-- composite PK) because multiple comments per (activity, user) are valid.
-- DELETE policy is two-disjunct: comment author OR the activity's actor — the
-- actor gets a moderation hatch on their own row.

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

-- Anyone authed reads — feed and profile surfaces both render threads.
CREATE POLICY activity_comments_select
  ON activity_comments FOR SELECT
  TO authenticated
  USING (true);

-- Author identity enforced on insert.
CREATE POLICY activity_comments_insert
  ON activity_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Author OR activity owner can delete.
CREATE POLICY activity_comments_delete
  ON activity_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT actor_user_id FROM activity WHERE id = activity_comments.activity_id)
  );

-- No UPDATE policy — edits not supported in v1.

GRANT SELECT, INSERT, DELETE ON activity_comments TO authenticated;
```

- [ ] **Step 2: Run pg-mem smoke**

```bash
cd db
npm test
```

Expected: all migration smoke tests pass. If pg-mem chokes on a CHECK or GRANT, extend the strip filter at `db/tests/helpers/pg-mem.ts` rather than rewriting the migration. Do NOT proceed if smoke fails.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0129_activity_comments.sql
git commit -m "feat(db): activity_comments table + RLS (0129)"
```

---

### Task 2: Migration 0130 — `comment_on_activity` notification kind + trigger

**Files:**
- Create: `db/migrations/0130_comment_notification.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0130_comment_notification.sql
-- Extend the notification_kind enum and fan inserts on activity_comments
-- into a notification for the activity's actor. Self-comments (user_id =
-- actor_user_id) are filtered by the WHERE clause so the INSERT inserts
-- zero rows in that case.
--
-- Payload includes film_id when the underlying activity has one (review,
-- recommendation, watchlist_added, watch_logged, list_film_added). The bell
-- row hydrates film via that field, mirroring recommendation_received.

ALTER TYPE notification_kind ADD VALUE 'comment_on_activity';

CREATE OR REPLACE FUNCTION public.notify_comment_on_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, actor_user_id, payload)
  SELECT
    a.actor_user_id,
    'comment_on_activity',
    NEW.user_id,
    jsonb_build_object(
      'activity_id', NEW.activity_id,
      'comment_id',  NEW.id,
      'body',        NEW.body,
      'film_id',     a.payload->>'film_id'
    )
  FROM activity a
  WHERE a.id = NEW.activity_id
    AND a.actor_user_id <> NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_activity_comment_insert_notify
AFTER INSERT ON activity_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_on_activity();
```

- [ ] **Step 2: Re-run pg-mem smoke**

```bash
cd db
npm test
```

Expected: pass. `ALTER TYPE … ADD VALUE` is supported in pg-mem 3.x; if it isn't, extend the strip filter to drop `ALTER TYPE` lines (smoke doesn't need the new value to validate table presence).

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0130_comment_notification.sql
git commit -m "feat(db): comment_on_activity notification kind + trigger (0130)"
```

---

### Task 3: RLS test suite for `activity_comments`

**Files:**
- Create: `db/tests/rls/activity_comments.test.ts`

- [ ] **Step 1: Write the test file**

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
     VALUES ($1, 'watchlist_added', $2)
     RETURNING id`,
    [fx.userA.id, JSON.stringify({ film_id: fx.filmId })]
  );
  activityId = res.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM notifications`);
  await db.client.query(`DELETE FROM activity_comments`);
  await commit(db.client);
});

describe("RLS: activity_comments", () => {
  it("authenticated INSERT with matching user_id succeeds", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO activity_comments (activity_id, user_id, body)
         VALUES ($1, $2, 'banger') RETURNING id`,
        [activityId, fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("INSERT with mismatched user_id is blocked", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comments (activity_id, user_id, body)
           VALUES ($1, $2, 'spoof')`,
          [activityId, fx.userC.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("body length 0 rejected by CHECK", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comments (activity_id, user_id, body)
           VALUES ($1, $2, '')`,
          [activityId, fx.userB.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("body length > 140 rejected by CHECK", async () => {
    const long = "x".repeat(141);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comments (activity_id, user_id, body)
           VALUES ($1, $2, $3)`,
          [activityId, fx.userB.id, long]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("public read — any authed user sees the thread", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'hi')`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM activity_comments WHERE activity_id = $1`, [activityId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("author can delete own comment", async () => {
    await beginAs(db.client, null, "service_role");
    const seed = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'mine') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const commentId = seed.rows[0].id;

    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comments WHERE id = $1`,
      [commentId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("activity owner can delete a comment on their own activity", async () => {
    await beginAs(db.client, null, "service_role");
    const seed = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'theirs') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const commentId = seed.rows[0].id;

    await beginAs(db.client, fx.userA.id, "authenticated"); // userA is the activity owner
    const del = await db.client.query(
      `DELETE FROM activity_comments WHERE id = $1`,
      [commentId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("third-party delete is blocked", async () => {
    await beginAs(db.client, null, "service_role");
    const seed = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'hands off') RETURNING id`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);
    const commentId = seed.rows[0].id;

    // userC is neither the comment author nor the activity owner.
    await beginAs(db.client, fx.userC.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comments WHERE id = $1`,
      [commentId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(0);
  });

  it("trigger: comment by non-actor produces a notification for the actor", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'hello')`,
      [activityId, fx.userB.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query<{ kind: string; user_id: string; actor_user_id: string; payload: any }>(
      `SELECT kind, user_id, actor_user_id, payload FROM notifications WHERE kind = 'comment_on_activity'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(1);
    expect(n.rows[0].user_id).toBe(fx.userA.id);
    expect(n.rows[0].actor_user_id).toBe(fx.userB.id);
    expect(n.rows[0].payload.activity_id).toBe(activityId);
    expect(n.rows[0].payload.body).toBe("hello");
    expect(n.rows[0].payload.film_id).toBe(fx.filmId);
  });

  it("trigger: self-comment produces no notification", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'self')`,
      [activityId, fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const n = await db.client.query(
      `SELECT id FROM notifications WHERE kind = 'comment_on_activity'`
    );
    await commit(db.client);
    expect(n.rowCount).toBe(0);
  });

  it("cascade: delete activity removes its comments", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'doomed')`,
      [activityId, fx.userB.id]
    );
    await db.client.query(`DELETE FROM activity WHERE id = $1`, [activityId]);
    const r = await db.client.query(`SELECT id FROM activity_comments WHERE activity_id = $1`, [activityId]);
    await commit(db.client);
    expect(r.rowCount).toBe(0);

    // Re-seed activity row so afterAll/other tests don't crash.
    const re = await db.client.query<{ id: string }>(
      `INSERT INTO activity (actor_user_id, kind, payload)
       VALUES ($1, 'watchlist_added', $2)
       RETURNING id`,
      [fx.userA.id, JSON.stringify({ film_id: fx.filmId })]
    );
    activityId = re.rows[0].id;
    await beginAs(db.client, null, "service_role");
    await commit(db.client);
  });
});
```

- [ ] **Step 2: Run RLS tests**

```bash
cd db
npm run test:rls -- tests/rls/activity_comments.test.ts
```

Expected: all tests pass. If a test fails, fix the migration or the test — do NOT skip.

- [ ] **Step 3: Run full RLS suite to confirm no regressions**

```bash
cd db
npm run test:rls
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add db/tests/rls/activity_comments.test.ts
git commit -m "test(db): RLS + trigger coverage for activity_comments"
```

---

### Task 4: Apply migrations to prod and regenerate types

**Files:**
- Modify: `app/lib/supabase/types.ts` (regenerated)

- [ ] **Step 1: Apply 0129 + 0130 to production Supabase**

Source the pooler URL from `passwords.txt` (gitignored — see CLAUDE.md "Passwords scratchpad"). From the repo root:

```bash
cd db
set -a; source ../app/.env.local; set +a
npm run migrate
```

Expected: log shows `0129_activity_comments.sql` and `0130_comment_notification.sql` applied. If `DATABASE_URL` is missing, fetch it from `passwords.txt` first.

- [ ] **Step 2: Regenerate Supabase types**

```bash
cd app
npm run gen:types
```

Expected: `app/lib/supabase/types.ts` updates to include the new `activity_comments` table and the new `comment_on_activity` enum value.

- [ ] **Step 3: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean (the new types are additive — no consumers yet).

- [ ] **Step 4: Commit types**

```bash
git add app/lib/supabase/types.ts
git commit -m "chore(types): regenerate after 0129 + 0130"
```

---

### Task 5: Read helper — `getCommentSummariesForActivities`

**Files:**
- Create: `app/lib/queries/activity-comments.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface CommentItem {
  id: string;
  user_id: string;
  user: {
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  body: string;
  created_at: string;
}

export interface CommentSummary {
  count: number;
  items: CommentItem[]; // chronological (oldest first)
}

/**
 * Batch-fetch comment threads for a set of activity rows. Single SELECT joining
 * activity_comments + profiles via PostgREST nested embed; aggregate into
 * Map<activity_id, CommentSummary> in JS. Mirrors getReactionsForActivities.
 *
 * The empty entry for every requested id is pre-seeded so callers can read
 * `map.get(id)` without null checks.
 */
export async function getCommentSummariesForActivities(
  client: Client,
  activityIds: string[],
): Promise<Map<string, CommentSummary>> {
  const map = new Map<string, CommentSummary>();
  for (const id of activityIds) map.set(id, { count: 0, items: [] });
  if (activityIds.length === 0) return map;

  // activity_comments may not be in generated types yet on the first build;
  // cast pattern from app/lib/actions/reactions.ts keeps this resilient.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("activity_comments")
    .select("id, activity_id, user_id, body, created_at, user:profiles!inner(handle, display_name, avatar_url)")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const row of data ?? []) {
    const entry = map.get(row.activity_id);
    if (!entry) continue;
    // PostgREST nested embed types may model the embed as array even when it's
    // always one row — same workaround as the FilmPoster `as never` cast.
    const u = (Array.isArray(row.user) ? row.user[0] : row.user) as CommentItem["user"];
    entry.items.push({
      id: row.id,
      user_id: row.user_id,
      user: u,
      body: row.body,
      created_at: row.created_at,
    });
    entry.count = entry.items.length;
  }
  return map;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/queries/activity-comments.ts
git commit -m "feat(queries): batch comment summaries for activity rows"
```

---

### Task 6: Server actions — `addActivityComment` + `deleteActivityComment`

**Files:**
- Create: `app/lib/actions/activity-comments.ts`

- [ ] **Step 1: Write the actions file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { CommentItem } from "@/lib/queries/activity-comments";

type Client = SupabaseClient<Database>;

const MAX_LEN = 140;

export type AddResult =
  | { ok: true; comment: CommentItem }
  | { ok: false; error: string };

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function _addActivityComment(
  client: Client,
  activityId: string,
  rawBody: string,
): Promise<AddResult> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return { ok: false, error: "unauthenticated" };

  const body = (rawBody ?? "").trim();
  if (body.length === 0) return { ok: false, error: "Comment is empty." };
  if (body.length > MAX_LEN) return { ok: false, error: `Comment is over ${MAX_LEN} characters.` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("activity_comments")
    .insert({ activity_id: activityId, user_id: user.id, body })
    .select("id, activity_id, user_id, body, created_at, user:profiles!inner(handle, display_name, avatar_url)")
    .single();
  if (error) return { ok: false, error: error.message };

  const u = (Array.isArray(data.user) ? data.user[0] : data.user) as CommentItem["user"];
  return {
    ok: true,
    comment: {
      id: data.id,
      user_id: data.user_id,
      user: u,
      body: data.body,
      created_at: data.created_at,
    },
  };
}

export async function addActivityComment(
  activityId: string,
  body: string,
): Promise<AddResult> {
  const supabase = await createClient();
  const result = await _addActivityComment(supabase, activityId, body);
  if (result.ok) revalidatePath("/home");
  return result;
}

export async function _deleteActivityComment(
  client: Client,
  commentId: string,
): Promise<DeleteResult> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return { ok: false, error: "unauthenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("activity_comments")
    .delete()
    .eq("id", commentId)
    .select("id"); // returns deleted row(s); empty array means RLS filtered the delete out.
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Not allowed." };
  return { ok: true };
}

export async function deleteActivityComment(commentId: string): Promise<DeleteResult> {
  const supabase = await createClient();
  const result = await _deleteActivityComment(supabase, commentId);
  if (result.ok) revalidatePath("/home");
  return result;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/activity-comments.ts
git commit -m "feat(actions): add + delete activity comments"
```

---

### Task 7: Server-action tests

**Files:**
- Create: `app/tests/actions/activity-comments.test.ts`

- [ ] **Step 1: Write env-gated integration tests**

Match the existing pattern from `app/tests/actions/coven.test.ts` — use the `createTestUser` / `signedInClient` / `adminClient` helpers from `tests/helpers/`.

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _addActivityComment, _deleteActivityComment } from "../../lib/actions/activity-comments";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

let alice: TestUser; // activity owner
let bob: TestUser;   // commenter
let carol: TestUser; // third-party
let filmId = "";
let activityId = "";

beforeAll(async () => {
  if (!hasEnv) return;
  alice = await createTestUser();
  bob = await createTestUser();
  carol = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ title: "Test Film", director: "T", year: 2026, artwork_url: "x", itunes_url: "y" })
    .select("id").single();
  filmId = (film.data as { id: string }).id;

  const act = await admin
    .from("activity")
    .insert({ actor_user_id: alice.id, kind: "watchlist_added", payload: { film_id: filmId } })
    .select("id").single();
  activityId = (act.data as { id: string }).id;
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  // activity_comments may not be in generated types yet — cast to never.
  await admin.from("activity_comments" as never).delete().eq("activity_id", activityId);
  await admin.from("notifications").delete().eq("kind", "comment_on_activity");
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("activity").delete().eq("id", activityId);
  await admin.from("films").delete().eq("id", filmId);
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
  await deleteTestUser(carol.id);
});

describe.skipIf(!hasEnv)("actions/activity-comments", () => {
  it("addActivityComment happy path", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "banger");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comment.body).toBe("banger");
    expect(r.comment.user_id).toBe(bob.id);
  });

  it("rejects empty body before DB", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/empty/i);
  });

  it("rejects body > 140 chars before DB", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "x".repeat(141));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/140/);
  });

  it("author can delete own comment", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const add = await _addActivityComment(c, activityId, "mine");
    if (!add.ok) throw new Error("seed failed");
    const del = await _deleteActivityComment(c, add.comment.id);
    expect(del.ok).toBe(true);
  });

  it("activity owner can delete a non-own comment on their row", async () => {
    const cBob = await signedInClient(bob.email, bob.password);
    const add = await _addActivityComment(cBob, activityId, "theirs");
    if (!add.ok) throw new Error("seed failed");

    const cAlice = await signedInClient(alice.email, alice.password); // activity owner
    const del = await _deleteActivityComment(cAlice, add.comment.id);
    expect(del.ok).toBe(true);
  });

  it("third party cannot delete", async () => {
    const cBob = await signedInClient(bob.email, bob.password);
    const add = await _addActivityComment(cBob, activityId, "hands off");
    if (!add.ok) throw new Error("seed failed");

    const cCarol = await signedInClient(carol.email, carol.password);
    const del = await _deleteActivityComment(cCarol, add.comment.id);
    expect(del.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd app
npm test -- tests/actions/activity-comments.test.ts
```

Expected: tests pass when `TEST_SUPABASE_SERVICE_ROLE_KEY` is set, or the file reports green-skipped when it isn't (matches existing `describe.skipIf` pattern).

- [ ] **Step 3: Commit**

```bash
git add app/tests/actions/activity-comments.test.ts
git commit -m "test(actions): activity-comments add/delete coverage"
```

---

### Task 8: `CommentButton` component

**Files:**
- Create: `app/components/CommentButton.tsx`

- [ ] **Step 1: Write the button**

```tsx
"use client";

interface Props {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

function SpeechIcon({ filled }: { filled: boolean }) {
  // Simple speech bubble — sharp corners + miter joins to match HeartIcon.
  return (
    <svg viewBox="0 0 18 16" width="16" height="14" aria-hidden="true">
      <path
        d="M2 2 L16 2 L16 11 L9 11 L5 14 L5 11 L2 11 Z"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default function CommentButton({ count, expanded, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`heart-btn ${expanded ? "heart-liked" : ""}`}
      aria-label={expanded ? "Hide comments" : "Show comments"}
      aria-expanded={expanded}
    >
      <SpeechIcon filled={expanded} />
      {count > 0 && (
        <span className="heart-count" style={{ pointerEvents: "none" }}>{count}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/CommentButton.tsx
git commit -m "feat(ui): CommentButton — speech-bubble toggle on activity rows"
```

---

### Task 9: `ActivityCommentThread` component

**Files:**
- Create: `app/components/ActivityCommentThread.tsx`

- [ ] **Step 1: Write the thread + composer**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { relativeTime } from "./activity/relativeTime";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  activityId: string;
  actorUserId: string;
  viewerId: string | null;
  initialItems: CommentItem[];
  onCountChange?: (n: number) => void;
}

const MAX_LEN = 140;

export default function ActivityCommentThread({
  activityId, actorUserId, viewerId, initialItems, onCountChange,
}: Props) {
  const [items, setItems] = useState<CommentItem[]>(initialItems);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const overLimit = trimmed.length > MAX_LEN;
  const canPost = trimmed.length > 0 && !overLimit && !pending && viewerId !== null;

  function postComment() {
    if (!canPost || !viewerId) return;
    setError(null);
    // Optimistic: append a temp row, swap with server row on success.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { handle: "...", display_name: null, avatar_url: null },
      body: trimmed,
      created_at: new Date().toISOString(),
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange?.(next.length);
      return next;
    });
    setDraft("");
    startTransition(async () => {
      const result = await addActivityComment(activityId, trimmed);
      if (result.ok) {
        setItems(prev => prev.map(c => c.id === tempId ? result.comment : c));
      } else {
        setItems(prev => {
          const next = prev.filter(c => c.id !== tempId);
          onCountChange?.(next.length);
          return next;
        });
        setError(result.error);
      }
    });
  }

  function removeComment(id: string) {
    const prev = items;
    setItems(p => {
      const next = p.filter(c => c.id !== id);
      onCountChange?.(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await deleteActivityComment(id);
      if (!result.ok) {
        setItems(prev);
        onCountChange?.(prev.length);
        setError(result.error);
      }
    });
  }

  return (
    <div className="comment-thread" style={{ marginTop: 10, borderLeft: "2px solid var(--accent)", paddingLeft: 12 }}>
      <div style={{ maxHeight: "min(50vh, 240px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(c => {
          const canDelete = viewerId !== null && (viewerId === c.user_id || viewerId === actorUserId);
          return (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
              <Avatar
                name={c.user.display_name ?? c.user.handle}
                color="var(--accent)"
                size={22}
                url={c.user.avatar_url}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <Link href={`/p/${encodeURIComponent(c.user.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>
                    @{c.user.handle}
                  </Link>{" "}
                  <span style={{ wordBreak: "break-word" }}>{c.body}</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{relativeTime(c.created_at)}</div>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => removeComment(c.id)}
                  aria-label="Delete comment"
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2 }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
      {viewerId !== null && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canPost) { e.preventDefault(); postComment(); } }}
            placeholder="Quick take…"
            maxLength={MAX_LEN + 1} // allow 141 to surface the over-limit state visibly
            style={{ flex: 1, fontSize: 12, padding: "6px 8px", background: "var(--void-2)", color: "var(--bone)", border: "1px solid var(--muted)" }}
          />
          <span style={{ fontSize: 10, color: overLimit ? "var(--accent)" : "var(--muted)", minWidth: 38, textAlign: "right" }}>
            {trimmed.length}/{MAX_LEN}
          </span>
          <button type="button" className="btn btn-sm" onClick={postComment} disabled={!canPost}>Post</button>
        </div>
      )}
      {error && <div style={{ marginTop: 6, fontSize: 11, color: "var(--accent)" }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/ActivityCommentThread.tsx
git commit -m "feat(ui): ActivityCommentThread — inline list + composer with optimistic insert"
```

---

### Task 10: Wire `CommentButton` + thread into `ActivityFooter`

**Files:**
- Modify: `app/components/activity/ActivityFooter.tsx`
- Modify: `app/lib/queries/activity.ts` (add `comments` field to `EnrichedActivity`)

- [ ] **Step 1: Extend `EnrichedActivity` with `comments`**

In `app/lib/queries/activity.ts`, update the type:

```ts
import { getReactionsForActivities, type ReactionSummary } from "./activity-reactions";
import type { CommentSummary } from "./activity-comments";
// ...
export type EnrichedActivity = (
  | { kind: "recommendation_sent"; film: FilmLite; recipient: RecipientLite; note: string }
  | { kind: "review_published"; film: FilmLite; title: string; pullquote: string | null }
  | { kind: "watchlist_added"; film: FilmLite }
  | { kind: "watch_logged"; film: FilmLite }
  | { kind: "list_created"; list: ListLite }
  | { kind: "list_film_added"; list: ListLite; film: FilmLite }
  | { kind: "coven_joined"; other: RecipientLite }
) & {
  id: string;
  created_at: string;
  actor: ActorLite;
  reactions: ReactionSummary;
  comments: CommentSummary;
};
```

Then in `getEnrichedFeed`, parallel-fetch comments alongside reactions and attach to `base`. The full diff:

```ts
import { getCommentSummariesForActivities } from "./activity-comments";
// ...
const [actors, films, recipients, lists, reactionsMap, commentsMap] = await Promise.all([
  rawActorIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", rawActorIds) : Promise.resolve({ data: [] as any }),
  filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any }),
  recipientIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any }),
  listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any }),
  getReactionsForActivities(client, raw.map(r => r.id), followerUserId),
  getCommentSummariesForActivities(client, raw.map(r => r.id)),
]);
// ...
const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
const comments = commentsMap.get(r.id) ?? { count: 0, items: [] };
const base = { id: r.id, created_at: r.created_at, actor, reactions, comments };
```

Note: `groupFeed` operates on `EnrichedActivity[]` and the new `comments` field rides through opaquely. Group items don't render `comments` because `ActivityWatchlistAddedGroup` / `ActivityWatchLoggedGroup` don't pull on it. That matches decision #3 — comments are scoped to single rows only.

- [ ] **Step 2: Wire `CommentButton` + thread into `ActivityFooter`**

`ActivityFooter` keeps its existing prop shape (`{ item }`) so the seven per-kind components don't need to change. Viewer id is fetched client-side via `createClient` from `@/lib/supabase/client` — one `auth.getUser()` per row. (The existing `HeartButton` doesn't need viewer either; it relies on `initialLikedByMe` from server-side enrichment.)

Replace `app/components/activity/ActivityFooter.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import CommentButton from "../CommentButton";
import ActivityCommentThread from "../ActivityCommentThread";
import { relativeTime } from "./relativeTime";
import { createClient } from "@/lib/supabase/client";

interface Props {
  item: EnrichedActivity;
}

export default function ActivityFooter({ item }: Props) {
  const params = useSearchParams();
  const focusedId = params?.get("activity");
  const [count, setCount] = useState(item.comments.count);
  const [expanded, setExpanded] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  // Pull viewer once on mount. Avoids threading a prop through 7 kind components.
  useEffect(() => {
    const c = createClient();
    c.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  // Auto-expand when this row matches `?activity=<id>` on /home.
  useEffect(() => {
    if (focusedId && focusedId === item.id) setExpanded(true);
  }, [focusedId, item.id]);

  return (
    <>
      <div className="activity-footer">
        <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>{relativeTime(item.created_at)}</span>
        <CommentButton count={count} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
        <HeartButton
          activityId={item.id}
          initialCount={item.reactions.count}
          initialLikedByMe={item.reactions.likedByMe}
        />
      </div>
      {expanded && (
        <ActivityCommentThread
          activityId={item.id}
          actorUserId={item.actor.id}
          viewerId={viewerId}
          initialItems={item.comments.items}
          onCountChange={setCount}
        />
      )}
    </>
  );
}
```

No changes are needed in any of the seven `Activity*` kind components — they already pass `<ActivityFooter item={item} />`.

- [ ] **Step 3: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Local dev smoke**

```bash
cd app
npm run dev
```

Open http://localhost:3000/home, sign in, expand a comment thread, post a 140-char take, delete it. Confirm: counter updates, optimistic insert + server swap works, your own ✕ delete works. Sign in as the activity actor (or fake an actor on a seeded row); confirm activity-owner can delete a non-own comment.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/activity.ts app/components/activity/ActivityFooter.tsx
git commit -m "feat(ui): wire CommentButton + thread into ActivityFooter; thread comments through getEnrichedFeed"
```

---

### Task 11: Profile-page integration

**Files:**
- Modify: `app/app/p/[handle]/page.tsx` (extend `enrichOwnActivity` to fetch comment summaries)

- [ ] **Step 1: Add comments to `enrichOwnActivity`**

In `app/app/p/[handle]/page.tsx`, update `enrichOwnActivity`:

```ts
import { getCommentSummariesForActivities } from "@/lib/queries/activity-comments";
// ...
async function enrichOwnActivity(supabase: any, rows: any[], profile: any, viewerId: string | null) {
  if (rows.length === 0) return [];
  const filmIds = Array.from(new Set(rows.map(r => r.payload?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(rows.map(r => r.payload?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(rows.map(r => r.payload?.list_id).filter(Boolean)));

  const [films, recipients, lists, reactionsMap, commentsMap] = await Promise.all([
    filmIds.length ? supabase.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] }),
    recipientIds.length ? supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] }),
    listIds.length ? supabase.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] }),
    getReactionsForActivities(supabase, rows.map(r => r.id), viewerId),
    getCommentSummariesForActivities(supabase, rows.map(r => r.id)),
  ]);

  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const actor = { id: profile.id, handle: profile.handle, display_name: profile.display_name, avatar_url: profile.avatar_url };
  const out: any[] = [];
  for (const r of rows) {
    const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
    const comments = commentsMap.get(r.id) ?? { count: 0, items: [] };
    const base = { id: r.id, created_at: r.created_at, actor, reactions, comments };
    // ...rest of the switch unchanged
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Local dev smoke**

Visit `http://localhost:3000/p/<some-handle>`. Each activity row should show the 💬 affordance and expand into a working thread.

- [ ] **Step 4: Commit**

```bash
git add app/app/p/\[handle\]/page.tsx
git commit -m "feat(profile): attach comments to /p/[handle] activity rows"
```

---

### Task 12: Notification rendering — `comment_on_activity`

**Files:**
- Modify: `app/components/notifications/NotificationRow.tsx`
- Modify: `app/components/notifications/NotificationGroupRow.tsx`

- [ ] **Step 1: Extend `targetFor` and `copyFor` in `NotificationRow.tsx`**

Add a case for the new kind. The bell row links to `/home?activity=<id>` so the page auto-expands. Body is truncated to ~60 chars.

```ts
function targetFor(n: EnrichedNotification): string {
  switch (n.kind) {
    case "coven_invite_pending":
      return "/coven#requests";
    case "coven_invite_accepted":
      return n.actor ? `/p/${encodeURIComponent(n.actor.handle)}` : "/coven";
    case "recommendation_received":
    case "price_drop": {
      const filmId = (n.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
    case "comment_on_activity": {
      const activityId = (n.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
  }
}

function copyFor(n: EnrichedNotification): React.ReactNode {
  const actorName = n.actor?.display_name ?? n.actor?.handle ?? "Someone";
  const title = n.film?.title ?? "your activity";
  switch (n.kind) {
    case "coven_invite_pending":
      return <><strong>{actorName}</strong> invited you to their coven.</>;
    case "coven_invite_accepted":
      return <><strong>{actorName}</strong> joined your coven.</>;
    case "recommendation_received":
      return <><strong>{actorName}</strong> recommended <em>{title}</em>.</>;
    case "price_drop": {
      const p = n.payload as { old_price_usd?: number; new_price_usd?: number };
      return <>Price drop: <em>{title}</em>{p.new_price_usd !== undefined ? ` — $${p.new_price_usd.toFixed(2)}` : ""}.</>;
    }
    case "comment_on_activity": {
      const raw = (n.payload as { body?: string }).body ?? "";
      const snippet = raw.length > 60 ? raw.slice(0, 57) + "…" : raw;
      return <><strong>{actorName}</strong> commented on <em>{title}</em>: “{snippet}”</>;
    }
  }
}
```

- [ ] **Step 2: Mirror the new branch in `NotificationGroupRow.tsx`**

Open `app/components/notifications/NotificationGroupRow.tsx` and add the same `comment_on_activity` cases to its `targetFor` and `copyFor` switches (groups multiple comments from the same actor into one row). Match the style of the existing `recommendation_received` group case.

- [ ] **Step 3: Typecheck**

```bash
cd app
npm run typecheck
```

Expected: clean. The new enum value is now in `notification_kind`, so omitting either case in either switch is a TS error — that's the safety net.

- [ ] **Step 4: Local dev smoke**

Trigger a comment on a row owned by another user; check the bell on `/home`. Click the row; confirm `/home?activity=<id>` loads with that row's thread auto-expanded.

- [ ] **Step 5: Commit**

```bash
git add app/components/notifications/NotificationRow.tsx app/components/notifications/NotificationGroupRow.tsx
git commit -m "feat(notifications): render comment_on_activity rows"
```

---

### Task 13: Push, PR, merge, deploy

**Files:**
- (no source changes)

- [ ] **Step 1: Push branch**

```bash
git fetch origin
git rebase origin/master  # if master moved while you worked
git push -u origin feature/activity-comments
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: activity comments (140 chars, inline thread)" --body "$(cat <<'EOF'
## Summary
- New activity_comments table + RLS (migrations 0129/0130)
- comment_on_activity notification kind + trigger
- Inline expand-down thread on every single-event activity row (feed + profile)
- Author or activity-owner delete; no edit; in-app notifications only
- Spec: docs/superpowers/specs/2026-04-27-activity-comments-design.md
- Plan: docs/superpowers/plans/2026-04-27-activity-comments.md

## Test plan
- [ ] Sign in, expand a row in /home, post + delete a 140-char take
- [ ] Confirm count badge updates and optimistic insert swaps to server row
- [ ] As the activity owner, delete someone else's comment on your row
- [ ] As a third party, attempt to delete — confirm the row stays
- [ ] Click a comment_on_activity bell row — /home opens with the thread auto-expanded
- [ ] Profile page (/p/<handle>) — same 💬 affordance, same thread

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Squash-merge and delete branch**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Sync local master + deploy from repo root**

```bash
git checkout master
git pull --ff-only origin master
# Verify CWD is the repo root (NOT app/) — see CLAUDE.md Vercel gotcha.
ls -la .vercel/project.json && pwd
npx vercel deploy --prod --yes
```

Expected: ✓ Ready. Then visit https://film-goblin.vercel.app/home, expand a thread, post a comment.

---

## Acceptance criteria (manual)

- ✓ 💬 badge appears on every single-event row in feed and profile
- ✓ Tapping 💬 expands an inline thread + composer; tapping again collapses it
- ✓ Live `N/140` counter; "Post" disabled at empty/over-limit
- ✓ Optimistic insert; rolls back on server error with inline message
- ✓ ✕ delete only on rows where viewer is the comment author OR the activity owner
- ✓ Self-comment posts but produces no notification
- ✓ Non-self comment produces a `comment_on_activity` bell row for the activity owner
- ✓ Bell click → `/home?activity=<id>` with that row's thread auto-expanded
- ✓ Grouped feed rows (watchlist-add bursts, watch-logged bursts) show NO 💬 affordance
- ✓ Anon viewers on `/p/<handle>` see the thread but no composer
- ✓ Cascade: deleting an activity removes its comments; deleting a user removes their comments

## Notes for the executor

- **Do not run migrations from anywhere except `db/`** with `DATABASE_URL` sourced from `app/.env.local` (which now contains the pooler URL after the recent `vercel env pull`). The pooler URL is the only path that works from this machine.
- **Vercel deploys must run from the repo root.** See the gotcha in CLAUDE.md.
- **`activity_comments` won't appear in `Database` types until `npm run gen:types` runs after Task 4.** Until then, the cast pattern (`client as unknown as { from: ... }`) is intentional and matches `app/lib/actions/reactions.ts`.
- **Two-step optimistic flow.** Insert appends a temp row with id `temp-...`; on server success swap by `c.id === tempId`; on error filter it out and surface the error. Delete is the inverse — remove locally first, restore on error.
- **Matching the heart UX.** No undo toast on delete; instant gone. Mirrors `HeartButton.onHeartTap`.
