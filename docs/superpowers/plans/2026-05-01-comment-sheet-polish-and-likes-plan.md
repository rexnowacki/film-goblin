# Comment sheet polish + likes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the comment bottom sheet to match prototype 1 (header, row layout, composer) and add likes-on-comments backed by a new `activity_comment_reactions` table with a materialized `like_count` on `activity_comments`.

**Architecture:** One new migration (`0147_activity_comment_reactions.sql`) introduces the reaction table + a trigger maintaining `like_count`. Server action `toggleCommentReaction(commentId)` mirrors `toggleReaction`. A sibling component `CommentHeartButton` reuses the existing `.heart-btn`/`.heart-count` CSS classes (with `HeartIcon` extracted to a shared component). `CommentList` and `CommentComposer` are restyled. `BottomSheet` accepts a `ReactNode` title.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres + RLS, TypeScript, Vitest, testcontainers (RLS tests), pg-mem (smoke).

**Spec:** `docs/superpowers/specs/2026-05-01-comment-sheet-polish-and-likes-design.md`

**Branch (already created in brainstorming):** `feature/comment-sheet-polish-and-likes`

---

## File Structure

**Created:**
- `db/migrations/0147_activity_comment_reactions.sql` — schema for the reaction table, RLS, trigger, index
- `db/tests/rls/activity-comment-reactions.test.ts` — RLS + trigger behavior
- `app/lib/actions/comment-reactions.ts` — server action + private form
- `app/tests/actions/comment-reactions.test.ts` — env-skipIf integration
- `app/components/HeartIcon.tsx` — extracted shared SVG glyph
- `app/components/CommentHeartButton.tsx` — sibling of `HeartButton`, always-render-count

**Modified:**
- `app/lib/queries/activity-comments.ts` — `CommentItem` gains `like_count`, `liked_by_me`
- `app/lib/supabase/types.ts` — hand-edit: add `activity_comments.like_count`, add `activity_comment_reactions` table
- `app/components/HeartButton.tsx` — import `HeartIcon` from shared file
- `app/components/CommentList.tsx` — full row rewrite (avatar, stacked username + body, inline Delete link, heart column)
- `app/components/CommentComposer.tsx` — viewer avatar + rounded-pill input + inline counter + smart Post button
- `app/components/CommentSheet.tsx` — ReactNode title, threads `viewerAvatarUrl` to composer
- `app/components/BottomSheet.tsx` — `title: string | ReactNode`
- `app/components/activity/ActivityFooter.tsx` — fetches viewer's `avatar_url`, passes to `CommentSheet`
- `app/app/globals.css` — add `.dot-accent`, `.comment-heart-stack`, `.composer-pill` (and friends), `.comment-row` styles

---

### Task 1: Apply migration `0147` and verify pg-mem smoke still passes

**Files:**
- Create: `db/migrations/0147_activity_comment_reactions.sql`

- [ ] **Step 1: Verify migration number is free**

Run: `ls db/migrations/ | tail -5`
Expected: shows `0146_rate_reminder_kind.sql` as the last file. `0147` is free.

- [ ] **Step 2: Write the migration**

Create `db/migrations/0147_activity_comment_reactions.sql` with:

```sql
-- 0147: likes on activity comments.
--
-- Mirrors activity_reactions: a composite PK (user_id, comment_id) collapses
-- the SELECT-then-INSERT race on toggle. Maintained `like_count` lives on
-- activity_comments so reads don't pay for an aggregate per row.
--
-- Trigger fires on each cascaded delete when a parent comment is deleted; the
-- UPDATE on a deleted parent is a no-op so the trigger is safe under cascade.

ALTER TABLE activity_comments
  ADD COLUMN like_count INT NOT NULL DEFAULT 0;

CREATE TABLE activity_comment_reactions (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES activity_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);

ALTER TABLE activity_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY acr_select ON activity_comment_reactions
  FOR SELECT USING (true);

CREATE POLICY acr_insert ON activity_comment_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY acr_delete ON activity_comment_reactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION acr_bump_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE activity_comments
       SET like_count = like_count + 1
     WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE activity_comments
       SET like_count = GREATEST(like_count - 1, 0)
     WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER acr_bump_count_trg
  AFTER INSERT OR DELETE ON activity_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION acr_bump_count();

CREATE INDEX idx_acr_comment ON activity_comment_reactions (comment_id);
```

- [ ] **Step 3: Run pg-mem smoke**

Run: `cd db && nvm use 20 && npm test`
Expected: PASS. If `CREATE OR REPLACE FUNCTION` trips pg-mem, extend the strip filters in `db/tests/helpers/pg-mem.ts` (the existing strip pattern handles function bodies, but verify).

- [ ] **Step 4: Commit migration**

```bash
git add db/migrations/0147_activity_comment_reactions.sql
git commit -m "feat(db): mig 0147 — activity_comment_reactions + like_count"
```

---

### Task 2: RLS + trigger tests for `activity_comment_reactions`

**Files:**
- Create: `db/tests/rls/activity-comment-reactions.test.ts`

- [ ] **Step 1: Write the test file**

Create `db/tests/rls/activity-comment-reactions.test.ts`:

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

  // Create one activity authored by userA, with one comment authored by userA.
  await beginAs(db.client, null, "service_role");
  const a = await db.client.query<{ id: string }>(
    `INSERT INTO activity (kind, actor_user_id, payload)
     VALUES ('watchlist_added', $1, jsonb_build_object('film_id', $2))
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
  await db.client.query(`DELETE FROM activity_comment_reactions`);
  await db.client.query(`UPDATE activity_comments SET like_count = 0 WHERE id = $1`, [commentId]);
  await commit(db.client);
});

describe("RLS: activity_comment_reactions", () => {
  it("anon SELECT — public read allowed (acr_select USING (true))", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM activity_comment_reactions`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user can INSERT own reaction", async () => {
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userB.id, commentId],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user CANNOT INSERT a spoofed user_id", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
          [fx.userB.id, commentId],
        ),
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user can DELETE own reaction", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE comment_id = $1`,
      [commentId],
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("user CANNOT DELETE another user's reaction (RLS no-op)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE comment_id = $1`,
      [commentId],
    );
    await commit(db.client);
    expect(del.rowCount).toBe(0);
  });

  it("trigger increments like_count on INSERT, decrements on DELETE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, commentId],
    );
    let r = await db.client.query<{ like_count: number }>(
      `SELECT like_count FROM activity_comments WHERE id = $1`,
      [commentId],
    );
    expect(r.rows[0].like_count).toBe(2);

    await db.client.query(
      `DELETE FROM activity_comment_reactions WHERE user_id = $1 AND comment_id = $2`,
      [fx.userA.id, commentId],
    );
    r = await db.client.query<{ like_count: number }>(
      `SELECT like_count FROM activity_comments WHERE id = $1`,
      [commentId],
    );
    expect(r.rows[0].like_count).toBe(1);
    await commit(db.client);
  });

  it("composite PK prevents duplicate likes", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userA.id, commentId],
    );
    await expect(
      db.client.query(
        `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
        [fx.userA.id, commentId],
      ),
    ).rejects.toThrow();
    await rollback(db.client);
  });

  it("ON DELETE CASCADE — deleting the parent comment removes reactions", async () => {
    // Create a throwaway comment so we don't break commentId for the rest of the suite.
    await beginAs(db.client, null, "service_role");
    const c = await db.client.query<{ id: string }>(
      `INSERT INTO activity_comments (activity_id, user_id, body)
       VALUES ($1, $2, 'throwaway') RETURNING id`,
      [activityId, fx.userA.id],
    );
    const tmpId = c.rows[0].id;
    await db.client.query(
      `INSERT INTO activity_comment_reactions (user_id, comment_id) VALUES ($1, $2)`,
      [fx.userB.id, tmpId],
    );
    await db.client.query(`DELETE FROM activity_comments WHERE id = $1`, [tmpId]);
    const r = await db.client.query(
      `SELECT * FROM activity_comment_reactions WHERE comment_id = $1`,
      [tmpId],
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });
});
```

- [ ] **Step 2: Run the test, confirm it passes against testcontainers Postgres**

Run: `cd db && npm run test:rls -- tests/rls/activity-comment-reactions.test.ts`
Expected: PASS (8 specs).

- [ ] **Step 3: Run the full RLS suite to confirm no regressions**

Run: `cd db && npm run test:rls`
Expected: PASS.

- [ ] **Step 4: Commit RLS tests**

```bash
git add db/tests/rls/activity-comment-reactions.test.ts
git commit -m "test(rls): activity_comment_reactions RLS + like_count trigger"
```

---

### Task 3: Hand-edit `app/lib/supabase/types.ts` for the new column + table

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Add `like_count` to the `activity_comments` Row/Insert/Update**

Find the `activity_comments` block (starts around line 76). Edit:

```typescript
      activity_comments: {
        Row: {
          activity_id: string
          body: string
          created_at: string
          id: string
          like_count: number
          user_id: string
        }
        Insert: {
          activity_id: string
          body: string
          created_at?: string
          id?: string
          like_count?: number
          user_id: string
        }
        Update: {
          activity_id?: string
          body?: string
          created_at?: string
          id?: string
          like_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Add the `activity_comment_reactions` table block**

Insert immediately after the `activity_comments` block (before `activity_reactions`):

```typescript
      activity_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "activity_comments"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Run typecheck**

Run: `cd app && nvm use 20 && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add app/lib/supabase/types.ts
git commit -m "types(supabase): hand-edit for activity_comment_reactions + like_count"
```

---

### Task 4: Server action `toggleCommentReaction`

**Files:**
- Create: `app/lib/actions/comment-reactions.ts`

- [ ] **Step 1: Write the action**

Create `app/lib/actions/comment-reactions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Toggle the current user's like on a comment. Insert if absent, delete if
 * present. Mirrors _toggleReaction exactly. The composite PK
 * (user_id, comment_id) collapses the SELECT-then-INSERT race; concurrent
 * duplicate inserts return 23505 which we swallow as "already liked".
 */
export async function _toggleCommentReaction(
  client: Client,
  commentId: string,
): Promise<{ liked: boolean }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const { data: existing } = await client
    .from("activity_comment_reactions")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from("activity_comment_reactions")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", user.id);
    if (error) throw error;
    return { liked: false };
  } else {
    const { error } = await client
      .from("activity_comment_reactions")
      .insert({ comment_id: commentId, user_id: user.id });
    if (error && (error as { code?: string }).code !== "23505") throw error;
    return { liked: true };
  }
}

export async function toggleCommentReaction(commentId: string): Promise<{ liked: boolean }> {
  const supabase = await createClient();
  const result = await _toggleCommentReaction(supabase, commentId);
  revalidatePath("/home");
  return result;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/comment-reactions.ts
git commit -m "feat(actions): toggleCommentReaction"
```

---

### Task 5: Integration test for `_toggleCommentReaction`

**Files:**
- Create: `app/tests/actions/comment-reactions.test.ts`

- [ ] **Step 1: Write the test**

Create `app/tests/actions/comment-reactions.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _toggleCommentReaction } from "../../lib/actions/comment-reactions";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let filmId: string;
let activityId: string;
let commentId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;

  const act = await admin
    .from("activity")
    .insert({ kind: "watchlist_added", actor_user_id: userA.id, payload: { film_id: filmId } as never })
    .select("id")
    .single();
  if (act.error || !act.data) throw act.error;
  activityId = act.data.id;

  const cm = await admin
    .from("activity_comments")
    .insert({ activity_id: activityId, user_id: userA.id, body: "first" })
    .select("id")
    .single();
  if (cm.error || !cm.data) throw cm.error;
  commentId = cm.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (commentId) await adminClient().from("activity_comments").delete().eq("id", commentId);
  if (activityId) await adminClient().from("activity").delete().eq("id", activityId);
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

describe.skipIf(!hasEnv)("_toggleCommentReaction", () => {
  it("toggle-on: returns { liked: true } and increments like_count", async () => {
    const c = await signedInClient(userB.email, userB.password);
    const res = await _toggleCommentReaction(c as never, commentId);
    expect(res).toEqual({ liked: true });

    const { data: rxRow } = await adminClient()
      .from("activity_comment_reactions")
      .select("user_id")
      .eq("comment_id", commentId)
      .eq("user_id", userB.id);
    expect(rxRow).toHaveLength(1);

    const { data: cmRow } = await adminClient()
      .from("activity_comments")
      .select("like_count")
      .eq("id", commentId)
      .single();
    expect(cmRow?.like_count).toBe(1);

    // cleanup for next test
    await adminClient().from("activity_comment_reactions").delete().eq("comment_id", commentId).eq("user_id", userB.id);
  });

  it("toggle-off: returns { liked: false } and decrements like_count", async () => {
    const c = await signedInClient(userB.email, userB.password);
    await _toggleCommentReaction(c as never, commentId);
    const res = await _toggleCommentReaction(c as never, commentId);
    expect(res).toEqual({ liked: false });

    const { data } = await adminClient()
      .from("activity_comment_reactions")
      .select("user_id")
      .eq("comment_id", commentId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(0);

    const { data: cmRow } = await adminClient()
      .from("activity_comments")
      .select("like_count")
      .eq("id", commentId)
      .single();
    expect(cmRow?.like_count).toBe(0);
  });
});
```

- [ ] **Step 2: Run typecheck and (if env present) the test**

Run: `cd app && npm run typecheck`
Expected: PASS.

Run: `cd app && npm test -- tests/actions/comment-reactions.test.ts`
Expected: skipped (no `TEST_SUPABASE_*` env in this dev environment) OR pass if env is present. Either is acceptable — `describe.skipIf` reports green-skipped.

- [ ] **Step 3: Commit**

```bash
git add app/tests/actions/comment-reactions.test.ts
git commit -m "test(actions): _toggleCommentReaction integration"
```

---

### Task 6: Extract `HeartIcon` to a shared component

**Files:**
- Create: `app/components/HeartIcon.tsx`
- Modify: `app/components/HeartButton.tsx`

- [ ] **Step 1: Write `HeartIcon`**

Create `app/components/HeartIcon.tsx`:

```typescript
interface Props {
  filled: boolean;
  size?: number;
}

// Sharp-geometry classic heart. Miter linejoin keeps the lobes pointed
// (not rounded) — matches the spec's "no chubby, bubbly edges" rule.
export default function HeartIcon({ filled, size = 16 }: Props) {
  const w = size;
  const h = Math.round((size * 14) / 16); // preserve 18:16 → width:height ratio
  return (
    <svg viewBox="0 0 18 16" width={w} height={h} aria-hidden="true">
      <path
        d="M9 15 L1 7 A4 4 0 0 1 9 3 A4 4 0 0 1 17 7 Z"
        fill={filled ? "var(--accent)" : "none"}
        stroke={filled ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Update `HeartButton.tsx` to import the shared icon**

In `app/components/HeartButton.tsx`:

Replace the `function HeartIcon(...)` definition (lines 14–28 currently) with an import at the top:

```typescript
import HeartIcon from "./HeartIcon";
```

Remove the local `HeartIcon` function. The existing `<HeartIcon filled={liked} />` call site keeps working.

- [ ] **Step 3: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/components/HeartIcon.tsx app/components/HeartButton.tsx
git commit -m "refactor(components): extract HeartIcon to shared file"
```

---

### Task 7: Extend `CommentItem` query to include `like_count` and `liked_by_me`

**Files:**
- Modify: `app/lib/queries/activity-comments.ts`

- [ ] **Step 1: Add the two new fields to `CommentItem`**

In `app/lib/queries/activity-comments.ts`, edit the `CommentItem` interface:

```typescript
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
}
```

- [ ] **Step 2: Update `getCommentSummariesForActivities` signature to accept a viewer id**

Change the function signature and select list. New signature:

```typescript
export async function getCommentSummariesForActivities(
  client: Client,
  activityIds: string[],
  viewerId: string | null,
): Promise<Map<string, CommentSummary>> {
```

In the body, after fetching `rows`, also fetch the viewer's reactions in a single query (skip if `viewerId` is null):

```typescript
  const { data: rows, error } = await client
    .from("activity_comments")
    .select("id, activity_id, user_id, body, created_at, like_count")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return map;

  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const { data: profiles, error: pErr } = await client
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);
  if (pErr) throw pErr;
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]));

  // Viewer's likes — single query, then in-memory Set lookup per row.
  // Skipped entirely for anonymous viewers.
  const likedSet = new Set<string>();
  if (viewerId !== null) {
    const commentIds = rows.map(r => r.id);
    const { data: rxRows, error: rxErr } = await client
      .from("activity_comment_reactions")
      .select("comment_id")
      .eq("user_id", viewerId)
      .in("comment_id", commentIds);
    if (rxErr) throw rxErr;
    for (const r of rxRows ?? []) likedSet.add(r.comment_id);
  }

  for (const row of rows) {
    const entry = map.get(row.activity_id);
    if (!entry) continue;
    const p = profileById.get(row.user_id);
    if (!p) continue;
    entry.items.push({
      id: row.id,
      user_id: row.user_id,
      user: { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url },
      body: row.body,
      created_at: row.created_at,
      like_count: row.like_count,
      liked_by_me: likedSet.has(row.id),
    });
    entry.count = entry.items.length;
  }
  return map;
```

- [ ] **Step 3: Update callers**

Run: `cd app && grep -rn "getCommentSummariesForActivities" --include='*.ts' --include='*.tsx'`
Expected: shows the call sites. For each caller, thread the viewer id through. Most likely caller: `app/lib/queries/activity.ts` (the enriched-feed builder). Open it and update the call site to pass `viewerId` (the function probably already has it).

- [ ] **Step 4: Update `_addActivityComment` in `app/lib/actions/activity-comments.ts` to return the two new fields**

A newly-inserted comment has `like_count: 0` and `liked_by_me: false`. In the `return` block of `_addActivityComment`:

```typescript
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
    },
  };
```

- [ ] **Step 5: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run existing comment-related tests**

Run: `cd app && npm test -- tests/queries tests/actions/activity-comments.test.ts`
Expected: PASS (or PASS-with-skip for env-gated). Some tests may need fixture updates — see Task 14 for the catch-all pass.

- [ ] **Step 7: Commit**

```bash
git add app/lib/queries/activity-comments.ts app/lib/actions/activity-comments.ts app/lib/queries/activity.ts
git commit -m "feat(queries): CommentItem.like_count + liked_by_me"
```

---

### Task 8: New component `CommentHeartButton`

**Files:**
- Create: `app/components/CommentHeartButton.tsx`

- [ ] **Step 1: Write the component**

Create `app/components/CommentHeartButton.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { toggleCommentReaction } from "@/lib/actions/comment-reactions";
import { compactCount } from "@/lib/format";
import HeartIcon from "./HeartIcon";

interface Props {
  commentId: string;
  initialCount: number;
  initialLikedByMe: boolean;
  disabled?: boolean;
}

export default function CommentHeartButton({
  commentId,
  initialCount,
  initialLikedByMe,
  disabled = false,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLikedByMe);
  const [pending, startTransition] = useTransition();

  function onTap() {
    if (disabled || pending) return;
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    startTransition(async () => {
      try {
        await toggleCommentReaction(commentId);
      } catch (e) {
        setLiked(prevLiked);
        setCount(prevCount);
        console.error(e);
      }
    });
  }

  return (
    <div className="comment-heart-stack">
      <button
        type="button"
        onClick={onTap}
        disabled={disabled || pending}
        className={`heart-btn ${liked ? "heart-liked" : ""}`}
        aria-label={liked ? "Unlike comment" : "Like comment"}
        aria-pressed={liked}
      >
        <HeartIcon filled={liked} />
      </button>
      <span className="comment-heart-count">{compactCount(count)}</span>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/CommentHeartButton.tsx
git commit -m "feat(components): CommentHeartButton (always-render-count)"
```

---

### Task 9: CSS additions in `app/app/globals.css`

**Files:**
- Modify: `app/app/globals.css`

- [ ] **Step 1: Append the new classes**

Add to the end of `app/app/globals.css`:

```css
/* ===== COMMENT SHEET ===== */

.comment-heart-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 40px;
}
.comment-heart-count {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--muted);
  line-height: 1;
}

.comment-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 0;
}
.comment-row + .comment-row {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.comment-row-body {
  flex: 1;
  min-width: 0;
}
.comment-row-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.comment-row-username {
  font-family: var(--font-ui);
  font-weight: 700;
  color: var(--bone);
  text-decoration: none;
}
.comment-row-time {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--muted);
}
.comment-row-text {
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--bone);
  line-height: 1.35;
  margin-top: 2px;
  word-break: break-word;
}
.comment-row-delete {
  background: none;
  border: 0;
  padding: 0;
  margin-top: 4px;
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
}
.comment-row-delete:hover {
  color: var(--blood);
}

.dot-accent {
  color: var(--accent);
  font-weight: 700;
  line-height: 1;
}

.composer-row {
  display: flex;
  gap: 10px;
  align-items: center;
  border-top: 1px solid var(--muted);
  padding: 12px 0;
  background: transparent;
}
.composer-pill {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--muted);
  border-radius: 999px;
  padding: 8px 14px;
  background: transparent;
}
.composer-pill input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--bone);
  font-family: var(--font-ui);
  font-size: 14px;
  padding: 0;
  min-width: 0;
}
.composer-counter {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}
.composer-counter.over {
  color: var(--accent);
}
.composer-post-link {
  background: none;
  border: 0;
  padding: 0 4px;
  color: var(--accent);
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 13px;
  cursor: not-allowed;
  opacity: 0.55;
}
```

Note: the bottom-sheet panel uses `#141414` background and `var(--bone)` text. The colors above target that surface. The existing `.heart-btn`/`.heart-count` classes already work on dark.

- [ ] **Step 2: Commit**

```bash
git add app/app/globals.css
git commit -m "style(css): comment-row + composer-pill primitives"
```

---

### Task 10: Widen `BottomSheet`'s `title` prop to `string | ReactNode`

**Files:**
- Modify: `app/components/BottomSheet.tsx`

- [ ] **Step 1: Edit the props type**

In `app/components/BottomSheet.tsx`, change:

```typescript
interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}
```

to:

```typescript
interface Props {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
}
```

The `<h2 id={titleId} className="head" style={{ fontSize: 22, margin: 0 }}>{title}</h2>` rendering already accepts ReactNode children — no other change.

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — existing callers pass strings, which is a valid `ReactNode`.

- [ ] **Step 3: Commit**

```bash
git add app/components/BottomSheet.tsx
git commit -m "refactor(components): BottomSheet title accepts ReactNode"
```

---

### Task 11: Restyle `CommentList`

**Files:**
- Modify: `app/components/CommentList.tsx`

- [ ] **Step 1: Rewrite the file**

Replace `app/components/CommentList.tsx` with:

```typescript
"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import CommentHeartButton from "./CommentHeartButton";
import { relativeTime } from "./activity/relativeTime";
import type { CommentItem } from "@/lib/queries/activity-comments";

interface Props {
  items: CommentItem[];
  viewerId: string | null;
  actorUserId: string;
  onDelete: (id: string) => void;
}

export default function CommentList({ items, viewerId, actorUserId, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "24px 0", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", textAlign: "center" }}>
        No comments yet. Be the first.
      </div>
    );
  }
  return (
    <div>
      {items.map(c => {
        const canDelete = viewerId !== null && (viewerId === c.user_id || viewerId === actorUserId);
        return (
          <div key={c.id} className="comment-row">
            <Avatar
              name={c.user.display_name ?? c.user.username}
              color="var(--accent)"
              size={36}
              url={c.user.avatar_url}
            />
            <div className="comment-row-body">
              <div className="comment-row-meta">
                <Link href={`/p/${encodeURIComponent(c.user.username)}`} className="comment-row-username">
                  {c.user.username}
                </Link>
                <span className="comment-row-time">{relativeTime(c.created_at)}</span>
              </div>
              <div className="comment-row-text">{c.body}</div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="comment-row-delete"
                  aria-label="Delete comment"
                >
                  Delete
                </button>
              )}
            </div>
            <CommentHeartButton
              commentId={c.id}
              initialCount={c.like_count}
              initialLikedByMe={c.liked_by_me}
              disabled={viewerId === null}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/CommentList.tsx
git commit -m "feat(components): restyle CommentList — stacked rows, heart column, inline delete"
```

---

### Task 12: Restyle `CommentComposer`

**Files:**
- Modify: `app/components/CommentComposer.tsx`

- [ ] **Step 1: Rewrite the file**

Replace `app/components/CommentComposer.tsx` with:

```typescript
"use client";

import { useState } from "react";
import Avatar from "./Avatar";

const MAX_LEN = 140;

interface Props {
  pending: boolean;
  error: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  onSubmit: (body: string) => void;
}

export default function CommentComposer({
  pending,
  error,
  viewerAvatarUrl,
  viewerDisplayName,
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

  return (
    <div
      className="composer-row"
      style={{ paddingBottom: "env(keyboard-inset-height, 0px)" }}
    >
      {error && (
        <div style={{
          fontSize: 11, color: "var(--blood)", marginBottom: 8,
          fontFamily: "var(--font-serif)", fontStyle: "italic",
        }}>
          {error}
        </div>
      )}
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
          placeholder="Add a comment…"
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
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: TypeScript will complain about callers — `CommentSheet` doesn't pass the new props yet. That's fine — Task 13 wires it.

- [ ] **Step 3: Commit (alongside Task 13 to keep typecheck green)**

Hold this commit until Task 13 is done — combined commit at the end of Task 13.

---

### Task 13: Wire `CommentSheet` to thread `viewerAvatarUrl` + ReactNode title

**Files:**
- Modify: `app/components/CommentSheet.tsx`

- [ ] **Step 1: Update `CommentSheet`**

Replace `app/components/CommentSheet.tsx` with:

```typescript
"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";
import CommentList from "./CommentList";
import CommentComposer from "./CommentComposer";
import { addActivityComment, deleteActivityComment } from "@/lib/actions/activity-comments";
import type { CommentItem } from "@/lib/queries/activity-comments";

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

  function postComment(body: string) {
    if (!viewerId) return;
    setError(null);
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: CommentItem = {
      id: tempId,
      user_id: viewerId,
      user: { username: "...", display_name: null, avatar_url: viewerAvatarUrl },
      body,
      created_at: new Date().toISOString(),
      like_count: 0,
      liked_by_me: false,
    };
    setItems(prev => {
      const next = [...prev, optimistic];
      onCountChange(next.length);
      return next;
    });
    startTransition(async () => {
      const result = await addActivityComment(activityId, body);
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
      const next = p.filter(c => c.id !== id);
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
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "70dvh" }}>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <CommentList
            items={items}
            viewerId={viewerId}
            actorUserId={actorUserId}
            onDelete={removeComment}
          />
        </div>
        {viewerId !== null ? (
          <CommentComposer
            pending={pending}
            error={error}
            viewerAvatarUrl={viewerAvatarUrl}
            viewerDisplayName={viewerDisplayName}
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

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: TypeScript will complain about `ActivityFooter` not passing the new props. Task 14 wires that.

- [ ] **Step 3: Commit Tasks 12 + 13 together**

```bash
git add app/components/CommentComposer.tsx app/components/CommentSheet.tsx
git commit -m "feat(components): restyle CommentSheet header + composer; thread viewer avatar"
```

---

### Task 14: Wire `ActivityFooter` to fetch viewer profile + pass through

**Files:**
- Modify: `app/components/activity/ActivityFooter.tsx`

- [ ] **Step 1: Extend the viewer fetch to include avatar + display_name**

Replace `app/components/activity/ActivityFooter.tsx` with:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import CommentButton from "../CommentButton";
import CommentSheet from "../CommentSheet";
import { relativeTime } from "./relativeTime";
import { createClient } from "@/lib/supabase/client";

interface Props {
  item: EnrichedActivity;
}

interface ViewerProfile {
  id: string;
  avatar_url: string | null;
  display_name: string | null;
}

export default function ActivityFooter({ item }: Props) {
  const params = useSearchParams();
  const focusedId = params?.get("activity");
  const [count, setCount] = useState(item.comments.count);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerProfile | null>(null);

  useEffect(() => {
    const c = createClient();
    c.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id ?? null;
      if (!uid) {
        setViewer(null);
        return;
      }
      const { data: prof } = await c
        .from("profiles")
        .select("id, avatar_url, display_name")
        .eq("id", uid)
        .single();
      setViewer(prof ?? { id: uid, avatar_url: null, display_name: null });
    });
  }, []);

  useEffect(() => {
    if (focusedId && focusedId === item.id) setSheetOpen(true);
  }, [focusedId, item.id]);

  return (
    <>
      <div className="activity-footer">
        <span className="activity-footer-time" style={{ fontFamily: "var(--font-ui)", color: "var(--muted)" }}>{relativeTime(item.created_at)}</span>
        <CommentButton count={count} open={sheetOpen} onOpen={() => setSheetOpen(true)} />
        <HeartButton
          activityId={item.id}
          initialCount={item.reactions.count}
          initialLikedByMe={item.reactions.likedByMe}
        />
      </div>
      <CommentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        activityId={item.id}
        actorUserId={item.actor.id}
        viewerId={viewer?.id ?? null}
        viewerAvatarUrl={viewer?.avatar_url ?? null}
        viewerDisplayName={viewer?.display_name ?? null}
        initialItems={item.comments.items}
        onCountChange={setCount}
      />
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/activity/ActivityFooter.tsx
git commit -m "feat(activity): fetch viewer avatar/display_name for CommentSheet"
```

---

### Task 15: Update existing tests for new `CommentItem` fields

**Files:**
- Modify: `app/tests/queries/group-activity.test.ts` (and any other test that asserts `CommentItem` shape)

- [ ] **Step 1: Locate fixtures touching `CommentItem`**

Run: `cd app && grep -rn "CommentItem\|comments.items" tests/ --include='*.ts' --include='*.tsx'`
Expected: lists the call sites. Most likely: `tests/queries/group-activity.test.ts`, possibly others under `tests/queries`.

- [ ] **Step 2: Add the two new fields to test fixtures**

For each fixture that constructs a `CommentItem` literal, add:

```typescript
like_count: 0,
liked_by_me: false,
```

If the fixture asserts the full shape via `toEqual`, also update the expected object.

- [ ] **Step 3: Update `getCommentSummariesForActivities` callers in tests**

Run: `cd app && grep -rn "getCommentSummariesForActivities" tests/`
For each caller, pass `null` (or a test viewer id) as the third argument.

- [ ] **Step 4: Run the full test suite**

Run: `cd app && npm test`
Expected: PASS (env-skipIf may skip a few; all non-skipped tests pass).

- [ ] **Step 5: Commit**

```bash
git add app/tests
git commit -m "test: extend CommentItem fixtures for like_count + liked_by_me"
```

---

### Task 16: Apply migration to local Supabase + manually smoke-test in dev

**Files:** none.

- [ ] **Step 1: Apply migration to local DB**

Run from repo root: `set -a; source app/.env.local; set +a; cd db && npm run migrate`
Expected: applies `0147_activity_comment_reactions.sql`, prints "applied".

- [ ] **Step 2: Start the dev server**

Run: `cd app && npm run dev`
Expected: dev server up at http://localhost:3000.

- [ ] **Step 3: Manual smoke test on `/home`**

Open `/home` in a browser logged in as a real user. Find any activity row and click the comment icon. Confirm:

- Bottom sheet opens. Header reads `Comments • N` with the `•` in pink.
- Comment rows render with 36px avatars, username + timestamp on first line, body underneath, and a heart + count column on the right.
- Tap an unliked heart on someone else's comment — heart fills, count goes up by 1.
- Reload the page — like state persists.
- Tap again — heart unfills, count goes down.
- Post a new comment — appears in list with `0` likes and an outline heart.
- Composer shows your avatar to the left of a rounded pill input. The `0/140` counter sits inside the pill on the right. The `Post` button is muted/disabled-looking until you type something, then becomes a solid pink pill.
- For a comment you authored: `Delete` text-link appears under the body. Tapping it removes the comment.
- Sign out → reload → open the sheet on a row with comments. Hearts render disabled, "Sign in to comment" replaces the composer.

- [ ] **Step 4: Stop the dev server**

Ctrl+C in the terminal running `npm run dev`.

- [ ] **Step 5: No commit needed.** Manual verification only.

---

### Task 17: Update CLAUDE.md "Current state" + final PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current state"**

Edit `CLAUDE.md`'s "Current state" section. Append a new sub-project entry to the table:

```markdown
| 25 | Comment sheet polish + likes — mig 0147 (`activity_comment_reactions` + `like_count` on `activity_comments`). New `toggleCommentReaction` action mirrors `toggleReaction`. New `CommentHeartButton`, restyled `CommentList` (36px avatars, stacked username/body, inline Delete link, heart column), restyled `CommentComposer` (viewer avatar + rounded-pill input + inline counter + smart Post). `BottomSheet.title` widened to ReactNode. `HeartIcon` extracted to shared component. | (no spec separate — see plan + spec files) |
```

Update the Open Threads to add: "**Sub-project #25 deferred follow-ups:** threaded comment replies + 'Reply'/'View N replies' UI; emoji quick-react strip above composer; send-icon header variant (proto 2); `LikersBottomSheet` for comment likes; notification kind `like_on_comment`."

- [ ] **Step 2: Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note sub-project #25 — comment polish + likes"
```

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feature/comment-sheet-polish-and-likes
```

Then run:

```bash
gh pr create --title "feat: comment sheet polish + likes on comments" --body "$(cat <<'EOF'
## Summary

- Mig 0147 adds `activity_comment_reactions` (composite PK `(user_id, comment_id)`) + `like_count` on `activity_comments` maintained via trigger.
- `toggleCommentReaction(commentId)` server action; mirrors `toggleReaction`.
- Restyled `CommentSheet` to match prototype 1: serif "Comments" + pink-dot separator + count, 36px avatars, stacked username/timestamp/body, heart-and-count column on the right, inline muted "Delete" text-link for owners/authors, viewer-avatar + rounded-pill composer with inline `N/140` counter and smart Post button.
- `BottomSheet.title` widened to `ReactNode`. `HeartIcon` SVG extracted to shared component.
- Threaded replies, emoji quick-react strip, send-icon header variant, comment-likers sheet, and `like_on_comment` notification are deferred (tracked in CLAUDE.md).

## Test plan
- [ ] `cd db && npm test` passes (pg-mem smoke includes mig 0147).
- [ ] `cd db && npm run test:rls` passes (new RLS test asserts insert/delete policies + trigger arithmetic + cascade).
- [ ] `cd app && npm run typecheck` passes.
- [ ] `cd app && npm test` passes (action test skipped without env, smoke for `CommentItem` shape elsewhere).
- [ ] Local dev: open a comment sheet, like/unlike, post, delete, verify counts persist.
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**

- Database migration `0147` → Task 1.
- RLS + trigger tests → Task 2.
- `types.ts` hand-edit → Task 3.
- `comment-reactions.ts` action → Task 4.
- Action integration test → Task 5.
- `HeartIcon` extraction → Task 6.
- `CommentItem` extension + viewer-likes query → Task 7.
- `CommentHeartButton` component → Task 8.
- CSS additions → Task 9.
- `BottomSheet` type widening → Task 10.
- `CommentList` restyle → Task 11.
- `CommentComposer` restyle → Task 12.
- `CommentSheet` (title + viewer threading) → Task 13.
- `ActivityFooter` viewer profile fetch → Task 14.
- Existing test fixtures → Task 15.
- Manual smoke → Task 16.
- CLAUDE.md + PR → Task 17.

All spec sections covered.

**2. Placeholder scan:** no "TBD" or "TODO" markers; every code block contains the actual code.

**3. Type consistency:**
- `CommentItem.like_count: number` and `liked_by_me: boolean` — used identically in Task 7, Task 8, Task 11, Task 13.
- `viewerAvatarUrl: string | null` and `viewerDisplayName: string | null` — used identically in Task 12, Task 13, Task 14.
- `toggleCommentReaction(commentId)` — Task 4 declares, Task 8 uses.
- Trigger function name `acr_bump_count` consistent in mig + RLS test.
- Migration number `0147` consistent across Task 1, Task 16, Task 17, and the spec.
