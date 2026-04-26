# Watched Action — C2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Letterboxd-style diary. New event-stream `watched` table, `/watched` route with stats hero + month-grouped diary, one-tap "+ Watched" button on `/film/[id]` with re-tap modal for rewatches and notes, `watch_logged` activity event that fans out to coven feeds and groups via D1's existing `groupFeed`.

**Architecture:** New `watched` table (event-shaped, surrogate `id` PK, multiple rows per `(user, film)` for rewatches), three indexes (diary-read, per-film count, B2's future film-aggregate). RLS allows owner OR coven-mate-with-broadcast-flag for SELECT; owner-only for I/U/D. Schema is split across two migrations because `ALTER TYPE … ADD VALUE` must commit before a function references the new value. Server actions follow the established `_private(client, …)` + `public(…)` convention, with `_logWatch` silently deleting any matching watchlist row (mirrors `_addToLibrary`'s shape). `WatchModal` is a single shared component used both for new entries (from `WatchedButton`) and edits (from `DiaryRow`). One-line registration in `isGroupableKind` makes D1's grouping pick up the new kind automatically.

**Tech Stack:** Postgres 15 (Supabase), RLS via testcontainers, Next.js 15 App Router, Supabase SSR, vitest + pg-mem for query tests, vitest + testcontainers for RLS, vitest + real Supabase for action tests (env-blocked).

**Spec:** `docs/superpowers/specs/2026-04-25-watched-action-design.md` (commit `4d899a0`).

---

## Task 1: Migration 0123 + RLS tests for the `watched` table

**Files:**
- Create: `db/migrations/0123_watched.sql`
- Create: `db/tests/rls/watched.test.ts`

This task lands the table, indexes, broadcast flag, ALTER TYPE, RLS policies, and GRANTs. Tests cover the table itself (SELECT/INSERT/UPDATE/DELETE policies). The trigger lives in 0124 and gets its own tests in Task 2.

- [ ] **Step 1: Verify the gate fails (no `watched` table yet)**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls 2>&1 | tail -10
```

Expected: existing RLS suite passes. There's no `watched.test.ts` yet — that's what we're adding.

- [ ] **Step 2: Create the migration**

Create `db/migrations/0123_watched.sql`:

```sql
-- C2: Watched — event-stream diary of films a user has watched. Event-shaped
-- (multiple rows per (user, film) for rewatches), distinct from C1's flag-shaped
-- library. Coven-visible by default (gated by profiles.broadcast_watched).

-- 1. The watched event-stream table
CREATE TABLE watched (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  watched_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX watched_user_watched_idx ON watched (user_id, watched_at DESC, created_at DESC);
CREATE INDEX watched_user_film_idx    ON watched (user_id, film_id);
CREATE INDEX watched_film_idx         ON watched (film_id);

-- 2. Profile broadcast flag (mirrors broadcast_watchlist_adds, broadcast_library)
ALTER TABLE profiles
  ADD COLUMN broadcast_watched BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Activity kind extension. Must commit before a function references the new
-- value — that's why the trigger lives in a separate migration (0124).
ALTER TYPE activity_kind ADD VALUE 'watch_logged';

-- 4. RLS — owner-or-coven-with-flag for SELECT; owner-only for I/U/D
ALTER TABLE watched ENABLE ROW LEVEL SECURITY;

CREATE POLICY watched_select ON watched
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM coven_members cm
        WHERE (cm.user_a_id = auth.uid() AND cm.user_b_id = watched.user_id)
           OR (cm.user_a_id = watched.user_id AND cm.user_b_id = auth.uid())
      )
      AND (SELECT broadcast_watched FROM profiles WHERE id = watched.user_id) IS TRUE
    )
  );

CREATE POLICY watched_insert ON watched
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watched_update ON watched
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watched_delete ON watched
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON watched TO authenticated;
```

- [ ] **Step 3: Create the RLS test file**

Create `db/tests/rls/watched.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  // Reset watched + coven edges + watchlists between tests via service_role.
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM watched`);
  await db.client.query(`DELETE FROM watchlists`);
  await db.client.query(`DELETE FROM coven_members`);
  await db.client.query(`DELETE FROM activity WHERE kind = 'watch_logged'`);
  // Reset broadcast_watched to default TRUE for each user.
  await db.client.query(`UPDATE profiles SET broadcast_watched = TRUE`);
  await commit(db.client);
});

// Helper: insert a coven_members edge respecting the (user_a < user_b) invariant.
async function bond(client: typeof db.client, x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await client.query(
    `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
    [a, b]
  );
}

describe("RLS: watched", () => {
  it("anon SELECT is denied — returns 0 rows even when rows exist", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM watched`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner SELECT own rows — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2), ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched`);
      expect(r.rowCount).toBe(2); // both watch entries visible to owner
    } finally { await rollback(db.client); }
  });

  it("multiple watches of same (user, film) all insert — no unique constraint", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await db.client.query(
        `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, '2026-04-01')`,
        [fx.userA.id, fx.filmId]
      );
      await db.client.query(
        `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, '2026-04-15')`,
        [fx.userA.id, fx.filmId]
      );
      await db.client.query(
        `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, '2026-04-15')`,
        [fx.userA.id, fx.filmId] // same date — also OK
      );
      const r = await db.client.query(
        `SELECT count(*)::int AS c FROM watched WHERE user_id = $1 AND film_id = $2`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rows[0].c).toBe(3);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=TRUE — SELECT allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=FALSE — SELECT denied", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await db.client.query(
      `UPDATE profiles SET broadcast_watched = FALSE WHERE id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("non-coven user — SELECT denied even with broadcast=TRUE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM watched WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner INSERT own row — allowed", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("INSERT with spoofed user_id — denied", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("owner UPDATE own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id, note) VALUES ($1, $2, 'old') RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const upd = await db.client.query(
      `UPDATE watched SET note = 'new' WHERE id = $1`,
      [watchId]
    );
    await commit(db.client);
    expect(upd.rowCount).toBe(1);
  });

  it("non-owner UPDATE — no-op (RLS filters out the row)", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    // Bond + broadcast=TRUE, so userB CAN see (SELECT) but UPDATE is owner-only.
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const upd = await db.client.query(
      `UPDATE watched SET note = 'pwned' WHERE id = $1`,
      [watchId]
    );
    await commit(db.client);
    expect(upd.rowCount).toBe(0);
  });

  it("owner DELETE own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM watched WHERE id = $1`,
      [watchId]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("non-owner DELETE — no-op (RLS filters out the row)", async () => {
    await beginAs(db.client, null, "service_role");
    const ins = await db.client.query<{ id: string }>(
      `INSERT INTO watched (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    const watchId = ins.rows[0].id;
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(`DELETE FROM watched WHERE id = $1`, [watchId]);
    await commit(db.client);
    expect(del.rowCount).toBe(0);
  });
});
```

- [ ] **Step 4: Run the RLS suite**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls 2>&1 | tail -20
```

Expected: all `RLS: watched` tests pass alongside the existing suite.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0123_watched.sql db/tests/rls/watched.test.ts
git commit -m "feat(c2): 0123 watched table + RLS tests"
```

---

## Task 2: Migration 0124 trigger + activity fan-out tests

**Files:**
- Create: `db/migrations/0124_watch_logged_trigger.sql`
- Modify: `db/tests/rls/watched.test.ts`

The trigger fan-outs `watched` inserts into `activity (kind='watch_logged')`, gated by `broadcast_watched`. The migration must be a separate file because `ALTER TYPE … ADD VALUE` (in 0123) must be committed in a prior transaction before a function can reference the new enum value — the migrate runner gives us that boundary by wrapping each `.sql` file in its own `BEGIN/COMMIT`.

- [ ] **Step 1: Create the trigger migration**

Create `db/migrations/0124_watch_logged_trigger.sql`:

```sql
-- Fan-out trigger: watched insert → activity (kind='watch_logged'),
-- gated by profiles.broadcast_watched. Mirrors activity_on_watchlist_insert.
-- Separate file from 0123 because ALTER TYPE … ADD VALUE must commit before
-- a function can reference the new value.

CREATE OR REPLACE FUNCTION public.activity_on_watch_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watched INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'watch_logged', jsonb_build_object('film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_watch_insert
AFTER INSERT ON watched
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_watch_insert();
```

- [ ] **Step 2: Add trigger-behavior tests to the existing `watched.test.ts`**

Append the following describe block to `db/tests/rls/watched.test.ts`:

```ts
describe("trigger: activity_on_watch_insert", () => {
  it("fires watch_logged activity when broadcast_watched = TRUE", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await db.client.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.filmId]
      );
    } finally { await commit(db.client); }

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT actor_user_id, kind, payload FROM activity
       WHERE kind = 'watch_logged' AND actor_user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].kind).toBe("watch_logged");
    expect(r.rows[0].payload).toEqual({ film_id: fx.filmId });
  });

  it("does NOT fire when broadcast_watched = FALSE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `UPDATE profiles SET broadcast_watched = FALSE WHERE id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await db.client.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.filmId]
      );
    } finally { await commit(db.client); }

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT 1 FROM activity WHERE kind = 'watch_logged' AND actor_user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(r.rowCount).toBe(0);
  });

  it("fires once per row — multiple inserts → multiple activity rows", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await db.client.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2), ($1, $2), ($1, $2)`,
        [fx.userA.id, fx.filmId]
      );
    } finally { await commit(db.client); }

    await beginAs(db.client, null, "service_role");
    const r = await db.client.query(
      `SELECT count(*)::int AS c FROM activity
       WHERE kind = 'watch_logged' AND actor_user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(r.rows[0].c).toBe(3);
  });
});
```

- [ ] **Step 3: Run the suite**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls 2>&1 | tail -20
```

Expected: existing tests + new `trigger: activity_on_watch_insert` block all pass.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0124_watch_logged_trigger.sql db/tests/rls/watched.test.ts
git commit -m "feat(c2): 0124 watch_logged trigger + fan-out tests"
```

---

## Task 3: Update pg-mem smoke + apply migrations to prod + regenerate types

**Files:**
- Modify: `db/tests/migrations.smoke.test.ts`

The pg-mem smoke helper auto-skips `_trigger` files (so 0124 is silent), and the helper also strips GRANT, CREATE/DROP VIEW, and `backfill` files (per the 2026-04-25 hygiene sweep). 0123 contains an `ALTER TYPE` that pg-mem 3.0.4 supports natively — no shim needed. The smoke test only asserts table presence, so adding `"watched"` to the expected list is the only change.

- [ ] **Step 1: Add `"watched"` to the smoke's expected-tables list**

Edit `db/tests/migrations.smoke.test.ts`. Find the `expect.arrayContaining([…])` array and add `"watched"` after `"activity"` (or wherever fits alphabetically — order doesn't matter, presence does):

```ts
expect(names).toEqual(expect.arrayContaining([
  "_migrations",
  "films",
  "price_history",
  "profiles",
  "staff",
  "follows",
  "coven_requests",
  "coven_members",
  "watchlists",
  "price_alerts",
  "lists",
  "list_films",
  "list_subscriptions",
  "reviews",
  "recommendations",
  "activity",
  "watched",
]));
```

- [ ] **Step 2: Run the pg-mem smoke**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -15
```

Expected: smoke passes. The `watched` table is detected; the trigger file (0124) is silently skipped per the `_trigger` filename rule in `pg-mem.ts`.

- [ ] **Step 3: Apply 0123 + 0124 to prod Supabase**

The prod Supabase pooler URL + password live in `passwords.txt` at the repo root (gitignored). The `app/.env.local` file holds the same `DATABASE_URL` (pointing at the pooler).

```bash
cd /home/cthulhulemon/film_goblin/db
set -a; source ../app/.env.local; set +a
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Expected: migrate runner reports applying `0123_watched.sql` and `0124_watch_logged_trigger.sql`. If 0123 fails with "type does not exist" — the activity_kind enum is missing; bail and ask the user. If 0124 fails with "type activity_kind does not have value 'watch_logged'" — the `ALTER TYPE` in 0123 didn't commit; check that 0123 succeeded (`SELECT name FROM _migrations ORDER BY name DESC LIMIT 5`) and re-run.

- [ ] **Step 4: Regenerate types from the now-extended schema**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run gen:types
```

Expected: `app/lib/supabase/types.ts` updates with the `watched` table type, the `broadcast_watched` column on `profiles`, and `'watch_logged'` in the `activity_kind` enum.

- [ ] **Step 5: Typecheck the app to confirm types are consistent**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors. (Existing code doesn't reference `watched` yet, so this is a "still green" check.)

- [ ] **Step 6: Commit**

```bash
git add db/tests/migrations.smoke.test.ts app/lib/supabase/types.ts
git commit -m "chore(c2): pg-mem smoke + regenerated types for watched"
```

---

## Task 4: Server actions + integration tests

**Files:**
- Create: `app/lib/actions/watched.ts`
- Create: `app/tests/actions/watched.test.ts`

Three private + three public actions, following the established `_doThing(client, …)` + `doThing(…)` split. `_logWatch` does two things in sequence (matches `_addToLibrary`'s shape): inserts the watched row, then silently deletes any matching watchlists row.

- [ ] **Step 1: Create the actions module**

Create `app/lib/actions/watched.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

interface LogWatchOpts {
  watched_at?: string; // ISO YYYY-MM-DD; defaults to today
  note?: string | null;
}

interface EditWatchPatch {
  watched_at?: string;
  note?: string | null;
}

/**
 * Logs a watch entry. When called with no opts, inserts today's date and no note.
 * Side-effect: silently deletes any matching (user, film) watchlist row — watching
 * supersedes wanting. Mirrors _addToLibrary's two-statement shape; the two ops are
 * not in a single SQL transaction, but both scope to auth.uid() = user_id and
 * neither is destructive on conflict.
 */
export async function _logWatch(
  client: Client,
  filmId: string,
  opts?: LogWatchOpts,
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const insertRow: { user_id: string; film_id: string; watched_at?: string; note?: string | null } = {
    user_id: user.id,
    film_id: filmId,
  };
  if (opts?.watched_at) insertRow.watched_at = opts.watched_at;
  if (opts?.note !== undefined) insertRow.note = opts.note;

  const { data, error } = await client
    .from("watched")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");

  // Auto-remove from watchlist (silent — no error if it wasn't there).
  await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);

  return { id: data.id };
}

export async function _editWatch(
  client: Client,
  watchId: string,
  patch: EditWatchPatch,
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const update: { watched_at?: string; note?: string | null } = {};
  if (patch.watched_at !== undefined) update.watched_at = patch.watched_at;
  if (patch.note !== undefined) update.note = patch.note;

  const { error } = await client
    .from("watched")
    .update(update)
    .eq("id", watchId);
  if (error) throw error;
}

export async function _deleteWatch(client: Client, watchId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const { error } = await client
    .from("watched")
    .delete()
    .eq("id", watchId);
  if (error) throw error;
}

export async function logWatch(filmId: string, opts?: LogWatchOpts): Promise<{ id: string }> {
  const supabase = await createClient();
  const result = await _logWatch(supabase, filmId, opts);
  revalidatePath("/watched");
  revalidatePath("/watchlist");
  revalidatePath("/home");
  revalidatePath("/films");
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function editWatch(watchId: string, patch: EditWatchPatch): Promise<void> {
  const supabase = await createClient();
  await _editWatch(supabase, watchId, patch);
  revalidatePath("/watched");
}

export async function deleteWatch(watchId: string, filmId?: string): Promise<void> {
  const supabase = await createClient();
  await _deleteWatch(supabase, watchId);
  revalidatePath("/watched");
  revalidatePath("/home");
  revalidatePath("/films");
  if (filmId) revalidatePath(`/film/${filmId}`);
}
```

Note on `deleteWatch`'s `filmId` arg: the public wrapper accepts an optional `filmId` so callers (e.g. `WatchedButton` triggering a delete) can revalidate `/film/[id]` precisely. `DiaryRow` doesn't need to pass it (the diary page is the only revalidation that matters for diary edits).

- [ ] **Step 2: Create the action test file**

Create `app/tests/actions/watched.test.ts` (follows the env-aware pattern from `library.test.ts`):

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _logWatch, _editWatch, _deleteWatch } from "../../lib/actions/watched";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 600000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("watched").delete().eq("user_id", userA.id);
  await admin.from("watched").delete().eq("user_id", userB.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
  await admin.from("activity").delete().eq("actor_user_id", userA.id).eq("kind", "watch_logged");
});

describe.skipIf(!hasEnv)("actions/watched", () => {
  it("_logWatch with no opts — inserts row with today's date, no note", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId);
    expect(id).toBeTruthy();

    const { data } = await adminClient()
      .from("watched")
      .select("user_id, film_id, watched_at, note")
      .eq("id", id)
      .single();
    expect(data?.user_id).toBe(userA.id);
    expect(data?.film_id).toBe(filmId);
    expect(data?.note).toBeNull();
    // watched_at should be today's ISO date
    expect(data?.watched_at).toBe(new Date().toISOString().slice(0, 10));
  });

  it("_logWatch honors explicit watched_at and note", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId, { watched_at: "2026-04-15", note: "moonlit" });

    const { data } = await adminClient()
      .from("watched")
      .select("watched_at, note")
      .eq("id", id)
      .single();
    expect(data?.watched_at).toBe("2026-04-15");
    expect(data?.note).toBe("moonlit");
  });

  it("_logWatch silently deletes any matching watchlist row", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: filmId, max_price_usd: 5.99 });

    const c = await signedInClient(userA.email, userA.password);
    await _logWatch(c as any, filmId);

    const { data: wlRows } = await admin
      .from("watchlists")
      .select("*")
      .eq("user_id", userA.id)
      .eq("film_id", filmId);
    expect(wlRows).toHaveLength(0);
  });

  it("_logWatch allows multiple inserts for same (user, film)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _logWatch(c as any, filmId, { watched_at: "2026-04-01" });
    await _logWatch(c as any, filmId, { watched_at: "2026-04-15" });
    await _logWatch(c as any, filmId, { watched_at: "2026-04-15" }); // same date OK

    const { data } = await adminClient()
      .from("watched")
      .select("id")
      .eq("user_id", userA.id)
      .eq("film_id", filmId);
    expect(data).toHaveLength(3);
  });

  it("_editWatch updates watched_at + note", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId, { watched_at: "2026-04-01", note: "old" });
    await _editWatch(c as any, id, { watched_at: "2026-04-22", note: "new" });

    const { data } = await adminClient()
      .from("watched")
      .select("watched_at, note")
      .eq("id", id)
      .single();
    expect(data?.watched_at).toBe("2026-04-22");
    expect(data?.note).toBe("new");
  });

  it("_deleteWatch deletes own row", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId);
    await _deleteWatch(c as any, id);

    const { data } = await adminClient().from("watched").select("id").eq("id", id);
    expect(data).toHaveLength(0);
  });

  it("_deleteWatch on another user's row — RLS-filtered no-op", async () => {
    const admin = adminClient();
    const ins = await admin
      .from("watched")
      .insert({ user_id: userA.id, film_id: filmId })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userB.email, userB.password);
    await _deleteWatch(c as any, ins.data.id);

    const { data } = await adminClient().from("watched").select("id").eq("id", ins.data.id);
    expect(data).toHaveLength(1); // still there — RLS filtered the delete
  });

  it("_logWatch throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_logWatch(anon as any, filmId)).rejects.toThrow(/unauthenticated/i);
  });

  it("_editWatch throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_editWatch(anon as any, "00000000-0000-0000-0000-000000000000", { note: "x" })).rejects.toThrow(/unauthenticated/i);
  });

  it("_deleteWatch throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_deleteWatch(anon as any, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/unauthenticated/i);
  });
});
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Run the action tests (will report green-skipped without env, or green-passed with it)**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/watched.test.ts 2>&1 | tail -15
```

Expected: file reports skipped (no env) or all 9 tests pass (env present). Either way: 0 failed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/watched.ts app/tests/actions/watched.test.ts
git commit -m "feat(c2): _logWatch / _editWatch / _deleteWatch + tests"
```

---

## Task 5: Read queries

**Files:**
- Create: `app/lib/queries/watched.ts`

Three queries: full diary for `/watched`, stats for the hero band, single-film count for `WatchedButton`'s initial state. The `getWatchedStats` function does three lightweight queries — no RPC required for v1 cardinality.

- [ ] **Step 1: Create the queries module**

Create `app/lib/queries/watched.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface DiaryFilm {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string;
}

export interface DiaryRow {
  id: string;
  watched_at: string; // YYYY-MM-DD
  note: string | null;
  film: DiaryFilm;
}

export interface TopFilm {
  film: DiaryFilm;
  count: number;
}

export interface WatchedStats {
  total: number;
  thisYear: number;
  topFilms: TopFilm[]; // up to 5
}

/**
 * Returns the user's full diary, newest first, joined with film details.
 * Powers the /watched page. Month-grouping happens at render time.
 */
export async function getWatchedDiary(client: Client, userId: string): Promise<DiaryRow[]> {
  const { data, error } = await client
    .from("watched")
    .select(`
      id, watched_at, note,
      film:films!inner(id, title, year, director, artwork_url)
    `)
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as never;
}

/**
 * Aggregate stats for the /watched hero band.
 */
export async function getWatchedStats(client: Client, userId: string): Promise<WatchedStats> {
  const { count: total } = await client
    .from("watched")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const { count: thisYear } = await client
    .from("watched")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("watched_at", yearStart);

  // Top-5 films by watch count. Pull all rows for this user, group in JS.
  // For v1 cardinality (a single user's watch log) this is fine; if it grows
  // to hundreds of thousands, swap for an RPC.
  const { data: rows } = await client
    .from("watched")
    .select("film_id")
    .eq("user_id", userId);

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    counts.set(r.film_id, (counts.get(r.film_id) ?? 0) + 1);
  }
  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let topFilms: TopFilm[] = [];
  if (topIds.length > 0) {
    const filmIds = topIds.map(([id]) => id);
    const { data: films } = await client
      .from("films")
      .select("id, title, year, director, artwork_url")
      .in("id", filmIds);
    const filmMap = new Map((films ?? []).map(f => [f.id, f]));
    topFilms = topIds
      .map(([id, count]) => {
        const film = filmMap.get(id);
        return film ? { film: film as DiaryFilm, count } : null;
      })
      .filter((x): x is TopFilm => x !== null);
  }

  return { total: total ?? 0, thisYear: thisYear ?? 0, topFilms };
}

/**
 * Watch count for a single (user, film). Powers the "✓ Watched · N" badge
 * on FilmActions on /film/[id]. Returns 0 for unauthed callers.
 */
export async function getWatchCountForFilm(
  client: Client,
  userId: string | null,
  filmId: string,
): Promise<number> {
  if (!userId) return 0;
  const { count } = await client
    .from("watched")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("film_id", filmId);
  return count ?? 0;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/queries/watched.ts
git commit -m "feat(c2): watched read queries (diary, stats, per-film count)"
```

---

## Task 6: WatchModal component (shared by WatchedButton + DiaryRow)

**Files:**
- Create: `app/components/WatchModal.tsx`

A single shared modal used both for new watch entries (from `WatchedButton` on rewatch) and for editing existing entries (from `DiaryRow`). Reuses `BottomSheet` (which renders as a bottom-sheet on mobile and an overlay-with-panel feel on desktop). Fields: date input + 500-char `maxLength` textarea. Buttons: Save (primary), Delete (only when editing), Cancel (text).

- [ ] **Step 1: Create the component**

Create `app/components/WatchModal.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import BottomSheet from "./BottomSheet";

interface SaveValues {
  watched_at: string;
  note: string;
}

interface Props {
  open: boolean;
  mode: "new" | "edit";
  initial: { watched_at: string; note: string; id?: string };
  filmTitle: string;
  onSave(values: SaveValues): Promise<void>;
  onDelete?(): Promise<void>;
  onClose(): void;
}

const MAX_NOTE = 500;

export default function WatchModal({ open, mode, initial, filmTitle, onSave, onDelete, onClose }: Props) {
  const [watchedAt, setWatchedAt] = useState(initial.watched_at);
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      setError(null);
      try {
        await onSave({ watched_at: watchedAt, note });
        onClose();
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    });
  }

  function del() {
    if (!onDelete) return;
    if (!confirm("Delete this watch entry?")) return;
    start(async () => {
      setError(null);
      try {
        await onDelete();
        onClose();
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "new" ? "Log a watch" : "Edit watch"}>
      <div style={{ display: "grid", gap: 14 }}>
        <div className="caps" style={{ fontSize: 11, opacity: 0.8 }}>
          {filmTitle}
        </div>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Watched on</div>
          <input
            type="date"
            value={watchedAt}
            onChange={e => setWatchedAt(e.target.value)}
            required
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
          />
        </label>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Note (optional)</span>
            {note.length >= 400 && (
              <span style={{ color: note.length >= 500 ? "var(--blood)" : "var(--muted)" }}>
                {note.length} / {MAX_NOTE}
              </span>
            )}
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            maxLength={MAX_NOTE}
            placeholder="What did you think?"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, resize: "none" }}
          />
        </label>
        {error && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button
            type="button"
            onClick={save}
            disabled={pending || !watchedAt}
            className="btn btn-lg"
            style={{ flex: 1, justifyContent: "center" }}
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={del}
              disabled={pending}
              style={{
                background: "transparent",
                color: "var(--blood)",
                border: "2px solid var(--blood)",
                padding: "10px 18px",
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: pending ? "default" : "pointer",
              }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              background: "transparent",
              color: "var(--bone)",
              border: 0,
              padding: "10px 18px",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/WatchModal.tsx
git commit -m "feat(c2): WatchModal — shared new/edit modal"
```

---

## Task 7: WatchedButton + FilmActions integration + film detail page wiring

**Files:**
- Create: `app/components/WatchedButton.tsx`
- Modify: `app/components/FilmActions.tsx`
- Modify: `app/app/film/[id]/page.tsx`

`WatchedButton` is the third peer button next to Watchlist and Library. First click (when `count === 0`) is a one-tap log of today. Subsequent clicks open `WatchModal` for a new entry. After a successful first watch, `onLogged` fires so `FilmActions` can clear the watchlist UI state (mirrors `OwnedButton`'s `onAdded`).

- [ ] **Step 1: Create `WatchedButton`**

Create `app/components/WatchedButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { logWatch } from "@/lib/actions/watched";
import WatchModal from "./WatchModal";

interface Props {
  filmId: string;
  filmTitle: string;
  initialCount: number;
  onLogged?: () => void;
}

export default function WatchedButton({ filmId, filmTitle, initialCount, onLogged }: Props) {
  const [count, setCount] = useState(initialCount);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, start] = useTransition();

  function quickLog() {
    start(async () => {
      try {
        await logWatch(filmId);
        setCount(c => c + 1);
        onLogged?.();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function click() {
    if (count === 0) {
      quickLog();
    } else {
      setModalOpen(true);
    }
  }

  async function saveModal({ watched_at, note }: { watched_at: string; note: string }) {
    await logWatch(filmId, { watched_at, note: note || null });
    setCount(c => c + 1);
    if (count === 0) onLogged?.(); // belt-and-braces; quickLog path covers count=0
  }

  return (
    <>
      <button
        className="btn btn-outline btn-lg"
        onClick={click}
        disabled={pending}
        style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
      >
        {count === 0 ? "+ Watched" : `✓ Watched · ${count}`}
      </button>
      {modalOpen && (
        <WatchModal
          open={modalOpen}
          mode="new"
          initial={{ watched_at: new Date().toISOString().slice(0, 10), note: "" }}
          filmTitle={filmTitle}
          onSave={saveModal}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Update `FilmActions` to render the third button + wire watchlist-clearing**

Replace the contents of `app/components/FilmActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import WatchlistButton from "./WatchlistButton";
import OwnedButton from "./OwnedButton";
import WatchedButton from "./WatchedButton";

interface Props {
  filmId: string;
  filmTitle: string;
  initialOnWatchlist: boolean;
  initialOwned: boolean;
  initialWatchCount: number;
}

export default function FilmActions({ filmId, filmTitle, initialOnWatchlist, initialOwned, initialWatchCount }: Props) {
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);

  return (
    <>
      <WatchlistButton
        filmId={filmId}
        initialOnList={onWatchlist}
        onChange={setOnWatchlist}
      />
      <OwnedButton
        filmId={filmId}
        initialOwned={initialOwned}
        onAdded={() => setOnWatchlist(false)}
      />
      <WatchedButton
        filmId={filmId}
        filmTitle={filmTitle}
        initialCount={initialWatchCount}
        onLogged={() => setOnWatchlist(false)}
      />
    </>
  );
}
```

- [ ] **Step 3: Update `/film/[id]/page.tsx` to fetch and pass the new props**

Edit `app/app/film/[id]/page.tsx`. At the top of the file, add to imports:

```ts
import { getWatchCountForFilm } from "@/lib/queries/watched";
```

Add the per-film count fetch alongside the other user-scoped fetches (after the `owned` line):

```ts
const watchCount = user ? await getWatchCountForFilm(supabase, user.id, id) : 0;
```

Update the `<FilmActions … />` invocation to pass the new props:

```tsx
{user && <FilmActions filmId={film.id} filmTitle={film.title} initialOnWatchlist={onList} initialOwned={owned} initialWatchCount={watchCount} />}
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Visual verify in dev server**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open `http://localhost:3000/film/<some-film-id>` while signed in. Verify:
- Three buttons in the actions row: Watchlist, Library, Watched.
- Click "+ Watched" → it becomes "✓ Watched · 1" without a modal.
- Click "✓ Watched · 1" → modal opens with today pre-filled and an empty note. Saving increments to 2.
- Adding a watch on a film that's on the watchlist → watchlist button switches to "+ Watchlist".

Stop the dev server when done (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add app/components/WatchedButton.tsx app/components/FilmActions.tsx app/app/film/[id]/page.tsx
git commit -m "feat(c2): WatchedButton + FilmActions wiring + film detail page"
```

---

## Task 8: `/watched` route + DiaryRow + TopNav entry

**Files:**
- Create: `app/app/watched/page.tsx`
- Create: `app/app/watched/DiaryRow.tsx`
- Modify: `app/components/TopNav.tsx`

The `/watched` page is auth-gated (mirrors `/library`). Hero is bone-on-void with `Your <em>Diary</em>.`. Below: stats band (3 numbers + 5-poster strip), then month-grouped diary list. Each diary row is a client component so it can open `WatchModal` for editing.

- [ ] **Step 1: Create `DiaryRow` (client component)**

Create `app/app/watched/DiaryRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import WatchModal from "@/components/WatchModal";
import { editWatch, deleteWatch } from "@/lib/actions/watched";
import type { DiaryRow as DiaryRowData } from "@/lib/queries/watched";

interface Props {
  row: DiaryRowData;
}

export default function DiaryRow({ row }: Props) {
  const [open, setOpen] = useState(false);

  async function save({ watched_at, note }: { watched_at: string; note: string }) {
    await editWatch(row.id, { watched_at, note: note || null });
  }

  async function del() {
    await deleteWatch(row.id);
  }

  return (
    <>
      <div
        className="diary-row"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter") setOpen(true); }}
      >
        <Link
          href={`/film/${row.film.id}`}
          onClick={e => e.stopPropagation()}
          style={{ flexShrink: 0 }}
        >
          <img
            src={row.film.artwork_url}
            alt={row.film.title}
            width={50}
            height={75}
            style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }}
          />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="head" style={{ fontSize: 18, lineHeight: 1.1 }}>{row.film.title}</div>
          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            {row.film.year} · {row.watched_at}
          </div>
          {row.note && (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 6, color: "var(--bone)", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              "{row.note}"
            </div>
          )}
        </div>
      </div>
      {open && (
        <WatchModal
          open={open}
          mode="edit"
          initial={{ id: row.id, watched_at: row.watched_at, note: row.note ?? "" }}
          filmTitle={row.film.title}
          onSave={save}
          onDelete={del}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Add the `.diary-row` style to `globals.css`**

Edit `app/app/globals.css`. Append (after the existing `.watchlist-list` rules or anywhere appropriate):

```css
.diary-row {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid #2a2a2a;
  cursor: pointer;
  align-items: flex-start;
}
.diary-row:hover {
  background: rgba(243, 236, 216, 0.02);
}
.diary-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

- [ ] **Step 3: Create the `/watched` page**

Create `app/app/watched/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWatchedDiary, getWatchedStats } from "@/lib/queries/watched";
import TopNav from "@/components/TopNav";
import DiaryRow from "./DiaryRow";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthKey(date: string): string {
  // YYYY-MM-DD → "YYYY-MM"
  return date.slice(0, 7);
}

function monthHeader(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function WatchedEmpty() {
  return (
    <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
      Nothing watched yet. Mark a film as watched from any film&rsquo;s page.
      <div style={{ marginTop: 24 }}>
        <Link href="/films" className="btn btn-lg">Browse the archive →</Link>
      </div>
    </div>
  );
}

export default async function WatchedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/watched");

  const [rows, stats] = await Promise.all([
    getWatchedDiary(supabase, user.id),
    getWatchedStats(supabase, user.id),
  ]);

  // Group by month-key, preserving newest-first order.
  const grouped: Array<{ key: string; rows: typeof rows }> = [];
  for (const row of rows) {
    const key = monthKey(row.watched_at);
    const last = grouped[grouped.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      grouped.push({ key, rows: [row] });
    }
  }

  const topName = stats.topFilms[0];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="watched" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Your <em style={{ color: "var(--accent)" }}>Diary</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchedEmpty />
          ) : (
            <>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24, fontFamily: "var(--font-ui)", fontSize: 13 }}>
                <span><span className="caps" style={{ fontSize: 10, color: "var(--muted)", marginRight: 6 }}>Total</span><strong style={{ color: "var(--accent)" }}>{stats.total}</strong></span>
                <span><span className="caps" style={{ fontSize: 10, color: "var(--muted)", marginRight: 6 }}>{new Date().getUTCFullYear()}</span><strong style={{ color: "var(--accent)" }}>{stats.thisYear}</strong></span>
                {topName && (
                  <span>
                    <span className="caps" style={{ fontSize: 10, color: "var(--muted)", marginRight: 6 }}>Most watched</span>
                    <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{topName.film.title}</em>
                    <span style={{ color: "var(--muted)" }}> ×{topName.count}</span>
                  </span>
                )}
              </div>

              {stats.topFilms.length > 0 && (
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, marginBottom: 24 }}>
                  {stats.topFilms.map(t => (
                    <Link key={t.film.id} href={`/film/${t.film.id}`} style={{ flexShrink: 0, textDecoration: "none", color: "inherit" }}>
                      <img src={t.film.artwork_url} alt={t.film.title} width={70} height={105} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
                      <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginTop: 4, textAlign: "center" }}>×{t.count}</div>
                    </Link>
                  ))}
                </div>
              )}

              <div>
                {grouped.map(g => (
                  <div key={g.key} style={{ marginBottom: 28 }}>
                    <div className="caps" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--muted)" }}>
                      {monthHeader(g.key)}
                    </div>
                    {g.rows.map(r => <DiaryRow key={r.id} row={r} />)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add `/watched` to TopNav items**

Edit `app/components/TopNav.tsx`. In the `items` array (the signed-in branch), insert a `watched` entry between `library` and `lists`:

```ts
{ id: "library", label: "Library", href: "/library" },
{ id: "watched", label: "Diary", href: "/watched" },
{ id: "lists", label: "Lists", href: "/lists" },
```

`TopNavChrome` consumes the items array generically — no changes needed there. The page already passes `current="watched"` so the active-state highlight works.

- [ ] **Step 5: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Visual verify in dev server**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open `http://localhost:3000/watched` while signed in. Verify:
- Hero reads "Your Diary." with "Diary" in accent.
- Stats band shows total, year count, most-watched name.
- Top-5 mini-poster strip renders (or doesn't, if you have <1 watch).
- Diary rows are grouped under "April 2026" / "March 2026" / etc. headers.
- Tapping a row opens the modal with the row's date + note.
- Saving an edit updates the row; deleting removes it.
- Empty state appears for a fresh user.
- TopNav shows "Diary" between Library and Lists; the active state highlights when on `/watched`.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add app/app/watched/page.tsx app/app/watched/DiaryRow.tsx app/app/globals.css app/components/TopNav.tsx
git commit -m "feat(c2): /watched route + DiaryRow + TopNav entry"
```

---

## Task 9: Activity feed wiring (registration, components, dispatcher, tests)

**Files:**
- Modify: `app/lib/queries/group-activity.ts`
- Modify: `app/lib/queries/activity.ts`
- Create: `app/components/activity/ActivityWatchLogged.tsx`
- Create: `app/components/activity/ActivityWatchLoggedGroup.tsx`
- Modify: `app/components/activity/FeedRow.tsx`
- Modify: `app/components/activity/ActivityRow.tsx`
- Create or modify: `app/lib/queries/group-activity.test.ts` (extend existing)

D1's `groupFeed` becomes kind-aware for `watch_logged` via a one-liner. `getEnrichedFeed` learns the new `EnrichedActivity` variant and the film-id extraction. New `ActivityWatchLogged` and `ActivityWatchLoggedGroup` mirror the watchlist-added shape exactly. `FeedRow` dispatcher gains the new cases. `ActivityRow` (the single-event dispatcher used inside the group's expanded list) gains the same.

- [ ] **Step 1: Find and read `app/components/activity/ActivityRow.tsx`** (you'll modify it in step 5)

```bash
cat app/components/activity/ActivityRow.tsx
```

This is the single-event dispatcher inside `FeedRow` (and inside expanded groups).

- [ ] **Step 2: Update `EnrichedActivity` + group-narrow union + film-id extraction in `getEnrichedFeed`**

Edit `app/lib/queries/activity.ts`.

In the `EnrichedActivity` union (around line 36), add `watch_logged` after `watchlist_added`:

```ts
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
};
```

In the `ActivityGroup` interface (around line 54), widen the `kind` union:

```ts
export interface ActivityGroup {
  key: string;
  actor: ActorLite;
  kind: "watchlist_added" | "watch_logged"; // widens as more kinds register
  items: EnrichedActivity[];
  count: number;
  latestAt: string;
}
```

In the `switch (r.kind)` block inside `getEnrichedFeed` (around line 139), add a case after `watchlist_added`:

```ts
case "watchlist_added":
  if (film) out.push({ ...base, kind: "watchlist_added", film });
  break;
case "watch_logged":
  if (film) out.push({ ...base, kind: "watch_logged", film });
  break;
```

(Film-id extraction happens earlier — `filmIds = … r.payload.film_id …` — and works as-is because `watch_logged`'s payload is `{ film_id }` like `watchlist_added`.)

- [ ] **Step 3: Register `watch_logged` as a groupable kind**

Edit `app/lib/queries/group-activity.ts`:

```ts
function isGroupableKind(kind: EnrichedActivity["kind"]): boolean {
  return kind === "watchlist_added" || kind === "watch_logged";
}
```

- [ ] **Step 4: Create `ActivityWatchLogged` (single-event renderer)**

Create `app/components/activity/ActivityWatchLogged.tsx`:

```tsx
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "watch_logged" }>;

export default function ActivityWatchLogged({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" watched "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {"."}
        </div>
        <ActivityFooter item={item} />
      </div>
      <Link href={`/film/${item.film.id}`}>
        <img src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Create `ActivityWatchLoggedGroup` (collapsed-group renderer)**

Create `app/components/activity/ActivityWatchLoggedGroup.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityWatchLogged from "./ActivityWatchLogged";
import { relativeTime } from "./relativeTime";
import type { ActivityGroup, EnrichedActivity } from "@/lib/queries/activity";

interface Props {
  group: ActivityGroup;
}

export default function ActivityWatchLoggedGroup({ group }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { actor, items, count, latestAt } = group;
  const firstItem = items[0] as Extract<EnrichedActivity, { kind: "watch_logged" }>;
  const othersCount = count - 1;
  const visiblePosters = items.slice(0, 3);
  const overflowCount = count - visiblePosters.length;

  function toggle() { setExpanded(v => !v); }

  return (
    <div className={expanded ? "activity-group-expanded" : ""}>
      <div className="activity-group-row" onClick={toggle} role="button" aria-expanded={expanded}>
        <Avatar
          name={actor.display_name ?? actor.handle}
          color="var(--accent)"
          size={40}
          url={actor.avatar_url}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
            <Link
              href={`/p/${encodeURIComponent(actor.handle)}`}
              onClick={e => e.stopPropagation()}
              style={{ color: "var(--bone)", fontWeight: 700 }}
            >
              {actor.display_name ?? actor.handle}
            </Link>
            {" watched "}
            <Link
              href={`/film/${firstItem.film.id}`}
              onClick={e => e.stopPropagation()}
              style={{ color: "var(--accent)", fontStyle: "italic" }}
            >
              {firstItem.film.title}
            </Link>
            {" and "}
            <strong style={{ color: "var(--accent)" }}>
              {othersCount} {othersCount === 1 ? "other film" : "other films"}
            </strong>
            {"."}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span>{relativeTime(latestAt)}</span>
            <span className="activity-group-chevron" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }} aria-hidden="true">
              ▾
            </span>
          </div>
        </div>
        <div className="activity-group-poster-stack">
          {visiblePosters.map((item, idx) => {
            const wlItem = item as Extract<EnrichedActivity, { kind: "watch_logged" }>;
            const isLast = idx === visiblePosters.length - 1;
            return (
              <div key={wlItem.id} style={{ position: "relative" }}>
                <img src={wlItem.film.artwork_url} alt={wlItem.film.title} />
                {isLast && overflowCount > 0 && (
                  <span className="more-badge">+{overflowCount}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="activity-group-expanded-items" data-open={expanded}>
        {items.map(item => {
          const wlItem = item as Extract<EnrichedActivity, { kind: "watch_logged" }>;
          return <ActivityWatchLogged key={wlItem.id} item={wlItem} />;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `FeedRow` to dispatch on group kind**

Replace `app/components/activity/FeedRow.tsx`:

```tsx
import type { FeedItem } from "@/lib/queries/activity";
import ActivityRow from "./ActivityRow";
import ActivityWatchlistAddedGroup from "./ActivityWatchlistAddedGroup";
import ActivityWatchLoggedGroup from "./ActivityWatchLoggedGroup";

export default function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "group") {
    if (item.group.kind === "watch_logged") {
      return <ActivityWatchLoggedGroup group={item.group} />;
    }
    return <ActivityWatchlistAddedGroup group={item.group} />;
  }
  return <ActivityRow item={item.activity} />;
}
```

- [ ] **Step 7: Update `ActivityRow` to dispatch the new single-event kind**

Read `app/components/activity/ActivityRow.tsx`. It has a switch over `item.kind` that returns the appropriate single-event component. Add a case for `watch_logged` returning `<ActivityWatchLogged item={item} />` (with the same `as Extract<…>` cast pattern used by the existing cases). Add the import at the top:

```ts
import ActivityWatchLogged from "./ActivityWatchLogged";
```

(If the existing dispatcher doesn't use a switch but a chain of `if`s, follow the file's existing pattern — don't restructure.)

- [ ] **Step 8: Extend group-activity tests for `watch_logged`**

Locate the existing group-activity test file (likely `app/lib/queries/group-activity.test.ts` — if it doesn't exist yet, the D1 plan probably embedded the tests inline; check `find . -name "group-activity*test*"`). If a test file exists, add the following describe block:

```ts
import { describe, it, expect } from "vitest";
import { groupFeed } from "./group-activity";
import type { EnrichedActivity } from "./activity";

function mkWatch(opts: { id: string; actorId: string; createdAt: string; filmId?: string }): EnrichedActivity {
  return {
    id: opts.id,
    kind: "watch_logged",
    created_at: opts.createdAt,
    actor: { id: opts.actorId, handle: "x", display_name: null, avatar_url: null },
    film: { id: opts.filmId ?? "f", title: "F", director: "D", year: 2024, artwork_url: "", itunes_url: "" },
    reactions: { count: 0, likedByMe: false },
  } as EnrichedActivity;
}

describe("groupFeed: watch_logged", () => {
  it("groups 3+ same-actor watch_logged events within window", async () => {
    const base = new Date("2026-04-22T20:00:00Z").getTime();
    const items: EnrichedActivity[] = [
      mkWatch({ id: "3", actorId: "u1", createdAt: new Date(base).toISOString() }),
      mkWatch({ id: "2", actorId: "u1", createdAt: new Date(base - 5 * 60 * 1000).toISOString() }),
      mkWatch({ id: "1", actorId: "u1", createdAt: new Date(base - 10 * 60 * 1000).toISOString() }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.kind).toBe("watch_logged");
      expect(out[0].group.count).toBe(3);
    }
  });

  it("doesn't group 2 events (below MIN_GROUP_SIZE)", () => {
    const base = new Date("2026-04-22T20:00:00Z").getTime();
    const items: EnrichedActivity[] = [
      mkWatch({ id: "2", actorId: "u1", createdAt: new Date(base).toISOString() }),
      mkWatch({ id: "1", actorId: "u1", createdAt: new Date(base - 5 * 60 * 1000).toISOString() }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(2);
    expect(out.every(x => x.type === "single")).toBe(true);
  });

  it("doesn't group across kinds (watchlist_added + watch_logged interleave)", () => {
    const base = new Date("2026-04-22T20:00:00Z").getTime();
    const items: EnrichedActivity[] = [
      mkWatch({ id: "3", actorId: "u1", createdAt: new Date(base).toISOString() }),
      {
        id: "2", kind: "watchlist_added", created_at: new Date(base - 5 * 60 * 1000).toISOString(),
        actor: { id: "u1", handle: "x", display_name: null, avatar_url: null },
        film: { id: "f2", title: "F2", director: "D", year: 2024, artwork_url: "", itunes_url: "" },
        reactions: { count: 0, likedByMe: false },
      } as EnrichedActivity,
      mkWatch({ id: "1", actorId: "u1", createdAt: new Date(base - 10 * 60 * 1000).toISOString() }),
    ];
    const out = groupFeed(items);
    // No grouping — runs are broken by the kind switch.
    expect(out.every(x => x.type === "single")).toBe(true);
  });
});
```

If no group-activity test file exists, create `app/lib/queries/group-activity.test.ts` with the above content (plus a top-level `import { describe, it, expect }` line — already shown).

- [ ] **Step 9: Typecheck + run tests**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10
```

Expected: typecheck clean; full app test suite passes (the new group-activity tests are included; action tests are still env-gated).

- [ ] **Step 10: Visual verify the feed**

Start the dev server. Open `http://localhost:3000/home`. Log a watch on `/film/<id>` (or several, on different films, in quick succession). Refresh `/home`:
- A single watch shows as "Sarah watched <film>." with the film poster.
- 3+ in quick succession collapse into "Sarah watched <film> and N other films." with the poster stack and chevron.
- Clicking the chevron expands the group into the full list.
- Heart button works on each item.

Stop the dev server.

- [ ] **Step 11: Commit**

```bash
git add app/lib/queries/activity.ts app/lib/queries/group-activity.ts \
        app/components/activity/ActivityWatchLogged.tsx \
        app/components/activity/ActivityWatchLoggedGroup.tsx \
        app/components/activity/FeedRow.tsx \
        app/components/activity/ActivityRow.tsx \
        app/lib/queries/group-activity.test.ts
git commit -m "feat(c2): activity feed wiring for watch_logged"
```

---

## Task 10: Settings toggle for `broadcast_watched`

**Files:**
- Modify: `app/lib/actions/profile.ts`
- Modify: `app/app/settings/SettingsForm.tsx`

Adds a third broadcast switch alongside watchlist + library. The `_updateProfile` function uses `{ ...fields }` spread, so adding `broadcast_watched?: boolean` to `ProfileFields` and extracting it in the form's `save()` is the entire wiring (per the auto-spread gotcha in CLAUDE.md).

- [ ] **Step 1: Add `broadcast_watched` to `ProfileFields`**

Edit `app/lib/actions/profile.ts`. In the `ProfileFields` interface (around line 11), add the new field next to the other broadcast flags:

```ts
export interface ProfileFields {
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  broadcast_library?: boolean;
  broadcast_watched?: boolean;
  email_notifications_enabled?: boolean;
}
```

- [ ] **Step 2: Add the toggle to `SettingsForm` and extract it in `save()`**

Edit `app/app/settings/SettingsForm.tsx`.

In the `save()` function (around line 104), add the new field to the `updateProfile({ … })` payload:

```ts
async function save(fd: FormData) {
  setSaving(true);
  setSaved(false);
  try {
    await updateProfile({
      handle: String(fd.get("handle")),
      display_name: String(fd.get("display_name")),
      bio: String(fd.get("bio") || ""),
      broadcast_watchlist_adds: fd.get("broadcast") === "on",
      broadcast_library: fd.get("broadcast_library") === "on",
      broadcast_watched: fd.get("broadcast_watched") === "on",
      email_notifications_enabled: fd.get("email_notifications") === "on",
    });
    setSaved(true);
  } finally { setSaving(false); }
}
```

In the form JSX, add a new `<label class="check-zine">` after the `broadcast_library` toggle and before `email_notifications`:

```tsx
<label className="check-zine">
  <input type="checkbox" name="broadcast_watched" defaultChecked={profile.broadcast_watched} />
  <span className="check-zine__box" aria-hidden="true" />
  <span className="caps" style={{ fontSize: 11 }}>Broadcast watches to your coven</span>
</label>
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Visual verify**

Start the dev server. Open `http://localhost:3000/settings`:
- The new "Broadcast watches to your coven" checkbox sits between the library broadcast and email notifications.
- It's checked by default (matches DB default `TRUE`).
- Unchecking and saving persists; refresh and confirm the unchecked state.
- Re-checking restores broadcast.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/profile.ts app/app/settings/SettingsForm.tsx
git commit -m "feat(c2): broadcast_watched toggle in Settings"
```

---

## Task 11: Whole-branch review + smoke + deploy + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

Final pass: run the full test suite, verify migrations are applied to prod, deploy to Vercel, do an in-prod smoke check, and update the CLAUDE.md "Current state" section so the next session can pick up cold.

- [ ] **Step 1: Run the full app + db suites**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all 2>&1 | tail -10

cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10

cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5

cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build 2>&1 | tail -10
```

Expected: db pg-mem smoke passes; db RLS suite passes; app vitest is 0 failed; typecheck clean; build succeeds.

- [ ] **Step 2: Verify prod migrations**

If you ran Task 3 Step 3 already, this is already done. Otherwise (or to confirm):

```bash
cd /home/cthulhulemon/film_goblin/db
set -a; source ../app/.env.local; set +a
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate 2>&1 | tail -10
```

Expected: "Applied 0 migrations" (already applied) OR confirms 0123/0124 are present.

- [ ] **Step 3: Deploy to Vercel from the repo root**

```bash
cd /home/cthulhulemon/film_goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes 2>&1 | tail -20
```

Expected: deploy succeeds. The deploy URL appears in the output. Per the gotcha: NEVER deploy from `app/` or any `<worktree>/app/` — only the repo root or worktree root.

- [ ] **Step 4: Production smoke check**

Open `https://film-goblin.vercel.app/watched` while signed in:
- Page loads. Hero reads "Your Diary." Stats render (zero state if you haven't logged anything).
- Pick a film page (e.g. one you own) — three buttons appear; click "+ Watched"; it becomes "✓ Watched · 1".
- Refresh `/watched` — the diary row appears, grouped under the current month.
- Tap the row → modal opens → change the date → save → page refreshes with the new date.
- Tap again → click Delete → row disappears.
- Open `/home` and verify the watch appears as a single feed row.
- Open `/settings` → confirm the "Broadcast watches to your coven" checkbox is present, defaults checked.

If anything is broken in prod that wasn't broken locally, capture the error from `npx vercel logs` and fix before continuing.

- [ ] **Step 5: Update CLAUDE.md "Current state"**

Edit `CLAUDE.md`. Replace the "Current state" section's "Last shipped" + "Next up" + "Open threads" subsections to reflect C2 shipping:

```markdown
**Last updated:** YYYY-MM-DD (end of session that shipped C2)

**Last shipped:** C2 — Watched Action. New event-stream `watched` table (one row per (user, film, date)), one-tap "+ Watched" button on `/film/[id]` with re-tap modal for rewatches, `/watched` route with stats hero + month-grouped diary + edit/delete via shared `WatchModal`, `watch_logged` activity event fan-out (gated by `broadcast_watched` profile flag) wired through D1's `groupFeed` so 3+ in 30 min collapse on the home/coven feed. Spec `2026-04-25-watched-action-design.md`, plan `2026-04-25-watched-action.md`. Migrations 0123 + 0124 applied to prod. Live at https://film-goblin.vercel.app/watched.

**Next up (queue locked in "Queued sub-projects" below):**
1. **B2 — Social signal on posters.** Coven-watchlist/owned/watched/(eventually)reviewed badges on `/films` Archive cards. Reads from `films_with_stats`. Now that C2 has shipped, B2's `watcher_count` extension can land alongside `owned_count` and `watchlist_count`.

**Open threads worth knowing about:**
- `passwords.txt` at repo root holds the Supabase prod pooler URL + password (gitignored). See the "Passwords scratchpad" auto-memory.
- C2 deferred: `/p/[handle]/watched` profile-page integration (v1.1 polish), rewatch differentiation in feed copy ("rewatched X" vs "watched X"), year-in-review breakdown chart, stars/ratings on diary entries, bulk-import from Letterboxd CSV, in-place film swap on diary rows.
```

Also update the "Sub-project history" table at the bottom of CLAUDE.md by appending row 14 for C2:

```markdown
| 14 | Watched Action (C2) — `watched` event-stream table + `/watched` route (stats hero + month-grouped diary), shared `WatchModal` for new+edit, `WatchedButton` as 3rd peer in `FilmActions`, `watch_logged` activity kind + trigger + `groupFeed` registration, `broadcast_watched` Settings toggle | `2026-04-25-watched-action-design.md` |
```

Update "Queued sub-projects" — remove C2 (now shipped); B2 stays:

```markdown
## Queued sub-projects

One piece of follow-on work. Brainstorm + spec before implementation.

1. **B2 — Social signal on posters.** Surface coven-watchlist / coven-owned / coven-watched / coven-reviewed counts as small badges on `/films` Archive cards. Reads from `films_with_stats` (already exposes `watchlist_count` and `owned_count`; needs additive extension for `watcher_count` (from `watched`) and `review_count` (from `reviews`)). No new schema for the read path. Open design questions: which signals matter most, how to render badges at small card sizes without crowding, whether to surface row-level "Sarah owns this" or stick to aggregate counts only.
```

- [ ] **Step 6: Commit the docs update**

```bash
cd /home/cthulhulemon/film_goblin
git add CLAUDE.md
git commit -m "docs(claude.md): C2 shipped; queue collapses to B2"
```

- [ ] **Step 7: Final verification**

```bash
git log --oneline -15
```

Expected: a clean chain of C2 commits ending with the docs update. No uncommitted changes (`git status` should be clean except for `.claude/`, `film-goblin/`, `worker/hehe.txt` which are pre-existing untracked).

C2 ships when this task completes.
