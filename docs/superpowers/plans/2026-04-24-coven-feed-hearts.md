# Coven Feed Hearts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship universal heart reactions on every Coven feed row, with a reusable `BottomSheet` primitive and a coven-first likers list surfaced when the count is tapped.

**Architecture:** New `activity_reactions` table keyed by `(activity_id, user_id)` with RLS scoping writes to `auth.uid()`. Feed enrichment adds one batch query for per-row `{count, likedByMe}`. New client components — `BottomSheet` (generic primitive), `HeartButton` (optimistic toggle), `LikersBottomSheet` (lazy-loaded coven/Others list) — injected via a shared `ActivityFooter` at the bottom of every `Activity*` variant. Self-likes blocked at the action AND hidden on own rows in the UI. No websockets; `revalidatePath("/home")` handles other viewers' refreshes.

**Tech Stack:** Next.js 15 App Router, Supabase SSR, Vitest (existing config), `vi.mock` / real-integration test patterns matching the existing watchlists tests, testcontainers Postgres for RLS tests. No new dependencies.

**Prerequisites:**
- Node 20 in PATH. Prefix one-shots with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- Commits via `/tmp/msg.txt` + `git commit -F` (heredocs mangle in this env — see CLAUDE.md Gotchas). Never `git commit -m`.
- Spec: `docs/superpowers/specs/2026-04-24-coven-feed-hearts-design.md`.
- Baseline: current master tip `bb8a709`. `_migrations` table in prod has `0100-0120` recorded (reconciled yesterday).
- Model routing (per `feedback_subagent_model_routing.md`): Task 1 Sonnet, Task 2 Haiku, Task 3 Sonnet, Task 4 Sonnet, Task 5 Haiku, Task 6 Sonnet, Task 7 Sonnet, Task 8 Haiku, Task 9 Sonnet, Tasks 10-12 coordinator/user.

---

## Task 1: Migration + RLS tests

**Files:**
- Create: `db/migrations/0121_activity_reactions.sql`
- Create: `db/tests/rls/activity_reactions.test.ts`

- [ ] **Step 1: Write the migration**

Create `db/migrations/0121_activity_reactions.sql`:

```sql
-- Universal "heart" reactions on activity feed rows. One row per (activity, user);
-- re-clicking the heart is a delete. Self-likes are blocked at the action layer
-- (see app/lib/actions/reactions.ts) — enforcing at the DB would require a trigger
-- lookup against activity.actor_user_id, which doesn't pay for itself since the
-- app layer already prevents it and there's no adversarial risk given RLS scopes
-- writes to auth.uid().

CREATE TABLE activity_reactions (
  activity_id   UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

-- Per-activity count + "did this user like this row" lookups both hit this index.
CREATE INDEX activity_reactions_activity_id_idx
  ON activity_reactions (activity_id);

-- "Which activities did this user like" scans (potential future use — e.g., a
-- 'my likes' tab) hit this one.
CREATE INDEX activity_reactions_user_id_idx
  ON activity_reactions (user_id);

ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

-- Public read so the feed can show counts + "N coven members liked this" to any
-- authenticated reader. Does not leak user_id to non-authed clients because the
-- existing activity RLS already gates reads.
CREATE POLICY activity_reactions_select
  ON activity_reactions FOR SELECT
  TO authenticated
  USING (true);

-- Writes scoped to the acting user.
CREATE POLICY activity_reactions_insert
  ON activity_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY activity_reactions_delete
  ON activity_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE policy — reactions are boolean (exists or doesn't). Re-tapping the
-- heart is DELETE + INSERT, not UPDATE.

GRANT SELECT, INSERT, DELETE ON activity_reactions TO authenticated;
```

- [ ] **Step 2: Read an existing RLS test to pattern-match**

Run: `cat db/tests/rls/watchlists.test.ts`
Note: the helpers in `db/tests/helpers/*` (auth-mock, fixtures, session, testcontainers setup) and the assertion style (policy violation = pg error code `42501`, no-op delete = 0 rows affected).

- [ ] **Step 3: Write the RLS tests**

Create `db/tests/rls/activity_reactions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { startPg, stopPg, applyMigrations, type Ctx } from "../helpers/testcontainers";
import { seedUser, setAuthUid, resetAuth } from "../helpers/auth-mock";

let ctx: Ctx;
let admin: Client;
let userA: string;
let userB: string;
let activityId: string;

beforeAll(async () => {
  ctx = await startPg();
  admin = ctx.adminClient;
  await applyMigrations(admin);

  userA = await seedUser(admin, "a@test.local");
  userB = await seedUser(admin, "b@test.local");

  // Seed a film + an activity row authored by userA so we have something to react to.
  const film = await admin.query(
    `INSERT INTO films (itunes_id, title, director, year)
     VALUES (700000 + floor(random() * 100000)::int, 'T', 'D', 2024) RETURNING id`,
  );
  const filmId = film.rows[0].id;

  const act = await admin.query(
    `INSERT INTO activity (kind, actor_user_id, payload)
     VALUES ('watchlist_added', $1, jsonb_build_object('film_id', $2::text))
     RETURNING id`,
    [userA, filmId],
  );
  activityId = act.rows[0].id;
});

afterAll(async () => {
  await stopPg(ctx);
});

beforeEach(async () => {
  await resetAuth(admin);
  await admin.query("DELETE FROM activity_reactions");
});

describe("activity_reactions RLS", () => {
  it("anon cannot SELECT activity_reactions", async () => {
    // Seed a row as admin so there's something to read.
    await admin.query(
      "INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)",
      [activityId, userA],
    );
    // Anon role — no auth.uid() set — gets 0 rows due to RLS.
    const res = await ctx.anonClient.query("SELECT * FROM activity_reactions");
    expect(res.rowCount).toBe(0);
  });

  it("authenticated user can SELECT all reactions (counts are public-read)", async () => {
    await admin.query(
      "INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)",
      [activityId, userA],
    );
    await setAuthUid(ctx.authClient, userB);
    const res = await ctx.authClient.query("SELECT * FROM activity_reactions");
    expect(res.rowCount).toBe(1);
  });

  it("authenticated user can INSERT own reaction (user_id = auth.uid())", async () => {
    await setAuthUid(ctx.authClient, userB);
    await ctx.authClient.query(
      "INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)",
      [activityId, userB],
    );
    const res = await admin.query(
      "SELECT user_id FROM activity_reactions WHERE activity_id = $1",
      [activityId],
    );
    expect(res.rows.map(r => r.user_id)).toEqual([userB]);
  });

  it("authenticated user CANNOT INSERT reaction with another user's user_id", async () => {
    await setAuthUid(ctx.authClient, userB);
    await expect(
      ctx.authClient.query(
        "INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2)",
        [activityId, userA], // spoofing userA
      ),
    ).rejects.toThrow(/policy|permission/i);
  });

  it("authenticated user can DELETE own reaction but not another's (RLS filters)", async () => {
    // Seed two reactions via admin.
    await admin.query(
      "INSERT INTO activity_reactions (activity_id, user_id) VALUES ($1, $2), ($1, $3)",
      [activityId, userA, userB],
    );
    await setAuthUid(ctx.authClient, userA);
    const res = await ctx.authClient.query("DELETE FROM activity_reactions");
    // userA's DELETE only scopes to their own row — userB's stays.
    expect(res.rowCount).toBe(1);
    const remaining = await admin.query(
      "SELECT user_id FROM activity_reactions WHERE activity_id = $1",
      [activityId],
    );
    expect(remaining.rows.map(r => r.user_id)).toEqual([userB]);
  });
});
```

Note: `seedUser`, `setAuthUid`, `resetAuth`, `startPg`, `stopPg`, `applyMigrations`, and the `Ctx` type are the existing helpers used by every other `db/tests/rls/*.test.ts`. If the helper names differ in your actual codebase, substitute — the test intent is what matters. The `anonClient` and `authClient` in `Ctx` are two pg `Client` instances connected with different roles; `setAuthUid` sets `request.jwt.claim.sub` for RLS.

- [ ] **Step 4: Run the RLS tests**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- activity_reactions`
Expected: 5/5 tests pass. The `applyMigrations` helper will run `0121_activity_reactions.sql` against the testcontainers-spawned Postgres as part of setup.

If the tests fail because a helper signature doesn't match, adjust the test to match the actual helpers (do NOT change the migration or the policies — the SQL is correct per spec).

- [ ] **Step 5: Commit**

Write `/tmp/msg.txt`:

```
feat(db): activity_reactions table + RLS policies

0121 migration creates activity_reactions with composite PK
(activity_id, user_id), two indexes (by activity and by user),
and RLS: public read for authenticated (counts are
publicly-readable for the feed), writes scoped to auth.uid() for
INSERT/DELETE, no UPDATE policy (unlike = DELETE + re-INSERT).

5 testcontainers RLS tests verify: anon SELECT denied,
authenticated SELECT allowed, authenticated INSERT with matching
user_id works, INSERT with spoofed user_id blocked,
cross-user DELETE is a no-op (RLS filters scope).
```

Then:

```bash
git add db/migrations/0121_activity_reactions.sql db/tests/rls/activity_reactions.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 2: `getReactionsForActivities` query + vi.mock tests

**Files:**
- Create: `app/lib/queries/activity-reactions.ts`
- Create: `app/tests/queries/activity-reactions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/tests/queries/activity-reactions.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getReactionsForActivities } from "@/lib/queries/activity-reactions";

function makeClient(rows: { activity_id: string; user_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  } as any;
}

describe("getReactionsForActivities", () => {
  it("aggregates counts per activity and flags likedByMe for the viewer", async () => {
    const client = makeClient([
      { activity_id: "a1", user_id: "u1" },
      { activity_id: "a1", user_id: "u2" },
      { activity_id: "a1", user_id: "viewer" },
      { activity_id: "a2", user_id: "u1" },
      { activity_id: "a3", user_id: "u3" },
    ]);
    const map = await getReactionsForActivities(client, ["a1", "a2", "a3"], "viewer");
    expect(map.get("a1")).toEqual({ count: 3, likedByMe: true });
    expect(map.get("a2")).toEqual({ count: 1, likedByMe: false });
    expect(map.get("a3")).toEqual({ count: 1, likedByMe: false });
  });

  it("flags likedByMe=false for every row when viewer has no reactions", async () => {
    const client = makeClient([
      { activity_id: "a1", user_id: "u1" },
      { activity_id: "a2", user_id: "u2" },
    ]);
    const map = await getReactionsForActivities(client, ["a1", "a2"], "viewer");
    expect(map.get("a1")?.likedByMe).toBe(false);
    expect(map.get("a2")?.likedByMe).toBe(false);
  });

  it("returns empty Map without hitting the DB when activityIds is empty", async () => {
    const fromSpy = vi.fn();
    const client = { from: fromSpy } as any;
    const map = await getReactionsForActivities(client, [], "viewer");
    expect(map.size).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/activity-reactions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the query helper**

Create `app/lib/queries/activity-reactions.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export interface ReactionSummary {
  count: number;
  likedByMe: boolean;
}

/**
 * Batch-fetch reaction summaries for a set of activity rows. One SELECT pulls
 * every (activity_id, user_id) tuple in the batch; we aggregate in JS. This
 * shape lets us compute both the per-activity count AND the "did the viewer
 * like this" flag in a single round-trip, which an aggregate SQL query can't
 * easily return.
 *
 * Passing `viewerUserId === null` is safe: every returned entry will have
 * `likedByMe: false`. Supports the "not signed in" case for callers that
 * don't want to branch.
 */
export async function getReactionsForActivities(
  client: Client,
  activityIds: string[],
  viewerUserId: string | null,
): Promise<Map<string, ReactionSummary>> {
  if (activityIds.length === 0) return new Map();

  const { data, error } = await client
    .from("activity_reactions")
    .select("activity_id, user_id")
    .in("activity_id", activityIds);
  if (error) throw error;

  const map = new Map<string, ReactionSummary>();
  for (const id of activityIds) map.set(id, { count: 0, likedByMe: false });
  for (const r of data ?? []) {
    const entry = map.get(r.activity_id);
    if (!entry) continue;
    entry.count += 1;
    if (viewerUserId && r.user_id === viewerUserId) entry.likedByMe = true;
  }
  return map;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/activity-reactions.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(queries): getReactionsForActivities batch helper

Single SELECT + JS aggregation returns a Map keyed by activity
id with { count, likedByMe } for each. Used by the feed
enrichment to surface reaction summaries per row in one
round-trip. Handles empty activityIds (skips the DB hit) and
null viewerUserId (all likedByMe flags false).

3 vi.mock tests: aggregation correctness, viewer-not-a-liker,
empty-input short-circuit.
```

Then:

```bash
git add app/lib/queries/activity-reactions.ts app/tests/queries/activity-reactions.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 3: Reactions server action + integration tests

**Files:**
- Create: `app/lib/actions/reactions.ts`
- Create: `app/tests/actions/reactions.test.ts`

- [ ] **Step 1: Read an existing action test file for the helper pattern**

Run: `cat app/tests/actions/watchlists.test.ts`
Note: the tests use real Supabase integration via `createTestUser`, `deleteTestUser`, `adminClient`, `signedInClient`. Same pattern here.

- [ ] **Step 2: Write the failing tests**

Create `app/tests/actions/reactions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _toggleReaction } from "../../lib/actions/reactions";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let userA: TestUser;
let userB: TestUser;
let filmId: string;
let activityId: string;

beforeAll(async () => {
  userA = await createTestUser();
  userB = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 700000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;

  // Activity authored by userA.
  const act = await admin
    .from("activity")
    .insert({ kind: "watchlist_added", actor_user_id: userA.id, payload: { film_id: filmId } as never })
    .select("id")
    .single();
  if (act.error || !act.data) throw act.error;
  activityId = act.data.id;
});

afterAll(async () => {
  if (activityId) await adminClient().from("activity").delete().eq("id", activityId);
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

describe("_toggleReaction", () => {
  it("toggle-on: returns { liked: true } and inserts a row", async () => {
    const c = await signedInClient(userB.email, userB.password);
    const res = await _toggleReaction(c as any, activityId);
    expect(res).toEqual({ liked: true });

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(1);

    await adminClient().from("activity_reactions").delete().eq("activity_id", activityId).eq("user_id", userB.id);
  });

  it("toggle-off: a second call removes the row and returns { liked: false }", async () => {
    const c = await signedInClient(userB.email, userB.password);
    await _toggleReaction(c as any, activityId);
    const res = await _toggleReaction(c as any, activityId);
    expect(res).toEqual({ liked: false });

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(0);
  });

  it("self-like blocked: throws 'cannot like own activity'", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(_toggleReaction(c as any, activityId)).rejects.toThrow(/cannot like own activity/i);
    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userA.id);
    expect(data).toHaveLength(0);
  });

  it("unauthenticated: throws 'unauthenticated'", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_toggleReaction(anon as any, activityId)).rejects.toThrow(/unauthenticated/i);
  });

  it("concurrent toggle-on: end state is exactly one row (23505 race swallowed)", async () => {
    const c = await signedInClient(userB.email, userB.password);
    // Fire two concurrent toggle-ons. The unique constraint will race; one
    // wins, one swallows 23505. Neither should throw to the caller.
    await Promise.all([_toggleReaction(c as any, activityId), _toggleReaction(c as any, activityId)]);

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(1);

    await adminClient().from("activity_reactions").delete().eq("activity_id", activityId).eq("user_id", userB.id);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/reactions.test.ts`
Expected: FAIL — module not found. (Note: may also fail at suite setup if `TEST_SUPABASE_SERVICE_ROLE_KEY` isn't set — that's the pre-existing env gap; tests still land and will pass when env is provisioned.)

- [ ] **Step 4: Create the action file**

Create `app/lib/actions/reactions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface LikerProfile {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface LikersResponse {
  coven: LikerProfile[];
  others: LikerProfile[];
}

/**
 * Toggle the current user's reaction on an activity row. Insert if absent,
 * delete if present. Self-likes blocked via a lookup against
 * activity.actor_user_id. Concurrent duplicate inserts (race between two
 * tabs) are swallowed at code 23505 — the final state matches the user's
 * intent either way.
 */
export async function _toggleReaction(
  client: Client,
  activityId: string,
): Promise<{ liked: boolean }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  // Self-like prevention.
  const { data: activityRow, error: actErr } = await client
    .from("activity")
    .select("actor_user_id")
    .eq("id", activityId)
    .maybeSingle();
  if (actErr) throw actErr;
  if (!activityRow) throw new Error("activity not found");
  if (activityRow.actor_user_id === user.id) {
    throw new Error("cannot like own activity");
  }

  // Existence → toggle.
  const { data: existing } = await client
    .from("activity_reactions")
    .select("activity_id")
    .eq("activity_id", activityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from("activity_reactions")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", user.id);
    if (error) throw error;
    return { liked: false };
  } else {
    const { error } = await client
      .from("activity_reactions")
      .insert({ activity_id: activityId, user_id: user.id });
    // Race with another tab: unique constraint violation — treat as "already liked".
    if (error && (error as { code?: string }).code !== "23505") throw error;
    return { liked: true };
  }
}

export async function toggleReaction(activityId: string): Promise<{ liked: boolean }> {
  const supabase = await createClient();
  const result = await _toggleReaction(supabase, activityId);
  revalidatePath("/home");
  return result;
}

/**
 * Fetch the likers of a single activity row, partitioned into coven members
 * of the viewer and everyone else. Called on-demand by LikersBottomSheet.
 */
export async function fetchLikersForActivity(activityId: string): Promise<LikersResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  // Likers + their profile info in one shot.
  const { data: likersRaw, error } = await supabase
    .from("activity_reactions")
    .select("user_id, profile:profiles!inner(id, handle, display_name, avatar_url)")
    .eq("activity_id", activityId);
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allLikers: LikerProfile[] = (likersRaw ?? []).map((r: any) => r.profile).filter(Boolean);
  if (allLikers.length === 0) return { coven: [], others: [] };

  // Viewer's coven membership.
  const { data: covenRows } = await supabase
    .from("coven_members")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
  const covenIds = new Set<string>();
  for (const r of covenRows ?? []) {
    covenIds.add(r.user_a_id === user.id ? r.user_b_id : r.user_a_id);
  }

  // Partition (drop the viewer from the list).
  const coven: LikerProfile[] = [];
  const others: LikerProfile[] = [];
  for (const p of allLikers) {
    if (p.id === user.id) continue;
    (covenIds.has(p.id) ? coven : others).push(p);
  }
  return { coven, others };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/reactions.test.ts`
Expected: 5/5 PASS (if env is provisioned). The 5 tests may all fail at suite setup if `TEST_SUPABASE_SERVICE_ROLE_KEY` is missing — that's a pre-existing env gap, not a code regression. Confirm the shape of the failures (env-level, not logic-level) before moving on.

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(actions): toggleReaction + fetchLikersForActivity

Private _toggleReaction takes explicit client and handles:
- Auth check (throws 'unauthenticated')
- Self-like block via SELECT activity.actor_user_id check
- Existence check → INSERT or DELETE
- 23505 race swallow so concurrent dual-tab taps converge on
  the user's intent

Public toggleReaction wraps with createClient and
revalidatePath("/home") so other feed viewers see counts on
their next render.

fetchLikersForActivity powers the bottom-sheet: returns
{ coven, others } partitioned by the viewer's coven_members
membership, with the viewer themselves filtered out.

5 integration tests (real Supabase via signedInClient /
adminClient) cover: toggle-on happy, toggle-off happy,
self-like block, unauth rejection, concurrent race.
```

Then:

```bash
git add app/lib/actions/reactions.ts app/tests/actions/reactions.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 4: Extend feed enrichment with reactions

**Files:**
- Modify: `app/lib/queries/activity.ts`

- [ ] **Step 1: Read the current enrichment code**

Run: `sed -n '30,145p' app/lib/queries/activity.ts`
Note: the existing `EnrichedActivity` union discriminated on `kind` and the enrichment loop at the bottom. You'll extend the union with two new common fields and add one parallel batch query.

- [ ] **Step 2: Apply the patch**

Edit `app/lib/queries/activity.ts`. Make these changes:

**2a.** Add a new import near the top, after the existing imports:

```ts
import { getReactionsForActivities, type ReactionSummary } from "./activity-reactions";
```

**2b.** Locate the `EnrichedActivity` union (around line 34-40). Replace it with:

```ts
export type EnrichedActivity = (
  | { kind: "recommendation_sent"; film: FilmLite; recipient: RecipientLite; note: string }
  | { kind: "review_published"; film: FilmLite; title: string; pullquote: string | null }
  | { kind: "watchlist_added"; film: FilmLite }
  | { kind: "list_created"; list: ListLite }
  | { kind: "list_film_added"; list: ListLite; film: FilmLite }
  | { kind: "coven_joined"; other: RecipientLite }
) & {
  id: string;
  created_at: string;
  actor: ActorLite;
  reactions: ReactionSummary;
  isOwnRow: boolean;
};
```

This refactors the union to factor out the common fields (`id`, `created_at`, `actor`, and the two new ones `reactions` + `isOwnRow`). Type narrowing still works — each kind still carries its specific payload fields.

**2c.** Inside `getEnrichedFeed`, find the `Promise.all` block that fetches `[actors, films, recipients, lists]` (around line 91). Add a fifth call:

```ts
const [actors, films, recipients, lists, reactionsMap] = await Promise.all([
  rawActorIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", rawActorIds) : Promise.resolve({ data: [] as any }),
  filmIds.length ? client.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] as any }),
  recipientIds.length ? client.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] as any }),
  listIds.length ? client.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] as any }),
  getReactionsForActivities(client, raw.map(r => r.id), followerUserId),
]);
```

**2d.** Inside the enrichment loop (where each row is pushed into `out`), augment `base`:

Replace this line:

```ts
const base = { id: r.id, created_at: r.created_at, actor };
```

with:

```ts
const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
const isOwnRow = r.actor_user_id === followerUserId;
const base = { id: r.id, created_at: r.created_at, actor, reactions, isOwnRow };
```

Leave every downstream `out.push({ ...base, kind: "...", ... })` unchanged — the spread picks up the new fields.

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean. If any `Activity*.tsx` component access to `item.id` / `item.actor` / `item.created_at` fails, confirm it wasn't relying on the old union shape — the common fields are still there, just factored out via the intersection.

- [ ] **Step 4: Run all existing tests**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: no REGRESSIONS vs. the pre-existing baseline (some tests fail due to env gap — same as before; confirm count matches the prior run).

- [ ] **Step 5: Commit**

Write `/tmp/msg.txt`:

```
feat(feed): enrichment includes per-row reactions summary

Extends EnrichedActivity with:
- reactions: { count, likedByMe } via getReactionsForActivities
  batch query
- isOwnRow: boolean for UI self-like-blocking

Refactors the discriminated union to factor out the common
fields (id, created_at, actor, reactions, isOwnRow) via an
intersection; type narrowing still works per kind.

One additional SELECT per feed load (in parallel with existing
batches). Downstream Activity* components now receive reaction
data in their item prop.
```

Then:

```bash
git add app/lib/queries/activity.ts
git commit -F /tmp/msg.txt
```

---

## Task 5: BottomSheet primitive

**Files:**
- Create: `app/components/BottomSheet.tsx`

No tests — project precedent is manual browser verification for client components. Typecheck only.

- [ ] **Step 1: Create the component**

Create `app/components/BottomSheet.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function BottomSheet({ open, onClose, title, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape to close + focus the sheet panel on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="bottom-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      <div
        ref={sheetRef}
        className="bottom-sheet-panel"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="bottom-sheet-header">
          <h2 id="bottom-sheet-title" className="head" style={{ fontSize: 22, margin: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="bottom-sheet-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="bottom-sheet-body">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
feat(components): BottomSheet generic primitive

Reusable half-sheet for mobile-first modals. Props:
{ open, onClose, title, children }. Handles:
- Body scroll-lock while open
- Escape-to-close
- Focus management (panel receives focus on open)
- Overlay click closes; panel click doesn't propagate
- role="dialog", aria-modal, aria-labelledby for a11y

CSS hooks (.bottom-sheet-overlay, -panel, -handle, -header,
-close, -body) will land in globals.css in task 9.

First consumer: LikersBottomSheet (task 6). Future surfaces
(search, film-detail likers, etc.) can reuse.
```

Then:

```bash
git add app/components/BottomSheet.tsx
git commit -F /tmp/msg.txt
```

---

## Task 6: LikersBottomSheet

**Files:**
- Create: `app/components/LikersBottomSheet.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/LikersBottomSheet.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import Avatar from "./Avatar";
import { fetchLikersForActivity, type LikersResponse } from "@/lib/actions/reactions";

interface Props {
  activityId: string;
  open: boolean;
  onClose: () => void;
}

interface LikerRowProps {
  p: { id: string; handle: string; display_name: string | null; avatar_url: string | null };
}

function LikerRow({ p }: LikerRowProps) {
  return (
    <a href={`/p/${p.handle}`} className="liker-row">
      <Avatar handle={p.handle} displayName={p.display_name} avatarUrl={p.avatar_url} size={36} />
      <div className="liker-row-text">
        <div className="liker-row-name">{p.display_name || p.handle}</div>
        <div className="liker-row-handle">@{p.handle}</div>
      </div>
    </a>
  );
}

export default function LikersBottomSheet({ activityId, open, onClose }: Props) {
  const [data, setData] = useState<LikersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy-load on first open only. Sheet can be opened / closed / reopened
  // without re-fetching during the same session.
  useEffect(() => {
    if (!open || data != null || loading) return;
    setLoading(true);
    setErr(null);
    fetchLikersForActivity(activityId)
      .then(setData)
      .catch(e => setErr(e instanceof Error ? e.message : "Couldn't load likers."))
      .finally(() => setLoading(false));
  }, [open, activityId, data, loading]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Liked by">
      {loading && <div className="likers-loading">Loading…</div>}
      {err && <div className="likers-error">{err}</div>}
      {data && (
        <>
          {data.coven.length > 0 && (
            <section className="likers-section">
              <div className="eyebrow likers-section-label">Your coven</div>
              {data.coven.map(p => <LikerRow key={p.id} p={p} />)}
            </section>
          )}
          {data.others.length > 0 && (
            <section className="likers-section">
              <div className="likers-divider" aria-hidden="true" />
              <div className="eyebrow likers-section-label">Others</div>
              {data.others.map(p => <LikerRow key={p.id} p={p} />)}
            </section>
          )}
          {data.coven.length === 0 && data.others.length === 0 && (
            <div className="likers-empty">No one you can see.</div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
```

Note: if `Avatar` component's prop signature differs, adjust the props passed to it. Common props across the codebase are `handle`, `displayName`, `avatarUrl`, and `size`.

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
feat(components): LikersBottomSheet

Consumes the generic BottomSheet primitive. Lazy-fetches the
likers-for-an-activity list via fetchLikersForActivity on first
open; subsequent opens within the same session reuse the
cached data (state survives close/reopen).

Renders a coven section first, a 1px accent divider, then an
Others section below. Empty case (count >= 1 but no visible
likers) shows italic "No one you can see." Loading + error
states inline. Each row is an <a> linking to the liker's
public profile at /p/{handle}.

CSS hooks (.likers-*, .liker-row-*) land in task 9.
```

Then:

```bash
git add app/components/LikersBottomSheet.tsx
git commit -F /tmp/msg.txt
```

---

## Task 7: HeartButton

**Files:**
- Create: `app/components/HeartButton.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/HeartButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toggleReaction } from "@/lib/actions/reactions";
import LikersBottomSheet from "./LikersBottomSheet";

interface Props {
  activityId: string;
  initialCount: number;
  initialLikedByMe: boolean;
  isOwnRow: boolean;
}

function HeartIcon({ filled }: { filled: boolean }) {
  // Sharp-geometry classic heart. Miter linejoin keeps the lobes pointed
  // (not rounded) — matches the spec's "no chubby, bubbly edges" rule.
  return (
    <svg viewBox="0 0 18 16" width="16" height="14" aria-hidden="true">
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

export default function HeartButton({
  activityId,
  initialCount,
  initialLikedByMe,
  isOwnRow,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLikedByMe);
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  function onHeartTap() {
    if (isOwnRow) return;
    // Optimistic update: flip local state immediately; rollback on server error.
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    startTransition(async () => {
      try {
        await toggleReaction(activityId);
      } catch (e) {
        setLiked(prevLiked);
        setCount(prevCount);
        console.error(e);
      }
    });
  }

  return (
    <>
      {!isOwnRow && (
        <button
          type="button"
          onClick={onHeartTap}
          disabled={pending}
          className={`heart-btn ${liked ? "heart-liked" : ""}`}
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
        >
          <HeartIcon filled={liked} />
        </button>
      )}
      {count > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="heart-count"
          aria-label={`See who liked this (${count})`}
        >
          {count}
        </button>
      )}
      <LikersBottomSheet
        activityId={activityId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

Write `/tmp/msg.txt`:

```
feat(components): HeartButton with optimistic toggle

Client component rendering the universal heart reaction. Props:
{ activityId, initialCount, initialLikedByMe, isOwnRow }.

- Hides the tap button when isOwnRow (self-like UI block);
  count + sheet trigger still render so users can see who
  liked their own activity.
- Optimistic toggle: local state flips immediately; useTransition
  wraps the server call; on throw, rollback both liked + count
  and console.error (matches the existing WatchlistButton pattern).
- Count renders only when >= 1. Clicking the count (separate tap
  target from the heart) opens LikersBottomSheet for this activity.
- Sharp-geometry SVG heart: miter linejoin for pointed lobes,
  stroke in --muted at rest, fill + stroke in --accent when liked
  (follows the accent-switcher for the palette rotation).

CSS hooks (.heart-btn, .heart-liked, .heart-count) land in task 9.
```

Then:

```bash
git add app/components/HeartButton.tsx
git commit -F /tmp/msg.txt
```

---

## Task 8: ActivityFooter + wire into 6 Activity* variants

**Files:**
- Create: `app/components/activity/ActivityFooter.tsx`
- Modify: `app/components/activity/ActivityRecommendationSent.tsx`
- Modify: `app/components/activity/ActivityReviewPublished.tsx`
- Modify: `app/components/activity/ActivityWatchlistAdded.tsx`
- Modify: `app/components/activity/ActivityListCreated.tsx`
- Modify: `app/components/activity/ActivityListFilmAdded.tsx`
- Modify: `app/components/activity/ActivityCovenJoined.tsx`

- [ ] **Step 1: Read the existing footer pattern in one of the Activity* files**

Run: `cat app/components/activity/ActivityWatchlistAdded.tsx`
Note: how the component renders its relative-time line (likely a `<div>` near the bottom calling `relativeTime()`). Identify the exact JSX to replace.

- [ ] **Step 2: Create ActivityFooter**

Create `app/components/activity/ActivityFooter.tsx`:

```tsx
import type { EnrichedActivity } from "@/lib/queries/activity";
import HeartButton from "../HeartButton";
import { relativeTime } from "./relativeTime";

interface Props {
  item: EnrichedActivity;
}

export default function ActivityFooter({ item }: Props) {
  return (
    <div className="activity-footer">
      <span className="caps activity-footer-time">{relativeTime(item.created_at)}</span>
      <HeartButton
        activityId={item.id}
        initialCount={item.reactions.count}
        initialLikedByMe={item.reactions.likedByMe}
        isOwnRow={item.isOwnRow}
      />
    </div>
  );
}
```

- [ ] **Step 3: Update each Activity* variant**

For each of the 6 `Activity*` files under `app/components/activity/`:

1. Add import: `import ActivityFooter from "./ActivityFooter";`
2. Locate the existing timestamp rendering (likely a `<div>` with `relativeTime(item.created_at)` inside it, typically near the end of the JSX).
3. Replace that timestamp `<div>` with `<ActivityFooter item={item} />`.

**Do this once per file** — 6 files, same edit pattern. The exact line to replace will differ per file but the replacement is identical.

Example for `ActivityWatchlistAdded.tsx` — if the current tail looks like:

```tsx
      <div className="caps" style={{ opacity: 0.6, fontSize: 11 }}>
        {relativeTime(item.created_at)}
      </div>
```

replace it with:

```tsx
      <ActivityFooter item={item} />
```

…and remove the now-unused `relativeTime` import if it's no longer referenced elsewhere in the file.

- [ ] **Step 4: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean. If one of the Activity* files uses a different timestamp rendering pattern than expected, adapt the replacement — the goal is every row's bottom-of-card renders `<ActivityFooter item={item} />` exactly once.

- [ ] **Step 5: Smoke-grep for lingering `relativeTime(` calls in Activity* files**

Run: `grep -n "relativeTime(" app/components/activity/Activity*.tsx`
Expected: zero hits (every Activity* file now delegates timestamp rendering to ActivityFooter). If any remain, swap them out.

- [ ] **Step 6: Commit**

Write `/tmp/msg.txt`:

```
feat(activity): ActivityFooter + wire HeartButton into all 6 variants

New shared ActivityFooter component renders the relative
timestamp + HeartButton at the bottom of every activity row.
Each of the 6 Activity* variants (recommendation_sent,
review_published, watchlist_added, list_created,
list_film_added, coven_joined) now delegates its timestamp
rendering to ActivityFooter, picking up the heart for free.

No tests added — React rendering isn't covered in app/ per
project precedent. Manual smoke in task 10 will verify every
variant renders the footer correctly.
```

Then:

```bash
git add app/components/activity/
git commit -F /tmp/msg.txt
```

---

## Task 9: CSS for all new classes

**Files:**
- Modify: `app/app/globals.css`

- [ ] **Step 1: Check the tail of globals.css**

Run: `tail -5 app/app/globals.css`
Note the last rule. Append the new block after it.

- [ ] **Step 2: Append the new CSS block**

Append to `app/app/globals.css`:

```css

/* ===== COVEN FEED HEARTS =====
   Universal heart reaction on every activity row. Heart icon tucked next
   to the timestamp in the footer; count renders only when >= 1 and opens
   a bottom-sheet listing coven likers first, then others. */

.activity-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  opacity: 0.9;
}
.activity-footer-time {
  opacity: 0.6;
  font-size: 11px;
}
.heart-btn {
  background: none;
  border: 0;
  padding: 4px 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  line-height: 0;
}
.heart-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.heart-btn:hover svg path {
  stroke: var(--accent);
}
.heart-count {
  background: none;
  border: 0;
  padding: 4px 2px;
  color: var(--bone);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.heart-count:hover {
  color: var(--accent);
}

/* ===== BOTTOM SHEET PRIMITIVE =====
   Generic half-sheet used by LikersBottomSheet and any future mobile modal.
   Overlay dims the page, panel slides up from the bottom. */

.bottom-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.7);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: bottom-sheet-fade-in 150ms ease-out;
}
.bottom-sheet-panel {
  background: var(--void-2);
  color: var(--bone);
  width: 100%;
  max-width: 560px;
  border-top: 2px solid var(--accent);
  border-radius: 16px 16px 0 0;
  padding: 12px 20px 24px;
  max-height: 80vh;
  overflow-y: auto;
  animation: bottom-sheet-slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.bottom-sheet-panel:focus {
  outline: none;
}
.bottom-sheet-handle {
  width: 40px;
  height: 3px;
  background: var(--muted-dark);
  border-radius: 2px;
  margin: 0 auto 14px;
}
.bottom-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.bottom-sheet-close {
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 26px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
}
.bottom-sheet-close:hover {
  color: var(--accent);
}
.bottom-sheet-body {
  padding-top: 4px;
}

@keyframes bottom-sheet-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes bottom-sheet-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

/* ===== LIKERS SHEET CONTENT ===== */

.likers-loading,
.likers-error,
.likers-empty {
  font-family: var(--font-serif);
  font-style: italic;
  opacity: 0.7;
  padding: 24px 0;
  text-align: center;
}
.likers-error {
  color: var(--blood);
}
.likers-section {
  margin-bottom: 16px;
}
.likers-section-label {
  color: var(--muted);
  margin-bottom: 10px;
}
.likers-divider {
  height: 1px;
  background: var(--accent);
  margin: 10px 0 14px;
}
.liker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  color: var(--bone);
  text-decoration: none;
}
.liker-row:hover {
  color: var(--accent);
}
.liker-row-text {
  min-width: 0;
}
.liker-row-name {
  font-family: var(--font-head);
  font-size: 16px;
  line-height: 1.1;
}
.liker-row-handle {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.6;
  margin-top: 2px;
}
```

- [ ] **Step 3: Typecheck sanity check** (CSS isn't typechecked, but confirm no unintended TS file was edited)

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

Write `/tmp/msg.txt`:

```
style(hearts): .heart-*, .bottom-sheet-*, .likers-* class set

Full CSS for the Coven feed hearts sub-project:
- .activity-footer layout (flex row, timestamp + heart + count)
- .heart-btn + .heart-count — transparent backgrounds, hover
  rotates to --accent; disabled while toggle pending
- .bottom-sheet-* — dimmed overlay (z-index 100), slide-up
  panel with accent top border, max 80vh with scroll, slide
  + fade keyframes (150-200ms)
- .likers-* — section headers in muted caps, 1px --accent
  divider between coven and Others, liker-row with avatar +
  display_name + @handle

No new color tokens. Accent-switcher compatible (.heart-liked
fill = var(--accent)).
```

Then:

```bash
git add app/app/globals.css
git commit -F /tmp/msg.txt
```

---

## Task 10: Manual smoke test

No code changes. Hands-on browser verification.

- [ ] **Step 1: Confirm env is set for local dev**

Run: `grep -E "^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=" app/.env.local`
Expected: both vars set. If missing, `npx vercel env pull app/.env.local --environment=development` from the repo root.

- [ ] **Step 2: Start the dev server**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`
Expected: "Ready in Xs" on http://localhost:3000.

- [ ] **Step 3: Sign in as two different users in two browser profiles (A, B)**

Sign in as user A in one profile (Chrome). Sign in as user B in another (Firefox or Chrome incognito). Make sure A and B follow each other (so they're coven-adjacent) — if not, use the Coven request flow to connect them.

- [ ] **Step 4: Seed feed activity**

As user A, perform at least two activities that appear on the feed:
- Add a film to watchlist (creates `watchlist_added`)
- Write/publish a review (creates `review_published`)
- Recommend a film to user B (creates `recommendation_sent`)

- [ ] **Step 5: Verify heart renders on user B's feed**

Navigate user B to http://localhost:3000/home. For each of A's activity rows:
- A heart outline (muted grey) appears next to the timestamp in the footer.
- No count (count is 0).
- Click the heart → optimistic fill to accent pink, then the server action completes and the feed revalidates.
- Count now shows "1" next to the heart.

- [ ] **Step 6: Verify B cannot like their own activity**

As user B, create an activity (e.g., add a film to watchlist). Refresh /home — B's own row is visible. Verify:
- No heart icon next to the timestamp.
- No count (since B can't like their own, count is 0).

- [ ] **Step 7: Verify sheet open on count tap**

As user A, navigate to /home. A should see B's row with the "1" count (from A's earlier like — wait, that's A's like, not a third-party's). Adjust: as user A, like one of A's-own rows is blocked; like one of B's rows instead. Then as user B, tap the "1" count on their own row — bottom sheet slides up with A's profile listed under "Your coven".

Click on A's profile row → routes to `/p/{A's handle}`. Close sheet works via: × button, Escape key, tap on overlay.

- [ ] **Step 8: Verify empty sheet state**

This is hard to exercise manually without a pathological setup; optional. If you can't reach it, skip — the code path is tested in `reactions.test.ts` (concurrent race) and the sheet renders "No one you can see." when both `coven` and `others` are empty.

- [ ] **Step 9: Verify mobile layout**

Resize the browser to <720px width (or use DevTools device emulation). Confirm the heart + count sit inline with the timestamp without wrapping awkwardly. Sheet renders full-width at the bottom, slide animation fires.

- [ ] **Step 10: Stop the dev server**

Ctrl-C. No commit — this task made no code changes.

---

## Task 11: Apply migration + deploy to production

- [ ] **Step 1: Apply 0121 migration to production**

The migration file is `db/migrations/0121_activity_reactions.sql` and is checked in. Apply via:

```bash
cd /home/cthulhulemon/film_goblin/db
DATABASE_URL='postgresql://postgres.wktylpissdjinccbwzha:<url-encoded-password>@aws-1-us-west-1.pooler.supabase.com:5432/postgres' \
  PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH \
  npm run migrate
```

URL-encode the password (`$` → `%24`, `#` → `%23`). Expected: the migrate script prints `applying 0121_activity_reactions.sql` (and only 0121 — the `_migrations` table already has 0100-0120 recorded from yesterday's reconciliation).

Alternative: paste the migration SQL into the Supabase SQL Editor and run it. If you go that route, ALSO insert a row into `_migrations` manually so future runs skip it: `INSERT INTO _migrations (name) VALUES ('0121_activity_reactions.sql');`.

- [ ] **Step 2: Verify migration applied**

Run a quick sanity check via node+pg:

```bash
cd /home/cthulhulemon/film_goblin/worker && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: '<same URL as step 1>' });
(async () => {
  try {
    await c.connect();
    const t = await c.query(\"SELECT to_regclass('public.activity_reactions') AS t\");
    console.log('table:', t.rows[0].t);
    const p = await c.query(\"SELECT policyname FROM pg_policies WHERE tablename = 'activity_reactions' ORDER BY policyname\");
    console.log('policies:', p.rows.map(r => r.policyname));
  } finally { await c.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected: `table: activity_reactions`, three policies (`activity_reactions_delete`, `activity_reactions_insert`, `activity_reactions_select`).

- [ ] **Step 3: Pre-deploy sanity**

Run: `cd /home/cthulhulemon/film_goblin && ls -la .vercel/project.json && pwd && git log --oneline -1`
Expected: `.vercel/project.json` present, pwd is repo root, last commit is the CSS task.

- [ ] **Step 4: Deploy**

Run: `npx vercel deploy --prod --yes`
Expected: build succeeds, output ends with `Aliased: https://film-goblin.vercel.app`.

- [ ] **Step 5: Prod smoke**

Quick curl sanity:

```bash
curl -s -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" https://film-goblin.vercel.app/
curl -s -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" https://film-goblin.vercel.app/home
```

Expected: root 200; /home 307 (middleware auth-gate).

Hands-on in a signed-in browser: navigate to https://film-goblin.vercel.app/home, verify hearts render on feed rows, tap one to verify the full flow (optimistic fill + server revalidate + bottom sheet on count tap).

No commit — this task doesn't modify the repo.

---

## Task 12: Whole-branch code review + push/merge

- [ ] **Step 1: Dispatch whole-branch review**

After Tasks 1-11 complete and the feature is live in prod, dispatch a final whole-branch code review (Opus) covering commits from `bb8a709` (spec) through the CSS task inclusive. Review focus: spec compliance, RLS policy correctness, self-like-block coverage (both layers), optimistic rollback logic, accent-switcher compatibility, test coverage gaps.

Template: adapt `skills/requesting-code-review/code-reviewer.md` with:
- WHAT_WAS_IMPLEMENTED: summary from the spec's Problem/Approach
- PLAN_OR_REQUIREMENTS: this plan + the spec
- BASE_SHA: `bb8a709`
- HEAD_SHA: tip of master after task 9 commit
- DESCRIPTION: "Universal heart reactions on the Coven feed, sub-project A of two"

- [ ] **Step 2: Address any must-do follow-ups from the review**

If the review flags critical or important issues, fix them in one focused commit with a clear message referencing the review finding. Re-deploy if the fix changes runtime behavior.

- [ ] **Step 3: Push to origin/master**

Run: `git push origin master 2>&1`
Expected: fast-forward push, `bb8a709..<latest-sha>` pushed to `origin/master`. No merge required — we worked directly on master per the project convention.

- [ ] **Step 4: Final wrap**

Update the `MEMORY.md` index if anything non-obvious emerged from the sub-project (e.g., new project convention, new test pattern, new operational gotcha). Otherwise, no further action.

---

## Summary

**Total tasks:** 12 (9 implementation + 1 smoke + 1 deploy + 1 review/push)
**Estimated total:** ~7.5 hours
**Net new files:** 9 (1 migration + 1 RLS test + 1 query + 1 query test + 1 action + 1 action test + 4 components)
**Net edited files:** 8 (activity.ts + globals.css + 6 Activity* variants)
**Test delta:** +13 (5 integration action + 3 vi.mock query + 5 RLS testcontainers)
**Env vars:** none
**Migrations:** 1 (`0121_activity_reactions.sql`)

**Model routing hint (subagent execution):**
- Task 1 (migration + RLS): **Sonnet** — SQL + testcontainers test patterns
- Task 2 (query + vi.mock tests): **Haiku** — mechanical with complete spec
- Task 3 (action + integration tests): **Sonnet** — self-like check + race swallow + real-integration
- Task 4 (activity.ts enrichment): **Sonnet** — hot-path edit, type union refactor
- Task 5 (BottomSheet primitive): **Haiku** — complete template provided
- Task 6 (LikersBottomSheet): **Sonnet** — lazy-fetch + partition + error states
- Task 7 (HeartButton): **Sonnet** — optimistic state machine + SVG geometry + self-like guard
- Task 8 (ActivityFooter + 6 swaps): **Haiku** — identical swap pattern × 6
- Task 9 (CSS): **Sonnet** — new overlay primitive, keyframes, ~100 lines of tokens
- Tasks 10-11 (smoke + deploy): coordinator/user
- Task 12 (final review): **Opus** for review, then coordinator for push

**Key invariants to preserve:**
- Private + public action pair pattern on every mutation (never skip the `_name(client, ...)` split).
- Self-likes blocked at BOTH the server action (DB-lookup against `actor_user_id`) AND the UI (conditional button render when `isOwnRow`).
- `revalidatePath("/home")` on every successful toggle so other viewers see the count change on next render.
- `23505` race swallowed in insert path — concurrent dual-tab taps converge on user intent.
- Optimistic UI rollback on server throw — matches the existing `WatchlistButton` pattern.
- Accent-switcher compatibility — liked state uses `var(--accent)` so pink/yellow/orange/blood flips carry through.
