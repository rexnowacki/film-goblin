# FYP Discover Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-expose the FYP inside `/films` as a shelf-based For You tab with a Daily Omen, "not interested" dismissals, and impression fatigue.

**Architecture:** Presentation-layer shelves (`fyp/shelves.ts`, pure) on top of the untouched v3 scorer; two new user-owned tables (`fyp_impressions` + batch RPC, `fyp_not_interested`); two additive `ScoreContext` inputs (dismissal exclusion, fatigue multiplier); `/films` becomes a two-tab Discover shell.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS + PL/pgSQL RPC), vitest, testcontainers (db RLS tests).

**Spec:** `docs/superpowers/specs/2026-07-01-fyp-discover-shelves-design.md`

## Global Constraints

- Node 20: prefix all npm/node commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- App tests/typecheck run from `app/`; db tests from `db/`. `db npm run test:rls` needs Docker/Colima (see memory: Colima env vars).
- `app/lib/supabase/types.ts` is hand-edited — do NOT run `gen:types`.
- v3 scoring math unchanged; new `ScoreContext` fields are **optional** so existing tests compile untouched.
- Existing FYP tests (`app/tests/queries/fyp/affinity.test.ts`, `score.test.ts`) must keep passing.
- Migrations are 0206 and 0207 (0205 is latest). Both use `SECURITY DEFINER ... SET search_path = public` for RPCs (per `burn_invite_code` precedent; no extension functions needed).
- Commit messages via `Write` to a temp file + `git commit -F` (heredoc gotcha).
- Branch: `feature/fyp-discover-shelves` (already exists, spec committed).
- User-facing copy says "For You", "Daily Omen", "Hexed for You" etc. — never internal band slugs.

---

### Task 1: Migration 0206 — `fyp_impressions` + `record_fyp_impressions` RPC

**Files:**
- Create: `db/migrations/0206_fyp_impressions.sql`
- Test: `db/tests/rls/fyp-impressions.test.ts`

**Interfaces:**
- Produces: table `fyp_impressions(user_id, film_id, impressions, first_shown_at, last_shown_at)`; RPC `record_fyp_impressions(p_film_ids uuid[]) RETURNS void` callable by `authenticated`, keyed on `auth.uid()`.

- [ ] **Step 1: Write the migration**

```sql
-- 0206_fyp_impressions.sql
-- FYP impression tracking (sub-project: FYP Discover Shelves).
-- Users SELECT their own rows; all writes go through the RPC.

CREATE TABLE fyp_impressions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  impressions int NOT NULL DEFAULT 1,
  first_shown_at timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

ALTER TABLE fyp_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY fyp_impressions_select_own ON fyp_impressions
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON fyp_impressions TO authenticated;

-- Race-safe batch upsert. Unknown film ids are silently skipped (JOIN films)
-- so a stale client can never error the fire-and-forget path. Caps at 50 ids.
CREATE OR REPLACE FUNCTION record_fyp_impressions(p_film_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_film_ids IS NULL
     OR array_length(p_film_ids, 1) IS NULL
     OR array_length(p_film_ids, 1) > 50 THEN
    RETURN;
  END IF;

  INSERT INTO fyp_impressions (user_id, film_id)
  SELECT auth.uid(), f.id
  FROM unnest(p_film_ids) AS ids(id)
  JOIN films f ON f.id = ids.id
  ON CONFLICT (user_id, film_id) DO UPDATE
    SET impressions = fyp_impressions.impressions + 1,
        last_shown_at = now();
END;
$$;

REVOKE ALL ON FUNCTION record_fyp_impressions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_fyp_impressions(uuid[]) TO authenticated;
```

- [ ] **Step 2: Run pg-mem smoke — expect skip, not failure**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: PASS. The file contains `LANGUAGE plpgsql SECURITY DEFINER`, so pg-mem's strip filter skips it entirely (per `db/CLAUDE.md`). If pg-mem errors on this file, add `0206_fyp_impressions.sql` to the skip list in `db/tests/helpers/pg-mem.ts` — do not rewrite the migration.

- [ ] **Step 3: Write the failing RLS test**

Copy the shape of `db/tests/rls/library.test.ts` (fixtures/helpers imports come from that template — reuse its exact import paths):

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, beginAs, commit } from "../helpers/testcontainers";
import { seedFixtures } from "../helpers/fixtures";

let db: Awaited<ReturnType<typeof makeTestDb>>;
let fx: Awaited<ReturnType<typeof seedFixtures>>;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query("DELETE FROM fyp_impressions");
  await commit(db.client);
});

describe("fyp_impressions RLS + record_fyp_impressions RPC", () => {
  it("RPC inserts on first call and increments on repeat", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await db.client.query("SELECT record_fyp_impressions($1::uuid[])", [[fx.filmId]]);
    await commit(db.client);

    await beginAs(db.client, fx.userA, "authenticated");
    await db.client.query("SELECT record_fyp_impressions($1::uuid[])", [[fx.filmId]]);
    const { rows } = await db.client.query(
      "SELECT impressions FROM fyp_impressions WHERE user_id = $1 AND film_id = $2",
      [fx.userA, fx.filmId],
    );
    await commit(db.client);
    expect(rows[0].impressions).toBe(2);
  });

  it("users cannot see each other's impressions", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await db.client.query("SELECT record_fyp_impressions($1::uuid[])", [[fx.filmId]]);
    await commit(db.client);

    await beginAs(db.client, fx.userB, "authenticated");
    const { rows } = await db.client.query("SELECT * FROM fyp_impressions");
    await commit(db.client);
    expect(rows).toHaveLength(0);
  });

  it("direct INSERT is denied to authenticated (writes only via RPC)", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await expect(
      db.client.query(
        "INSERT INTO fyp_impressions (user_id, film_id) VALUES ($1, $2)",
        [fx.userA, fx.filmId],
      ),
    ).rejects.toThrow();
    await db.client.query("ROLLBACK");
  });

  it("unknown film ids are skipped, not errored", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await db.client.query("SELECT record_fyp_impressions($1::uuid[])", [
      ["00000000-0000-0000-0000-000000000000", fx.filmId],
    ]);
    const { rows } = await db.client.query("SELECT film_id FROM fyp_impressions");
    await commit(db.client);
    expect(rows).toHaveLength(1);
    expect(rows[0].film_id).toBe(fx.filmId);
  });
});
```

Adjust helper import paths/names to match `library.test.ts` exactly (e.g. if the helper file is `db/tests/rls/helpers.ts` or fixtures expose `fx.filmA` instead of `fx.filmId`, follow the template — the template is authoritative).

- [ ] **Step 4: Run RLS test to verify it fails** (table doesn't exist yet in test DB until migrations apply — testcontainers applies all migrations, so after Step 1 the migration exists; the failure mode to check first is test-shape errors)

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- fyp-impressions`
Expected: PASS if migration + test are both correct. If it fails, fix the failing assertion/SQL — do not weaken the policies.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0206_fyp_impressions.sql db/tests/rls/fyp-impressions.test.ts
git commit -m "feat(db): fyp_impressions table + record_fyp_impressions RPC (mig 0206)"
```

---

### Task 2: Migration 0207 — `fyp_not_interested`

**Files:**
- Create: `db/migrations/0207_fyp_not_interested.sql`
- Test: `db/tests/rls/fyp-not-interested.test.ts`

**Interfaces:**
- Produces: table `fyp_not_interested(user_id, film_id, created_at)`; authenticated users SELECT/INSERT/DELETE own rows.

- [ ] **Step 1: Write the migration**

```sql
-- 0207_fyp_not_interested.sql
-- Explicit "not interested" dismissals for the FYP. User-owned; DELETE = undo.

CREATE TABLE fyp_not_interested (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

ALTER TABLE fyp_not_interested ENABLE ROW LEVEL SECURITY;

CREATE POLICY fyp_not_interested_select_own ON fyp_not_interested
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY fyp_not_interested_insert_own ON fyp_not_interested
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY fyp_not_interested_delete_own ON fyp_not_interested
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON fyp_not_interested TO authenticated;
```

- [ ] **Step 2: Write the RLS test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, beginAs, commit } from "../helpers/testcontainers";
import { seedFixtures } from "../helpers/fixtures";

let db: Awaited<ReturnType<typeof makeTestDb>>;
let fx: Awaited<ReturnType<typeof seedFixtures>>;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query("DELETE FROM fyp_not_interested");
  await commit(db.client);
});

describe("fyp_not_interested RLS", () => {
  it("user can insert and delete their own dismissal", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await db.client.query(
      "INSERT INTO fyp_not_interested (user_id, film_id) VALUES ($1, $2)",
      [fx.userA, fx.filmId],
    );
    const ins = await db.client.query("SELECT * FROM fyp_not_interested");
    expect(ins.rows).toHaveLength(1);
    await db.client.query(
      "DELETE FROM fyp_not_interested WHERE user_id = $1 AND film_id = $2",
      [fx.userA, fx.filmId],
    );
    const del = await db.client.query("SELECT * FROM fyp_not_interested");
    await commit(db.client);
    expect(del.rows).toHaveLength(0);
  });

  it("user cannot insert a dismissal for another user", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await expect(
      db.client.query(
        "INSERT INTO fyp_not_interested (user_id, film_id) VALUES ($1, $2)",
        [fx.userB, fx.filmId],
      ),
    ).rejects.toThrow();
    await db.client.query("ROLLBACK");
  });

  it("users cannot see each other's dismissals", async () => {
    await beginAs(db.client, fx.userA, "authenticated");
    await db.client.query(
      "INSERT INTO fyp_not_interested (user_id, film_id) VALUES ($1, $2)",
      [fx.userA, fx.filmId],
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB, "authenticated");
    const { rows } = await db.client.query("SELECT * FROM fyp_not_interested");
    await commit(db.client);
    expect(rows).toHaveLength(0);
  });
});
```

(Same template caveat as Task 1: mirror `library.test.ts` helper imports exactly.)

- [ ] **Step 3: Run both db suites**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all`
Expected: PASS (pg-mem applies 0207 fine — plain DDL minus stripped RLS/GRANT lines).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0207_fyp_not_interested.sql db/tests/rls/fyp-not-interested.test.ts
git commit -m "feat(db): fyp_not_interested table (mig 0207)"
```

---

### Task 3: Hand-edit `types.ts` for the new tables + RPC

**Files:**
- Modify: `app/lib/supabase/types.ts` (add two Tables entries + one Functions entry)

**Interfaces:**
- Produces: `Database["public"]["Tables"]["fyp_impressions"]`, `["fyp_not_interested"]`, `Database["public"]["Functions"]["record_fyp_impressions"]` so `client.from(...)` and `client.rpc("record_fyp_impressions", { p_film_ids })` typecheck in later tasks.

- [ ] **Step 1: Add table types** — inside the `Tables` object (alphabetical placement near other `f*` tables), following the exact shape of neighboring entries:

```ts
fyp_impressions: {
  Row: {
    user_id: string;
    film_id: string;
    impressions: number;
    first_shown_at: string;
    last_shown_at: string;
  };
  Insert: {
    user_id: string;
    film_id: string;
    impressions?: number;
    first_shown_at?: string;
    last_shown_at?: string;
  };
  Update: {
    user_id?: string;
    film_id?: string;
    impressions?: number;
    first_shown_at?: string;
    last_shown_at?: string;
  };
  Relationships: [];
};
fyp_not_interested: {
  Row: {
    user_id: string;
    film_id: string;
    created_at: string;
  };
  Insert: {
    user_id: string;
    film_id: string;
    created_at?: string;
  };
  Update: {
    user_id?: string;
    film_id?: string;
    created_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 2: Add the RPC to the `Functions` section** (match the shape of existing entries like `burn_invite_code`):

```ts
record_fyp_impressions: {
  Args: { p_film_ids: string[] };
  Returns: undefined;
};
```

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/supabase/types.ts
git commit -m "types: fyp_impressions + fyp_not_interested tables, record_fyp_impressions RPC"
```

---

### Task 4: `score.ts` — dismissal exclusion + impression fatigue

**Files:**
- Modify: `app/lib/queries/fyp/score.ts`
- Test: `app/tests/queries/fyp/score.test.ts` (append new describe blocks; existing tests untouched)

**Interfaces:**
- Consumes: existing `ScoreContext`, `scoreOneFilm`, `scoreFilms`.
- Produces: `ScoreContext` gains OPTIONAL fields `notInterestedFilmIds?: Set<string>` and `impressionsByFilm?: Map<string, number>`; exported constants `FATIGUE_FREE_IMPRESSIONS = 3`, `FATIGUE_K = 0.15`, `FATIGUE_FLOOR = 0.35`.

- [ ] **Step 1: Write failing tests** (append to `score.test.ts`; build a full `ScoreContext` inline so the tests are self-contained):

```ts
import { scoreFilms, scoreOneFilm, FATIGUE_FREE_IMPRESSIONS, FATIGUE_K, FATIGUE_FLOOR } from "@/lib/queries/fyp/score";
// (merge into the file's existing import line)

function baseCtx(over: Partial<import("@/lib/queries/fyp/score").ScoreContext> = {}) {
  return {
    userWatchedFilmIds: new Set<string>(),
    userDislikedFilmIds: new Set<string>(),
    covenRatingByFilm: new Map<string, number>(),
    ownDirectors: new Set<string>(),
    lanesByTag: new Set<string>(),
    idfByTag: new Map<string, number>(),
    aversion: { byTag: {} },
    ...over,
  };
}

const tag = (name: string): import("@/lib/queries/film-tags").FilmTagRow =>
  ({ id: "t-" + name, name, type: "subgenre", position: 1, is_primary: true });

const filmInput = (id: string) => ({ id, director: "D", tags: [tag("folk-horror")] });
const affinity = { byTag: { "folk-horror": 10 } };

describe("v3.5 dismissal exclusion", () => {
  it("excludes not-interested films from scoreFilms output", () => {
    const out = scoreFilms([filmInput("f1"), filmInput("f2")], affinity,
      baseCtx({ notInterestedFilmIds: new Set(["f1"]) }));
    expect(out.map(s => s.filmId)).toEqual(["f2"]);
  });
});

describe("v3.5 impression fatigue", () => {
  it("first FATIGUE_FREE_IMPRESSIONS impressions cost nothing", () => {
    const fresh = scoreOneFilm(filmInput("f1"), affinity, baseCtx()).score;
    const shown = scoreOneFilm(filmInput("f1"), affinity,
      baseCtx({ impressionsByFilm: new Map([["f1", FATIGUE_FREE_IMPRESSIONS]]) })).score;
    expect(shown).toBe(fresh);
  });

  it("damps score beyond the free threshold", () => {
    const fresh = scoreOneFilm(filmInput("f1"), affinity, baseCtx()).score;
    const shown = scoreOneFilm(filmInput("f1"), affinity,
      baseCtx({ impressionsByFilm: new Map([["f1", FATIGUE_FREE_IMPRESSIONS + 4]]) })).score;
    expect(shown).toBeCloseTo(fresh * (1 / (1 + FATIGUE_K * 4)), 10);
  });

  it("never damps below FATIGUE_FLOOR", () => {
    const fresh = scoreOneFilm(filmInput("f1"), affinity, baseCtx()).score;
    const buried = scoreOneFilm(filmInput("f1"), affinity,
      baseCtx({ impressionsByFilm: new Map([["f1", 500]]) })).score;
    expect(buried).toBeCloseTo(fresh * FATIGUE_FLOOR, 10);
  });
});
```

If the existing file already defines helpers with these names, reuse them instead of redefining.

- [ ] **Step 2: Run to verify failure**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/fyp/score.test.ts`
Expected: FAIL — `FATIGUE_FREE_IMPRESSIONS` not exported.

- [ ] **Step 3: Implement.** In `score.ts`:

Add constants below `AVERSION_LAMBDA`:

```ts
/**
 * Impression fatigue (v3.5). The first FATIGUE_FREE_IMPRESSIONS impressions
 * cost nothing; beyond that the score is multiplied by
 * max(FATIGUE_FLOOR, 1 / (1 + FATIGUE_K × excess)). A great match sinks
 * with repeated ignoring but never vanishes.
 * Feed feels sticky → raise FATIGUE_K. Good films vanish → raise FATIGUE_FLOOR.
 */
export const FATIGUE_FREE_IMPRESSIONS = 3;
export const FATIGUE_K = 0.15;
export const FATIGUE_FLOOR = 0.35;
```

Extend `ScoreContext` (both optional — existing tests construct the context without them):

```ts
/** Films the user explicitly dismissed ("not interested"). Hard-excluded. */
notInterestedFilmIds?: Set<string>;
/** Raw impression counts per film for fatigue damping. */
impressionsByFilm?: Map<string, number>;
```

In `scoreOneFilm`, after the coven-rating bonus and before `topReason` selection:

```ts
// v3.5 impression fatigue — applied last, as a multiplier on the whole score.
const impressions = ctx.impressionsByFilm?.get(film.id) ?? 0;
const excess = Math.max(0, impressions - FATIGUE_FREE_IMPRESSIONS);
if (excess > 0 && total > 0) {
  total *= Math.max(FATIGUE_FLOOR, 1 / (1 + FATIGUE_K * excess));
}
```

In `scoreFilms`'s loop, after the disliked check:

```ts
if (ctx.notInterestedFilmIds?.has(f.id)) continue;
```

- [ ] **Step 4: Run all FYP tests**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/fyp/`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/fyp/score.ts app/tests/queries/fyp/score.test.ts
git commit -m "feat(fyp): dismissal exclusion + impression fatigue in scorer"
```

---

### Task 5: `affinity.ts` — `not_interested` aversion signal

**Files:**
- Modify: `app/lib/queries/fyp/affinity.ts` (SIGNAL_WEIGHTS + `getUserAversion`)
- Test: `app/tests/queries/fyp/affinity.test.ts` (append)

**Interfaces:**
- Consumes: `getUserAversion(client, userId)` — existing signature unchanged.
- Produces: `SIGNAL_WEIGHTS.not_interested === -1.5`; `getUserAversion` also accumulates dismissed films' tags at weight `|−1.5| × decay × μ(facet)`.

- [ ] **Step 1: Write failing test.** Append to `affinity.test.ts`, using the file's existing stub-client helper if one exists; otherwise this self-contained stub (mirrors the query chains `getUserAversion` makes — `watched` filtered eq/eq, `fyp_not_interested` filtered eq, `film_tags` with `.in`):

```ts
import { getUserAversion, SIGNAL_WEIGHTS, FACET_MULTIPLIERS } from "@/lib/queries/fyp/affinity";

function aversionStubClient(opts: {
  disliked: Array<{ film_id: string; created_at: string }>;
  notInterested: Array<{ film_id: string; created_at: string }>;
  filmTags: Array<{ film_id: string; position: number; is_primary: boolean; tag: { name: string; type: string } }>;
}) {
  return {
    from(table: string) {
      const rows =
        table === "watched" ? opts.disliked
        : table === "fyp_not_interested" ? opts.notInterested
        : table === "film_tags" ? opts.filmTags
        : [];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  } as never;
}

describe("getUserAversion — not_interested contribution (v3.5)", () => {
  it("dismissed films' tags add aversion at the not_interested weight", async () => {
    const nowIso = new Date().toISOString();
    const client = aversionStubClient({
      disliked: [],
      notInterested: [{ film_id: "f1", created_at: nowIso }],
      filmTags: [{ film_id: "f1", position: 1, is_primary: true, tag: { name: "gore", type: "subgenre" } }],
    });
    const v = await getUserAversion(client, "u1");
    const expected = Math.abs(SIGNAL_WEIGHTS.not_interested) * FACET_MULTIPLIERS.subgenre_primary;
    expect(v.byTag["gore"]).toBeCloseTo(expected, 5);
  });

  it("stacks with watch_disliked on the same tag", async () => {
    const nowIso = new Date().toISOString();
    const client = aversionStubClient({
      disliked: [{ film_id: "f1", created_at: nowIso }],
      notInterested: [{ film_id: "f2", created_at: nowIso }],
      filmTags: [
        { film_id: "f1", position: 1, is_primary: true, tag: { name: "gore", type: "subgenre" } },
        { film_id: "f2", position: 1, is_primary: true, tag: { name: "gore", type: "subgenre" } },
      ],
    });
    const v = await getUserAversion(client, "u1");
    const expected =
      (Math.abs(SIGNAL_WEIGHTS.watch_disliked) + Math.abs(SIGNAL_WEIGHTS.not_interested)) *
      FACET_MULTIPLIERS.subgenre_primary;
    expect(v.byTag["gore"]).toBeCloseTo(expected, 5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/fyp/affinity.test.ts`
Expected: FAIL — `SIGNAL_WEIGHTS.not_interested` undefined / byTag missing.

- [ ] **Step 3: Implement.** In `affinity.ts`:

Add to `SIGNAL_WEIGHTS`:

```ts
// "Not for me" is milder than "watched and hated" (v3.5 FYP dismissals).
not_interested: -1.5,
```

In `getUserAversion`, replace the single `disliked` fetch with a parallel pair, and merge both into `filmWeights`:

```ts
const [dislikedRes, dismissedRes] = await Promise.all([
  client
    .from("watched")
    .select("film_id, created_at")
    .eq("user_id", userId)
    .eq("recommended", false),
  client
    .from("fyp_not_interested")
    .select("film_id, created_at")
    .eq("user_id", userId),
]);

const disliked = dislikedRes.data ?? [];
const dismissed = dismissedRes.data ?? [];
if (disliked.length === 0 && dismissed.length === 0) return { byTag: {} };

const now = Date.now();
const filmWeights = new Map<string, number>();

for (const w of disliked) {
  const decay = timeDecay(w.created_at, now);
  filmWeights.set(
    w.film_id,
    (filmWeights.get(w.film_id) ?? 0) + Math.abs(SIGNAL_WEIGHTS.watch_disliked) * decay,
  );
}
for (const d of dismissed) {
  const decay = timeDecay(d.created_at, now);
  filmWeights.set(
    d.film_id,
    (filmWeights.get(d.film_id) ?? 0) + Math.abs(SIGNAL_WEIGHTS.not_interested) * decay,
  );
}
```

The rest of the function (film_tags fetch, facet multiply, floor/cap) is unchanged.

- [ ] **Step 4: Run all FYP tests** — same command as Task 4 Step 4. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/fyp/affinity.ts app/tests/queries/fyp/affinity.test.ts
git commit -m "feat(fyp): not_interested feeds the aversion vector at -1.5"
```

---

### Task 6: `shelves.ts` — seed, RNG, Daily Omen

**Files:**
- Create: `app/lib/queries/fyp/shelves.ts`
- Test: `app/tests/queries/fyp/shelves.test.ts`

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number`; `dailySeed(userId: string, now: Date): number`; `pickOmen(scored: ScoredFilm[], rand: () => number): ScoredFilm | null`. Also the types `ShelfKind`, `Shelf { id; kind; title; filmIds }`, `ShelfFilmMeta { director; addedAt; primarySubgenre }` used by Task 7.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { dailySeed, mulberry32, pickOmen } from "@/lib/queries/fyp/shelves";
import type { ScoredFilm } from "@/lib/queries/fyp/score";

const scoredFilm = (id: string, score = 1): ScoredFilm => ({
  filmId: id,
  score,
  topReason: { kind: "tag", tagName: "folk-horror", contribution: score },
  matchPercent: null,
  matchVerbal: null,
  matchBand: "hexed",
  covenFavorite: false,
});

describe("dailySeed", () => {
  it("is stable for the same user + UTC day", () => {
    expect(dailySeed("u1", new Date("2026-07-01T03:00:00Z")))
      .toBe(dailySeed("u1", new Date("2026-07-01T22:00:00Z")));
  });
  it("changes across days and across users", () => {
    expect(dailySeed("u1", new Date("2026-07-01T12:00:00Z")))
      .not.toBe(dailySeed("u1", new Date("2026-07-02T12:00:00Z")));
    expect(dailySeed("u1", new Date("2026-07-01T12:00:00Z")))
      .not.toBe(dailySeed("u2", new Date("2026-07-01T12:00:00Z")));
  });
});

describe("pickOmen", () => {
  const pool = Array.from({ length: 20 }, (_, i) => scoredFilm(`f${i}`));

  it("picks deterministically from the top 12 for a given seed", () => {
    const a = pickOmen(pool, mulberry32(42));
    const b = pickOmen(pool, mulberry32(42));
    expect(a!.filmId).toBe(b!.filmId);
    expect(Number(a!.filmId.slice(1))).toBeLessThan(12);
  });

  it("returns null on an empty pool", () => {
    expect(pickOmen([], mulberry32(42))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/fyp/shelves.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { ScoredFilm } from "./score";

export type ShelfKind = "hexed" | "loved_tag" | "coven" | "new" | "strange" | "starter";

export interface Shelf {
  id: string;    // stable per kind (+tag), e.g. "loved:folk-horror"
  kind: ShelfKind;
  title: string;
  filmIds: string[];
}

/** Per-film metadata the shelf assembler needs beyond ScoredFilm. */
export interface ShelfFilmMeta {
  director: string;
  addedAt: string;                 // films.added_at ISO
  primarySubgenre: string | null;  // primary subgenre tag name, if tagged
}

/** Films eligible for the Daily Omen: the user's top-N by score. */
export const OMEN_POOL = 12;

/** Deterministic PRNG — standard mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over `userId:YYYY-MM-DD` (UTC) — same seed all day, new at midnight. */
export function dailySeed(userId: string, now: Date): number {
  const key = `${userId}:${now.toISOString().slice(0, 10)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * The Daily Omen: a seeded pick from the top OMEN_POOL scored films.
 * Deterministic within a UTC day (same seed). If the pool shrinks mid-day
 * (a film watched/dismissed), the pick re-lands deterministically on the
 * changed pool at next render.
 */
export function pickOmen(scored: ScoredFilm[], rand: () => number): ScoredFilm | null {
  const pool = scored.slice(0, OMEN_POOL);
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)];
}
```

- [ ] **Step 4: Run tests** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/fyp/shelves.ts app/tests/queries/fyp/shelves.test.ts
git commit -m "feat(fyp): shelves module — daily seed, PRNG, omen pick"
```

---

### Task 7: `shelves.ts` — `buildShelves` + diversity guard

**Files:**
- Modify: `app/lib/queries/fyp/shelves.ts`
- Test: `app/tests/queries/fyp/shelves.test.ts` (append)

**Interfaces:**
- Consumes: Task 6 exports; `ScoredFilm` (with `matchBand`, `topReason`, `covenFavorite`); `AffinityVector`.
- Produces:

```ts
export interface BuildShelvesInput {
  scored: ScoredFilm[];                       // sorted best-first
  metaByFilm: Map<string, ShelfFilmMeta>;
  affinity: AffinityVector;
  covenRatingByFilm: Map<string, number>;
  seed: number;
  now: Date;
}
export function buildShelves(input: BuildShelvesInput): { omen: ScoredFilm | null; shelves: Shelf[] };
export function diversityGuard(filmIds: string[], meta: Map<string, ShelfFilmMeta>): string[];
export function starterShelf(filmIds: string[]): Shelf;
```

- [ ] **Step 1: Write failing tests** (append; extend the `scoredFilm` helper with overrides):

```ts
import { buildShelves, diversityGuard, starterShelf, type ShelfFilmMeta } from "@/lib/queries/fyp/shelves";
import type { MatchBand } from "@/lib/queries/fyp/score";

const sf = (id: string, over: Partial<ScoredFilm> = {}): ScoredFilm => ({
  ...scoredFilm(id), ...over,
});
const meta = (director: string, addedAt = "2026-01-01", primarySubgenre: string | null = null): ShelfFilmMeta =>
  ({ director, addedAt, primarySubgenre });

describe("diversityGuard", () => {
  it("caps films per primary subgenre at 3", () => {
    const m = new Map(["a", "b", "c", "d"].map(id => [id, meta("D" + id, "2026-01-01", "slasher")]));
    expect(diversityGuard(["a", "b", "c", "d"], m)).toEqual(["a", "b", "c"]);
  });

  it("breaks up consecutive same-director runs when possible", () => {
    const m = new Map<string, ShelfFilmMeta>([
      ["a", meta("Aster")], ["b", meta("Aster")], ["c", meta("Peele")],
    ]);
    const out = diversityGuard(["a", "b", "c"], m);
    expect(out).toEqual(["a", "c", "b"]);
  });
});

describe("buildShelves", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  function makePool() {
    // 20 films: 6 hexed, 6 strong_omen, 4 strange_pull, 4 good_omen
    const bands: MatchBand[] = [
      ...Array(6).fill("hexed"), ...Array(6).fill("strong_omen"),
      ...Array(4).fill("strange_pull"), ...Array(4).fill("good_omen"),
    ];
    const scored = bands.map((band, i) =>
      sf(`f${i}`, { matchBand: band, score: 20 - i }));
    const metaByFilm = new Map(scored.map((s, i) =>
      [s.filmId, meta(`Dir${i}`, "2026-01-01", null)]));
    return { scored, metaByFilm };
  }

  it("places each film in at most one shelf and excludes the omen", () => {
    const { scored, metaByFilm } = makePool();
    const { omen, shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 42, now,
    });
    const all = shelves.flatMap(s => s.filmIds);
    expect(new Set(all).size).toBe(all.length);
    expect(omen).not.toBeNull();
    expect(all).not.toContain(omen!.filmId);
  });

  it("drops shelves with fewer than 3 films", () => {
    const scored = [sf("f0", { matchBand: "strange_pull" }), sf("f1", { matchBand: "strange_pull" })];
    const metaByFilm = new Map(scored.map(s => [s.filmId, meta("D" + s.filmId)]));
    const { shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 1, now,
    });
    expect(shelves.find(s => s.kind === "strange")).toBeUndefined();
  });

  it("builds 'Because you loved [tag]' from the top affinity tags", () => {
    const scored = [
      sf("f0", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 5 } }),
      sf("f1", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 4 } }),
      sf("f2", { matchBand: "strong_omen", topReason: { kind: "tag", tagName: "folk-horror", contribution: 3 } }),
      sf("f3", { matchBand: "good_omen", topReason: { kind: "tag", tagName: "gore", contribution: 2 } }),
    ];
    const metaByFilm = new Map(scored.map((s, i) => [s.filmId, meta(`D${i}`)]));
    const { shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: { "folk-horror": 20, gore: 5 } },
      covenRatingByFilm: new Map(), seed: 1, now,
    });
    const loved = shelves.find(s => s.id === "loved:folk-horror");
    expect(loved).toBeDefined();
    expect(loved!.title).toBe("Because you loved folk-horror");
  });

  it("New to the Pit contains only recent adds, newest first, no cursed band", () => {
    const scored = [
      sf("f0", { matchBand: "good_omen" }), sf("f1", { matchBand: "good_omen" }),
      sf("f2", { matchBand: "good_omen" }), sf("f3", { matchBand: "cursed_artifact" }),
      sf("f4", { matchBand: "good_omen" }),
    ];
    const metaByFilm = new Map<string, ShelfFilmMeta>([
      ["f0", meta("D0", "2026-06-25")], ["f1", meta("D1", "2026-06-28")],
      ["f2", meta("D2", "2026-06-20")], ["f3", meta("D3", "2026-06-29")],
      ["f4", meta("D4", "2025-01-01")], // too old
    ]);
    const { shelves } = buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 999999, now,
    });
    const shelf = shelves.find(s => s.kind === "new");
    expect(shelf).toBeDefined();
    const ids = shelf!.filmIds.filter(id => id !== undefined);
    expect(ids).not.toContain("f3");
    expect(ids).not.toContain("f4");
    // newest-first among survivors (omen may have claimed one)
    const order = ids.map(id => metaByFilm.get(id)!.addedAt);
    expect([...order].sort().reverse()).toEqual(order);
  });

  it("shelf composition is stable for the same seed", () => {
    const { scored, metaByFilm } = makePool();
    const run = () => buildShelves({
      scored, metaByFilm, affinity: { byTag: {} },
      covenRatingByFilm: new Map(), seed: 7, now,
    });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe("starterShelf", () => {
  it("wraps ids as the Starter Séance shelf", () => {
    const s = starterShelf(["a", "b", "c"]);
    expect(s).toEqual({ id: "starter", kind: "starter", title: "Starter Séance", filmIds: ["a", "b", "c"] });
  });
});
```

- [ ] **Step 2: Run to verify failure** — same command as Task 6. Expected: FAIL (missing exports).

- [ ] **Step 3: Implement.** Append to `shelves.ts`:

```ts
import type { AffinityVector } from "./affinity";

const SHELF_MIN = 3;
const HEXED_MAX = 12;
const LOVED_MAX = 10;
const LOVED_SHELVES = 2;
const COVEN_MAX = 10;
const NEW_MAX = 10;
const NEW_WINDOW_DAYS = 30;
const STRANGE_MAX = 8;
const MAX_PER_SUBGENRE = 3;

export interface BuildShelvesInput {
  scored: ScoredFilm[];
  metaByFilm: Map<string, ShelfFilmMeta>;
  affinity: AffinityVector;
  covenRatingByFilm: Map<string, number>;
  seed: number;
  now: Date;
}

/** Fisher–Yates-ish seeded sample without replacement. */
function seededSample<T>(items: T[], count: number, rand: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length > 0 && out.length < count) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}

/**
 * Within-shelf diversity: (1) at most MAX_PER_SUBGENRE films per primary
 * subgenre (overflow dropped, later films promoted); (2) no two consecutive
 * films by the same director, repaired by swapping forward — when no
 * different-director candidate remains, the adjacency stands (small pools).
 */
export function diversityGuard(filmIds: string[], meta: Map<string, ShelfFilmMeta>): string[] {
  const bySub = new Map<string, number>();
  const capped: string[] = [];
  for (const id of filmIds) {
    const sub = meta.get(id)?.primarySubgenre ?? null;
    if (sub !== null) {
      const n = bySub.get(sub) ?? 0;
      if (n >= MAX_PER_SUBGENRE) continue;
      bySub.set(sub, n + 1);
    }
    capped.push(id);
  }
  const out = [...capped];
  for (let i = 1; i < out.length; i++) {
    const prev = meta.get(out[i - 1])?.director;
    if (meta.get(out[i])?.director !== prev) continue;
    let j = i + 1;
    while (j < out.length && meta.get(out[j])?.director === prev) j++;
    if (j < out.length) [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Assembles the For You shelves from an already-scored (sorted) list.
 * Placement priority: Omen → Hexed → Because-you-loved ×2 → Coven → New →
 * Strange. Each film lands in at most one shelf (first claim wins); the
 * omen film is excluded from all shelves. Shelves with < SHELF_MIN films
 * after the diversity guard are dropped.
 */
export function buildShelves(input: BuildShelvesInput): { omen: ScoredFilm | null; shelves: Shelf[] } {
  const { scored, metaByFilm, affinity, covenRatingByFilm, seed, now } = input;
  const rand = mulberry32(seed);
  const claimed = new Set<string>();
  const shelves: Shelf[] = [];

  const omen = pickOmen(scored, rand);
  if (omen) claimed.add(omen.filmId);

  const unclaimed = (pred: (s: ScoredFilm) => boolean) =>
    scored.filter(s => !claimed.has(s.filmId) && pred(s));

  const push = (kind: ShelfKind, id: string, title: string, ids: string[]) => {
    const guarded = diversityGuard(ids, metaByFilm);
    if (guarded.length < SHELF_MIN) return;
    for (const fid of guarded) claimed.add(fid);
    shelves.push({ id, kind, title, filmIds: guarded });
  };

  push("hexed", "hexed", "Hexed for You",
    unclaimed(s => s.matchBand === "hexed").slice(0, HEXED_MAX).map(s => s.filmId));

  const topTags = Object.entries(affinity.byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LOVED_SHELVES)
    .map(([t]) => t);
  for (const tagName of topTags) {
    push("loved_tag", `loved:${tagName}`, `Because you loved ${tagName}`,
      unclaimed(s =>
        (s.topReason.kind === "tag" || s.topReason.kind === "lane") &&
        s.topReason.tagName === tagName,
      ).slice(0, LOVED_MAX).map(s => s.filmId));
  }

  push("coven", "coven", "Coven Favorites",
    unclaimed(s => s.covenFavorite)
      .sort((a, b) => (covenRatingByFilm.get(b.filmId) ?? 0) - (covenRatingByFilm.get(a.filmId) ?? 0))
      .slice(0, COVEN_MAX).map(s => s.filmId));

  const cutoff = now.getTime() - NEW_WINDOW_DAYS * 86_400_000;
  push("new", "new", "New to the Pit",
    unclaimed(s => {
      if (s.matchBand === "cursed_artifact") return false;
      const added = metaByFilm.get(s.filmId)?.addedAt;
      return added != null && Date.parse(added) >= cutoff;
    })
      .sort((a, b) =>
        Date.parse(metaByFilm.get(b.filmId)?.addedAt ?? "") -
        Date.parse(metaByFilm.get(a.filmId)?.addedAt ?? ""))
      .slice(0, NEW_MAX).map(s => s.filmId));

  push("strange", "strange", "Strange Pulls",
    seededSample(unclaimed(s => s.matchBand === "strange_pull"), STRANGE_MAX, rand)
      .map(s => s.filmId));

  return { omen, shelves };
}

/** Cold-start shelf wrapper (alphabetical starter pack, minus the omen). */
export function starterShelf(filmIds: string[]): Shelf {
  return { id: "starter", kind: "starter", title: "Starter Séance", filmIds };
}
```

- [ ] **Step 4: Run shelves + full FYP suites** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/fyp/shelves.ts app/tests/queries/fyp/shelves.test.ts
git commit -m "feat(fyp): buildShelves — placement, diversity guard, starter shelf"
```

---

### Task 8: `forYou.ts` — `getForYouShelves` orchestrator

**Files:**
- Modify: `app/lib/queries/fyp/forYou.ts`
- Test: `app/tests/queries/fyp/for-you-shelves.test.ts`

**Interfaces:**
- Consumes: `buildShelves`, `dailySeed`, `pickOmen`, `mulberry32`, `starterShelf`, `starterPackScored`, `scoreFilms`, `getUserAffinity`, `getUserAversion`.
- Produces:

```ts
export interface FilmLite {   // gains added_at
  id: string; title: string; year: number; director: string;
  artwork_url: string | null; added_at: string;
}
export interface ForYouShelvesResult {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsById: Map<string, FilmLite>;
  scoredById: Map<string, ScoredFilm>;   // for MatchPill bands on cards
}
export async function getForYouShelves(client: Client, userId: string): Promise<ForYouShelvesResult>;
```

- [ ] **Step 1: Extend `FilmLite`** with `added_at: string`, and add `added_at` to every `films` select in `forYou.ts` (both the starter query and the candidate-pool query — the old `getForYou` compiles against the same type until Task 12 deletes it).

- [ ] **Step 2: Implement `getForYouShelves`.** Add to `forYou.ts` (it reuses the same fetch structure as `getForYou`; the flat `getForYou` is deleted in Task 12, so temporary duplication is acceptable):

```ts
import { buildShelves, dailySeed, mulberry32, pickOmen, starterShelf, type Shelf, type ShelfFilmMeta } from "./shelves";

export interface ForYouShelvesResult {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsById: Map<string, FilmLite>;
  scoredById: Map<string, ScoredFilm>;
}

/**
 * v3.5 orchestrator: same score pipeline as getForYou, plus impressions +
 * dismissals context, then shelf assembly. No pagination — shelves are
 * fully materialized (≤ ~60 films).
 */
export async function getForYouShelves(
  client: Client,
  userId: string,
): Promise<ForYouShelvesResult> {
  const now = new Date();
  const seed = dailySeed(userId, now);

  const [affinity, aversion] = await Promise.all([
    getUserAffinity(client, userId),
    getUserAversion(client, userId),
  ]);
  const hasAnySignal = Object.keys(affinity.byTag).length > 0;

  if (!hasAnySignal) {
    // Cold start: seeded omen from the starter pack + one alphabetical shelf.
    const [startersRes, watchedRes, dismissedRes] = await Promise.all([
      client
        .from("films")
        .select("id, title, year, director, artwork_url, added_at")
        .eq("editorial_starter", true)
        .eq("available", true)
        .order("title"),
      client.from("watched").select("film_id").eq("user_id", userId),
      client.from("fyp_not_interested").select("film_id").eq("user_id", userId),
    ]);
    const excluded = new Set([
      ...(watchedRes.data ?? []).map(w => w.film_id),
      ...(dismissedRes.data ?? []).map(d => d.film_id),
    ]);
    const starterList = ((startersRes.data ?? []) as FilmLite[]).filter(f => !excluded.has(f.id));
    const filmsById = new Map(starterList.map(f => [f.id, f]));
    const scored = starterPackScored(starterList.map(s => s.id));
    const omen = pickOmen(scored, mulberry32(seed));
    const rest = scored.filter(s => s.filmId !== omen?.filmId).map(s => s.filmId);
    return {
      omen,
      shelves: rest.length >= 3 ? [starterShelf(rest)] : [],
      filmsById,
      scoredById: new Map(scored.map(s => [s.filmId, s])),
    };
  }

  const [
    candidateFilms,
    watchedRows,
    dislikedRows,
    lanesProfile,
    covenRatings,
    ownWatchDirectors,
    impressionRows,
    dismissedRows,
  ] = await Promise.all([
    client
      .from("films")
      .select("id, title, year, director, artwork_url, added_at")
      .eq("available", true),
    client.from("watched").select("film_id").eq("user_id", userId),
    client.from("watched").select("film_id").eq("user_id", userId).eq("recommended", false),
    client.from("profiles").select("lane_tag_ids").eq("id", userId).maybeSingle(),
    client.from("films_with_stats").select("id, coven_rating_pct").eq("available", true),
    client.from("watched").select("film:films!inner(director)").eq("user_id", userId),
    client.from("fyp_impressions").select("film_id, impressions").eq("user_id", userId),
    client.from("fyp_not_interested").select("film_id").eq("user_id", userId),
  ]);

  // …tags fetch, tagsByFilmId, lanesByTag, IDF — copied verbatim from
  // getForYou (same code, same constants IDF_FLOOR/IDF_CEIL)…
  // [implementer: copy the blocks from getForYou lines "Fetch tags…" through
  //  "idfByTag.set(...)" unchanged]

  const covenRatingByFilm = new Map(
    (covenRatings.data ?? [])
      .filter((r): r is { id: string; coven_rating_pct: number } =>
        r.id != null && r.coven_rating_pct != null)
      .map(r => [r.id, r.coven_rating_pct]),
  );

  const ctx = {
    userWatchedFilmIds: new Set((watchedRows.data ?? []).map(w => w.film_id)),
    userDislikedFilmIds: new Set((dislikedRows.data ?? []).map(w => w.film_id)),
    covenRatingByFilm,
    ownDirectors: new Set(
      (ownWatchDirectors.data ?? [])
        .map(r => (r as unknown as { film: { director: string } }).film.director)
        .filter(Boolean),
    ),
    lanesByTag,
    idfByTag,
    aversion,
    notInterestedFilmIds: new Set((dismissedRows.data ?? []).map(d => d.film_id)),
    impressionsByFilm: new Map(
      (impressionRows.data ?? []).map(r => [r.film_id, r.impressions]),
    ),
  };

  const filmsList = (candidateFilms.data ?? []) as FilmLite[];
  const filmsById = new Map(filmsList.map(f => [f.id, f]));

  const scored = scoreFilms(
    filmsList.map(f => ({ id: f.id, director: f.director, tags: tagsByFilmId.get(f.id) ?? [] })),
    affinity,
    ctx,
  );

  const metaByFilm = new Map<string, ShelfFilmMeta>(
    filmsList.map(f => {
      const primary = (tagsByFilmId.get(f.id) ?? []).find(
        t => t.type === "subgenre" && t.is_primary,
      );
      return [f.id, {
        director: f.director,
        addedAt: f.added_at,
        primarySubgenre: primary?.name ?? null,
      }];
    }),
  );

  const { omen, shelves } = buildShelves({
    scored, metaByFilm, affinity, covenRatingByFilm, seed, now,
  });

  return { omen, shelves, filmsById, scoredById: new Map(scored.map(s => [s.filmId, s])) };
}
```

Note the bracketed implementer instruction above is NOT a placeholder for *design* — the exact code already exists verbatim in `getForYou` in the same file; copy it.

- [ ] **Step 3: Write the stub-client test.** Modeled on `app/tests/itunes-availability/check.test.ts`'s table-keyed stub (a `from(table)` switch resolving canned rows through a thenable chain). Cover:

```ts
// for-you-shelves.test.ts — assertions to implement with the stub client:
// 1. cold start (no signals anywhere): returns omen from starter pack +
//    single "starter" shelf, alphabetical minus omen; watched/dismissed
//    starter films excluded.
// 2. score path: a dismissed film id never appears in omen or any shelf.
// 3. score path: impressions rows flow into scoring (a film with 50
//    impressions ranks below its identically-tagged twin with 0).
```

Write the stub so each of the tables used above (`films`, `watched`, `profiles`, `films_with_stats`, `film_tags`, `tags`, `fyp_impressions`, `fyp_not_interested`) resolves canned fixtures; chain methods (`select/eq/in/order/maybeSingle`) all return the chain; `then` resolves `{ data, error: null }`. Keep fixtures minimal (4–6 films, 1–2 tags each).

- [ ] **Step 4: Run** `npx vitest run tests/queries/fyp/` — Expected: PASS (all suites).

- [ ] **Step 5: Typecheck** — `npm run typecheck` from `app/`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/queries/fyp/forYou.ts app/tests/queries/fyp/for-you-shelves.test.ts
git commit -m "feat(fyp): getForYouShelves orchestrator with impressions + dismissals"
```

---

### Task 9: Server actions — `app/lib/actions/fyp.ts`

**Files:**
- Create: `app/lib/actions/fyp.ts` (note: `app/lib/actions/fyp/load-more.ts` already exists and is retired in Task 12 — the new file is a sibling module, not a replacement of that path)
- Test: `app/tests/actions/fyp.test.ts`

**Interfaces:**
- Produces: `recordFypImpressions(filmIds: string[]): Promise<void>` (fire-and-forget safe), `setNotInterested(filmId: string)`, `undoNotInterested(filmId: string)`; private forms `_recordFypImpressions(client, filmIds)`, `_setNotInterested(client, filmId)`, `_undoNotInterested(client, filmId)`.

- [ ] **Step 1: Write failing tests** (stub-client unit tests of the private forms):

```ts
import { describe, it, expect } from "vitest";
import { _recordFypImpressions, _setNotInterested, _undoNotInterested } from "@/lib/actions/fyp";

function stubClient() {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: async (fn: string, args: unknown) => { calls.push({ kind: `rpc:${fn}`, args }); return { data: null, error: null }; },
    from: (table: string) => ({
      insert: (payload: unknown) => { calls.push({ kind: `insert:${table}`, args: payload }); return Promise.resolve({ error: null }); },
      delete: () => ({
        eq: (col1: string, v1: unknown) => ({
          eq: (col2: string, v2: unknown) => {
            calls.push({ kind: `delete:${table}`, args: { [col1]: v1, [col2]: v2 } });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  } as never;
  return { client, calls };
}

describe("_recordFypImpressions", () => {
  it("calls the RPC with the film ids", async () => {
    const { client, calls } = stubClient();
    await _recordFypImpressions(client, ["f1", "f2"]);
    expect(calls).toEqual([{ kind: "rpc:record_fyp_impressions", args: { p_film_ids: ["f1", "f2"] } }]);
  });
  it("no-ops on empty input", async () => {
    const { client, calls } = stubClient();
    await _recordFypImpressions(client, []);
    expect(calls).toHaveLength(0);
  });
  it("caps at 50 ids", async () => {
    const { client, calls } = stubClient();
    await _recordFypImpressions(client, Array.from({ length: 80 }, (_, i) => `f${i}`));
    expect((calls[0].args as { p_film_ids: string[] }).p_film_ids).toHaveLength(50);
  });
});

describe("_setNotInterested / _undoNotInterested", () => {
  it("inserts the user-owned dismissal row", async () => {
    const { client, calls } = stubClient();
    await _setNotInterested(client, "f1");
    expect(calls).toEqual([{ kind: "insert:fyp_not_interested", args: { user_id: "u1", film_id: "f1" } }]);
  });
  it("deletes the dismissal row on undo", async () => {
    const { client, calls } = stubClient();
    await _undoNotInterested(client, "f1");
    expect(calls).toEqual([{ kind: "delete:fyp_not_interested", args: { user_id: "u1", film_id: "f1" } }]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/actions/fyp.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

const IMPRESSION_BATCH_CAP = 50;

export async function _recordFypImpressions(client: Client, filmIds: string[]): Promise<void> {
  if (filmIds.length === 0) return;
  const capped = filmIds.slice(0, IMPRESSION_BATCH_CAP);
  const { error } = await client.rpc("record_fyp_impressions", { p_film_ids: capped });
  if (error) throw error;
}

/** Fire-and-forget: impression loss is free, so all failures are swallowed. */
export async function recordFypImpressions(filmIds: string[]): Promise<void> {
  try {
    const client = await createClient();
    await _recordFypImpressions(client, filmIds);
  } catch (e) {
    console.warn("recordFypImpressions failed (dropped):", e);
  }
}

export async function _setNotInterested(client: Client, filmId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("fyp_not_interested")
    .insert({ user_id: user.id, film_id: filmId });
  if (error) throw error;
}

export async function setNotInterested(filmId: string): Promise<void> {
  const client = await createClient();
  await _setNotInterested(client, filmId);
  revalidatePath("/films");
}

export async function _undoNotInterested(client: Client, filmId: string): Promise<void> {
  const user = await requireAuthUser(client);
  const { error } = await client
    .from("fyp_not_interested")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function undoNotInterested(filmId: string): Promise<void> {
  const client = await createClient();
  await _undoNotInterested(client, filmId);
  revalidatePath("/films");
}
```

(If the stub's `requireAuthUser` path fails because the real helper reads more of the client, extend the stub's `auth` object to match — do not fork the helper.)

- [ ] **Step 4: Run tests + typecheck.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/fyp.ts app/tests/actions/fyp.test.ts
git commit -m "feat(fyp): impression + not-interested server actions"
```

---

### Task 10: Impression queue helper

**Files:**
- Create: `app/lib/fyp/impression-queue.ts`
- Test: `app/tests/fyp/impression-queue.test.ts`

**Interfaces:**
- Produces: `createImpressionQueue(flush: (ids: string[]) => void, intervalMs?: number): { add(id: string): void; flushNow(): void; dispose(): void }` — dedupes per page view (an id flushes at most once), flushes on interval and on demand.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createImpressionQueue } from "@/lib/fyp/impression-queue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createImpressionQueue", () => {
  it("flushes batched ids on the interval", () => {
    const flush = vi.fn();
    const q = createImpressionQueue(flush, 5000);
    q.add("a"); q.add("b");
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenCalledWith(["a", "b"]);
  });

  it("never flushes the same id twice per page view", () => {
    const flush = vi.fn();
    const q = createImpressionQueue(flush, 5000);
    q.add("a");
    vi.advanceTimersByTime(5000);
    q.add("a"); q.add("b");
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenNthCalledWith(1, ["a"]);
    expect(flush).toHaveBeenNthCalledWith(2, ["b"]);
  });

  it("flushNow drains immediately; dispose flushes leftovers and stops the timer", () => {
    const flush = vi.fn();
    const q = createImpressionQueue(flush, 5000);
    q.add("a");
    q.flushNow();
    expect(flush).toHaveBeenCalledWith(["a"]);
    q.add("b");
    q.dispose();
    expect(flush).toHaveBeenCalledWith(["b"]);
    q.add("c");
    vi.advanceTimersByTime(60000);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does not call flush when nothing is pending", () => {
    const flush = vi.fn();
    createImpressionQueue(flush, 5000);
    vi.advanceTimersByTime(20000);
    expect(flush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Batches FYP impression ids for fire-and-forget flushing. An id is flushed
 * at most once per queue lifetime (one page view). Pure logic — the caller
 * wires it to IntersectionObserver + the recordFypImpressions action.
 */
export function createImpressionQueue(
  flush: (ids: string[]) => void,
  intervalMs = 5000,
): { add(id: string): void; flushNow(): void; dispose(): void } {
  const pending = new Set<string>();
  const sent = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function drain() {
    if (pending.size === 0) return;
    const ids = [...pending];
    pending.clear();
    for (const id of ids) sent.add(id);
    flush(ids);
  }

  return {
    add(id: string) {
      if (disposed || sent.has(id) || pending.has(id)) return;
      pending.add(id);
      if (timer === null) timer = setInterval(drain, intervalMs);
    },
    flushNow: drain,
    dispose() {
      drain();
      if (timer !== null) clearInterval(timer);
      timer = null;
      disposed = true;
    },
  };
}
```

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/fyp/impression-queue.ts app/tests/fyp/impression-queue.test.ts
git commit -m "feat(fyp): impression batching queue"
```

---

### Task 11: Discover shell — `/films` tabs, BrowseAll extraction, `/for-you` redirect

**Files:**
- Modify: `app/app/films/page.tsx` (becomes the shell)
- Create: `app/app/films/BrowseAll.tsx` (existing catalog UI moved here verbatim)
- Create: `app/app/films/DiscoverTabs.tsx`
- Modify: `app/app/for-you/page.tsx` (redirect)

**Interfaces:**
- Consumes: `getForYouShelves` (Task 8), `ForYouShelves` client component (Task 12 — this task renders a placeholder `<div>` for it, replaced in Task 12; the page compiles at every commit).
- Produces: URL contract — `/films` = For You (signed-in) / Browse (anon); any of `?tab=browse`, `?q=`, `?sort=`, `?page=` = Browse tab. This rule means existing sort/search/pagination links keep working without modification.

- [ ] **Step 1: Extract BrowseAll.** Create `app/app/films/BrowseAll.tsx` as an async server component and move the ENTIRE current body of `FilmsPage` below the header section into it — the `getFilms`/`getMyProfile` fetch, `FilmsSearch`, `FilmsSortChips`, count line, grid, empty state, pagination (including the `pageHref` helper and `parseSort`). Props:

```tsx
export default async function BrowseAll({
  q, sort, page, user,
}: {
  q: string;
  sort: FilmsSort;
  page: number;
  user: { id: string } | null;
}) { /* moved code, unchanged behavior */ }
```

- [ ] **Step 2: Create DiscoverTabs** (server component — tabs are plain links):

```tsx
import Link from "next/link";

export default function DiscoverTabs({ active }: { active: "for-you" | "browse" }) {
  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    fontSize: 11,
    fontFamily: "var(--font-ui)",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textDecoration: "none",
    color: isActive ? "var(--accent-ink)" : "var(--bone)",
    background: isActive ? "var(--accent)" : "transparent",
    border: "2px solid var(--accent)",
  });
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }} className="caps">
      <Link href="/films" prefetch={false} style={tabStyle(active === "for-you")}
        aria-current={active === "for-you" ? "page" : undefined}>
        For You
      </Link>
      <Link href="/films?tab=browse" prefetch={false} style={tabStyle(active === "browse")}
        aria-current={active === "browse" ? "page" : undefined}>
        Browse All
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `FilmsPage` as the shell**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getForYouShelves } from "@/lib/queries/fyp/forYou";
import type { FilmsSort } from "@/lib/queries/films";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import DiscoverTabs from "./DiscoverTabs";
import BrowseAll from "./BrowseAll";
import ForYouShelves from "@/components/ForYouShelves"; // Task 12; placeholder until then

const VALID_SORTS: FilmsSort[] = ["added", "release", "title", "watchlisted", "price_low", "price_high"];
function parseSort(raw: string | undefined): FilmsSort {
  return VALID_SORTS.includes(raw as FilmsSort) ? (raw as FilmsSort) : "added";
}

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const user = await getServerUser();

  // Browse whenever any browse-flavored param is present — this keeps all
  // existing sort/search/pagination links working without a tab param.
  const browse = !user || sp.tab === "browse" || sp.q != null || sp.sort != null || sp.page != null;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />
      <BottomNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Watch <em style={{ color: "var(--accent)" }}>Weirder</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {user && <DiscoverTabs active={browse ? "browse" : "for-you"} />}
          {browse ? (
            <BrowseAll q={sp.q ?? ""} sort={parseSort(sp.sort)} page={Math.max(1, Number(sp.page ?? 1))} user={user} />
          ) : (
            <ForYouSection userId={user!.id} />
          )}
        </div>
      </section>
    </div>
  );
}

async function ForYouSection({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { omen, shelves, filmsById, scoredById } = await getForYouShelves(supabase, userId);
  return (
    <ForYouShelves
      omen={omen}
      shelves={shelves}
      filmsEntries={Array.from(filmsById.entries())}
      scoredEntries={Array.from(scoredById.entries())}
    />
  );
}
```

Until Task 12 lands, stub `ForYouShelves` as a minimal client component that renders shelf titles as plain text so this commit compiles (Task 12 replaces the stub's body — same file, same props).

- [ ] **Step 4: Redirect `/for-you`.** Replace `app/app/for-you/page.tsx` with:

```tsx
import { permanentRedirect } from "next/navigation";

export default function ForYouRedirect() {
  permanentRedirect("/films");
}
```

- [ ] **Step 5: Typecheck + manual smoke**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && npm run test`
Expected: PASS. Then `npm run dev` and verify: `/films` signed-out shows Browse with no tabs; `/films?sort=title` shows Browse; `/for-you` redirects.

- [ ] **Step 6: Commit**

```bash
git add app/app/films/ app/app/for-you/page.tsx app/components/ForYouShelves.tsx
git commit -m "feat(discover): /films two-tab shell, BrowseAll extraction, /for-you redirect"
```

---

### Task 12: For You UI — `ForYouShelves`, `DailyOmenHero`, `ShelfCarousel`, dismissals, impressions

**Files:**
- Modify: `app/components/ForYouShelves.tsx` (replace Task 11 stub)
- Create: `app/components/DailyOmenHero.tsx`
- Create: `app/components/ShelfCarousel.tsx`
- Delete: `app/components/ForYouFeed.tsx`, `app/components/ForYouRow.tsx`, `app/lib/actions/fyp/load-more.ts`
- Modify: `app/lib/queries/fyp/forYou.ts` (delete the flat `getForYou` + `ForYouPage` type — nothing imports them after the deletions above)

**Interfaces:**
- Consumes: `Shelf`, `ScoredFilm`, `FilmLite`, `MatchPill`, `FilmPoster`, `useToast`, `createImpressionQueue`, `recordFypImpressions`, `setNotInterested`, `undoNotInterested`.
- Produces: `ForYouShelves({ omen, shelves, filmsEntries })` — the complete For You tab body.

- [ ] **Step 1: `DailyOmenHero.tsx`** (presentational; client not required by itself but lives inside the client tree):

```tsx
import Link from "next/link";
import FilmPoster from "./FilmPoster";
import MatchPill from "./MatchPill";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

export default function DailyOmenHero({ film, scored }: { film: FilmLite; scored: ScoredFilm }) {
  return (
    <Link prefetch={false} href={`/film/${film.id}`} className="stackable" style={{
      "--stack-template": "180px 1fr", "--stack-gap": "20px",
      display: "grid", textDecoration: "none", color: "inherit",
      border: "2px solid var(--accent)", padding: 16, marginBottom: 28,
    } as React.CSSProperties}>
      <div style={{ position: "relative" }}>
        <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
        <MatchPill band={scored.matchBand} covenFavorite={scored.covenFavorite} />
      </div>
      <div>
        <div className="caps" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em" }}>
          Daily Omen
        </div>
        <div className="head" style={{ fontSize: 28, lineHeight: 1.05, marginTop: 8 }}>{film.title}</div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          {film.director} · {film.year}
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
          The goblin consulted the entrails. Today they point here.
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: `ShelfCarousel.tsx`** — a client component: title + horizontally scrolling cards with poster, `MatchPill`, a ✕ dismiss control, and impression registration via a callback ref prop. Dismissed cards render an in-place "Hidden — undo" stub (ToastProvider has no action slot, so undo lives in-place; toast is confirmation only):

```tsx
"use client";

import Link from "next/link";
import FilmPoster from "./FilmPoster";
import MatchPill from "./MatchPill";
import type { Shelf } from "@/lib/queries/fyp/shelves";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

interface Props {
  shelf: Shelf;
  filmsById: Map<string, FilmLite>;
  scoredById: Map<string, ScoredFilm>;
  dismissed: Set<string>;
  onDismiss: (filmId: string) => void;
  onUndo: (filmId: string) => void;
  registerCard: (el: HTMLElement | null, filmId: string) => void;
}

export default function ShelfCarousel({
  shelf, filmsById, scoredById, dismissed, onDismiss, onUndo, registerCard,
}: Props) {
  const visible = shelf.filmIds.filter(id => filmsById.has(id));
  if (visible.length === 0) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 className="head" style={{ fontSize: 20, marginBottom: 12 }}>{shelf.title}</h2>
      <div style={{
        display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8,
        scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch",
      }}>
        {visible.map(filmId => {
          const film = filmsById.get(filmId)!;
          if (dismissed.has(filmId)) {
            return (
              <div key={filmId} style={{
                flex: "0 0 140px", scrollSnapAlign: "start", display: "grid",
                placeItems: "center", aspectRatio: "2/3", border: "1px dashed var(--muted)",
              }}>
                <button type="button" onClick={() => onUndo(filmId)} className="caps" style={{
                  background: "transparent", border: "none", color: "var(--muted)",
                  fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)",
                }}>
                  Hidden — undo
                </button>
              </div>
            );
          }
          const scored = scoredById.get(filmId);
          return (
            <div key={filmId} ref={el => registerCard(el, filmId)} data-film-id={filmId}
              style={{ flex: "0 0 140px", scrollSnapAlign: "start", position: "relative" }}>
              <Link prefetch={false} href={`/film/${filmId}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ position: "relative" }}>
                  <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                  {scored && <MatchPill band={scored.matchBand} covenFavorite={scored.covenFavorite} />}
                </div>
                <div className="head" style={{ fontSize: 14, lineHeight: 1.1, marginTop: 8 }}>{film.title}</div>
                <div className="caps" style={{ fontSize: 9, color: "var(--muted)", marginTop: 3 }}>{film.year}</div>
              </Link>
              <button
                type="button"
                aria-label={`Not interested in ${film.title}`}
                onClick={e => { e.preventDefault(); onDismiss(filmId); }}
                style={{
                  position: "absolute", top: 4, right: 4, width: 22, height: 22,
                  background: "rgba(10,10,10,0.75)", color: "var(--bone)",
                  border: "1px solid var(--muted)", cursor: "pointer",
                  fontSize: 11, lineHeight: 1, display: "grid", placeItems: "center",
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `ForYouShelves.tsx`** — replace the Task 11 stub:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DailyOmenHero from "./DailyOmenHero";
import ShelfCarousel from "./ShelfCarousel";
import { useToast } from "./ToastProvider";
import { createImpressionQueue } from "@/lib/fyp/impression-queue";
import { recordFypImpressions, setNotInterested, undoNotInterested } from "@/lib/actions/fyp";
import type { Shelf } from "@/lib/queries/fyp/shelves";
import type { ScoredFilm } from "@/lib/queries/fyp/score";
import type { FilmLite } from "@/lib/queries/fyp/forYou";

const DWELL_MS = 1000;

interface Props {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsEntries: Array<[string, FilmLite]>;
  scoredEntries: Array<[string, ScoredFilm]>;
}

export default function ForYouShelves({ omen, shelves, filmsEntries, scoredEntries }: Props) {
  const filmsById = useMemo(() => new Map(filmsEntries), [filmsEntries]);
  const scoredById = useMemo(() => new Map(scoredEntries), [scoredEntries]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // ── Impression logging ────────────────────────────────────────────────────
  const queueRef = useRef<ReturnType<typeof createImpressionQueue> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const dwellTimers = useRef(new Map<Element, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const queue = createImpressionQueue(ids => void recordFypImpressions(ids));
    queueRef.current = queue;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const filmId = (e.target as HTMLElement).dataset.filmId;
        if (!filmId) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          const t = setTimeout(() => queue.add(filmId), DWELL_MS);
          dwellTimers.current.set(e.target, t);
        } else {
          const t = dwellTimers.current.get(e.target);
          if (t) { clearTimeout(t); dwellTimers.current.delete(e.target); }
        }
      }
    }, { threshold: 0.5 });
    observerRef.current = io;

    const onHide = () => queue.flushNow();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      for (const t of dwellTimers.current.values()) clearTimeout(t);
      io.disconnect();
      queue.dispose();
    };
  }, []);

  const registerCard = useCallback((el: HTMLElement | null, _filmId: string) => {
    if (el) observerRef.current?.observe(el);
  }, []);

  // ── Dismissals ────────────────────────────────────────────────────────────
  const onDismiss = useCallback((filmId: string) => {
    setDismissed(prev => new Set(prev).add(filmId));
    void setNotInterested(filmId)
      .then(() => toast("Hidden from your For You"))
      .catch(() => {
        setDismissed(prev => {
          const next = new Set(prev);
          next.delete(filmId);
          return next;
        });
        toast("Couldn't hide that — try again.");
      });
  }, [toast]);

  const onUndo = useCallback((filmId: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(filmId);
      return next;
    });
    void undoNotInterested(filmId).catch(() => toast("Couldn't undo — try again."));
  }, [toast]);

  const omenFilm = omen ? filmsById.get(omen.filmId) : undefined;

  if (!omenFilm && shelves.length === 0) {
    return (
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "40px 0" }}>
        Nothing to divine yet. Log or tag a few films and the goblin will find your scent.
      </div>
    );
  }

  return (
    <>
      {omen && omenFilm && !dismissed.has(omen.filmId) && (
        <div ref={el => registerCard(el as HTMLElement | null, omen.filmId)} data-film-id={omen.filmId}>
          <DailyOmenHero film={omenFilm} scored={omen} />
        </div>
      )}
      {shelves.map(shelf => (
        <ShelfCarousel
          key={shelf.id}
          shelf={shelf}
          filmsById={filmsById}
          scoredById={scoredById}
          dismissed={dismissed}
          onDismiss={onDismiss}
          onUndo={onUndo}
          registerCard={registerCard}
        />
      ))}
    </>
  );
}
```

(`scoredEntries` is already provided by Task 11's `ForYouSection` from `getForYouShelves().scoredById` — defined in Task 8.)

- [ ] **Step 4: Delete the retired flat-list pieces.** Remove `app/components/ForYouFeed.tsx`, `app/components/ForYouRow.tsx`, `app/lib/actions/fyp/load-more.ts`, and the `getForYou` function + `ForYouPage` interface from `forYou.ts` (keep `FilmLite`). Grep for stragglers:

Run: `grep -rn "ForYouFeed\|ForYouRow\|loadMoreForYou\|getForYou(" app/ --include="*.ts" --include="*.tsx"` — expect matches only in `getForYouShelves` internals and tests you control; fix any others.

- [ ] **Step 5: Full verification**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && npm run test`
Expected: PASS. Then `npm run dev`, signed-in: `/films` shows Omen + shelves; ✕ hides a card with toast + in-place undo; scrolling shelves populates `fyp_impressions` (check via the local/prod table after ~5s).

- [ ] **Step 6: Commit**

```bash
git add -A app/components/ app/lib/ app/app/films/ && git rm -q app/components/ForYouFeed.tsx app/components/ForYouRow.tsx app/lib/actions/fyp/load-more.ts 2>/dev/null; git commit -m "feat(fyp): For You shelves UI — omen hero, carousels, dismissals, impressions"
```

(If `git rm` already happened via `add -A`, the rm is a no-op — fine.)

---

### Task 13: Docs, migration apply, final verification

**Files:**
- Modify: `app/lib/queries/fyp/CLAUDE.md` (new architecture entries + fatigue tuning levers)
- Modify: `CLAUDE.md` (Current state + open threads)

- [ ] **Step 1: Update `fyp/CLAUDE.md`.** Add `shelves.ts` to the architecture list ("pure shelf assembly — omen, placement, diversity guard; consumed only by getForYouShelves"), note that `forYou.ts` now exports `getForYouShelves` (flat `getForYou` deleted), and append the three fatigue constants to the tuning-levers section with the guidance from Task 4's comment. Note the two feedback tables and that dismissals feed aversion at `not_interested: -1.5`.

- [ ] **Step 2: Update root `CLAUDE.md`** Current state (FYP re-exposed as Discover For You tab; migs 0206–0207; rollout = migrations first, then deploy) and refresh the "Recommender v3 unverified" open thread to mention the new feedback instrumentation.

- [ ] **Step 3: Full suite, both packages**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && npm run test
cd ../db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all
```
Expected: all PASS.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md app/lib/queries/fyp/CLAUDE.md
git commit -m "docs: FYP v3.5 shelves architecture + tuning levers"
```

- [ ] **Step 5: Ship sequence (after PR merge — do not run before merge).** Apply migrations to prod (`set -a; source app/.env.local; set +a; cd db && npm run migrate`), THEN deploy (`npx vercel deploy --prod --yes` from repo root). Migrations-first is safe: only new code reads the new tables.
