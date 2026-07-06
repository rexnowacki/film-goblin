# Living Pit v2 — Eight New Feed Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight new system feed event types — `left_free`, `now_free`, `now_on_apple`, `last_showing`, `verdict_anointed`, `now_at_theater`, `full_moon`, `monthly_communion` — plus a summon copy variant for `new_film`, emitted from existing hooks.

**Architecture:** Migration 0210 extends the `feed_event_type` enum. All v1 plumbing (emit.ts dedup/variants, composer, SystemEventRow rendering) is reused unchanged — new types flow through automatically once copy templates and priorities exist. Emission: the daily job gains four checks (last_showing, verdict_anointed, full_moon via a new pure moon-phase module, monthly_communion); the streaming-availability refresh gains a read-before-write free-provider diff; the Loft showtimes scrape gains a post-scrape emit; the three `itunes_id` graft points emit `now_on_apple`. Spec: `docs/superpowers/specs/2026-07-06-living-pit-v2-design.md`.

**Tech Stack:** Postgres enum migration, pure TypeScript modules (moon phase, pool pickers), existing `emitFeedEvent` (pg) / `emitFeedEventSvc` (supabase service) writers.

## Global Constraints

- Node 20: prefix all npm/node commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`, run from the package dir stated in each step.
- Branch: `feature/living-pit-v2` (exists; spec committed). Never commit to master; commit after every task.
- Do NOT edit `app/lib/supabase/types.ts`. Use the `as unknown as { from: (t: string) => any }` cast for supabase reads/writes of untyped tables.
- Copy: goblin voice, **no leading emoji** (2026-07-06 FROM THE PIT amendment), "Apple TV" never "iTunes" in user-facing strings. Template wording in Task 2 is final — copy verbatim.
- New priorities (exact): left_free=88, now_free=85, now_on_apple=82, last_showing=78, verdict_anointed=75, now_at_theater=65, full_moon=45, monthly_communion=40.
- Dedup: 7-day (film, type) default via existing `emitFeedEvent`; `verdict_anointed` once-ever (payload dedup); `monthly_communion` once per month (payload dedup on month); full_moon additionally guarded by a 3-day global lookback.
- `emitFeedEventSvc` handles neither milestone-style payload dedup nor ATL supersession — it may ONLY be used for `now_at_theater` and `now_on_apple` (and v1's new_film/goblin_pick). Payload-dedup types go through the pg flavor in the daily job.
- Emission failures never fail the host operation: try/catch + console.warn at every non-cron emission site.
- Rollout: **migration 0210 first, then deploy** (only new code uses the new enum values).

**Verified facts the plan relies on (do not re-derive):**
- `films_with_stats` has `coven_rating_pct`, `coven_rating_count`; the Anointed tier is `pct >= 90` and the UI count gate is `count >= 5` (`app/components/CovenScore.tsx`, `threshold = 5`).
- `theater_showtimes(film_id UUID NULL, starts_at, is_active, last_seen_at, …)`; `runLoftShowtimes(client: SupabaseClient, now?)` runs Mondays in the maintenance cron with the service-role client (`app/lib/theaters/showtimes/scrape-loft-showtimes.ts:29`).
- `runStreamingAvailabilityRefresh(client: PgClient, options?)` (`app/lib/streaming-availability/refresh.ts:123`) loops films and calls `replaceProviders` per film; free categories are `flatrate|free|ads` (`STREAMING_CATEGORY_ALLOWLIST` in `app/lib/queries/streaming-availability.ts`).
- `itunes_id` graft points: `app/lib/admin/promote-tmdb-twin.ts` (updates `itunes_id` on an existing row), `app/lib/itunes-availability/check.ts` (~line 208, race-safe auto-promote, runs with the service-role client), `app/lib/actions/admin/itunes-candidates.ts` (~line 45, `.is("itunes_id", null)` guarded approve).
- `fulfillFilmRequest` (`app/lib/actions/film-requests.ts:327`) calls `adminCreateFilm(...)` then `_fulfillRequest`. `adminCreateFilm`'s fresh-insert path already emits `new_film`.
- Subject-tag census (prod, 2026-07-06): `werewolves:1`, `vampires:7`, `zombies:5`, `kaiju:2`. Tag join: `film_tags.tag_id → tags.id`, `tags.type = 'subject'`, `film_tags.film_id`.
- `watched.watched_at` timestamptz; `watchlists.film_id` for popularity counts.

---

### Task 1: Migration 0210 — extend the enum

**Files:**
- Create: `db/migrations/0210_feed_event_types_v2.sql`
- Modify: `db/tests/rls/feed_events.test.ts` (add an insert test for the new values)

**Interfaces:**
- Produces: enum values `left_free`, `now_free`, `now_on_apple`, `last_showing`, `verdict_anointed`, `now_at_theater`, `full_moon`, `monthly_communion` on `feed_event_type`.

- [ ] **Step 1: Add the failing test**

Append to `db/tests/rls/feed_events.test.ts` inside the existing `describe("RLS: feed_events")`:

```ts
  it("accepts every v2 event_type value (mig 0210)", async () => {
    const v2 = [
      "left_free", "now_free", "now_on_apple", "last_showing",
      "verdict_anointed", "now_at_theater", "full_moon", "monthly_communion",
    ];
    await beginAs(db.client, null, "service_role");
    for (const t of v2) {
      await db.client.query(
        `INSERT INTO feed_events (event_type, copy, priority) VALUES ($1::feed_event_type, 'x', 1)`,
        [t],
      );
    }
    const r = await db.client.query(`SELECT count(*) AS c FROM feed_events`);
    expect(Number(r.rows[0].c)).toBe(v2.length);
    await commit(db.client);
  });
```

- [ ] **Step 2: Run to verify it fails**

From `db/` (Docker/Colima required):

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/feed_events.test.ts
```

Expected: the new test FAILS with `invalid input value for enum feed_event_type`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0210_feed_event_types_v2.sql`:

```sql
-- Living Pit v2 (spec 2026-07-06): eight new system event types.
-- ALTER TYPE ... ADD VALUE is safe inside the migration transaction as long
-- as the new values are not used in the same transaction (Postgres 12+).

ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'left_free';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'now_free';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'now_on_apple';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'last_showing';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'verdict_anointed';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'now_at_theater';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'full_moon';
ALTER TYPE feed_event_type ADD VALUE IF NOT EXISTS 'monthly_communion';
```

- [ ] **Step 4: Run both db suites**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/feed_events.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: RLS suite green (5 tests). If pg-mem chokes on `ALTER TYPE ... ADD VALUE`, extend the strip list in `db/tests/helpers/pg-mem.ts` (read its existing patterns; strip lines matching `ALTER TYPE`) — the pg-mem suite doesn't exercise enum values.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0210_feed_event_types_v2.sql db/tests/rls/feed_events.test.ts db/tests/helpers/pg-mem.ts
git commit -m "feat(db): living pit v2 event types (mig 0210)"
```

---

### Task 2: Copy templates, priorities, summon variant

**Files:**
- Modify: `app/lib/feed-events/copy.ts`
- Test: `app/tests/feed-events/copy.test.ts` (extend)

**Interfaces:**
- Produces: `FeedEventType` union gains the 8 values; `EVENT_PRIORITY` entries per Global Constraints; `CopyVars` gains `service?: string`, `theater?: string`, `summoned?: boolean`; templates below.
- Consumed by: every later task (via `emitFeedEvent`/`emitFeedEventSvc`, which already call `renderCopy`/`pickVariant`).

- [ ] **Step 1: Extend the failing tests**

Append to `app/tests/feed-events/copy.test.ts`:

```ts
describe("v2 templates", () => {
  it("now_free / left_free name the service", () => {
    expect(renderCopy("now_free", { title: "Hokum", service: "Tubi" }, 0)).toBe(
      "**Hokum** is free on Tubi. No tithe required. Go."
    );
    expect(renderCopy("left_free", { title: "Hokum", service: "Tubi" }, 0)).toBe(
      "**Hokum** has left Tubi. The free ride is over — the goblin still tracks the price."
    );
  });

  it("now_on_apple crosses over", () => {
    expect(renderCopy("now_on_apple", { title: "Obsession" }, 0)).toBe(
      "The theatrical veil lifts. **Obsession** crosses over — now on Apple TV."
    );
  });

  it("theater events name the theater", () => {
    expect(renderCopy("now_at_theater", { title: "Suspiria", theater: "The Loft" }, 0)).toBe(
      "**Suspiria** haunts The Loft this week. The big screen is the proper altar."
    );
    expect(renderCopy("last_showing", { title: "Suspiria", theater: "The Loft" }, 0)).toBe(
      "Tonight is the last showing of **Suspiria** at The Loft. Then: the small screen, and regret."
    );
  });

  it("verdict, moon, communion", () => {
    expect(renderCopy("verdict_anointed", { title: "The Wailing" }, 0)).toBe(
      "The coven has spoken. **The Wailing** is Anointed."
    );
    expect(renderCopy("full_moon", { title: "Ginger Snaps" }, 0)).toBe(
      "The moon is full. The pit suggests **Ginger Snaps**. Lock the doors either way."
    );
    expect(renderCopy("monthly_communion", { title: "Nosferatu", n: 4 }, 0)).toBe(
      "The coven gathered around **Nosferatu** this month — 4 watchings."
    );
  });

  it("new_film summon variant overrides rotation", () => {
    expect(renderCopy("new_film", { title: "Backrooms", year: 2026, summoned: true }, 0)).toBe(
      "The summons was answered. **Backrooms** claws its way into the pit."
    );
    expect(renderCopy("new_film", { title: "Backrooms", year: 2026, summoned: true }, 1)).toBe(
      "The summons was answered. **Backrooms** claws its way into the pit."
    );
  });

  it("v2 priorities are exact", () => {
    expect(EVENT_PRIORITY.left_free).toBe(88);
    expect(EVENT_PRIORITY.now_free).toBe(85);
    expect(EVENT_PRIORITY.now_on_apple).toBe(82);
    expect(EVENT_PRIORITY.last_showing).toBe(78);
    expect(EVENT_PRIORITY.verdict_anointed).toBe(75);
    expect(EVENT_PRIORITY.now_at_theater).toBe(65);
    expect(EVENT_PRIORITY.full_moon).toBe(45);
    expect(EVENT_PRIORITY.monthly_communion).toBe(40);
  });
});
```

- [ ] **Step 2: Run to verify failure**

From `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/copy.test.ts
```

Expected: FAIL — new types not in `FeedEventType`.

- [ ] **Step 3: Implement in copy.ts**

Extend `FeedEventType`:

```ts
export type FeedEventType =
  | "price_drop" | "all_time_low" | "price_rise" | "new_film"
  | "anniversary" | "goblin_pick" | "milestone"
  | "left_free" | "now_free" | "now_on_apple" | "last_showing"
  | "verdict_anointed" | "now_at_theater" | "full_moon" | "monthly_communion";
```

Extend `EVENT_PRIORITY` with the exact values from Global Constraints. Extend `CopyVars`:

```ts
  service?: string;
  theater?: string;
  summoned?: boolean;
```

Add templates to the `TEMPLATES` record (exact strings — the tests above are the contract):

```ts
  left_free: [
    v => `**${v.title}** has left ${v.service}. The free ride is over — the goblin still tracks the price.`,
    v => `${v.service} took **${v.title}** back. The goblin mourns. The goblin also watches the price.`,
  ],
  now_free: [
    v => `**${v.title}** is free on ${v.service}. No tithe required. Go.`,
    v => `${v.service} offers **${v.title}** for nothing. Suspicious. Take it anyway.`,
  ],
  now_on_apple: [
    v => `The theatrical veil lifts. **${v.title}** crosses over — now on Apple TV.`,
    v => `The wait ends. **${v.title}** is on Apple TV. The pit tracks its price from tonight.`,
  ],
  last_showing: [
    v => `Tonight is the last showing of **${v.title}** at ${v.theater}. Then: the small screen, and regret.`,
    v => `Final night for **${v.title}** at ${v.theater}. The projector forgets; the goblin does not.`,
  ],
  verdict_anointed: [
    v => `The coven has spoken. **${v.title}** is Anointed.`,
    v => `Ninety percent of the coven cannot be wrong. **${v.title}** ascends.`,
  ],
  now_at_theater: [
    v => `**${v.title}** haunts ${v.theater} this week. The big screen is the proper altar.`,
    v => `${v.theater} summons **${v.title}**. Attend.`,
  ],
  full_moon: [
    v => `The moon is full. The pit suggests **${v.title}**. Lock the doors either way.`,
    v => `Full moon tonight. **${v.title}** knows what that means.`,
  ],
  monthly_communion: [
    v => `The coven gathered around **${v.title}** this month — ${v.n} watchings.`,
  ],
```

Add the summon override at the top of `renderCopy` (before milestone handling):

```ts
  if (type === "new_film" && vars.summoned) {
    return `The summons was answered. **${vars.title}** claws its way into the pit.`;
  }
```

(`pickVariant` needs no change — the summon override ignores the variant index by design; rotation state for regular new_film copy is unaffected.)

- [ ] **Step 4: Run tests + typecheck**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/copy.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: all copy tests PASS (v1 + v2); typecheck clean (Record completeness forces the priority entries).

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/copy.ts app/tests/feed-events/copy.test.ts
git commit -m "feat(feed-events): v2 copy templates, priorities, summon variant"
```

---

### Task 3: Moon-phase module (pure)

**Files:**
- Create: `app/lib/feed-events/moon.ts`
- Test: `app/tests/feed-events/moon.test.ts`

**Interfaces:**
- Produces: `isFullMoonUTCDate(date: Date): boolean` — true when any instant of that UTC calendar day lies within ±12h of full-moon syzygy. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `app/tests/feed-events/moon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isFullMoonUTCDate } from "@/lib/feed-events/moon";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("isFullMoonUTCDate", () => {
  it("recognizes well-documented full moons", () => {
    // 2018-01-31: "super blue blood moon", full at 13:27 UTC
    expect(isFullMoonUTCDate(d("2018-01-31"))).toBe(true);
    // 2015-09-28: supermoon lunar eclipse, full at 02:50 UTC
    expect(isFullMoonUTCDate(d("2015-09-28"))).toBe(true);
    // 1999-12-22: solstice full moon, full at 17:31 UTC
    expect(isFullMoonUTCDate(d("1999-12-22"))).toBe(true);
  });

  it("rejects days far from full", () => {
    expect(isFullMoonUTCDate(d("2018-01-17"))).toBe(false); // new moon
    expect(isFullMoonUTCDate(d("2018-02-07"))).toBe(false); // last quarter
    expect(isFullMoonUTCDate(d("2015-09-13"))).toBe(false); // new moon
  });

  it("fires on 1-2 days per synodic month, never 0, never 3+", () => {
    // scan one year; group consecutive true days into full-moon windows
    let windows = 0, run = 0, maxRun = 0;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86_400_000) {
      if (isFullMoonUTCDate(new Date(t))) {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else {
        if (run > 0) windows += 1;
        run = 0;
      }
    }
    if (run > 0) windows += 1;
    expect(windows).toBeGreaterThanOrEqual(12);
    expect(windows).toBeLessThanOrEqual(13);
    expect(maxRun).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/moon.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/lib/feed-events/moon.ts`:

```ts
// Pure lunar-phase arithmetic — no API, no dependency. Mean synodic month
// from a known new-moon epoch gives full-moon instants accurate to a few
// hours over decades, which is ample for a daily "is tonight a full moon"
// check with a ±12h window. Do not use for astronomy.

const SYNODIC_DAYS = 29.530588853;
// Well-documented new moon: 2000-01-06 18:14 UTC.
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);
const FULL_OFFSET_DAYS = SYNODIC_DAYS / 2;
const DAY_MS = 86_400_000;
const WINDOW_MS = 12 * 60 * 60 * 1000; // ±12h around syzygy

/** True when any instant of the given UTC calendar day is within ±12h of a full moon. */
export function isFullMoonUTCDate(date: Date): boolean {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayEnd = dayStart + DAY_MS;

  // Nearest full-moon instant to the middle of this day.
  const mid = dayStart + DAY_MS / 2;
  const ageDays = (mid - NEW_MOON_EPOCH_MS) / DAY_MS;
  const cycles = Math.round((ageDays - FULL_OFFSET_DAYS) / SYNODIC_DAYS);
  const fullMs = NEW_MOON_EPOCH_MS + (cycles * SYNODIC_DAYS + FULL_OFFSET_DAYS) * DAY_MS;

  return fullMs + WINDOW_MS > dayStart && fullMs - WINDOW_MS < dayEnd;
}
```

- [ ] **Step 4: Run tests; adjust only the WINDOW if a documented date misses**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/moon.test.ts
```

Expected: PASS. Mean-cycle drift can put a documented syzygy a few hours off; if (and only if) one of the three documented dates fails, widen `WINDOW_MS` to 14h and re-run — do NOT touch the epoch or synodic constant, and do not weaken the 1-2-days-per-window property test.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/moon.ts app/tests/feed-events/moon.test.ts
git commit -m "feat(feed-events): pure moon-phase module"
```

---

### Task 4: Daily job — last_showing, verdict_anointed, full_moon, monthly_communion

**Files:**
- Modify: `app/lib/feed-events/daily.ts`
- Test: `app/tests/feed-events/daily.test.ts` (extend — pure picker only)

**Interfaces:**
- Consumes: `emitFeedEvent` (pg flavor — required: verdict/communion use payload dedup), `isFullMoonUTCDate` (Task 3).
- Produces: `pickFullMoonFilm(candidates: FullMoonCandidate[]): FullMoonCandidate | null` where `FullMoonCandidate = { film_id: string; title: string; prior_appearances: number; watchlist_count: number }`.

- [ ] **Step 1: Extend the failing tests (pure picker)**

Append to `app/tests/feed-events/daily.test.ts`:

```ts
import { pickFullMoonFilm, type FullMoonCandidate } from "@/lib/feed-events/daily";

const fm = (id: string, prior: number, wl: number): FullMoonCandidate =>
  ({ film_id: id, title: id, prior_appearances: prior, watchlist_count: wl });

describe("pickFullMoonFilm", () => {
  it("prefers fewest prior full-moon appearances, then highest watchlist count, then id", () => {
    expect(pickFullMoonFilm([fm("a", 1, 9), fm("b", 0, 1)])?.film_id).toBe("b");
    expect(pickFullMoonFilm([fm("a", 0, 1), fm("b", 0, 5)])?.film_id).toBe("b");
    expect(pickFullMoonFilm([fm("b", 0, 5), fm("a", 0, 5)])?.film_id).toBe("a");
    expect(pickFullMoonFilm([])).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/daily.test.ts
```

Expected: FAIL — `pickFullMoonFilm` not exported.

- [ ] **Step 3: Implement in daily.ts**

Add imports:

```ts
import { isFullMoonUTCDate } from "./moon";
```

Add the pure picker + constants near the other exported helpers:

```ts
export interface FullMoonCandidate {
  film_id: string;
  title: string;
  prior_appearances: number;
  watchlist_count: number;
}

// Owner decision 2026-07-06: prefer werewolves; fall back to the creature
// trio until more werewolf films are tagged. Rotate: fewest prior full_moon
// appearances first so the small pool doesn't repeat one favorite.
const FULL_MOON_PRIMARY_TAGS = ["werewolves"];
const FULL_MOON_FALLBACK_TAGS = ["vampires", "zombies", "kaiju"];

export function pickFullMoonFilm(candidates: FullMoonCandidate[]): FullMoonCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) =>
    a.prior_appearances - b.prior_appearances
    || b.watchlist_count - a.watchlist_count
    || a.film_id.localeCompare(b.film_id),
  )[0];
}
```

Inside `runDailyFeedEvents`, after the existing member-milestone block, add the four checks:

```ts
  // --- last_showing: film's final active future Loft showtime is today (UTC) ---
  const lastShows = await client.query(
    `SELECT f.id AS film_id, f.title
     FROM films f
     JOIN theater_showtimes ts ON ts.film_id = f.id
     WHERE ts.is_active AND ts.starts_at >= now()
     GROUP BY f.id, f.title
     HAVING max(ts.starts_at) < (date_trunc('day', now()) + interval '1 day')`,
  );
  for (const r of lastShows.rows) {
    bump(await emitFeedEvent(client, {
      type: "last_showing",
      filmId: r.film_id,
      vars: { title: r.title, theater: "The Loft" },
    }));
  }

  // --- verdict_anointed: coven verdict crosses the top tier (once ever) ---
  const anointed = await client.query(
    `SELECT fws.id AS film_id, fws.title
     FROM films_with_stats fws
     WHERE fws.coven_rating_pct >= 90 AND fws.coven_rating_count >= 5
       AND NOT EXISTS (
         SELECT 1 FROM feed_events fe
         WHERE fe.film_id = fws.id AND fe.event_type = 'verdict_anointed'
       )`,
  );
  for (const r of anointed.rows) {
    bump(await emitFeedEvent(client, {
      type: "verdict_anointed",
      filmId: r.film_id,
      vars: { title: r.title },
    }));
  }

  // --- full_moon: one film, on full-moon days, max one event per window ---
  if (isFullMoonUTCDate(now)) {
    const recentMoon = await client.query(
      `SELECT 1 FROM feed_events
       WHERE event_type = 'full_moon' AND created_at > now() - interval '3 days'
       LIMIT 1`,
    );
    if (!recentMoon.rowCount) {
      const poolFor = async (tags: string[]) => client.query(
        `SELECT f.id AS film_id, f.title,
                (SELECT count(*) FROM feed_events fe
                 WHERE fe.film_id = f.id AND fe.event_type = 'full_moon')::int AS prior_appearances,
                (SELECT count(*) FROM watchlists w WHERE w.film_id = f.id)::int AS watchlist_count
         FROM films f
         WHERE EXISTS (
           SELECT 1 FROM film_tags ft JOIN tags t ON t.id = ft.tag_id
           WHERE ft.film_id = f.id AND t.type = 'subject' AND t.name = ANY($1)
         )`,
        [tags],
      );
      let pool = await poolFor(FULL_MOON_PRIMARY_TAGS);
      if (pool.rowCount === 0) pool = await poolFor(FULL_MOON_FALLBACK_TAGS);
      const picked = pickFullMoonFilm(pool.rows);
      if (picked) {
        bump(await emitFeedEvent(client, {
          type: "full_moon",
          filmId: picked.film_id,
          vars: { title: picked.title },
        }));
      }
    }
  }

  // --- monthly_communion: most-watched film of last month (1st of month) ---
  if (now.getUTCDate() === 1) {
    const commThisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const commPrevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = commPrevMonthStart.toISOString().slice(0, 7);
    const dup = await client.query(
      `SELECT 1 FROM feed_events
       WHERE event_type = 'monthly_communion' AND payload ->> 'month' = $1
       LIMIT 1`,
      [month],
    );
    if (!dup.rowCount) {
      const top = await client.query(
        `SELECT f.id AS film_id, f.title, count(*)::int AS n
         FROM watched w JOIN films f ON f.id = w.film_id
         WHERE w.watched_at >= $1 AND w.watched_at < $2
         GROUP BY f.id, f.title
         HAVING count(*) >= 2
         ORDER BY n DESC, f.id
         LIMIT 1`,
        [commPrevMonthStart.toISOString(), commThisMonthStart.toISOString()],
      );
      const t = top.rows[0];
      if (t) {
        bump(await emitFeedEvent(client, {
          type: "monthly_communion",
          filmId: t.film_id,
          vars: { title: t.title, n: Number(t.n) },
          payloadExtra: { month },
        }));
      }
    }
  }
```

Note: `verdict_anointed` and `monthly_communion` implement their once-ever/once-per-month dedup via the NOT EXISTS / payload checks above, BEFORE `emitFeedEvent` — the generic (film, type) 7-day dedup inside `emitFeedEvent` is a harmless second gate. `monthly_communion` must not reuse Task 6-v1's `milestone` monthly variables — name locals distinctly (as above) to avoid shadowing.

- [ ] **Step 4: Run tests + typecheck + full suite**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/daily.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/daily.ts app/tests/feed-events/daily.test.ts
git commit -m "feat(feed-events): daily v2 checks — last showing, anointed, full moon, communion"
```

---

### Task 5: Streaming refresh diff — now_free / left_free

**Files:**
- Modify: `app/lib/streaming-availability/refresh.ts`

**Interfaces:**
- Consumes: `emitFeedEvent` (pg — same `client` the refresh already holds), `replaceProviders` loop in `runStreamingAvailabilityRefresh`.

- [ ] **Step 1: Implement the read-before-write diff**

In `runStreamingAvailabilityRefresh` (`app/lib/streaming-availability/refresh.ts:123`), import:

```ts
import { emitFeedEvent } from "@/lib/feed-events/emit";
```

Add a module-level constant beside the existing ones:

```ts
const FREE_CATEGORIES = ["flatrate", "free", "ads"] as const;
```

Inside the per-film loop, immediately BEFORE the `replaceProviders` call, read the current free set:

```ts
    let beforeFree = new Set<string>();
    try {
      const prev = await client.query(
        `SELECT DISTINCT provider_name FROM film_watch_providers
         WHERE film_id = $1 AND region = $2 AND category = ANY($3)`,
        [film.id, region, FREE_CATEGORIES as unknown as string[]],
      );
      beforeFree = new Set(prev.rows.map((r: { provider_name: string }) => r.provider_name));
    } catch (err) {
      console.warn(`free-provider snapshot failed for film ${film.id}:`, err);
    }
```

Immediately AFTER the successful `replaceProviders` call (inside its existing try block, after `result.providersSaved += saved;`), diff and emit — guarded so a feed failure never fails the refresh:

```ts
      try {
        const afterFree = new Set(
          lookup.providers
            .filter(p => (FREE_CATEGORIES as readonly string[]).includes(p.category))
            .map(p => p.provider_name),
        );
        const gained = [...afterFree].filter(n => !beforeFree.has(n));
        if (gained.length > 0) {
          await emitFeedEvent(client, {
            type: "now_free",
            filmId: film.id,
            vars: { title: film.title, service: gained[0] },
          });
        } else if (beforeFree.size > 0 && afterFree.size === 0) {
          await emitFeedEvent(client, {
            type: "left_free",
            filmId: film.id,
            vars: { title: film.title, service: [...beforeFree][0] },
          });
        }
      } catch (err) {
        console.warn(`free-provider feed event failed for film ${film.id}:`, err);
      }
```

Check first that `film.title` is on the selected film rows (read `selectFilms` in the same file); if the select doesn't include `title`, add it to that query's column list.

- [ ] **Step 2: Typecheck + full suite (existing streaming tests must stay green)**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: clean. If a streaming-availability test constructs a mock pg client, extend the mock to answer the snapshot SELECT with `{ rows: [] }` rather than weakening assertions.

- [ ] **Step 3: Commit**

```bash
git add app/lib/streaming-availability/refresh.ts
git commit -m "feat(feed-events): now_free/left_free via provider snapshot diff"
```

---

### Task 6: Showtimes scrape — now_at_theater

**Files:**
- Modify: `app/lib/theaters/showtimes/scrape-loft-showtimes.ts`

**Interfaces:**
- Consumes: `emitFeedEventSvc` (the scrape runs with the service-role supabase client — allowed for this type per Global Constraints).

- [ ] **Step 1: Implement**

In `runLoftShowtimes` (`app/lib/theaters/showtimes/scrape-loft-showtimes.ts:29`), after the scrape's upsert/deactivation work completes (read the function to find the point where `theater_showtimes` rows are final for this run), add — try/catch-guarded:

```ts
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as unknown as { from: (t: string) => any };
    const { data: showing } = await c
      .from("theater_showtimes")
      .select("film_id, film:films(id, title)")
      .eq("is_active", true)
      .gte("starts_at", new Date().toISOString())
      .not("film_id", "is", null);
    const seen = new Set<string>();
    for (const row of showing ?? []) {
      const film = Array.isArray(row.film) ? row.film[0] : row.film;
      if (!film || seen.has(film.id)) continue;
      seen.add(film.id);
      await emitFeedEventSvc(client, {
        type: "now_at_theater",
        filmId: film.id,
        vars: { title: film.title, theater: "The Loft" },
      });
    }
  } catch (err) {
    console.warn("now_at_theater feed events failed:", err instanceof Error ? err.message : err);
  }
```

Import `emitFeedEventSvc` from `@/lib/feed-events/emit`. The 7-day (film, type) dedup inside `emitFeedEventSvc` absorbs the weekly Monday re-run; a multi-week engagement re-announces weekly by design (spec: accepted).

- [ ] **Step 2: Typecheck + suite**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: clean (extend any showtimes test mocks the same way as Task 5 if they break on the new query).

- [ ] **Step 3: Commit**

```bash
git add app/lib/theaters/showtimes/scrape-loft-showtimes.ts
git commit -m "feat(feed-events): now_at_theater from the Loft scrape"
```

---

### Task 7: now_on_apple at the three graft points + summon flag

**Files:**
- Modify: `app/lib/admin/promote-tmdb-twin.ts`
- Modify: `app/lib/itunes-availability/check.ts`
- Modify: `app/lib/actions/admin/itunes-candidates.ts`
- Modify: `app/lib/actions/admin/films.ts` (summon flag pass-through)
- Modify: `app/lib/actions/film-requests.ts` (pass the flag)

**Interfaces:**
- Consumes: `emitFeedEventSvc`; `CopyVars.summoned` (Task 2).

- [ ] **Step 1: now_on_apple emissions**

At each of the three graft points, AFTER the `itunes_id` write succeeds, add (adapting variable names to each file — read each function first; every one already has a service-role client and the film's title in scope or one select away):

```ts
  try {
    await emitFeedEventSvc(svc, {
      type: "now_on_apple",
      filmId,
      vars: { title: filmTitle },
    });
  } catch (err) {
    console.warn("feed event now_on_apple failed:", err instanceof Error ? err.message : err);
  }
```

Sites, precisely:
1. `promote-tmdb-twin.ts` — inside the promotion function after the UPDATE that sets `itunes_id` (the twin row's title is already selected there; if not, add `title` to the select). Note this makes twin promotion emit `now_on_apple` where v1 deliberately emitted nothing — that is the point (Hokum/Obsession were this path).
2. `check.ts` ~line 208 — the race-safe auto-promote: emit only when the guarded UPDATE actually affected a row (check the update result the code already inspects for race safety).
3. `itunes-candidates.ts` — the approve action, after its guarded `.is("itunes_id", null)` update succeeds.

The transition is one-way, so the built-in 7-day dedup makes double-emission across paths (e.g., candidate approved minutes after auto-promote) harmless.

- [ ] **Step 2: Summon flag**

In `app/lib/actions/admin/films.ts`: add an optional `summoned?: boolean` to `adminCreateFilm`'s input type, and thread it into the existing `new_film` emission:

```ts
      vars: { title: createdTitle, year: createdYear, ...(input.summoned ? { summoned: true } : {}) },
```

In `app/lib/actions/film-requests.ts` (`fulfillFilmRequest`, line ~344): add `summoned: true` to the `adminCreateFilm({...})` argument object.

- [ ] **Step 3: Typecheck + full suite**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: clean; existing admin/film-request tests stay green.

- [ ] **Step 4: Commit**

```bash
git add app/lib/admin/promote-tmdb-twin.ts app/lib/itunes-availability/check.ts app/lib/actions/admin/itunes-candidates.ts app/lib/actions/admin/films.ts app/lib/actions/film-requests.ts
git commit -m "feat(feed-events): now_on_apple at itunes grafts + summon variant wiring"
```

---

### Task 8: Runbook — merge, migrate, deploy, smoke, wrapup

**Files:**
- Modify: root `CLAUDE.md` (post-merge, separate docs branch)

- [ ] **Step 1: Full local gates, PR, merge after review**

```bash
# from app/: typecheck + test + build all clean, then:
git push -u origin feature/living-pit-v2
gh pr create --title "feat: Living Pit v2 — eight new feed events" --body "Spec: docs/superpowers/specs/2026-07-06-living-pit-v2-design.md. Rollout: mig 0210 FIRST, then deploy."
```

- [ ] **Step 2: Rollout (migration first)**

```bash
git checkout master && git fetch origin && git merge --ff-only origin/master
set -a; source app/.env.local; set +a
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate   # applies 0210
cd .. && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes
```

- [ ] **Step 3: Smoke**

1. Trigger maintenance: `curl -H "Authorization: Bearer $(cat .cron-secret)" https://film-goblin.vercel.app/api/cron/maintenance` — `dailyFeedEvents` ok; on a Monday the showtimes + streaming jobs also exercise Tasks 5–6.
2. `SELECT event_type, copy, created_at FROM feed_events ORDER BY created_at DESC LIMIT 10;` — expect `verdict_anointed` rows for any already-Anointed films (backfill effect: films at ≥90/≥5 today will fire once on first run — expected and correct), plus `now_at_theater` if the Loft slate has matched films.
3. `now_on_apple` live-fire happens on the next candidate promotion (Backrooms expected via the Monday cron) — verify then; no forced test against prod.
4. Landing + `/home`: new rows render through the existing FROM THE PIT presentation with no UI changes.

- [ ] **Step 4: CLAUDE.md wrapup**

Per the wrapup convention: Current state entry (v2 shipped, event census now 15 types), open thread "watch the v2 generators — especially the first streaming-refresh diff and the Backrooms now_on_apple crossing".

---

## Self-review notes

- **Spec coverage:** enum (T1), copy/priorities/summon (T2), moon module (T3), the four daily checks incl. full-moon pool + guards (T4), provider diff (T5), theater emit (T6), three grafts + summon wiring (T7), rollout order + smoke (T8). Composer/rendering/PUSH_KINDS untouched, per spec. ✓
- **Type consistency:** `FullMoonCandidate` produced and consumed in T4; `CopyVars.service/theater/summoned` defined in T2, used in T4–T7; `emitFeedEventSvc` restricted to `now_at_theater`/`now_on_apple` per the Global Constraint. ✓
- **Known judgment calls:** (1) verdict backfill on first run announces already-Anointed films — deliberate (they earned it; the feed was born yesterday); (2) `last_showing` uses UTC day, not theater-local — spec-accepted; (3) full-moon property test tolerates a 12↔13-window year and documented-date tests may require the 14h window fallback noted in T3.
