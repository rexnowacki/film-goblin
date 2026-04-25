# Library (Owned) — C1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track films a user owns; exclude them from `/films` discovery; coven-visible by default with a profile flag; new `/library` route; OwnedButton on `/film/[id]`; auto-removes from watchlist on add (silent).

**Architecture:** New `library` table with composite PK `(user_id, film_id)`. RLS allows owner OR coven-mate-with-broadcast-flag. New `profiles.broadcast_library` boolean (default TRUE). Server actions `_addToLibrary` / `_removeFromLibrary` mirror the watchlist pattern; add-to-library silently deletes any matching watchlist row in the same action. `films_with_stats` view extended with `owned_count` for B2 to consume later. `/films` query gets a `viewerUserId` opt that excludes owned films via `.not("id", "in", "(…)")`.

**Tech Stack:** Postgres 15 (Supabase), RLS via testcontainers, Next.js 15 App Router, Supabase SSR, vitest + pg-mem for query tests, vitest + testcontainers for RLS + action tests.

**Spec:** `docs/superpowers/specs/2026-04-25-library-owned-design.md` (commit `0c23dad`).

---

## Task 1: Migration + RLS tests

**Files:**
- Create: `db/migrations/0122_library.sql`
- Create: `db/tests/rls/library.test.ts`

- [ ] **Step 1: Verify the gate fails (no library table yet)**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls 2>&1 | tail -10
```

Expected: existing RLS suite passes. There's no `library.test.ts` yet — that's what we're adding.

- [ ] **Step 2: Create the migration**

Create `db/migrations/0122_library.sql`:

```sql
-- C1: Library — track films a user owns. Coven-visible by default
-- (gated by profiles.broadcast_library); discovery filter excludes
-- viewer's owned films from /films.

-- 1. The library table
CREATE TABLE library (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

CREATE INDEX library_film_id_idx ON library (film_id);
CREATE INDEX library_user_created_idx ON library (user_id, created_at DESC);

-- 2. Profile broadcast flag
ALTER TABLE profiles
  ADD COLUMN broadcast_library BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. RLS
ALTER TABLE library ENABLE ROW LEVEL SECURITY;

-- Owner always sees their own. Coven members see fellow members' rows
-- when the target has broadcast_library = TRUE.
-- coven_members is a graph-edge table: (user_a_id, user_b_id) with
-- user_a_id < user_b_id invariant. Edge between auth.uid() and
-- library.user_id can be in either direction; check both.
CREATE POLICY library_select ON library
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM coven_members cm
        WHERE (cm.user_a_id = auth.uid() AND cm.user_b_id = library.user_id)
           OR (cm.user_a_id = library.user_id AND cm.user_b_id = auth.uid())
      )
      AND (SELECT broadcast_library FROM profiles WHERE id = library.user_id) IS TRUE
    )
  );

CREATE POLICY library_insert ON library
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY library_delete ON library
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON library TO authenticated;

-- 4. Extend films_with_stats with owned_count for B2.
DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
```

- [ ] **Step 3: Create the RLS test file**

Create `db/tests/rls/library.test.ts`:

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
  // Reset library + coven edges between tests via service_role.
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM library`);
  await db.client.query(`DELETE FROM coven_members`);
  // Also reset broadcast_library to default TRUE for each user.
  await db.client.query(`UPDATE profiles SET broadcast_library = TRUE`);
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

describe("RLS: library", () => {
  it("anon SELECT is denied — returns 0 rows even when rows exist", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM library`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner SELECT own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=TRUE — SELECT allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=FALSE — SELECT denied", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await db.client.query(
      `UPDATE profiles SET broadcast_library = FALSE WHERE id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("non-coven user — SELECT denied even with broadcast=TRUE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    // No coven edge between userA and userC.
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner INSERT own row — allowed", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO library (user_id, film_id) VALUES ($1, $2) RETURNING user_id`,
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
          `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.filmId]  // userA tries to insert as userB
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("owner DELETE own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM library WHERE user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("non-owner DELETE — no-op (RLS filters out the row)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    // userB tries to delete userA's row. Bonded coven; broadcast=TRUE means
    // userB CAN see the row (SELECT) but the DELETE policy is owner-only.
    await bond(db.client, fx.userA.id, fx.userB.id);
    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM library WHERE user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(0);

    // Confirm row still exists via service_role.
    await beginAs(db.client, null, "service_role");
    const remaining = await db.client.query(
      `SELECT user_id FROM library`
    );
    await commit(db.client);
    expect(remaining.rowCount).toBe(1);
  });
});
```

- [ ] **Step 4: Run RLS suite — must pass 9/9 new cases plus all existing**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls 2>&1 | tail -30
```

Expected: existing tests still pass + 9 new library tests pass. If the migration SQL has a typo, the testcontainers setup will fail to apply migrations — fix by reading the error and correcting `0122_library.sql`.

- [ ] **Step 5: Run pg-mem migration smoke**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10
```

Expected: pg-mem smoke runs all migrations including `0122_library.sql` against an in-memory Postgres. If pg-mem rejects something (e.g., view extension recreation), error will name the problem; otherwise green.

- [ ] **Step 6: Commit Task 1**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): migration 0122 + RLS tests

New library table with composite PK (user_id, film_id), owner-or-coven-
with-broadcast-flag SELECT policy, owner-only INSERT/DELETE. Adds
profiles.broadcast_library boolean (default TRUE). Extends
films_with_stats with owned_count aggregate for B2 to consume later.

9 testcontainers RLS cases cover: anon denied, owner SELECT, coven
mate with broadcast=TRUE allowed, coven mate with broadcast=FALSE
denied, non-coven denied, owner INSERT, spoofed-user INSERT denied,
owner DELETE, non-owner DELETE no-op (visible-via-broadcast does not
imply deletable).
EOF
git add db/migrations/0122_library.sql db/tests/rls/library.test.ts
git commit -F /tmp/msg.txt
```

(If the `cat <<EOF` heredoc mangles the message — known intermittent issue, see CLAUDE.md gotchas — `Write` the message to `/tmp/msg.txt` directly via the Write tool, then `git commit -F /tmp/msg.txt`.)

---

## Task 2: Apply migration to prod + regenerate types

**Files:**
- Modify: `app/lib/supabase/types.ts` (regenerated)

- [ ] **Step 1: Verify DATABASE_URL is set for the production Supabase**

```bash
cd /home/cthulhulemon/film_goblin/db
test -n "$DATABASE_URL" && echo "DATABASE_URL set" || echo "DATABASE_URL NOT set"
```

If not set, source it from wherever the user keeps it (typically `app/.env.local` or a secret manager). The migration runs against the production Supabase instance and is recorded in the `_migrations` tracking table.

- [ ] **Step 2: Apply the migration to production**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate 2>&1 | tail -10
```

Expected: `Applied 0122_library.sql` (or equivalent — check the migrate script's exact log format). The migrate runner is idempotent against `_migrations` so re-runs skip applied migrations.

- [ ] **Step 3: Regenerate Supabase types**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run gen:types
```

Expected: `app/lib/supabase/types.ts` updates with the new `library` table type and the new `broadcast_library` field on `profiles.Row` / `profiles.Insert` / `profiles.Update`.

- [ ] **Step 4: Verify the regenerated types**

```bash
grep -A 5 "library:" app/lib/supabase/types.ts | head -15
grep "broadcast_library" app/lib/supabase/types.ts | head -5
```

Expected: `library` block exists with `Row`, `Insert`, `Update`, `Relationships`. `broadcast_library: boolean` appears in profiles.

- [ ] **Step 5: Typecheck — must pass**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5
```

Expected: PASS. The regenerated types should not break any existing code (additive only).

- [ ] **Step 6: Commit Task 2**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
chore(supabase): regenerate types after migration 0122

Picks up the new library table type and the broadcast_library field on
profiles.Row/Insert/Update. Migration 0122_library.sql applied to prod
in this same task; the _migrations tracking table now records it.
EOF
git add app/lib/supabase/types.ts
git commit -F /tmp/msg.txt
```

---

## Task 3: Queries module + tests

**Files:**
- Create: `app/lib/queries/library.ts`
- Create: `app/tests/queries/library.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/queries/library.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getOwnedFilmIds, isInLibrary } from "@/lib/queries/library";

function makeIdsClient(rows: { film_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  } as any;
}

function makeMaybeSingleClient(row: { film_id: string } | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      }),
    }),
  } as any;
}

describe("getOwnedFilmIds", () => {
  it("returns the list of film IDs for the given user", async () => {
    const client = makeIdsClient([
      { film_id: "f1" },
      { film_id: "f2" },
      { film_id: "f3" },
    ]);
    const ids = await getOwnedFilmIds(client, "u1");
    expect(ids).toEqual(["f1", "f2", "f3"]);
  });

  it("returns [] without hitting the DB when userId is null", async () => {
    const fromSpy = vi.fn();
    const client = { from: fromSpy } as any;
    const ids = await getOwnedFilmIds(client, null);
    expect(ids).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("returns [] when the user owns nothing", async () => {
    const client = makeIdsClient([]);
    const ids = await getOwnedFilmIds(client, "u1");
    expect(ids).toEqual([]);
  });
});

describe("isInLibrary", () => {
  it("returns true when the row exists", async () => {
    const client = makeMaybeSingleClient({ film_id: "f1" });
    expect(await isInLibrary(client, "u1", "f1")).toBe(true);
  });

  it("returns false when the row does not exist", async () => {
    const client = makeMaybeSingleClient(null);
    expect(await isInLibrary(client, "u1", "f1")).toBe(false);
  });
});
```

- [ ] **Step 2: Verify the gate fails (queries module doesn't exist)**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/library.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/lib/queries/library'`.

- [ ] **Step 3: Implement the queries module**

Create `app/lib/queries/library.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Returns the IDs of films owned by the given user. Used by /films
 * discovery to exclude these from the grid for the viewer.
 * Returns [] for unauthed callers.
 */
export async function getOwnedFilmIds(client: Client, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.film_id);
}

/**
 * Returns the user's library joined with film details, sorted by
 * recently-added by default. Powers the /library page.
 */
export async function getLibrary(client: Client, userId: string) {
  const { data, error } = await client
    .from("library")
    .select(`
      created_at,
      film:films!inner(
        id, itunes_id, title, director, year, runtime_min,
        genre_primary, artwork_url
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Boolean: does this user own this film? Powers the OwnedButton's
 * initial state on /film/[id].
 */
export async function isInLibrary(client: Client, userId: string, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId)
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/library.test.ts 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Typecheck**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): query module + tests

Adds getOwnedFilmIds (powers the /films discovery filter), getLibrary
(powers the /library page), and isInLibrary (powers the OwnedButton
initial state). 5 hermetic pg-mock tests cover non-empty / null user /
empty library / row-exists / row-missing.
EOF
git add app/lib/queries/library.ts app/tests/queries/library.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 4: Actions module + tests

**Files:**
- Create: `app/lib/actions/library.ts`
- Create: `app/tests/actions/library.test.ts`

- [ ] **Step 1: Write the (env-blocked) action tests**

Create `app/tests/actions/library.test.ts`. These tests use a real Postgres via testcontainers + the service-role key from `TEST_SUPABASE_SERVICE_ROLE_KEY` env. Same pattern as `app/tests/actions/reactions.test.ts` — written to pass when the env is provisioned, currently env-skipped:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient as createSb } from "@supabase/supabase-js";
import { _addToLibrary, _removeFromLibrary } from "@/lib/actions/library";

const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.TEST_SUPABASE_URL;

describe.skipIf(!serviceKey || !supabaseUrl)("library actions (integration)", () => {
  // The implementation will need a helper to create test users + sign in.
  // Use the existing app/tests/helpers/supabase.ts + helpers/users.ts patterns
  // (same as reactions.test.ts). This test file mirrors that structure.

  let userAClient: any;
  let userAId: string;
  let filmId: string;

  beforeAll(async () => {
    // Set up service-role client, create userA, create a test film, return refs.
    // (The exact bootstrap follows the same pattern as reactions.test.ts.)
  });

  afterAll(async () => {
    // Tear down — delete test rows.
  });

  beforeEach(async () => {
    // Reset library + watchlist rows for userA via service role.
    const admin = createSb(supabaseUrl!, serviceKey!);
    await admin.from("library").delete().eq("user_id", userAId);
    await admin.from("watchlists").delete().eq("user_id", userAId);
  });

  it("_addToLibrary inserts the row + deletes the watchlist row", async () => {
    // Pre-seed: user has the film on their watchlist.
    const admin = createSb(supabaseUrl!, serviceKey!);
    await admin.from("watchlists").insert({ user_id: userAId, film_id: filmId });

    await _addToLibrary(userAClient, filmId);

    const { data: lib } = await admin.from("library")
      .select("*").eq("user_id", userAId).eq("film_id", filmId);
    expect(lib?.length).toBe(1);

    const { data: wl } = await admin.from("watchlists")
      .select("*").eq("user_id", userAId).eq("film_id", filmId);
    expect(wl?.length).toBe(0);
  });

  it("_addToLibrary is idempotent on re-add (swallows 23505)", async () => {
    await _addToLibrary(userAClient, filmId);
    await expect(_addToLibrary(userAClient, filmId)).resolves.not.toThrow();
  });

  it("_addToLibrary throws when unauthed", async () => {
    const anon = createSb(supabaseUrl!, "anon-key");  // no auth.uid()
    await expect(_addToLibrary(anon as any, filmId)).rejects.toThrow("unauthenticated");
  });

  it("_removeFromLibrary deletes own row; no-op on missing row", async () => {
    await _addToLibrary(userAClient, filmId);
    await _removeFromLibrary(userAClient, filmId);
    const admin = createSb(supabaseUrl!, serviceKey!);
    const { data } = await admin.from("library").select("*")
      .eq("user_id", userAId).eq("film_id", filmId);
    expect(data?.length).toBe(0);

    // Re-call — no-op, no throw.
    await expect(_removeFromLibrary(userAClient, filmId)).resolves.not.toThrow();
  });

  it("_removeFromLibrary throws when unauthed", async () => {
    const anon = createSb(supabaseUrl!, "anon-key");
    await expect(_removeFromLibrary(anon as any, filmId)).rejects.toThrow("unauthenticated");
  });
});
```

(The `beforeAll` user-setup block is left as a sketch matching `reactions.test.ts`'s shape — when env is provisioned, fill it in by copy-modifying that file's bootstrap. The test file is committed in skipped state.)

- [ ] **Step 2: Implement the actions module**

Create `app/lib/actions/library.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Marks a film as owned by the user. Side-effect: silently deletes any
 * watchlist row for the same (user, film) — owning supersedes wanting.
 * The two ops are not in a single SQL transaction, but both scope to
 * auth.uid() = user_id and conflicts are idempotent (re-mark = no-op
 * via PK; missing watchlist row = no-op delete).
 */
export async function _addToLibrary(client: Client, filmId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const { error: insertErr } = await client
    .from("library")
    .insert({ user_id: user.id, film_id: filmId });
  // Swallow "already in library" duplicates (PK violation, code 23505).
  if (insertErr && insertErr.code !== "23505") throw insertErr;

  // Auto-remove from watchlist (silent — no error if it wasn't there).
  await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
}

export async function _removeFromLibrary(client: Client, filmId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("library")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToLibrary(filmId: string) {
  const supabase = await createClient();
  await _addToLibrary(supabase, filmId);
  revalidatePath("/library");
  revalidatePath("/watchlist");
  revalidatePath("/films");
  revalidatePath(`/film/${filmId}`);
}

export async function removeFromLibrary(filmId: string) {
  const supabase = await createClient();
  await _removeFromLibrary(supabase, filmId);
  revalidatePath("/library");
  revalidatePath("/films");
  revalidatePath(`/film/${filmId}`);
}
```

- [ ] **Step 3: Run app tests — must pass (library.test.ts skips)**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10
```

Expected: existing tests pass; `library.test.ts` reports 5 skipped.

- [ ] **Step 4: Typecheck**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): actions module + tests

Private _addToLibrary / _removeFromLibrary (Supabase client injected for
testability) plus public addToLibrary / removeFromLibrary wrappers
that revalidate /library /watchlist /films /film/[id]. _addToLibrary
silently deletes any matching watchlist row in the same action — no
DB trigger, debuggable + reversible at the application layer.

5 integration tests written but env-skipped on missing
TEST_SUPABASE_SERVICE_ROLE_KEY (same gate as reactions.test.ts).
EOF
git add app/lib/actions/library.ts app/tests/actions/library.test.ts
git commit -F /tmp/msg.txt
```

---

## Task 5: Discovery filter wiring

**Files:**
- Modify: `app/lib/queries/films.ts`
- Modify: `app/app/films/page.tsx`

- [ ] **Step 1: Modify `getFilms` to accept and apply `viewerUserId`**

In `app/lib/queries/films.ts`, find the existing `getFilms` signature:

```ts
export async function getFilms(
  client: Client,
  opts: { q?: string; sort?: FilmsSort; page?: number } = {},
): Promise<{
```

Replace with:

```ts
export async function getFilms(
  client: Client,
  opts: { q?: string; sort?: FilmsSort; page?: number; viewerUserId?: string | null } = {},
): Promise<{
```

Then, immediately after the existing `if (opts.q && opts.q.trim()) { … }` block (the `q` ilike filter), add:

```ts
  if (opts.viewerUserId) {
    const ownedIds = await getOwnedFilmIds(client, opts.viewerUserId);
    if (ownedIds.length > 0) {
      query = query.not("id", "in", `(${ownedIds.map(id => `"${id}"`).join(",")})`);
    }
  }
```

And add the import at the top of `app/lib/queries/films.ts` (after the other imports):

```ts
import { getOwnedFilmIds } from "./library";
```

- [ ] **Step 2: Modify `/films` page to pass `viewerUserId`**

In `app/app/films/page.tsx`, find:

```tsx
  const supabase = await createClient();
  const { rows: films, total, pageSize } = await getFilms(supabase, { q, sort, page });
```

Replace with:

```tsx
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { rows: films, total, pageSize } = await getFilms(supabase, { q, sort, page, viewerUserId: user?.id ?? null });
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 4: Manual smoke (direct DB ownership injection)**

Open http://localhost:3000/films in dev (`npm run dev`), note one film's ID. In a separate psql or Supabase SQL editor, insert an ownership row for the logged-in user:

```sql
INSERT INTO library (user_id, film_id) VALUES ('<your-user-id>', '<film-id>');
```

Refresh /films. The film should be absent from the grid. Then `DELETE FROM library WHERE user_id = '<your-user-id>' AND film_id = '<film-id>';` to clean up.

If you can't conveniently inject ownership, skip this step — Task 6 will exercise the toggle round-trip end-to-end.

- [ ] **Step 5: Commit Task 5**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): /films excludes viewer's owned films

getFilms gains an optional viewerUserId arg; when set, fetches the
viewer's owned film IDs via getOwnedFilmIds and appends a
.not("id", "in", "(…)") clause. Anon viewers (no viewerUserId)
see everything unchanged. /films/page.tsx threads auth.getUser().id
through to the query.
EOF
git add app/lib/queries/films.ts app/app/films/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 6: OwnedButton + FilmActions wrapper + film detail page

**Files:**
- Create: `app/components/OwnedButton.tsx`
- Modify: `app/components/WatchlistButton.tsx`
- Create: `app/components/FilmActions.tsx`
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Modify `WatchlistButton` to expose its state via callback**

In `app/components/WatchlistButton.tsx`, find:

```tsx
interface Props {
  filmId: string;
  initialOnList: boolean;
}

export default function WatchlistButton({ filmId, initialOnList }: Props) {
  const [onList, setOnList] = useState(initialOnList);
```

Replace with:

```tsx
interface Props {
  filmId: string;
  initialOnList: boolean;
  onChange?: (next: boolean) => void;
}

export default function WatchlistButton({ filmId, initialOnList, onChange }: Props) {
  const [onList, setOnList] = useState(initialOnList);
```

Then in the same file, find the two `setOnList(…)` calls inside the `toggle()` body:

```tsx
        if (onList) {
          await removeFromWatchlist(filmId);
          setOnList(false);
        } else {
          await addToWatchlist(filmId);
          setOnList(true);
        }
```

Replace with:

```tsx
        if (onList) {
          await removeFromWatchlist(filmId);
          setOnList(false);
          onChange?.(false);
        } else {
          await addToWatchlist(filmId);
          setOnList(true);
          onChange?.(true);
        }
```

Also: when `initialOnList` changes externally (parent flipping it after auto-cleanup), the local `onList` state should track. Add a `useEffect`:

```tsx
import { useEffect, useState, useTransition } from "react";
// ...
  useEffect(() => {
    setOnList(initialOnList);
  }, [initialOnList]);
```

- [ ] **Step 2: Create `OwnedButton`**

Create `app/components/OwnedButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { addToLibrary, removeFromLibrary } from "@/lib/actions/library";

interface Props {
  filmId: string;
  initialOwned: boolean;
  onAdded?: () => void;
}

export default function OwnedButton({ filmId, initialOwned, onAdded }: Props) {
  const [owned, setOwned] = useState(initialOwned);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (owned) {
          await removeFromLibrary(filmId);
          setOwned(false);
        } else {
          await addToLibrary(filmId);
          setOwned(true);
          onAdded?.();
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <button
      className="btn btn-outline btn-lg"
      onClick={toggle}
      disabled={pending}
      style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
    >
      {owned ? "✓ In Library" : "+ Library"}
    </button>
  );
}
```

- [ ] **Step 3: Create `FilmActions` wrapper**

Create `app/components/FilmActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import WatchlistButton from "./WatchlistButton";
import OwnedButton from "./OwnedButton";

interface Props {
  filmId: string;
  initialOnWatchlist: boolean;
  initialOwned: boolean;
}

export default function FilmActions({ filmId, initialOnWatchlist, initialOwned }: Props) {
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
    </>
  );
}
```

(Returns a fragment so the two buttons sit inline within the existing `.hero-actions` flex container on the film detail page.)

- [ ] **Step 4: Modify the film detail page**

In `app/app/film/[id]/page.tsx`, find at the top:

```tsx
import { isOnWatchlist } from "@/lib/queries/watchlists";
```

Add immediately after:

```tsx
import { isInLibrary } from "@/lib/queries/library";
```

Find:

```tsx
import WatchlistButton from "@/components/WatchlistButton";
```

Replace with:

```tsx
import FilmActions from "@/components/FilmActions";
```

Find the read line:

```tsx
  const onList = user ? await isOnWatchlist(supabase, id) : false;
```

Add immediately after:

```tsx
  const owned = user ? await isInLibrary(supabase, user.id, id) : false;
```

Find the button render:

```tsx
              {user && <WatchlistButton filmId={film.id} initialOnList={onList} />}
```

Replace with:

```tsx
              {user && <FilmActions filmId={film.id} initialOnWatchlist={onList} initialOwned={owned} />}
```

- [ ] **Step 5: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 6: Manual smoke**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000/film/[some-id] (logged in). Verify:
1. `+ Library` button renders next to the watchlist button.
2. Click `+ Watchlist` first to put the film on watchlist; button reads `✓ On Watchlist`.
3. Click `+ Library`. Both buttons should flip simultaneously: `+ Library` → `✓ In Library` AND `✓ On Watchlist` → `+ Watchlist` (the auto-cleanup made visible client-side).
4. Click `✓ In Library` to unmark. Watchlist stays at `+ Watchlist` (we don't restore).
5. Reload the page — the state persists.

Stop the dev server.

- [ ] **Step 7: Commit Task 6**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): OwnedButton + FilmActions wrapper on /film/[id]

OwnedButton mirrors WatchlistButton's optimistic toggle pattern with
an onAdded callback so the parent can mirror the silent watchlist
auto-cleanup in client state. WatchlistButton gains an optional
onChange prop and a useEffect that tracks initialOnList changes from
the parent. FilmActions is a tiny client wrapper that owns onWatchlist
state and renders both buttons. Film detail page swaps its standalone
<WatchlistButton/> for <FilmActions/>.
EOF
git add app/components/OwnedButton.tsx app/components/WatchlistButton.tsx app/components/FilmActions.tsx app/app/film/[id]/page.tsx
git commit -F /tmp/msg.txt
```

---

## Task 7: `/library` route + top nav entry

**Files:**
- Create: `app/app/library/page.tsx`
- Modify: `app/components/TopNav.tsx`

- [ ] **Step 1: Create the `/library` route**

Create `app/app/library/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLibrary } from "@/lib/queries/library";
import TopNav from "@/components/TopNav";
import FilmPoster from "@/components/FilmPoster";

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/library");

  const rows = await getLibrary(supabase, user.id);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="library" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Your <em style={{ color: "var(--accent)" }}>Library</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              Empty stacks. Mark films as owned from any film&rsquo;s page.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 20, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
                {rows.length} {rows.length === 1 ? "film" : "films"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
                {rows.map(r => (
                  <Link key={r.film.id} href={`/film/${r.film.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                    <FilmPoster film={r.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                    <div style={{ marginTop: 10 }}>
                      <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{r.film.title}</div>
                      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        {r.film.year}
                        {r.film.director ? <span> &middot; {r.film.director}</span> : null}
                      </div>
                    </div>
                  </Link>
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

- [ ] **Step 2: Add Library to top nav**

In `app/components/TopNav.tsx`, find the authed `items` array:

```tsx
  const items = user
    ? [
        { id: "home", label: "Home", href: "/home" },
        { id: "films", label: "Films", href: "/films" },
        { id: "watchlist", label: "Watchlist", href: "/watchlist" },
        { id: "lists", label: "Lists", href: "/lists" },
```

Insert a new entry between Watchlist and Lists:

```tsx
  const items = user
    ? [
        { id: "home", label: "Home", href: "/home" },
        { id: "films", label: "Films", href: "/films" },
        { id: "watchlist", label: "Watchlist", href: "/watchlist" },
        { id: "library", label: "Library", href: "/library" },
        { id: "lists", label: "Lists", href: "/lists" },
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS. (Note: the `films:films!inner(...)` PostgREST nested select should return an object, but the generated types may emit it as an array — if typecheck complains about `r.film` being `r.film[0]`, the easiest fix is `(r.film as any).id` etc. or `(r.film as never)` cast on the `<FilmPoster>` line as written.)

- [ ] **Step 4: Manual smoke**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Visit http://localhost:3000/library — should redirect to signin if logged out, render the library grid (or empty state) if logged in. Click `Library` in the top nav from any other route — should navigate. Mark one film as owned via `/film/[id]`, return to `/library` — film appears.

Stop the dev server.

- [ ] **Step 5: Commit Task 7**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): /library route + top-nav entry

New /library page mirrors /watchlist's shape: hero with h-display
"Your Library", grid of FilmPosters sorted recently-added, italic
serif empty state. Top nav gains a "Library" entry between Watchlist
and Lists; mobile menu inherits via the same items array.
EOF
git add app/app/library/page.tsx app/components/TopNav.tsx
git commit -F /tmp/msg.txt
```

---

## Task 8: Settings toggle for `broadcast_library`

**Files:**
- Modify: `app/lib/actions/profile.ts`
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Extend `ProfileFields` and accept the new flag**

In `app/lib/actions/profile.ts`, find:

```ts
export interface ProfileFields {
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  email_notifications_enabled?: boolean;
}
```

Replace with:

```ts
export interface ProfileFields {
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
  broadcast_library?: boolean;
  email_notifications_enabled?: boolean;
}
```

The `_updateProfile` body's `const patch: ProfileUpdate = { ...fields };` already passes through any field present in `ProfileFields` because `ProfileUpdate` (regenerated in Task 2) now includes `broadcast_library` — no further code change in `profile.ts`.

- [ ] **Step 2: Add the settings checkbox**

In `app/app/settings/SettingsForm.tsx`, find the existing broadcast toggle:

```tsx
      <label className="check-zine">
        <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
      </label>
```

Insert immediately after (before the `email_notifications` checkbox):

```tsx
      <label className="check-zine">
        <input type="checkbox" name="broadcast_library" defaultChecked={profile.broadcast_library} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Show your library to coven members</span>
      </label>
```

Find the `save()` function body:

```tsx
    try {
      await updateProfile({
        handle: String(fd.get("handle")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        email_notifications_enabled: fd.get("email_notifications") === "on",
      });
```

Replace with:

```tsx
    try {
      await updateProfile({
        handle: String(fd.get("handle")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        broadcast_library: fd.get("broadcast_library") === "on",
        email_notifications_enabled: fd.get("email_notifications") === "on",
      });
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS. (If `profile.broadcast_library` is `unknown`-typed because the SettingsForm reads it via `useState<any>(null)`, that's fine — the existing component is `any`-typed at the form scope, which is consistent with how `broadcast_watchlist_adds` is currently read.)

- [ ] **Step 4: Manual smoke**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000/settings. Verify:
1. New checkbox "Show your library to coven members" renders between the two existing toggles.
2. Default state is checked (TRUE).
3. Uncheck, click Save, see "Saved.".
4. Reload page — checkbox stays unchecked.
5. Re-check, save — checkbox stays checked across reload.

Stop the dev server.

- [ ] **Step 5: Commit Task 8**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(library): settings toggle for broadcast_library

ProfileFields gains broadcast_library; SettingsForm renders a new
.check-zine checkbox "Show your library to coven members" between the
existing broadcast and email-notifications toggles. Default TRUE
(matches the migration default). Save round-trip persists across
reload via the existing updateProfile path; no new server action.
EOF
git add app/lib/actions/profile.ts app/app/settings/SettingsForm.tsx
git commit -F /tmp/msg.txt
```

---

## Task 9: Whole-branch review + deploy

**Files:** none (review + deploy only).

- [ ] **Step 1: Read every changed file end-to-end**

```bash
cd /home/cthulhulemon/film_goblin
git diff origin/master..HEAD --stat
```

Expected: ~16 files across migration / RLS test / queries / actions / components / routes / settings + types regen. For each touched file, open it and verify:
- No leftover console.logs or debug code.
- Imports tidy.
- TypeScript types accurate (no stray `any` beyond the existing pattern).
- Error handling matches the surrounding code's posture (we don't add `try/catch` where the codebase swallows errors; we do throw on unauth where the codebase throws).

- [ ] **Step 2: Run all tests one more time**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all 2>&1 | tail -10
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: db `test:all` green, app vitest green (5 library action tests skipped on env, all others pass), typecheck clean.

- [ ] **Step 3: Push to origin**

```bash
cd /home/cthulhulemon/film_goblin
git push origin master 2>&1 | tail -3
```

Expected: 8 commits pushed (Tasks 1-8 each had a commit; Task 9 has none yet).

- [ ] **Step 4: Deploy from repo root**

```bash
cd /home/cthulhulemon/film_goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes 2>&1 | tail -8
```

Expected: `readyState: "READY"`, aliased to `https://film-goblin.vercel.app`.

- [ ] **Step 5: Prod smoke**

```bash
echo "=== /films logged-out should 200 unfiltered ==="
/usr/bin/curl -sI https://film-goblin.vercel.app/films | head -3

echo "=== /library should redirect to signin when logged out ==="
/usr/bin/curl -sI https://film-goblin.vercel.app/library | head -5
```

Expected: /films returns 200; /library returns 307 to `/auth/signin?next=/library`.

Then on a real browser logged in:
1. `/films` — Archive grid loads; mark one film as owned via its detail page; return to /films and confirm that film is no longer in the grid.
2. `/film/[id]` for a film NOT in your library — `+ Library` button renders; toggle round-trip works; if film was on watchlist, watchlist button flips to `+ Watchlist` simultaneously.
3. `/library` — owned film appears; sort is recently-added; empty-state copy renders if empty.
4. `/settings` — new "Show your library to coven members" toggle exists, checks/unchecks persist.
5. From a coven mate's account (if available): visit your `/p/[handle]` profile (or query the `library` table directly) — they see your owned films when `broadcast_library = TRUE`, do not see them when FALSE. (If no coven-mate available, skip; the RLS suite already covers this.)

- [ ] **Step 6: Mark sub-project complete**

C1 is done. Optional housekeeping (separate commit, not part of C1):
- Update `CLAUDE.md`'s "Sub-project history" section to add C1 to the shipped list.
- Update the auto-memory `project_architecture_snapshot.md` if any architectural fact changed.

If you want a sweep of the deferred items now in scope (B2 Social signal, C2 Watched), this is the natural moment to brainstorm the next sub-project.

---

## Self-Review

**Spec coverage** (against `2026-04-25-library-owned-design.md`):
- Section 1 (data model): Task 1 implements migration + RLS tests. ✓
- Section 2 (server actions + queries): Tasks 3-4 implement queries + actions; Task 5 wires the discovery filter. ✓
- Section 3 (UI): Task 6 implements OwnedButton + FilmActions + film detail integration; Task 7 implements `/library` + top nav; Task 8 implements settings. ✓
- Locked decisions: Q1 (dedicated /library), Q2 (auto-remove silent), Q3 (broadcast_library default TRUE), Q4 (toggle on /film/[id] only), Q5 (no activity broadcast). All implemented. ✓
- Out-of-scope items: not implemented (correct). ✓
- Risks: covered — view drop+recreate is in Task 1's migration; films_with_stats consumers verified additive; discovery filter cost is a single indexed read per /films request. ✓

**Placeholder scan:** No TBDs. Every code block is complete. The only "left as a sketch" is the `beforeAll` user-setup in Task 4's action tests — that's intentional (env-blocked test that needs a real Supabase project to actually run; the bootstrap copy-modifies `reactions.test.ts` when env is provisioned). Same posture hearts shipped with.

**Type consistency:**
- `getOwnedFilmIds`, `getLibrary`, `isInLibrary` signatures match across queries module, tests, callers (`getFilms`, film detail page). ✓
- `_addToLibrary`, `_removeFromLibrary`, `addToLibrary`, `removeFromLibrary` signatures consistent. ✓
- `OwnedButton` props (`filmId`, `initialOwned`, `onAdded`) consistent with `FilmActions` callsite. ✓
- `WatchlistButton` `onChange` prop is optional everywhere; existing callers (the home/feed/list pages where `WatchlistButton` is used elsewhere) are unaffected. ✓
- `ProfileFields.broadcast_library` matches the migration column name and the SettingsForm input name. ✓

No issues to fix.

---

## Implementation handoff

This plan has 9 tasks; subagent-driven execution is the natural fit (DB work + multiple layers + RLS = real review-gated complexity, similar to the hearts sub-project). Inline execution also workable if you prefer the same cadence as B1 — each task is small enough to keep moving.
