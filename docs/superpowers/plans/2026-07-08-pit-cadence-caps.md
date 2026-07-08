# FROM THE PIT: Cadence Caps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap how often and where FROM THE PIT system events interrupt the signed-in `/home` feed — max 3 new events introduced per user per UTC day, permanent "already seen" exclusion, at most 1 Pit item in the first 6 feed positions, at least 2 user items between any two Pit items — with a watchlist-match boost so a user's own films win their daily slots first.

**Architecture:** A new `pit_impressions` table (mirrors the existing `fyp_impressions` pattern exactly) backs both the permanent exclusion and the daily counter. Candidate selection happens in a new `getEligiblePitEventsForUser` query, which filters/boosts/trims *before* handing events to the existing, untouched `composeFeed`. A new pure pipeline stage, `enforcePitPositionRules`, runs between `composeFeed`'s output and the existing `resolvePitTiers`, dropping (never reordering) position-rule violators. Impressions are recorded client-side on actual render, mirroring `recordFypImpressions`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (PostgREST + RLS + plpgsql RPC), vitest, testcontainers Postgres.

**Spec:** `docs/superpowers/specs/2026-07-08-pit-cadence-caps-design.md`

## Global Constraints

- **Node 20 required.** Prefix every `npm`/`npx` command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- App commands run from `app/`; DB commands run from `db/`.
- **Migration 0212 reserved for this plan** (`db/migrations/0212_pit_impressions.sql`). Rollout order: migration first, then app deploy (new code reads the new table/RPC; nothing else depends on it).
- **Daily cap = 3**, **first-screen window = 6**, **min-gap = 2**, **watchlist boost = +1000** (all exact values from the spec — do not substitute different numbers).
- **Day boundary is UTC calendar day** — no per-user timezone tracking exists anywhere in this app; do not introduce any.
- **"Already seen" is permanent** (all-time, any day) — not a same-day-only dedup.
- **Scope boundary: signed-in `/home` only.** `app/lib/queries/landing.ts` / `LandingFeedCard` are explicitly untouched by this plan — anonymous visitors keep today's behavior exactly.
- **`composeFeed` (`app/lib/feed-events/compose.ts`) and `resolvePitTiers` (`app/lib/feed-events/pitCadence.ts`) are NOT modified** — both stay exactly as shipped. New logic is additive pipeline stages before/after them.
- **RLS test convention**: new suites go in `db/tests/rls/`, testcontainers Postgres, following `db/tests/rls/fyp-impressions.test.ts` as the direct template (same helpers: `makeTestDb`, `seedFixtures`, `beginAs`/`commit`/`rollback`).
- **Action test convention**: env-gated integration tests (`describe.skipIf(!hasEnv)`, `if (!hasEnv) return` in every lifecycle hook) — see `app/tests/actions/library.test.ts` for the house shape.
- Branch: `feature/pit-cadence-caps` (already exists; spec committed as `46a51c1`).
- Commit-message gotcha: heredoc commit messages get mangled in this repo — use a single-line `-m` or write the message to a file and `git commit -F`.

---

### Task 1: Migration 0212 — `pit_impressions` table + RPC + RLS test + types.ts hand-edit

**Files:**
- Create: `db/migrations/0212_pit_impressions.sql`
- Create: `db/tests/rls/pit-impressions.test.ts`
- Modify: `app/lib/supabase/types.ts` (hand-edit — add `pit_impressions` table types)

**Interfaces:**
- Consumes: nothing.
- Produces: table `pit_impressions(user_id, event_id, shown_at)`, RPC `record_pit_impressions(p_event_ids uuid[])` — Task 4's action calls this RPC by name. `pit_impressions` becomes known to the generated `Database` type here — Task 3's `.from("pit_impressions")` call (one task later) needs this to already be in place to typecheck cleanly.

**Why the types.ts edit lands here, not with the action (Task 4):** Task 3's `getEligiblePitEventsForUser` calls `client.from("pit_impressions")` directly, one task before the action that was originally paired with this edit. Landing the type alongside the migration — the same task that creates the table — avoids a task boundary where a real table exists in the DB but is invisible to the type system.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0212_pit_impressions.sql`:

```sql
-- 0212_pit_impressions.sql
-- FROM THE PIT cadence caps (spec 2026-07-08-pit-cadence-caps-design.md).
-- Mirrors fyp_impressions (mig 0206) exactly in shape/RLS/RPC style, but
-- keyed on feed_events.id rather than films.id, and ON CONFLICT DO NOTHING
-- rather than incrementing a counter -- row presence alone is all this
-- table needs to express (permanent "already seen" exclusion + today's
-- distinct count).
CREATE TABLE pit_impressions (
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES feed_events(id) ON DELETE CASCADE,
  shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE pit_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pit_impressions_select_own ON pit_impressions
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON pit_impressions TO authenticated;

-- Race-safe batch insert. Unknown event ids are silently skipped (JOIN
-- feed_events) so a stale client can never error the fire-and-forget path.
-- Capped at 10 (a single feed render shows far fewer Pit items than the
-- 50-id cap fyp_impressions uses for FYP shelf posters).
CREATE OR REPLACE FUNCTION record_pit_impressions(p_event_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_event_ids IS NULL
     OR array_length(p_event_ids, 1) IS NULL
     OR array_length(p_event_ids, 1) > 10 THEN
    RETURN;
  END IF;

  INSERT INTO pit_impressions (user_id, event_id)
  SELECT auth.uid(), e.id
  FROM unnest(p_event_ids) AS ids(id)
  JOIN feed_events e ON e.id = ids.id
  ON CONFLICT (user_id, event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION record_pit_impressions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_pit_impressions(uuid[]) TO authenticated;
```

Do NOT apply to prod in this task — prod apply is the final ship-sequence step, after the whole branch is reviewed and merged.

- [ ] **Step 2: Write the RLS test**

Create `db/tests/rls/pit-impressions.test.ts` (direct copy of `db/tests/rls/fyp-impressions.test.ts`'s structure, adapted to `pit_impressions`' shape — note this table has no `event_id` fixture, so each test inserts its own `feed_events` row as service_role):

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let eventId: string;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM pit_impressions`);
  await db.client.query(`DELETE FROM feed_events`);
  const { rows } = await db.client.query(
    `INSERT INTO feed_events (event_type, film_id, copy, priority) VALUES ('price_drop', $1, 'test copy', 90) RETURNING id`,
    [fx.filmId],
  );
  eventId = rows[0].id;
  await commit(db.client);
});

describe("RLS: pit_impressions + record_pit_impressions RPC", () => {
  it("RPC inserts on first call and is a no-op on repeat (no counter, no error)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[eventId]]);
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[eventId]]);
    const { rows } = await db.client.query(
      `SELECT count(*)::int AS n FROM pit_impressions WHERE user_id = $1 AND event_id = $2`,
      [fx.userA.id, eventId],
    );
    await commit(db.client);
    expect(rows[0].n).toBe(1);
  });

  it("users cannot see each other's impressions", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[eventId]]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const { rows } = await db.client.query(`SELECT * FROM pit_impressions`);
      expect(rows).toHaveLength(0);
    } finally { await rollback(db.client); }
  });

  it("direct INSERT is denied to authenticated (writes only via RPC)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO pit_impressions (user_id, event_id) VALUES ($1, $2)`,
          [fx.userA.id, eventId],
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("unknown event ids are skipped, not errored", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [
      ["00000000-0000-0000-0000-000000000000", eventId],
    ]);
    const { rows } = await db.client.query(`SELECT event_id FROM pit_impressions`);
    await commit(db.client);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe(eventId);
  });

  it("a batch over 10 ids is rejected (returns without inserting)", async () => {
    const admin = db.client;
    await beginAs(admin, null, "service_role");
    const extraIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const { rows } = await admin.query(
        `INSERT INTO feed_events (event_type, film_id, copy, priority) VALUES ('price_drop', $1, 'x', 1) RETURNING id`,
        [fx.filmId],
      );
      extraIds.push(rows[0].id);
    }
    await commit(admin);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [extraIds]);
    const { rows } = await db.client.query(`SELECT count(*)::int AS n FROM pit_impressions`);
    await commit(db.client);
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 3: Apply locally and run the RLS test**

If a local/test Postgres target is configured (`TEST_SUPABASE_*` or a local Docker-reachable DB), apply the migration there and run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/pit-impressions.test.ts` (from `db/`).
Expected: PASS, 5 tests. If no local Docker/testcontainers target is available in this environment, note that clearly in your report — do not skip writing the test, only note that it couldn't be executed here.

- [ ] **Step 4: Hand-edit `app/lib/supabase/types.ts`**

Find any existing table block (e.g. `library:`) to confirm the file's current `Row`/`Insert`/`Update` convention, then add a new `pit_impressions` entry following the exact same shape, inserted alongside the other table definitions (match the file's existing ordering — check first):

```ts
pit_impressions: {
  Row: { user_id: string; event_id: string; shown_at: string };
  Insert: { user_id: string; event_id: string; shown_at?: string };
  Update: { user_id?: string; event_id?: string; shown_at?: string };
};
```

Do NOT run `npm run gen:types` — this file is hand-maintained; regeneration would clobber unrelated hand-edits already in the file.

- [ ] **Step 5: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0212_pit_impressions.sql db/tests/rls/pit-impressions.test.ts app/lib/supabase/types.ts
git commit -m "feat(pit-cadence): mig 0212 pit_impressions table + RPC + types.ts entry"
```

---

### Task 2: Position enforcement — `enforcePitPositionRules`

**Files:**
- Create: `app/lib/feed-events/pitPosition.ts`
- Test: `app/tests/feed-events/pitPosition.test.ts`

**Interfaces:**
- Consumes: `ComposedItem` from `@/lib/feed-events/compose`.
- Produces (Task 5 imports from `@/lib/feed-events/pitPosition`):
  - `export const PIT_FIRST_SCREEN_WINDOW = 6;`
  - `export const PIT_MIN_GAP = 2;`
  - `export function enforcePitPositionRules<U>(items: Array<ComposedItem<U>>): Array<ComposedItem<U>>`

- [ ] **Step 1: Write the failing test**

Create `app/tests/feed-events/pitPosition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { enforcePitPositionRules, PIT_FIRST_SCREEN_WINDOW, PIT_MIN_GAP } from "../../lib/feed-events/pitPosition";
import type { SystemFeedEvent } from "../../lib/feed-events/types";
import type { ComposedItem } from "../../lib/feed-events/compose";

function sysItem(id: string): ComposedItem<{ id: string }> {
  const event: SystemFeedEvent = { id, event_type: "price_drop", film_id: null, payload: {}, copy: "x", priority: 90, created_at: "2026-07-08T00:00:00Z", film: null };
  return { type: "system", event };
}
function userItem(id: string): ComposedItem<{ id: string }> {
  return { type: "user", item: { id } };
}
function ids(items: Array<ComposedItem<{ id: string }>>): string[] {
  return items.map(i => i.type === "system" ? i.event.id : i.item.id);
}

describe("enforcePitPositionRules", () => {
  it("keeps a single Pit item within the first-screen window", () => {
    const items = [userItem("u0"), sysItem("s0"), userItem("u1")];
    expect(ids(enforcePitPositionRules(items))).toEqual(["u0", "s0", "u1"]);
  });

  it("drops a second Pit item that lands inside the first-screen window", () => {
    // positions 0..5 = first screen. Two system items both land inside it.
    const items = [userItem("u0"), sysItem("s0"), userItem("u1"), sysItem("s1"), userItem("u2")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toEqual(["u0", "s0", "u1", "u2"]); // s1 dropped
  });

  it("allows a second Pit item once it lands outside the first-screen window, respecting min-gap", () => {
    const items = [
      sysItem("s0"),                                    // pos 0 (first screen, kept)
      ...Array.from({ length: 6 }, (_, i) => userItem(`u${i}`)), // pos 1..6, pushes past first-screen window
      sysItem("s1"),                                     // pos 7 (outside first-screen window; gap since s0 is 6 user items, well over PIT_MIN_GAP)
    ];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toContain("s1");
  });

  it(`drops a Pit item fewer than ${PIT_MIN_GAP} user items after a kept Pit item, even outside the first screen`, () => {
    const items = [
      sysItem("s0"),
      ...Array.from({ length: 10 }, (_, i) => userItem(`u${i}`)), // clears first-screen window
      sysItem("s1"), // immediately after s0's window clears, but only 1 user item follows before s2
      userItem("gap"),
      sysItem("s2"), // only 1 user item ("gap") since s1 -- fewer than PIT_MIN_GAP (2)
    ];
    const out = enforcePitPositionRules(items);
    const kept = ids(out);
    expect(kept).toContain("s1");
    expect(kept).not.toContain("s2");
  });

  it("keeps a Pit item exactly PIT_MIN_GAP user items after the previous kept Pit item", () => {
    const items = [
      sysItem("s0"),
      ...Array.from({ length: 10 }, (_, i) => userItem(`u${i}`)),
      sysItem("s1"),
      ...Array.from({ length: PIT_MIN_GAP }, (_, i) => userItem(`gap${i}`)),
      sysItem("s2"),
    ];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toContain("s2");
  });

  it("applies the min-gap rule uniformly regardless of tier (whisper events are not exempt)", () => {
    // enforcePitPositionRules has no concept of tier at all -- it only sees
    // ComposedItem's user/system discriminant. This test documents that a
    // system item is a system item for position purposes, full stop.
    const items = [sysItem("s0"), userItem("u0"), sysItem("s1")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toEqual(["s0", "u0"]); // s1 dropped: only 1 user item between them, gap < PIT_MIN_GAP
  });

  it("never drops user items", () => {
    const items = [sysItem("s0"), sysItem("s1"), sysItem("s2"), userItem("u0")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toContain("u0");
  });

  it("handles an empty feed", () => {
    expect(enforcePitPositionRules([])).toEqual([]);
  });

  it("handles an all-system feed (no user items to satisfy any gap)", () => {
    const items = [sysItem("s0"), sysItem("s1"), sysItem("s2")];
    const out = enforcePitPositionRules(items);
    expect(ids(out)).toEqual(["s0"]); // only the first survives -- first-screen cap AND min-gap both violated for s1/s2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitPosition.test.ts`
Expected: FAIL — cannot resolve `../../lib/feed-events/pitPosition`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/feed-events/pitPosition.ts`:

```ts
// Position enforcement for FROM THE PIT (spec 2026-07-08-pit-cadence-caps).
// Runs between composeFeed (unchanged) and resolvePitTiers (unchanged) --
// a violator is DROPPED, never reordered or deferred: reordering would
// fight composeFeed's recency-ordering contract, and a dropped item isn't
// wasted (no impression is recorded for something that was never rendered,
// so it remains eligible on a later render).
import type { ComposedItem } from "./compose";

export const PIT_FIRST_SCREEN_WINDOW = 6;
export const PIT_MIN_GAP = 2;

export function enforcePitPositionRules<U>(
  items: Array<ComposedItem<U>>,
): Array<ComposedItem<U>> {
  const result: Array<ComposedItem<U>> = [];
  let pitItemsInFirstScreen = 0;
  let userItemsSinceLastPit = Infinity;

  items.forEach((item, index) => {
    if (item.type !== "system") {
      result.push(item);
      userItemsSinceLastPit++;
      return;
    }

    const withinFirstScreen = index < PIT_FIRST_SCREEN_WINDOW;
    const violatesFirstScreenCap = withinFirstScreen && pitItemsInFirstScreen >= 1;
    const violatesMinGap = userItemsSinceLastPit < PIT_MIN_GAP;

    if (violatesFirstScreenCap || violatesMinGap) {
      return; // drop -- omit from result, do not touch the counters
    }

    result.push(item);
    userItemsSinceLastPit = 0;
    if (withinFirstScreen) pitItemsInFirstScreen++;
  });

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitPosition.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/pitPosition.ts app/tests/feed-events/pitPosition.test.ts
git commit -m "feat(pit-cadence): enforcePitPositionRules — first-screen cap + min-gap"
```

---

### Task 3: Candidate selection — `pitSelection.ts` (watchlist boost + `getEligiblePitEventsForUser`)

**Files:**
- Create: `app/lib/feed-events/pitSelection.ts`
- Test: `app/tests/feed-events/pitSelection.test.ts` (pure ranking function)
- Test: `app/tests/feed-events/getEligiblePitEventsForUser.test.ts` (env-gated integration test)

**Interfaces:**
- Consumes: `SystemFeedEvent` from `@/lib/feed-events/types`; `getRecentSystemEvents` from `@/lib/feed-events/query`; `getWatchlistedFilmIds` from `@/lib/queries/watchlists`.
- Produces (Task 5 imports from `@/lib/feed-events/pitSelection`):
  - `export const PIT_DAILY_CAP = 3;`
  - `export const PIT_WATCHLIST_BOOST = 1000;`
  - `export function rankPitCandidatesByWatchlist(events: SystemFeedEvent[], watchlistFilmIds: string[]): SystemFeedEvent[]` (pure — boosts + sorts, never mutates input events)
  - `export async function getEligiblePitEventsForUser(client: Client, userId: string, limit: number): Promise<SystemFeedEvent[]>`

- [ ] **Step 1: Write the failing test for the pure ranking function**

Create `app/tests/feed-events/pitSelection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rankPitCandidatesByWatchlist, PIT_WATCHLIST_BOOST } from "../../lib/feed-events/pitSelection";
import type { SystemFeedEvent } from "../../lib/feed-events/types";

function ev(id: string, filmId: string | null, priority: number): SystemFeedEvent {
  return { id, event_type: "price_drop", film_id: filmId, payload: {}, copy: "x", priority, created_at: "2026-07-08T00:00:00Z", film: null };
}

describe("rankPitCandidatesByWatchlist", () => {
  it("a low-priority watchlist match outranks a high-priority non-match", () => {
    const low = ev("low", "f1", 10);
    const high = ev("high", "f2", 100);
    const out = rankPitCandidatesByWatchlist([high, low], ["f1"]);
    expect(out.map(e => e.id)).toEqual(["low", "high"]);
  });

  it("preserves existing priority order within each group", () => {
    const wl1 = ev("wl1", "f1", 50);
    const wl2 = ev("wl2", "f2", 90);
    const other1 = ev("other1", "f3", 60);
    const other2 = ev("other2", "f4", 40);
    const out = rankPitCandidatesByWatchlist([other1, wl1, other2, wl2], ["f1", "f2"]);
    expect(out.map(e => e.id)).toEqual(["wl2", "wl1", "other1", "other2"]);
  });

  it("does not mutate the input events", () => {
    const original = ev("a", "f1", 10);
    rankPitCandidatesByWatchlist([original], ["f1"]);
    expect(original.priority).toBe(10);
  });

  it("is a no-op ordering-wise when the watchlist is empty", () => {
    const a = ev("a", "f1", 90);
    const b = ev("b", "f2", 10);
    const out = rankPitCandidatesByWatchlist([b, a], []);
    expect(out.map(e => e.id)).toEqual(["a", "b"]);
  });

  it("events with a null film_id are never boosted", () => {
    const noFilm = ev("nofilm", null, 10);
    const matched = ev("matched", "f1", 5);
    const out = rankPitCandidatesByWatchlist([noFilm, matched], ["f1"]);
    expect(out.map(e => e.id)).toEqual(["matched", "nofilm"]);
  });

  it("boosted priority is exactly priority + PIT_WATCHLIST_BOOST", () => {
    const e = ev("a", "f1", 10);
    const [out] = rankPitCandidatesByWatchlist([e], ["f1"]);
    expect(out.priority).toBe(10 + PIT_WATCHLIST_BOOST);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitSelection.test.ts`
Expected: FAIL — cannot resolve `../../lib/feed-events/pitSelection`.

- [ ] **Step 3: Write the pure ranking function**

Create `app/lib/feed-events/pitSelection.ts`:

```ts
// Candidate selection for FROM THE PIT cadence caps (spec
// 2026-07-08-pit-cadence-caps-design.md). getEligiblePitEventsForUser
// filters/boosts/trims BEFORE handing events to the existing, unmodified
// composeFeed -- the boost is a pure pre-processing step (boosted-priority
// copies), never a change to composeFeed's own b.priority - a.priority sort.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SystemFeedEvent } from "./types";
import { getRecentSystemEvents } from "./query";
import { getWatchlistedFilmIds } from "@/lib/queries/watchlists";

type Client = SupabaseClient<Database>;

export const PIT_DAILY_CAP = 3;
export const PIT_WATCHLIST_BOOST = 1000;

/**
 * Returns boosted-priority COPIES (never mutates input) sorted descending.
 * A flat +1000 on the existing 10-100 priority scale guarantees any
 * watchlist match outranks any non-match, while preserving relative order
 * within each group.
 */
export function rankPitCandidatesByWatchlist(
  events: SystemFeedEvent[],
  watchlistFilmIds: string[],
): SystemFeedEvent[] {
  const watchlist = new Set(watchlistFilmIds);
  return events
    .map(e => watchlist.has(e.film_id ?? "") ? { ...e, priority: e.priority + PIT_WATCHLIST_BOOST } : e)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Eligible, ranked, cap-trimmed candidates for one signed-in user's feed.
 * feed_events isn't in the generated Database type yet (matches
 * getRecentSystemEvents's own note) -- the `.from` cast is reused via
 * getRecentSystemEvents rather than re-cast here.
 */
export async function getEligiblePitEventsForUser(
  client: Client,
  userId: string,
  limit: number,
): Promise<SystemFeedEvent[]> {
  const { data: impressed, error: impErr } = await client
    .from("pit_impressions")
    .select("event_id, shown_at")
    .eq("user_id", userId);
  if (impErr) throw impErr;

  const seenEventIds = new Set((impressed ?? []).map(r => r.event_id));

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayCount = new Set(
    (impressed ?? [])
      .filter(r => new Date(r.shown_at) >= dayStart)
      .map(r => r.event_id),
  ).size;

  if (todayCount >= PIT_DAILY_CAP) return [];

  const candidates = (await getRecentSystemEvents(client, limit)).filter(
    e => !seenEventIds.has(e.id),
  );
  if (candidates.length === 0) return [];

  const watchlistFilmIds = await getWatchlistedFilmIds(client, userId);
  const ranked = rankPitCandidatesByWatchlist(candidates, watchlistFilmIds);

  return ranked.slice(0, PIT_DAILY_CAP - todayCount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitSelection.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the integration test for `getEligiblePitEventsForUser`**

Create `app/tests/feed-events/getEligiblePitEventsForUser.test.ts` (env-gated, house pattern from `app/tests/actions/library.test.ts`):

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getEligiblePitEventsForUser, PIT_DAILY_CAP } from "../../lib/feed-events/pitSelection";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;
let watchlistedFilmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const f1 = await admin.from("films").insert({ itunes_id: 820000 + Math.floor(Math.random() * 100000), title: "T1", director: "D", year: 2024 }).select("id").single();
  const f2 = await admin.from("films").insert({ itunes_id: 830000 + Math.floor(Math.random() * 100000), title: "T2", director: "D", year: 2024 }).select("id").single();
  if (f1.error || !f1.data || f2.error || !f2.data) throw f1.error ?? f2.error;
  filmId = f1.data.id;
  watchlistedFilmId = f2.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("feed_events").delete().in("film_id", [filmId, watchlistedFilmId]);
  await admin.from("films").delete().in("id", [filmId, watchlistedFilmId]);
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("pit_impressions").delete().eq("user_id", userA.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
  await admin.from("feed_events").delete().in("film_id", [filmId, watchlistedFilmId]);
});

describe.skipIf(!hasEnv)("getEligiblePitEventsForUser", () => {
  it("excludes an already-impressed event permanently", async () => {
    const admin = adminClient();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "x", priority: 90 }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;
    await admin.from("pit_impressions").insert({ user_id: userA.id, event_id: ins.data.id });

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(out.find(e => e.id === ins.data!.id)).toBeUndefined();
  });

  it("returns [] once the daily cap is reached", async () => {
    const admin = adminClient();
    for (let i = 0; i < PIT_DAILY_CAP; i++) {
      const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: `x${i}`, priority: 90 }).select("id").single();
      if (ins.error || !ins.data) throw ins.error;
      await admin.from("pit_impressions").insert({ user_id: userA.id, event_id: ins.data.id });
    }
    const ins2 = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "fresh", priority: 90 }).select("id").single();
    if (ins2.error || !ins2.data) throw ins2.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(out).toEqual([]);
  });

  it("a watchlist match is returned ahead of a higher-priority non-match", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: watchlistedFilmId, max_price_usd: 9.99 });
    await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "high priority, not watchlisted", priority: 90 });
    await admin.from("feed_events").insert({ event_type: "milestone", film_id: watchlistedFilmId, copy: "low priority, watchlisted", priority: 10 });

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(out[0].film_id).toBe(watchlistedFilmId);
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/getEligiblePitEventsForUser.test.ts`
Expected: PASS (3 tests) with env, or all skipped without. If skipped, note that in your report and rely on typecheck as the correctness signal for this file.

- [ ] **Step 7: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0. `pit_impressions` is already in `app/lib/supabase/types.ts` as of Task 1 — this task's `.from("pit_impressions")` calls in `getEligiblePitEventsForUser` should typecheck cleanly with no looseness or workaround needed.

- [ ] **Step 8: Commit**

```bash
git add app/lib/feed-events/pitSelection.ts app/tests/feed-events/pitSelection.test.ts app/tests/feed-events/getEligiblePitEventsForUser.test.ts
git commit -m "feat(pit-cadence): getEligiblePitEventsForUser + watchlist-boost ranking"
```

---

### Task 4: `recordPitImpressions` action

**Files:**
- Create: `app/lib/actions/feed-events.ts`
- Test: `app/tests/actions/feed-events.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (calls the `record_pit_impressions` RPC from Task 1 by name; `pit_impressions`'s types.ts entry, also from Task 1, is already in place).
- Produces (Task 5 imports from `@/lib/actions/feed-events`):
  - `recordPitImpressions(eventIds: string[]): Promise<void>`
  - private form `_recordPitImpressions(client: Client, eventIds: string[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `app/tests/actions/feed-events.test.ts` (env-gated, house pattern):

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _recordPitImpressions } from "../../lib/actions/feed-events";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;
let eventId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const film = await admin.from("films").insert({ itunes_id: 840000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 }).select("id").single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
  const ev = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "x", priority: 90 }).select("id").single();
  if (ev.error || !ev.data) throw ev.error;
  eventId = ev.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("feed_events").delete().eq("id", eventId);
  await admin.from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  await adminClient().from("pit_impressions").delete().eq("user_id", userA.id);
});

describe.skipIf(!hasEnv)("actions/recordPitImpressions", () => {
  it("inserts an impression row for the signed-in user", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _recordPitImpressions(c as any, [eventId]);

    const admin = adminClient();
    const { data } = await admin.from("pit_impressions").select("*").eq("user_id", userA.id).eq("event_id", eventId);
    expect(data).toHaveLength(1);
  });

  it("is a no-op for an empty array (no RPC call, no error)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(_recordPitImpressions(c as any, [])).resolves.toBeUndefined();
  });

  it("calling twice does not error or duplicate", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _recordPitImpressions(c as any, [eventId]);
    await _recordPitImpressions(c as any, [eventId]);

    const admin = adminClient();
    const { data } = await admin.from("pit_impressions").select("*").eq("user_id", userA.id).eq("event_id", eventId);
    expect(data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/actions/feed-events.test.ts`
Expected: FAIL — `_recordPitImpressions` not exported (or SKIP if no `TEST_SUPABASE_*` env — note this in your report).

- [ ] **Step 3: Write the action**

Create `app/lib/actions/feed-events.ts`:

```ts
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

const IMPRESSION_BATCH_CAP = 10;

export async function _recordPitImpressions(client: Client, eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const capped = eventIds.slice(0, IMPRESSION_BATCH_CAP);
  const { error } = await client.rpc("record_pit_impressions", { p_event_ids: capped });
  if (error) throw error;
}

/** Fire-and-forget: impression loss is free, so all failures are swallowed. */
export async function recordPitImpressions(eventIds: string[]): Promise<void> {
  try {
    const client = await createClient();
    await _recordPitImpressions(client, eventIds);
  } catch (e) {
    console.warn("recordPitImpressions failed (dropped):", e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes, then typecheck**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/actions/feed-events.test.ts` — Expected: PASS (3 tests) with env, or all skipped without.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` — Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/feed-events.ts app/tests/actions/feed-events.test.ts
git commit -m "feat(pit-cadence): recordPitImpressions action"
```

---

### Task 5: Wiring — `FeedTabs.tsx`, `home/page.tsx`, impression recording on render

**Files:**
- Modify: `app/components/FeedTabs.tsx`
- Modify: `app/app/home/page.tsx`
- Modify: `app/components/activity/SystemEventRow.tsx` (record impression on mount)

**Interfaces:**
- Consumes: `enforcePitPositionRules` (Task 2); `getEligiblePitEventsForUser` (Task 3); `recordPitImpressions` (Task 4).
- Produces: end-to-end wired feature.

- [ ] **Step 1: Wire `enforcePitPositionRules` into `FeedTabs.tsx`**

Add the import alongside the existing `resolvePitTiers` import:

```tsx
import { enforcePitPositionRules } from "@/lib/feed-events/pitPosition";
```

Find the existing `composedRaw`/`composed`/`pitTiers` block:

```tsx
  const composedRaw = useMemo(() => {
    if (!systemEvents || systemEvents.length === 0) return null;
    const seed = dateSeed ?? new Date().toISOString().slice(0, 10);
    const wrapped = grouped.map(item => ({
      item,
      created_at: item.type === "group" ? item.group.latestAt : item.type === "single" ? item.activity.created_at : item.event.created_at,
    }));
    return composeFeed(wrapped, systemEvents, seed, (w) => w.created_at);
  }, [grouped, systemEvents, dateSeed]);
  const composed = useMemo<FeedItem[]>(() => {
    if (!composedRaw) return grouped;
    return composedRaw.map(c => c.type === "system" ? { type: "system" as const, event: c.event } : c.item.item);
  }, [composedRaw, grouped]);
  const pitTiers = useMemo(
    () => composedRaw ? resolvePitTiers(composedRaw) : new Map<string, PitTier>(),
    [composedRaw],
  );
```

Insert `enforcePitPositionRules` between `composedRaw` and everything that consumes it — both `composed` and `pitTiers` must read the position-filtered array, not the raw one:

```tsx
  const composedRaw = useMemo(() => {
    if (!systemEvents || systemEvents.length === 0) return null;
    const seed = dateSeed ?? new Date().toISOString().slice(0, 10);
    const wrapped = grouped.map(item => ({
      item,
      created_at: item.type === "group" ? item.group.latestAt : item.type === "single" ? item.activity.created_at : item.event.created_at,
    }));
    return composeFeed(wrapped, systemEvents, seed, (w) => w.created_at);
  }, [grouped, systemEvents, dateSeed]);
  // Position rules (first-screen cap, min-gap) run on composeFeed's raw
  // output, before tier resolution -- a dropped item shouldn't consume
  // resolvePitTiers' full-card sliding-window budget either.
  const composedFiltered = useMemo(
    () => composedRaw ? enforcePitPositionRules(composedRaw) : null,
    [composedRaw],
  );
  const composed = useMemo<FeedItem[]>(() => {
    if (!composedFiltered) return grouped;
    return composedFiltered.map(c => c.type === "system" ? { type: "system" as const, event: c.event } : c.item.item);
  }, [composedFiltered, grouped]);
  const pitTiers = useMemo(
    () => composedFiltered ? resolvePitTiers(composedFiltered) : new Map<string, PitTier>(),
    [composedFiltered],
  );
```

- [ ] **Step 2: Wire `getEligiblePitEventsForUser` into `home/page.tsx`, with an anonymous fallback**

Add the import:

```tsx
import { getEligiblePitEventsForUser } from "@/lib/feed-events/pitSelection";
```

Find the existing systemEvents fetch inside the `Promise.all`:

```tsx
  const [priceDropFilms, ritualPick, systemEvents] = await Promise.all([
    user ? getWatchlistPriceDropFilms(supabase, user.id, 5) : Promise.resolve([]),
    getActiveRitualPick(),
    getRecentSystemEvents(supabase, 12),
  ]);
```

Replace the third element to branch on `user`, matching the file's own established `user ? ... : ...` pattern (see the first element in the same array) — **signed-out visitors to `/home` keep today's plain, uncapped behavior**, since there's no user identity to key impressions/caps on:

```tsx
  const [priceDropFilms, ritualPick, systemEvents] = await Promise.all([
    user ? getWatchlistPriceDropFilms(supabase, user.id, 5) : Promise.resolve([]),
    getActiveRitualPick(),
    user ? getEligiblePitEventsForUser(supabase, user.id, 12) : getRecentSystemEvents(supabase, 12),
  ]);
```

`getRecentSystemEvents` stays imported (still used in the anonymous branch) — do not remove that import.

- [ ] **Step 3: Record impressions on actual render in `SystemEventRow.tsx`**

Read the current file first — it's a `"use client"` component. Add a `useEffect` that fires `recordPitImpressions([event.id])` once on mount:

```tsx
"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { relativeTime } from "./relativeTime";
import { renderCopyText, PitSeal } from "./systemEventParts";
import { getPitKicker, getPitPriceVars, getPitBadges, type PitTier } from "@/lib/feed-events/tier";
import { recordPitImpressions } from "@/lib/actions/feed-events";

export default function SystemEventRow({ event, tier }: { event: SystemFeedEvent; tier: PitTier }) {
  useEffect(() => {
    recordPitImpressions([event.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const kicker = getPitKicker(event, tier);
```

(Keep the rest of the function body exactly as it is today — only the `useEffect` import, the `recordPitImpressions` import, and the effect itself are new. The `eslint-disable` comment matches this repo's convention for a deliberately-narrow dependency array — verify that convention is actually used elsewhere in this codebase before including the comment; if not, omit it and just list `event.id` as the sole dependency, which is already correct and complete.)

**Important scope note**: this records an impression for every tier, including whisper — correct, since the daily cap and "already seen" apply uniformly regardless of visual weight. Do NOT add this effect to `LandingFeedCard`'s rendering — that surface is explicitly out of scope (no user-specific impressions there).

- [ ] **Step 4: Typecheck and full test suite**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` — Expected: exit 0.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — Expected: all pass, no new failures.

- [ ] **Step 5: Manual smoke (dev server)**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`
This needs the mig 0212 table/RPC present in whatever database the dev server points at — if unavailable, note that clearly and defer this step to the controller. Checklist:
- Signed in, `/home`: confirm at most 1 Pit item appears in the first 6 rows.
- Confirm no two Pit items appear with fewer than 2 user rows between them.
- Reload multiple times: confirm the same Pit events keep appearing (not re-randomized) until the daily cap resets tomorrow.
- Signed out, `/home`: confirm Pit items still appear with today's old (uncapped) behavior — this path must not regress.
- `/` (anonymous landing): confirm completely unaffected.

- [ ] **Step 6: Commit**

```bash
git add app/components/FeedTabs.tsx app/app/home/page.tsx app/components/activity/SystemEventRow.tsx
git commit -m "feat(pit-cadence): wire position rules + eligible-candidate selection + impression recording"
```

---

### Task 6: Docs, prod migration, deploy, live smoke

**Files:**
- Modify: `CLAUDE.md` (root — "Current state" + "Open threads")
- Modify: `docs/sub-project-history.md` (append next row — check the current last row number first)

**Interfaces:**
- Consumes: shipped state from Tasks 1–5.
- Produces: session documentation + live feature.

- [ ] **Step 1: Update root `CLAUDE.md`**

Add a new "Last shipped" paragraph (demote the previous entry's label to "Previously shipped" per the file's established convention; bump `**Last updated:**`). Content: cadence caps for FROM THE PIT — `pit_impressions` table (mig 0212, mirrors `fyp_impressions`), `getEligiblePitEventsForUser` (daily cap of 3, permanent "already seen" exclusion, +1000 watchlist-match boost), `enforcePitPositionRules` (first-screen cap of 1-in-6, min-gap of 2 user items between any two Pit items regardless of tier), impressions recorded client-side on actual render via `recordPitImpressions`. Note explicitly: signed-in `/home` only, anonymous landing page untouched, UTC day boundary (no per-user timezone tracking exists). Note this is sub-project #1 of 5 from the owner's original brief — aging/TTL (#2), digest events (#3), the Ledger page (#4), and the Pit archive tab (#5) remain backlog items. Cite spec + plan paths.

- [ ] **Step 2: Append the sub-project-history row**

Check the current last row number in `docs/sub-project-history.md` first, then append the next row summarizing this sub-project in the established dense style, citing the spec filename `2026-07-08-pit-cadence-caps-design.md`.

- [ ] **Step 3: Final verification**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: both exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs: record FROM THE PIT cadence caps ship"
```

- [ ] **Step 5: Ship sequence (after merge to master — controller/owner step)**

1. Apply mig 0212 to prod (from `db/`): `set -a; source ../app/.env.local; set +a; npm run migrate` — expect it to report 0212 applied.
2. Deploy from repo root: `npx vercel deploy --prod --yes`.
3. Live smoke: as a real signed-in user, confirm `/home`'s first screen shows at most 1 Pit item and reload behavior is stable (same events recur, not reshuffled) within the same day.

**Ship sequence:** migration 0212 FIRST, then deploy — `getEligiblePitEventsForUser` selects from `pit_impressions`, which doesn't exist until the migration lands; deploying first would 500 every signed-in `/home` load (same class of risk as the buy-claim-loop migration, see that sub-project's CLAUDE.md entry for the precedent).
