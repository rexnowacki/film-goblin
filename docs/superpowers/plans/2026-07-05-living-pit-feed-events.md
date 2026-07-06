# The Living Pit — System Feed Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated system events (price drops, all-time lows, price rises, new films, anniversaries, goblin picks, milestones) interleaved with user activity on `/home` and the anon landing card, so the feed never reads as empty.

**Architecture:** A system-only `feed_events` table (mig 0209) is written by app-side generators — a post-sweep price scan + a daily job, both in the maintenance cron using its existing `pg.Client` (the `runRateReminders(client)` pattern; **zero worker changes**), plus emissions from the `adminCreateFilm` and `scheduleGoblinPick` server actions. Copy is rendered at creation time by a pure copy module. A pure composer merges user `FeedItem`s with system events at read time (ratio cap, no stacking, priority, date-seeded determinism). Spec: `docs/superpowers/specs/2026-07-05-living-pit-feed-events-design.md`.

**Tech Stack:** Postgres (Supabase) + RLS, Next.js 15 server components, `pg` for cron jobs, PostgREST (supabase-js) for read paths, TMDB API for the release-date backfill.

## Global Constraints

- Node 20: prefix all npm/node commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`, run from the package dir stated in each step.
- Branch: all work on `feature/living-pit-feed-events` (exists; spec committed).
- Never commit to master; commit after every task. If `git commit -m` mangles, use `git commit -F /tmp/msg.txt`.
- Do NOT edit `app/lib/supabase/types.ts`. Use the cast `client as unknown as { from: (t: string) => any }` for `feed_events` reads/writes via supabase-js.
- User-facing copy says **"Apple TV"**, never "iTunes". Copy templates come verbatim from the spec (emoji embedded in the string).
- v1 event types (exactly 7): `price_drop`, `all_time_low`, `price_rise`, `new_film`, `anniversary`, `goblin_pick`, `milestone`.
- Priorities: all_time_low=100, price_drop=90, goblin_pick=80, new_film=70, price_rise=60, milestone=50, anniversary=10.
- Dedup: one event per (film_id, event_type) per 7 days, enforced in `emit.ts` at write time. Milestones (film_id NULL) dedup by `payload` (`kind`+`n`) instead. All-time-low deletes a same-day `price_drop` for the same film.
- Rollout order: **migration 0209 first, then deploy** (only new code reads the table), then backfill, then smoke.

---

### Task 1: Migration 0209 — `feed_events` table + RLS

**Files:**
- Create: `db/migrations/0209_feed_events.sql`
- Test: `db/tests/rls/feed_events.test.ts`

**Interfaces:**
- Produces: table `feed_events(id uuid, event_type feed_event_type, film_id uuid NULL, payload jsonb, copy text, priority int, created_at timestamptz)`; enum `feed_event_type` with the 7 v1 values. SELECT for `anon` + `authenticated`; no client-role writes.

- [ ] **Step 1: Write the failing RLS test**

Create `db/tests/rls/feed_events.test.ts` (same harness as `db/tests/rls/push_subscriptions.test.ts`):

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
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM feed_events`);
  await commit(db.client);
});

describe("RLS: feed_events", () => {
  it("service role can INSERT", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'The pit now holds 250 films. The hoard grows.', 50)`
    );
    await commit(db.client);
  });

  it("anon can SELECT", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'x', 50)`
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM feed_events`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated can SELECT but cannot INSERT", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(
        `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'x', 50)`
      )).rejects.toThrow();
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM feed_events`);
      expect(r.rowCount).toBe(0); // empty table — but the SELECT itself must not error
    } finally { await rollback(db.client); }
  });

  it("anon cannot DELETE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'x', 50)`
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`DELETE FROM feed_events`);
      expect(r.rowCount).toBe(0); // RLS: silently affects 0 rows
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

From `db/` (Colima/Docker required — see `reference_db_url_and_testcontainers` memory):

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/feed_events.test.ts
```

Expected: FAIL — `relation "feed_events" does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/0209_feed_events.sql`:

```sql
-- The Living Pit: system feed events (spec 2026-07-05).
-- System-only rows — user activity stays in `activity`. Copy is rendered at
-- creation time so template edits never rewrite history.

CREATE TYPE feed_event_type AS ENUM (
  'price_drop','all_time_low','price_rise','new_film',
  'anniversary','goblin_pick','milestone'
);

CREATE TABLE feed_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type feed_event_type NOT NULL,
  film_id    UUID REFERENCES films(id) ON DELETE CASCADE,
  payload    JSONB NOT NULL DEFAULT '{}',
  copy       TEXT NOT NULL,
  priority   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feed_events_created_idx ON feed_events (created_at DESC);
CREATE INDEX feed_events_dedup_idx ON feed_events (film_id, event_type, created_at);

ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

-- The feed is the storefront: anon reads it too. Writes are service-role only
-- (cron jobs + admin server actions) — no client-role write policies exist.
GRANT SELECT ON feed_events TO anon, authenticated;

CREATE POLICY feed_events_read ON feed_events
  FOR SELECT TO anon, authenticated USING (true);
```

- [ ] **Step 4: Run both db suites**

From `db/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/rls/feed_events.test.ts
```

Expected: pg-mem suite green (if `CREATE TYPE`/`GRANT`/`POLICY` trips pg-mem, extend the strip list in `db/tests/helpers/pg-mem.ts` the same way mig 0208 did for pg_net); RLS test 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0209_feed_events.sql db/tests/rls/feed_events.test.ts db/tests/helpers/pg-mem.ts
git commit -m "feat(db): feed_events table + anon-readable RLS (mig 0209)"
```

---

### Task 2: Copy module (pure)

**Files:**
- Create: `app/lib/feed-events/copy.ts`
- Test: `app/tests/feed-events/copy.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 4–8):

```ts
export type FeedEventType = "price_drop" | "all_time_low" | "price_rise" | "new_film" | "anniversary" | "goblin_pick" | "milestone";
export const EVENT_PRIORITY: Record<FeedEventType, number>;
export interface CopyVars { title?: string; year?: number; price?: number; old_price?: number; n?: number; age?: number; one_line?: string; milestone_kind?: "catalog" | "monthly" | "member"; }
export function variantCount(type: FeedEventType, vars?: CopyVars): number;
export function renderCopy(type: FeedEventType, vars: CopyVars, variant: number): string;
export function pickVariant(type: FeedEventType, vars: CopyVars, prevVariant: number | null, rand: () => number): number;
```

- [ ] **Step 1: Write the failing tests**

Create `app/tests/feed-events/copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderCopy, pickVariant, variantCount, EVENT_PRIORITY } from "@/lib/feed-events/copy";

describe("renderCopy", () => {
  it("price_drop variant 0 formats both prices", () => {
    expect(renderCopy("price_drop", { title: "Suspiria", price: 4.99, old_price: 14.99 }, 0)).toBe(
      "🩸 The blood price falls. **Suspiria** is now $4.99 — down from $14.99."
    );
  });

  it("all_time_low variant 0", () => {
    expect(renderCopy("all_time_low", { title: "Suspiria", price: 4.99 }, 0)).toBe(
      "⚡ ALL-TIME LOW: **Suspiria** at $4.99. The moon is right. The price is finally right too."
    );
  });

  it("anniversary variant 1 uses the release year", () => {
    expect(renderCopy("anniversary", { title: "Suspiria", year: 1977, age: 49 }, 1)).toBe(
      "💀 On this night in 1977, **Suspiria** was released. Burn something."
    );
  });

  it("milestone monthly appends 'Appropriate.' only for 13/66/666", () => {
    expect(renderCopy("milestone", { n: 13, milestone_kind: "monthly" }, 0)).toBe(
      "🌑 The coven watched 13 films together this month. Appropriate."
    );
    expect(renderCopy("milestone", { n: 14, milestone_kind: "monthly" }, 0)).toBe(
      "🌑 The coven watched 14 films together this month."
    );
  });

  it("goblin_pick includes the one-liner", () => {
    expect(renderCopy("goblin_pick", { title: "Possession", year: 1981, one_line: "Do not watch with a spouse." }, 0)).toBe(
      "👁️ The goblin's counsel this week: **Possession** (1981). Do not watch with a spouse."
    );
  });
});

describe("pickVariant", () => {
  it("never repeats the previous variant when more than one exists", () => {
    for (let i = 0; i < 20; i++) {
      const v = pickVariant("price_drop", {}, 1, Math.random);
      expect(v).not.toBe(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(variantCount("price_drop"));
    }
  });

  it("returns 0 for single-variant types regardless of prev", () => {
    expect(pickVariant("goblin_pick", {}, 0, Math.random)).toBe(0);
  });
});

describe("EVENT_PRIORITY", () => {
  it("matches the spec ordering", () => {
    expect(EVENT_PRIORITY.all_time_low).toBeGreaterThan(EVENT_PRIORITY.price_drop);
    expect(EVENT_PRIORITY.price_drop).toBeGreaterThan(EVENT_PRIORITY.goblin_pick);
    expect(EVENT_PRIORITY.goblin_pick).toBeGreaterThan(EVENT_PRIORITY.new_film);
    expect(EVENT_PRIORITY.new_film).toBeGreaterThan(EVENT_PRIORITY.price_rise);
    expect(EVENT_PRIORITY.price_rise).toBeGreaterThan(EVENT_PRIORITY.milestone);
    expect(EVENT_PRIORITY.milestone).toBeGreaterThan(EVENT_PRIORITY.anniversary);
  });
});
```

- [ ] **Step 2: Run to verify failure**

From `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/copy.test.ts
```

Expected: FAIL — cannot resolve `@/lib/feed-events/copy`.

- [ ] **Step 3: Implement**

Create `app/lib/feed-events/copy.ts`:

```ts
// Pure copy templates for system feed events (spec 2026-07-05 "The Living Pit").
// Copy is rendered ONCE at emission time and stored in feed_events.copy —
// editing these templates never rewrites history. Emoji is part of the string.

export type FeedEventType =
  | "price_drop" | "all_time_low" | "price_rise" | "new_film"
  | "anniversary" | "goblin_pick" | "milestone";

export const EVENT_PRIORITY: Record<FeedEventType, number> = {
  all_time_low: 100,
  price_drop: 90,
  goblin_pick: 80,
  new_film: 70,
  price_rise: 60,
  milestone: 50,
  anniversary: 10,
};

export interface CopyVars {
  title?: string;
  year?: number;
  price?: number;
  old_price?: number;
  n?: number;
  age?: number;
  one_line?: string;
  milestone_kind?: "catalog" | "monthly" | "member";
}

function usd(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(2)}` : "a new low";
}

type Template = (v: CopyVars) => string;

const TEMPLATES: Record<Exclude<FeedEventType, "milestone">, Template[]> = {
  price_drop: [
    v => `🩸 The blood price falls. **${v.title}** is now ${usd(v.price)} — down from ${usd(v.old_price)}.`,
    v => `🩸 Apple blinked. **${v.title}** drops to ${usd(v.price)}.`,
    v => `🩸 **${v.title}** just fell to ${usd(v.price)}. The goblin noticed. Now you have too.`,
  ],
  all_time_low: [
    v => `⚡ ALL-TIME LOW: **${v.title}** at ${usd(v.price)}. The moon is right. The price is finally right too.`,
    v => `⚡ **${v.title}** hits ${usd(v.price)} — the lowest the goblin has ever seen. Strike.`,
  ],
  price_rise: [
    v => `📈 The window closes. **${v.title}** climbs back to ${usd(v.price)}. You were warned.`,
    v => `📈 **${v.title}** rises to ${usd(v.price)}. The patient will be rewarded. Eventually.`,
  ],
  new_film: [
    v => `🕯️ Summoned to the pit: **${v.title}** (${v.year}). The goblin has been waiting for this one.`,
    v => `🕯️ Fresh from the pit: **${v.title}** (${v.year}) joins the hoard.`,
  ],
  anniversary: [
    v => `💀 **${v.title}** turns ${v.age} today. It has not mellowed.`,
    v => `💀 On this night in ${v.year}, **${v.title}** was released. Burn something.`,
    v => `🌕 ${v.age} years of **${v.title}**. The mothers do not age.`,
  ],
  goblin_pick: [
    v => `👁️ The goblin's counsel this week: **${v.title}** (${v.year}). ${v.one_line ?? ""}`.trim(),
  ],
};

const MILESTONE_TEMPLATES: Record<NonNullable<CopyVars["milestone_kind"]>, Template> = {
  catalog: v => `🎉 The pit now holds ${v.n} films. The hoard grows.`,
  monthly: v => {
    const base = `🌑 The coven watched ${v.n} films together this month.`;
    return v.n === 13 || v.n === 66 || v.n === 666 ? `${base} Appropriate.` : base;
  },
  member: v => `🎉 Coven member ${v.n} has signed the book. Welcome.`,
};

export function variantCount(type: FeedEventType, _vars?: CopyVars): number {
  return type === "milestone" ? 1 : TEMPLATES[type].length;
}

export function renderCopy(type: FeedEventType, vars: CopyVars, variant: number): string {
  if (type === "milestone") {
    const kind = vars.milestone_kind ?? "catalog";
    return MILESTONE_TEMPLATES[kind](vars);
  }
  const list = TEMPLATES[type];
  const idx = Math.min(Math.max(variant, 0), list.length - 1);
  return list[idx](vars);
}

/** Pick a variant index, never repeating prevVariant when >1 variant exists. */
export function pickVariant(
  type: FeedEventType,
  vars: CopyVars,
  prevVariant: number | null,
  rand: () => number,
): number {
  const count = variantCount(type, vars);
  if (count <= 1) return 0;
  const pool = Array.from({ length: count }, (_, i) => i).filter(i => i !== prevVariant);
  return pool[Math.floor(rand() * pool.length)];
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/copy.test.ts
```

Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/copy.ts app/tests/feed-events/copy.test.ts
git commit -m "feat(feed-events): copy templates + variant rotation (pure)"
```

---

### Task 3: Price-change classifier (pure)

**Files:**
- Create: `app/lib/feed-events/classify.ts`
- Test: `app/tests/feed-events/classify.test.ts`

**Interfaces:**
- Produces (consumed by Task 5):

```ts
export interface PriceChangeFacts {
  prevPrice: number;        // last recorded price before this change
  newPrice: number;         // the just-recorded price
  histMin: number;          // min price over the film's whole history (excluding the new row)
  histSpanDays: number;     // days between oldest and newest history rows
  median: number;           // median price over trailing 180d (excluding the new row)
  rowsAtOrAboveMedianLast7d: number; // history rows in last 7d (excl. new) with price >= median
}
export type PriceEventKind = "price_drop" | "all_time_low" | "price_rise";
export function classifyPriceChange(f: PriceChangeFacts): PriceEventKind | null;
```

- [ ] **Step 1: Write the failing tests**

Create `app/tests/feed-events/classify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyPriceChange, type PriceChangeFacts } from "@/lib/feed-events/classify";

const base: PriceChangeFacts = {
  prevPrice: 14.99, newPrice: 14.99, histMin: 4.99, histSpanDays: 400,
  median: 12.99, rowsAtOrAboveMedianLast7d: 3,
};

describe("classifyPriceChange", () => {
  it("drop of >= $3 → price_drop", () => {
    expect(classifyPriceChange({ ...base, newPrice: 11.99 })).toBe("price_drop");
  });

  it("drop of >= 20% (but < $3) → price_drop", () => {
    expect(classifyPriceChange({ ...base, prevPrice: 9.99, newPrice: 7.99 })).toBe("price_drop");
  });

  it("small drop (< 20% and < $3) → null", () => {
    expect(classifyPriceChange({ ...base, prevPrice: 14.99, newPrice: 13.99 })).toBe(null);
  });

  it("new price at or below historical min with >= 180d span → all_time_low (supersedes drop)", () => {
    expect(classifyPriceChange({ ...base, newPrice: 4.99 })).toBe("all_time_low");
    expect(classifyPriceChange({ ...base, newPrice: 3.99 })).toBe("all_time_low");
  });

  it("at historical min but span < 180d → plain price_drop", () => {
    expect(classifyPriceChange({ ...base, newPrice: 4.99, histSpanDays: 90 })).toBe("price_drop");
  });

  it("rise back to >= median after 7 clean days below → price_rise", () => {
    expect(classifyPriceChange({
      ...base, prevPrice: 7.99, newPrice: 14.99, rowsAtOrAboveMedianLast7d: 0,
    })).toBe("price_rise");
  });

  it("rise that never dipped 7 days below median → null", () => {
    expect(classifyPriceChange({
      ...base, prevPrice: 7.99, newPrice: 14.99, rowsAtOrAboveMedianLast7d: 2,
    })).toBe(null);
  });

  it("no change → null", () => {
    expect(classifyPriceChange(base)).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/classify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/lib/feed-events/classify.ts`:

```ts
// Pure price-event decisions (spec triggers, section "Generators").
// No DB, no clock: the caller assembles PriceChangeFacts from SQL.

export interface PriceChangeFacts {
  prevPrice: number;
  newPrice: number;
  histMin: number;
  histSpanDays: number;
  median: number;
  rowsAtOrAboveMedianLast7d: number;
}

export type PriceEventKind = "price_drop" | "all_time_low" | "price_rise";

const DROP_ABS_USD = 3;
const DROP_PCT = 0.2;
const ATL_MIN_SPAN_DAYS = 180;

export function classifyPriceChange(f: PriceChangeFacts): PriceEventKind | null {
  if (f.newPrice < f.prevPrice) {
    const dropped = f.prevPrice - f.newPrice;
    const isDrop = dropped >= DROP_ABS_USD || dropped >= f.prevPrice * DROP_PCT;
    const isAtl = f.histSpanDays >= ATL_MIN_SPAN_DAYS && f.newPrice <= f.histMin;
    if (isAtl && f.newPrice < f.prevPrice) return "all_time_low";
    return isDrop ? "price_drop" : null;
  }
  if (f.newPrice > f.prevPrice) {
    const returnedToMedian = f.newPrice >= f.median;
    const sevenCleanDaysBelow = f.rowsAtOrAboveMedianLast7d === 0;
    return returnedToMedian && sevenCleanDaysBelow ? "price_rise" : null;
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/classify.test.ts
```

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/classify.ts app/tests/feed-events/classify.test.ts
git commit -m "feat(feed-events): pure price-change classifier"
```

---

### Task 4: Composer (pure)

**Files:**
- Create: `app/lib/feed-events/types.ts`
- Create: `app/lib/feed-events/compose.ts`
- Test: `app/tests/feed-events/compose.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export interface SystemFeedEvent {
  id: string;
  event_type: FeedEventType;
  film_id: string | null;
  payload: Record<string, unknown>;
  copy: string;
  priority: number;
  created_at: string;
  film: { id: string; title: string; artwork_url: string | null } | null;
}

// compose.ts — generic over the user-item type so it doesn't import activity.ts
export interface ComposeOptions { maxSystemWhenEmpty?: number }  // default 6
export function composeFeed<U extends { created_at?: string }>(
  userItems: U[],
  systemEvents: SystemFeedEvent[],
  dateSeed: string,               // e.g. "2026-07-05" — same all day → stable order
  getCreatedAt: (u: U) => string, // extractor because FeedItem wraps singles/groups
  opts?: ComposeOptions,
): Array<{ type: "user"; item: U } | { type: "system"; event: SystemFeedEvent }>;
```

- Consumes: `FeedEventType` from Task 2's `copy.ts`.

- [ ] **Step 1: Write types.ts**

Create `app/lib/feed-events/types.ts`:

```ts
import type { FeedEventType } from "./copy";

export interface SystemFeedEvent {
  id: string;
  event_type: FeedEventType;
  film_id: string | null;
  payload: Record<string, unknown>;
  copy: string;
  priority: number;
  created_at: string;
  film: { id: string; title: string; artwork_url: string | null } | null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `app/tests/feed-events/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeFeed } from "@/lib/feed-events/compose";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

function sys(id: string, type: SystemFeedEvent["event_type"], priority: number, createdAt: string): SystemFeedEvent {
  return { id, event_type: type, film_id: null, payload: {}, copy: id, priority, created_at: createdAt, film: null };
}
function usr(id: string, createdAt: string) {
  return { id, created_at: createdAt };
}
const at = (h: number) => `2026-07-05T${String(h).padStart(2, "0")}:00:00Z`;
const getCreatedAt = (u: { created_at: string }) => u.created_at;

describe("composeFeed", () => {
  it("caps system events at 2:1 against user items", () => {
    const users = [usr("u1", at(10)), usr("u2", at(9))];
    const systems = Array.from({ length: 10 }, (_, i) =>
      sys(`s${i}`, i % 2 ? "price_drop" : "anniversary", 50, at(8 - (i % 8))));
    const out = composeFeed(users, systems, "2026-07-05", getCreatedAt);
    const sysCount = out.filter(o => o.type === "system").length;
    expect(sysCount).toBeLessThanOrEqual(4); // 2 * 2 users
    expect(out.filter(o => o.type === "user")).toHaveLength(2);
  });

  it("caps at 6 system events when there is zero user activity", () => {
    const systems = Array.from({ length: 12 }, (_, i) =>
      sys(`s${i}`, i % 2 ? "price_drop" : "anniversary", 50, at(i % 12)));
    const out = composeFeed([], systems, "2026-07-05", getCreatedAt);
    expect(out).toHaveLength(6);
  });

  it("includes at least one system event when any exist", () => {
    const users = [usr("u1", at(10))];
    const out = composeFeed(users, [sys("s1", "milestone", 50, at(9))], "2026-07-05", getCreatedAt);
    expect(out.some(o => o.type === "system")).toBe(true);
  });

  it("never renders two consecutive system events of the same type", () => {
    const systems = [
      sys("a", "price_drop", 90, at(10)),
      sys("b", "price_drop", 90, at(9)),
      sys("c", "price_drop", 90, at(8)),
      sys("d", "anniversary", 10, at(7)),
    ];
    const out = composeFeed([usr("u1", at(6)), usr("u2", at(5))], systems, "2026-07-05", getCreatedAt);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i];
      if (a.type === "system" && b.type === "system") {
        expect(a.event.event_type).not.toBe(b.event.event_type);
      }
    }
  });

  it("selects higher-priority system events when over cap", () => {
    const users = [usr("u1", at(10))];
    const systems = [
      sys("low1", "anniversary", 10, at(9)),
      sys("low2", "anniversary", 10, at(8)),
      sys("high", "all_time_low", 100, at(1)),
    ];
    const out = composeFeed(users, systems, "2026-07-05", getCreatedAt); // cap = 2
    const chosen = out.filter(o => o.type === "system").map(o => (o as any).event.id);
    expect(chosen).toContain("high");
  });

  it("is deterministic for the same date seed", () => {
    const users = [usr("u1", at(10)), usr("u2", at(6))];
    const systems = [sys("a", "price_drop", 90, at(9)), sys("b", "milestone", 50, at(7))];
    const run1 = composeFeed(users, systems, "2026-07-05", getCreatedAt).map(o => o.type === "user" ? o.item.id : o.event.id);
    const run2 = composeFeed(users, systems, "2026-07-05", getCreatedAt).map(o => o.type === "user" ? o.item.id : o.event.id);
    expect(run1).toEqual(run2);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/compose.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `app/lib/feed-events/compose.ts`:

```ts
// Read-time feed composer (spec "Core rules"): ratio cap, no same-type
// stacking, priority selection, date-seeded determinism. Pure — no DB.

import type { SystemFeedEvent } from "./types";

export interface ComposeOptions { maxSystemWhenEmpty?: number }

export type ComposedItem<U> =
  | { type: "user"; item: U }
  | { type: "system"; event: SystemFeedEvent };

// mulberry32 — tiny deterministic PRNG; seeded from the date string so the
// feed does not reshuffle on refresh within a day.
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function composeFeed<U>(
  userItems: U[],
  systemEvents: SystemFeedEvent[],
  dateSeed: string,
  getCreatedAt: (u: U) => string,
  opts: ComposeOptions = {},
): Array<ComposedItem<U>> {
  const rng = seededRng(dateSeed);
  const maxWhenEmpty = opts.maxSystemWhenEmpty ?? 6;

  // Rule 4: priority weighting picks WHICH system events surface…
  const ranked = [...systemEvents].sort((a, b) =>
    b.priority - a.priority || b.created_at.localeCompare(a.created_at));

  // Rule 1: ratio cap (system ≤ 2:1), floor of 1 when any exist (rule 3).
  const cap = userItems.length === 0
    ? Math.min(maxWhenEmpty, ranked.length)
    : Math.min(ranked.length, Math.max(1, userItems.length * 2));
  const chosen = ranked.slice(0, cap);

  // …then everything renders in recency order.
  const merged: Array<ComposedItem<U>> = [
    ...userItems.map(item => ({ type: "user" as const, item })),
    ...chosen.map(event => ({ type: "system" as const, event })),
  ].sort((a, b) => {
    const ta = a.type === "user" ? getCreatedAt(a.item) : a.event.created_at;
    const tb = b.type === "user" ? getCreatedAt(b.item) : b.event.created_at;
    return tb.localeCompare(ta) || (rng() < 0.5 ? -1 : 1);
  });

  // Rule 2: no two consecutive system events of the same event_type.
  // Single fix-up pass: push the offender down past the next non-conflicting slot.
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1], cur = merged[i];
    if (prev.type !== "system" || cur.type !== "system") continue;
    if (prev.event.event_type !== cur.event.event_type) continue;
    let j = i + 1;
    while (j < merged.length) {
      const cand = merged[j];
      if (cand.type !== "system" || cand.event.event_type !== prev.event.event_type) break;
      j++;
    }
    if (j < merged.length) {
      const [moved] = merged.splice(j, 1);
      merged.splice(i, 0, moved);
    } else {
      merged.splice(i, 1)[0] && merged.push(cur); // no swap available — demote to tail
    }
  }

  return merged;
}
```

- [ ] **Step 5: Run tests; iterate until green**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/compose.test.ts
```

Expected: PASS (6/6). The fix-up pass is the fiddly part — if the no-stacking test fails, debug the splice logic rather than weakening the test.

- [ ] **Step 6: Commit**

```bash
git add app/lib/feed-events/types.ts app/lib/feed-events/compose.ts app/tests/feed-events/compose.test.ts
git commit -m "feat(feed-events): pure feed composer with cap/stacking/priority rules"
```

---

### Task 5: Emission helpers + price scan

**Files:**
- Create: `app/lib/feed-events/emit.ts`
- Create: `app/lib/feed-events/price-scan.ts`
- Test: none new (pure logic already covered by Tasks 2–3; SQL paths are smoke-tested in the Task 10 runbook — same treatment as `app/lib/cron/rate-reminders.ts`)

**Interfaces:**
- Consumes: `renderCopy`, `pickVariant`, `EVENT_PRIORITY`, `CopyVars`, `FeedEventType` (Task 2); `classifyPriceChange`, `PriceChangeFacts` (Task 3).
- Produces (consumed by Tasks 6–8):

```ts
// emit.ts
export interface FeedEventSpec { type: FeedEventType; filmId: string | null; vars: CopyVars; payloadExtra?: Record<string, unknown>; }
export async function emitFeedEvent(client: pg.Client, spec: FeedEventSpec): Promise<"inserted" | "deduped">;
export async function emitFeedEventSvc(svc: SupabaseClient, spec: FeedEventSpec): Promise<"inserted" | "deduped">;
// price-scan.ts
export async function runPriceFeedScan(client: pg.Client, opts?: { sinceHours?: number }): Promise<{ scanned: number; emitted: number }>;
```

- [ ] **Step 1: Implement emit.ts**

Create `app/lib/feed-events/emit.ts`:

```ts
// Write path for feed_events. Two flavors of the same emission:
//  - emitFeedEvent(pg)   — cron jobs (maintenance route hands jobs a pg.Client)
//  - emitFeedEventSvc(s) — server actions (service-role supabase client)
// Both enforce: 7-day (film_id, event_type) dedup; milestone dedup by payload
// kind+n; variant rotation vs. the previous event of the same type;
// all_time_low deletes a same-day price_drop for the same film.

import type { Client as PgClient } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  renderCopy, pickVariant, EVENT_PRIORITY,
  type CopyVars, type FeedEventType,
} from "./copy";

export interface FeedEventSpec {
  type: FeedEventType;
  filmId: string | null;
  vars: CopyVars;
  payloadExtra?: Record<string, unknown>;
}

interface BuiltRow {
  event_type: FeedEventType;
  film_id: string | null;
  payload: Record<string, unknown>;
  copy: string;
  priority: number;
}

function buildRow(spec: FeedEventSpec, prevVariant: number | null): BuiltRow {
  const variant = pickVariant(spec.type, spec.vars, prevVariant, Math.random);
  return {
    event_type: spec.type,
    film_id: spec.filmId,
    payload: { ...spec.payloadExtra, vars: spec.vars, variant },
    copy: renderCopy(spec.type, spec.vars, variant),
    priority: EVENT_PRIORITY[spec.type],
  };
}

export async function emitFeedEvent(
  client: PgClient,
  spec: FeedEventSpec,
): Promise<"inserted" | "deduped"> {
  if (spec.type === "milestone") {
    const kind = spec.vars.milestone_kind ?? "catalog";
    const dup = await client.query(
      `SELECT 1 FROM feed_events
       WHERE event_type = 'milestone'
         AND payload -> 'vars' ->> 'milestone_kind' = $1
         AND (payload -> 'vars' ->> 'n')::int = $2
       LIMIT 1`,
      [kind, spec.vars.n ?? 0],
    );
    if (dup.rowCount) return "deduped";
  } else if (spec.filmId) {
    const dup = await client.query(
      `SELECT 1 FROM feed_events
       WHERE film_id = $1 AND event_type = $2
         AND created_at > now() - interval '7 days'
       LIMIT 1`,
      [spec.filmId, spec.type],
    );
    if (dup.rowCount) return "deduped";
  }

  const prev = await client.query(
    `SELECT (payload ->> 'variant')::int AS variant FROM feed_events
     WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1`,
    [spec.type],
  );
  const row = buildRow(spec, prev.rows[0]?.variant ?? null);

  if (spec.type === "all_time_low" && spec.filmId) {
    // ATL supersedes: kill a same-day price_drop for this film.
    await client.query(
      `DELETE FROM feed_events
       WHERE film_id = $1 AND event_type = 'price_drop'
         AND created_at::date = now()::date`,
      [spec.filmId],
    );
  }

  await client.query(
    `INSERT INTO feed_events (event_type, film_id, payload, copy, priority)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.event_type, row.film_id, JSON.stringify(row.payload), row.copy, row.priority],
  );
  return "inserted";
}

export async function emitFeedEventSvc(
  svc: SupabaseClient,
  spec: FeedEventSpec,
): Promise<"inserted" | "deduped"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = svc as unknown as { from: (t: string) => any };

  if (spec.filmId) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dup } = await c
      .from("feed_events")
      .select("id")
      .eq("film_id", spec.filmId)
      .eq("event_type", spec.type)
      .gt("created_at", cutoff)
      .limit(1);
    if (dup && dup.length > 0) return "deduped";
  }

  const { data: prev } = await c
    .from("feed_events")
    .select("payload")
    .eq("event_type", spec.type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevVariant = typeof prev?.payload?.variant === "number" ? prev.payload.variant : null;
  const row = buildRow(spec, prevVariant);

  const { error } = await c.from("feed_events").insert(row);
  if (error) throw error;
  return "inserted";
}
```

- [ ] **Step 2: Implement price-scan.ts**

Create `app/lib/feed-events/price-scan.ts`:

```ts
// Post-sweep price scan: derives price feed events from price_history rather
// than hooking the worker (zero worker changes — the worker's job is prices,
// this module's job is theater). Runs right after runOnce() in the
// maintenance cron and in the standalone refresh-prices route.
// Idempotent: re-runs are absorbed by emit.ts's 7-day dedup.

import type { Client as PgClient } from "pg";
import { classifyPriceChange } from "./classify";
import { emitFeedEvent } from "./emit";

export async function runPriceFeedScan(
  client: PgClient,
  opts: { sinceHours?: number } = {},
): Promise<{ scanned: number; emitted: number }> {
  const sinceHours = opts.sinceHours ?? 26; // daily cron cadence + slack

  // Latest new price per film in the window, with the immediately-prior price.
  const { rows } = await client.query(
    `WITH ranked AS (
       SELECT ph.film_id, ph.price_usd, ph.created_at,
              LAG(ph.price_usd) OVER (PARTITION BY ph.film_id ORDER BY ph.created_at) AS prev_price,
              ROW_NUMBER() OVER (PARTITION BY ph.film_id ORDER BY ph.created_at DESC) AS rn
       FROM price_history ph
     )
     SELECT r.film_id, r.price_usd, r.prev_price, f.title
     FROM ranked r
     JOIN films f ON f.id = r.film_id
     WHERE r.rn = 1
       AND r.created_at > now() - ($1 || ' hours')::interval
       AND r.prev_price IS NOT NULL
       AND r.price_usd <> r.prev_price`,
    [String(sinceHours)],
  );

  let emitted = 0;
  for (const r of rows) {
    const filmId: string = r.film_id;
    const newPrice = Number(r.price_usd);
    const prevPrice = Number(r.prev_price);

    const stats = await client.query(
      `SELECT
         min(price_usd) FILTER (WHERE rn > 1)                                   AS hist_min,
         EXTRACT(EPOCH FROM (max(created_at) - min(created_at))) / 86400        AS span_days,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd)
           FILTER (WHERE rn > 1 AND created_at > now() - interval '180 days')   AS median_180
       FROM (
         SELECT price_usd, created_at,
                ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
         FROM price_history WHERE film_id = $1
       ) t`,
      [filmId],
    );
    const s = stats.rows[0];
    const median = s.median_180 == null ? prevPrice : Number(s.median_180);

    const above = await client.query(
      `SELECT count(*) AS c FROM (
         SELECT price_usd, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
         FROM price_history
         WHERE film_id = $1 AND created_at > now() - interval '7 days'
       ) t WHERE rn > 1 AND price_usd >= $2`,
      [filmId, median],
    );

    const kind = classifyPriceChange({
      prevPrice,
      newPrice,
      histMin: s.hist_min == null ? newPrice : Number(s.hist_min),
      histSpanDays: s.span_days == null ? 0 : Number(s.span_days),
      median,
      rowsAtOrAboveMedianLast7d: Number(above.rows[0].c),
    });
    if (!kind) continue;

    const result = await emitFeedEvent(client, {
      type: kind,
      filmId,
      vars: { title: r.title, price: newPrice, old_price: prevPrice },
    });
    if (result === "inserted") emitted += 1;
  }

  return { scanned: rows.length, emitted };
}
```

- [ ] **Step 3: Typecheck**

From `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: clean. (NUMERIC comes back from `pg` as strings — every read above wraps in `Number(...)`; keep it that way, same lesson as `worker/db.ts`.)

- [ ] **Step 4: Commit**

```bash
git add app/lib/feed-events/emit.ts app/lib/feed-events/price-scan.ts
git commit -m "feat(feed-events): emission helpers + post-sweep price scan"
```

---

### Task 6: Daily job — anniversaries + milestones

**Files:**
- Create: `app/lib/feed-events/daily.ts`
- Test: `app/tests/feed-events/daily.test.ts` (pure pickers only)

**Interfaces:**
- Consumes: `emitFeedEvent` (Task 5).
- Produces (consumed by Task 7):

```ts
export interface AnniversaryCandidate { film_id: string; title: string; release_year: number; watchlist_count: number; }
export function pickAnniversary(candidates: AnniversaryCandidate[], todayYear: number): (AnniversaryCandidate & { age: number }) | null;
export function catalogThresholds(count: number): number[];   // e.g. 322 → [250, 300]
export async function runDailyFeedEvents(client: pg.Client, now?: Date): Promise<{ emitted: number }>;
```

- [ ] **Step 1: Write the failing tests for the pure pickers**

Create `app/tests/feed-events/daily.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickAnniversary, catalogThresholds, type AnniversaryCandidate } from "@/lib/feed-events/daily";

const c = (id: string, year: number, wl: number): AnniversaryCandidate =>
  ({ film_id: id, title: id, release_year: year, watchlist_count: wl });

describe("pickAnniversary", () => {
  it("prefers a round-number age (age % 5 === 0) over a higher watchlist count", () => {
    const picked = pickAnniversary([c("round", 2001, 1), c("popular", 2000, 99)], 2026);
    expect(picked?.film_id).toBe("round"); // 2026-2001 = 25
  });

  it("falls back to highest watchlist count when no round age exists", () => {
    const picked = pickAnniversary([c("a", 2002, 3), c("b", 2003, 7)], 2026);
    expect(picked?.film_id).toBe("b");
  });

  it("computes age and returns null for empty input", () => {
    expect(pickAnniversary([c("x", 1977, 0)], 2026)?.age).toBe(49);
    expect(pickAnniversary([], 2026)).toBe(null);
  });
});

describe("catalogThresholds", () => {
  it("lists every 50-threshold from 250 up to the count", () => {
    expect(catalogThresholds(322)).toEqual([250, 300]);
    expect(catalogThresholds(249)).toEqual([]);
    expect(catalogThresholds(250)).toEqual([250]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/daily.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/lib/feed-events/daily.ts`:

```ts
// Daily generator (runs inside the maintenance cron): anniversaries — the
// guaranteed freshness fallback — plus milestone checks. Max ONE anniversary
// per day (spec). Idempotent via emit.ts dedup rules.

import type { Client as PgClient } from "pg";
import { emitFeedEvent } from "./emit";

export interface AnniversaryCandidate {
  film_id: string;
  title: string;
  release_year: number;
  watchlist_count: number;
}

export function pickAnniversary(
  candidates: AnniversaryCandidate[],
  todayYear: number,
): (AnniversaryCandidate & { age: number }) | null {
  if (candidates.length === 0) return null;
  const withAge = candidates
    .map(c => ({ ...c, age: todayYear - c.release_year }))
    .filter(c => c.age > 0);
  if (withAge.length === 0) return null;
  const byPopularity = (a: typeof withAge[number], b: typeof withAge[number]) =>
    b.watchlist_count - a.watchlist_count || b.age - a.age;
  const round = withAge.filter(c => c.age % 5 === 0).sort(byPopularity);
  return round[0] ?? withAge.sort(byPopularity)[0];
}

const CATALOG_START = 250;
const CATALOG_STEP = 50;

export function catalogThresholds(count: number): number[] {
  const out: number[] = [];
  for (let t = CATALOG_START; t <= count; t += CATALOG_STEP) out.push(t);
  return out;
}

const MEMBER_STEP = 5;

export async function runDailyFeedEvents(
  client: PgClient,
  now: Date = new Date(),
): Promise<{ emitted: number }> {
  let emitted = 0;
  const bump = (r: "inserted" | "deduped") => { if (r === "inserted") emitted += 1; };

  // --- anniversary (max one per day; the freshness fallback of last resort) ---
  const anniv = await client.query(
    `SELECT f.id AS film_id, f.title,
            EXTRACT(YEAR FROM f.theatrical_release_date)::int AS release_year,
            count(w.id)::int AS watchlist_count
     FROM films f
     LEFT JOIN watchlists w ON w.film_id = f.id
     WHERE f.theatrical_release_date IS NOT NULL
       AND EXTRACT(MONTH FROM f.theatrical_release_date) = $1
       AND EXTRACT(DAY   FROM f.theatrical_release_date) = $2
     GROUP BY f.id, f.title, f.theatrical_release_date`,
    [now.getUTCMonth() + 1, now.getUTCDate()],
  );
  const picked = pickAnniversary(anniv.rows, now.getUTCFullYear());
  if (picked) {
    bump(await emitFeedEvent(client, {
      type: "anniversary",
      filmId: picked.film_id,
      vars: { title: picked.title, year: picked.release_year, age: picked.age },
    }));
  }

  // --- milestone: catalog size crosses 250, 300, 350, … ---
  const filmCount = Number((await client.query(`SELECT count(*) AS c FROM films`)).rows[0].c);
  for (const t of catalogThresholds(filmCount)) {
    bump(await emitFeedEvent(client, {
      type: "milestone", filmId: null,
      vars: { n: t, milestone_kind: "catalog" },
    }));
  }

  // --- milestone: monthly coven watch total (1st of the month, for last month) ---
  if (now.getUTCDate() === 1) {
    const monthly = await client.query(
      `SELECT count(*) AS c FROM watched
       WHERE watched_at >= date_trunc('month', now() - interval '1 month')
         AND watched_at <  date_trunc('month', now())`,
    );
    const n = Number(monthly.rows[0].c);
    if (n > 0) {
      bump(await emitFeedEvent(client, {
        type: "milestone", filmId: null,
        vars: { n, milestone_kind: "monthly" },
        payloadExtra: { month: now.toISOString().slice(0, 7) },
      }));
    }
  }

  // --- milestone: every 5th member ---
  const members = Number((await client.query(`SELECT count(*) AS c FROM profiles`)).rows[0].c);
  if (members > 0 && members % MEMBER_STEP === 0) {
    bump(await emitFeedEvent(client, {
      type: "milestone", filmId: null,
      vars: { n: members, milestone_kind: "member" },
    }));
  }

  return { emitted };
}
```

Note: milestone dedup lives in `emit.ts` (payload kind+n check, no 7-day window), so catalog/member milestones fire exactly once ever per threshold, and the monthly one dedups on `n` — if two consecutive months tie exactly, the second is skipped; accepted for v1.

- [ ] **Step 4: Run tests + typecheck**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/daily.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: PASS (5/5); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/daily.ts app/tests/feed-events/daily.test.ts
git commit -m "feat(feed-events): daily anniversary + milestone generator"
```

---

### Task 7: Wire generators into the crons

**Files:**
- Modify: `app/app/api/cron/maintenance/route.ts` (add two jobs after `jobs.refreshPrices`)
- Modify: `app/app/api/cron/refresh-prices/route.ts` (parity: scan after `runOnce`)

**Interfaces:**
- Consumes: `runPriceFeedScan(client)` (Task 5), `runDailyFeedEvents(client)` (Task 6). Both take the route's existing `pg.Client` — same pattern as `runRateReminders(client)`.

- [ ] **Step 1: Maintenance route**

In `app/app/api/cron/maintenance/route.ts`, add imports:

```ts
import { runPriceFeedScan } from "@/lib/feed-events/price-scan";
import { runDailyFeedEvents } from "@/lib/feed-events/daily";
```

Immediately after the `jobs.refreshPrices = await recordedJob("refresh-prices", ...)` block, add:

```ts
    jobs.priceFeedScan = await recordedJob("price-feed-scan", () => runPriceFeedScan(client));

    jobs.dailyFeedEvents = await recordedJob("daily-feed-events", () => runDailyFeedEvents(client));
```

(Match the surrounding `recordedJob` call style exactly — read the neighbors before editing.)

- [ ] **Step 2: refresh-prices route (manual smoke parity)**

In `app/app/api/cron/refresh-prices/route.ts`, import `runPriceFeedScan` and, after `const digest = await runOnce(client, ...)`, add:

```ts
    const feedScan = await runPriceFeedScan(client);
```

and include it in the response: `return NextResponse.json({ ok: true, digest: digest.snapshot(), feedScan });`

- [ ] **Step 3: Typecheck + full suite**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: clean / all green.

- [ ] **Step 4: Commit**

```bash
git add app/app/api/cron/maintenance/route.ts app/app/api/cron/refresh-prices/route.ts
git commit -m "feat(feed-events): wire price scan + daily job into crons"
```

---

### Task 8: `new_film` + `goblin_pick` emission from admin actions

**Files:**
- Modify: `app/lib/actions/admin/films.ts` (`adminCreateFilm`)
- Modify: `app/lib/actions/admin/goblin-pick.ts` (`scheduleGoblinPick`)

**Interfaces:**
- Consumes: `emitFeedEventSvc(svc, spec)` (Task 5).

- [ ] **Step 1: adminCreateFilm**

In `app/lib/actions/admin/films.ts`, import `emitFeedEventSvc`. Read `adminCreateFilm` (line ~178) to find where the film row insert succeeds and its `id`/`title`/`year` are known, then add — inside a try/catch so a feed hiccup never fails film creation:

```ts
  try {
    await emitFeedEventSvc(serviceRoleClient(), {
      type: "new_film",
      filmId: createdFilmId,           // the id returned by the insert in this function
      vars: { title: createdTitle, year: createdYear },
    });
  } catch (err) {
    console.warn("feed event new_film failed:", err instanceof Error ? err.message : err);
  }
```

Important: `adminCreateFilm` can also *promote a TMDB twin in place* (`lib/admin/promote-tmdb-twin.ts` path) — that is NOT a new film; only emit on the fresh-insert path.

- [ ] **Step 2: scheduleGoblinPick**

In `app/lib/actions/admin/goblin-pick.ts`, after the successful `goblin_pick` insert in `scheduleGoblinPick`, fetch the film's title/year and emit (same try/catch discipline):

```ts
  try {
    const svc = serviceRoleClient();
    const { data: film } = await svc
      .from("films")
      .select("title, year")
      .eq("id", filmId)
      .maybeSingle();
    if (film) {
      await emitFeedEventSvc(svc, {
        type: "goblin_pick",
        filmId,
        vars: { title: film.title, year: film.year, one_line: whisperText.trim() || undefined },
      });
    }
  } catch (err) {
    console.warn("feed event goblin_pick failed:", err instanceof Error ? err.message : err);
  }
```

- [ ] **Step 3: Typecheck + suite**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: clean / green (existing `films.ts` action tests must still pass).

- [ ] **Step 4: Commit**

```bash
git add app/lib/actions/admin/films.ts app/lib/actions/admin/goblin-pick.ts
git commit -m "feat(feed-events): emit new_film + goblin_pick from admin actions"
```

---

### Task 9: Read path + rendering (/home and landing)

**Files:**
- Create: `app/lib/feed-events/query.ts`
- Create: `app/components/activity/SystemEventRow.tsx`
- Modify: `app/lib/queries/activity.ts` (extend `FeedItem`)
- Modify: `app/components/FeedTabs.tsx` (render system rows; "all" tab only)
- Modify: `app/app/home/page.tsx` (fetch + compose)
- Modify: `app/lib/queries/landing.ts` + `app/components/LandingFeedCard.tsx` (replace ad-hoc price_drop merge)

**Interfaces:**
- Consumes: `SystemFeedEvent` (Task 4), `composeFeed` (Task 4).
- Produces: `getRecentSystemEvents(client, limit): Promise<SystemFeedEvent[]>`; `FeedItem` union gains `{ type: "system"; event: SystemFeedEvent }`.

- [ ] **Step 1: query.ts (client-injection pattern per `app/lib/queries/CLAUDE.md`)**

Create `app/lib/feed-events/query.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SystemFeedEvent } from "./types";

type Client = SupabaseClient<Database>;

export async function getRecentSystemEvents(
  client: Client,
  limit = 12,
): Promise<SystemFeedEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as unknown as { from: (t: string) => any };
  const { data, error } = await c
    .from("feed_events")
    .select("id, event_type, film_id, payload, copy, priority, created_at, film:films(id, title, artwork_url)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("getRecentSystemEvents failed:", error.message);
    return [];
  }
  // PostgREST embed may type as array — normalize (see components/CLAUDE.md).
  return (data ?? []).map((r: any) => ({
    ...r,
    film: Array.isArray(r.film) ? (r.film[0] ?? null) : (r.film ?? null),
  }));
}
```

- [ ] **Step 2: Extend FeedItem**

In `app/lib/queries/activity.ts`, add the import and extend the union:

```ts
import type { SystemFeedEvent } from "@/lib/feed-events/types";

export type FeedItem =
  | { type: "single"; activity: EnrichedActivity }
  | { type: "group"; group: ActivityGroup }
  | { type: "system"; event: SystemFeedEvent };
```

Then chase the union through every switch/conditional the typechecker flags (`FeedTabs.feedItemMatches`, `FeedRow` callers): system items match ONLY the "all" tab (`feedItemMatches` returns `false` for "coven"/"recs"), and list keys use `item.event.id`.

- [ ] **Step 3: SystemEventRow**

Create `app/components/activity/SystemEventRow.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { SystemFeedEvent } from "@/lib/feed-events/types";

// copy contains **bold** markers from the templates — render them as <strong>.
function renderCopyText(copy: string) {
  return copy.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**")
      ? <strong key={i}>{seg.slice(2, -2)}</strong>
      : <span key={i}>{seg}</span>
  );
}

export default function SystemEventRow({ event }: { event: SystemFeedEvent }) {
  const body = (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {event.film?.artwork_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.film.artwork_url}
          alt=""
          width={40}
          height={60}
          style={{ objectFit: "cover", border: "1px solid #333", flexShrink: 0 }}
        />
      ) : null}
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{renderCopyText(event.copy)}</p>
    </div>
  );
  return (
    <div
      data-system-event={event.event_type}
      style={{ padding: "12px 0", borderBottom: "1px solid #222", color: "var(--muted)" }}
    >
      {event.film ? (
        <Link href={`/film/${event.film.id}`} prefetch={false} style={{ color: "inherit", textDecoration: "none" }}>
          {body}
        </Link>
      ) : body}
    </div>
  );
}
```

Before finishing, read `app/components/activity/FeedRow.tsx` and match its row container/border conventions so system rows sit visually inside the same feed (adjust the wrapper styles above to whatever FeedRow actually uses — quieter than user rows is correct and intended, per the `--muted` color). Note `prefetch={false}` is repo law (see failure archaeology).

- [ ] **Step 4: FeedTabs renders system items**

In `app/components/FeedTabs.tsx`: import `SystemEventRow`; in `feedItemMatches` return `item.type !== "system"` short-circuit for non-"all" tabs (system items visible only under "all"); in the render `.map`, branch:

```tsx
filtered.map(item =>
  item.type === "system" ? (
    <SystemEventRow key={item.event.id} event={item.event} />
  ) : (
    <FeedRow key={item.type === "group" ? item.group.key : item.activity.id} item={item} /* keep existing props */ />
  )
)
```

Keep the existing pagination/`seen`-set logic operating on user items only — the `seen` id set should also tolerate system ids (use `item.type === "system" ? item.event.id : …` wherever ids are collected).

- [ ] **Step 5: Compose on /home**

In `app/app/home/page.tsx`: alongside the existing feed fetch (find where `FeedTabs` gets its items, around line 142), fetch system events and compose:

```ts
import { getRecentSystemEvents } from "@/lib/feed-events/query";
import { composeFeed } from "@/lib/feed-events/compose";
import type { FeedItem } from "@/lib/queries/activity";

// after userFeedItems: FeedItem[] is fetched (the existing call):
const systemEvents = await getRecentSystemEvents(supabase, 12);
const dateSeed = new Date().toISOString().slice(0, 10);
const composed = composeFeed(
  userFeedItems,
  systemEvents,
  dateSeed,
  (it) => it.type === "group" ? it.group.items[0]?.created_at ?? "" : it.type === "single" ? it.activity.created_at : "",
);
const feedItems: FeedItem[] = composed.map(c =>
  c.type === "system" ? { type: "system" as const, event: c.event } : c.item
);
```

Pass `feedItems` where the old items went. Check the actual `ActivityGroup` shape in `group-activity.ts` for the correct `created_at` extractor (adjust the accessor to the real field — the group's newest member's timestamp).

- [ ] **Step 6: Landing card**

In `app/lib/queries/landing.ts`: add a new row variant to `LandingFeedRow`:

```ts
  | { kind: "system"; id: string; created_at: string; copy: string; film: LandingFilm | null }
```

Replace the existing ad-hoc price_drop sourcing (the `PRICE_DROP_MAX_AGE_MS` block) with: fetch `getRecentSystemEvents(client, 6)`, run `composeFeed(userRows, systemEvents, dateSeed, r => r.created_at)`, and map system entries into the new variant (`copy`, `film` from the embed). Delete the old `price_drop` variant and its renderer once nothing references it. In `app/components/LandingFeedCard.tsx`, render `kind === "system"` rows with the same `**bold**`→`<strong>` treatment as `SystemEventRow` (extract `renderCopyText` into `SystemEventRow.tsx` as a named export and import it).

- [ ] **Step 7: Verify**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: all clean. The typechecker is the guide here — every place the `FeedItem` union lands must handle `"system"`.

- [ ] **Step 8: Commit**

```bash
git add app/lib/feed-events/query.ts app/components/activity/SystemEventRow.tsx app/lib/queries/activity.ts app/components/FeedTabs.tsx app/app/home/page.tsx app/lib/queries/landing.ts app/components/LandingFeedCard.tsx
git commit -m "feat(feed-events): compose + render system events on /home and landing"
```

---

### Task 10: Backfill script, rollout runbook, wrapup

**Files:**
- Create: `app/scripts/backfill-release-dates.ts`
- Modify: root `CLAUDE.md` (wrapup, separate docs branch after merge)

- [ ] **Step 1: Backfill script**

Create `app/scripts/backfill-release-dates.ts`:

```ts
// One-time backfill: theatrical_release_date from TMDB for films that have a
// tmdb_id but no date (10/322 had dates as of 2026-07-05). Idempotent — only
// touches NULL dates. Run from app/ with prod env sourced:
//   set -a; source .env.local; source ../db/.env; set +a
//   PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsx scripts/backfill-release-dates.ts
import pg from "pg";
import { lookupTmdb } from "../lib/search/tmdb";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, title, tmdb_id FROM films
     WHERE tmdb_id IS NOT NULL AND theatrical_release_date IS NULL
     ORDER BY title`,
  );
  console.log(`${rows.length} films to backfill`);

  let updated = 0, missing = 0, failed = 0;
  for (const f of rows) {
    const res = await lookupTmdb(Number(f.tmdb_id));
    if (!res.ok) { failed += 1; console.warn(`FAIL ${f.title}: ${res.error}`); continue; }
    const date = res.fields.theatrical_release_date;
    if (!date) { missing += 1; console.warn(`no date on TMDB: ${f.title}`); continue; }
    await client.query(
      `UPDATE films SET theatrical_release_date = $1 WHERE id = $2 AND theatrical_release_date IS NULL`,
      [date, f.id],
    );
    updated += 1;
    await new Promise(r => setTimeout(r, 120)); // stay friendly to TMDB rate limits
  }

  console.log(`done: ${updated} updated, ${missing} no-date, ${failed} failed`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Typecheck it compiles: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` from `app/`. Requires `TMDB_API_KEY` in env (already used by `lib/search/tmdb.ts`).

- [ ] **Step 2: Commit, PR, merge after review**

```bash
git add app/scripts/backfill-release-dates.ts
git commit -m "feat(feed-events): TMDB release-date backfill script"
git push -u origin feature/living-pit-feed-events
gh pr create --title "feat: The Living Pit — system feed events" --body "Spec: docs/superpowers/specs/2026-07-05-living-pit-feed-events-design.md. Rollout: mig 0209 FIRST, then deploy, then backfill script, then smoke."
```

- [ ] **Step 3: Rollout (after merge) — migration FIRST this time**

```bash
git checkout master && git fetch origin && git merge --ff-only origin/master
set -a; source app/.env.local; set +a
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate   # applies 0209
cd .. && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes   # from repo root
```

- [ ] **Step 4: Backfill + smoke**

```bash
# backfill (from app/, env sourced as in the script header)
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsx scripts/backfill-release-dates.ts

# smoke 1 — price scan + daily job via maintenance cron:
curl -H "Authorization: Bearer $(cat .cron-secret)" https://film-goblin.vercel.app/api/cron/maintenance
# expect jobs.priceFeedScan and jobs.dailyFeedEvents in the response, ok:true

# smoke 2 — rows landed:
# SELECT event_type, copy, created_at FROM feed_events ORDER BY created_at DESC LIMIT 10;

# smoke 3 — eyeball: landing page (signed out) and /home (signed in) show
# system rows interleaved; no two consecutive same-type system rows.
```

- [ ] **Step 5: CLAUDE.md wrapup**

On a fresh `docs/living-pit-wrapup` branch after merge: update "Current state" (what shipped), add Open threads — "feed_events generation is new: watch `jobs.priceFeedScan`/`jobs.dailyFeedEvents` in maintenance output for a week", and note deferred v2 items (now_free/left_free need provider snapshot/diff; death_day needs person dates; badge/ritual events need rituals). PR per convention.

---

## Self-review notes

- **Spec coverage:** table+RLS (T1), copy frozen at creation + variants + priorities (T2), price triggers exactly as spec'd (T3+T5), composer rules 1–5 (T4, freshness rule = min-1-system floor + anniversary generation guarantee in T6), generators incl. dedup + ATL supersession (T5–T6), cron wiring (T7), new_film/goblin_pick from existing flows (T8), both render surfaces + anon (T9), backfill + rollout order (T10). Out-of-scope list untouched. ✓
- **Type consistency:** `FeedEventSpec`/`emitFeedEvent`/`emitFeedEventSvc` (T5) consumed in T6–T8; `SystemFeedEvent` (T4) consumed in T9; `composeFeed` generic signature identical in T4 tests and T9 call sites; `CopyVars.milestone_kind` used in T2 templates and T6 emissions. ✓
- **Known judgment calls:** (1) price events derive from `price_history` post-sweep rather than inside the worker — keeps copy/emission in one package at the cost of a second pass over ~few changed rows/day; (2) system events appear only in the initial `/home` window and the "all" tab — pagination stays user-only for v1; (3) `emit.ts`/`price-scan.ts`/`daily.ts` SQL is smoke-verified in the runbook, not unit-tested (repo precedent: `rate-reminders.ts`) — their decision logic is fully unit-tested in the pure modules.
