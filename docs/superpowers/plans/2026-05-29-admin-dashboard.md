# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add site stats and manual "Run now" buttons (with persisted run history) for four background jobs to the admin Site Settings page, retitled "Admin Dashboard".

**Architecture:** A new `cron_runs` table persists every job run. A shared `recordCronRun` wrapper writes those rows; the daily `maintenance` cron is refactored onto it (so scheduled runs record history), and a new admin-session-guarded route `POST /api/admin/jobs/[job]/run` (maxDuration 300, lock-guarded) uses it for manual runs. The dashboard server component reads cheap COUNT stats plus the latest run per job.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + service-role client), vitest, the `film-goblin-worker` package.

---

## Conventions for this plan

- **Node 20.** Prefix one-shot commands: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- **App tests** run from `app/`: `npm run test` (vitest). Worker tests run from `worker/`: `npm test`.
- **Typecheck** from `app/`: `npm run typecheck`.
- `cron_runs` is not in `app/lib/supabase/types.ts`; access it via `(client as any)` casts, exactly as the existing `site_settings` code does (`app/lib/actions/admin/site-settings.ts`). Type regen is a separate follow-up PR.
- Commit messages end with the repo's `Co-Authored-By` trailer (omitted from steps below for brevity — add it).

---

## File Structure

**Create:**
- `db/migrations/0193_cron_runs.sql` — run-history table.
- `app/lib/cron/jobs.ts` — canonical job keys, labels, notify flags, dispatch (`runJobByKey`).
- `app/lib/cron/record-run.ts` — `recordCronRun` wrapper.
- `app/lib/queries/admin-stats.ts` — `getAdminStats`.
- `app/lib/queries/cron-runs.ts` — `getLatestCronRuns`.
- `app/app/api/admin/jobs/[job]/run/route.ts` — manual trigger route.
- `app/app/admin/site-settings/JobsSection.tsx` — client component: job rows + Run-now buttons.
- `app/tests/cron/record-run.test.ts`, `app/tests/queries/admin-stats.test.ts`, `app/tests/queries/cron-runs.test.ts`, `app/tests/routes/admin-jobs-run.test.ts`.

**Modify:**
- `worker/src/digest.ts`, `worker/src/worker.ts`, `worker/tests/digest.test.ts` — `price_drops` counter.
- `app/app/api/cron/maintenance/route.ts` — route through `recordCronRun`.
- `app/app/admin/site-settings/page.tsx` — retitle + render stats + jobs.
- `app/app/admin/page.tsx` — tile blurb.

---

## Task 1: `cron_runs` migration

**Files:**
- Create: `db/migrations/0193_cron_runs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0193_cron_runs.sql
-- Persisted history of background-job runs (cron + manual admin triggers).

CREATE TABLE IF NOT EXISTS cron_runs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job          TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'error', 'skipped')),
  stats        JSONB,
  error_text   TEXT,
  triggered_by TEXT        NOT NULL DEFAULT 'cron'
                 CHECK (triggered_by IN ('cron', 'manual'))
);

CREATE INDEX IF NOT EXISTS cron_runs_job_started_idx
  ON cron_runs (job, started_at DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
-- No policies: cron_runs is accessed only via the service-role client
-- (which bypasses RLS). RLS-on + zero policies = deny-all for anon/authed.
```

- [ ] **Step 2: Apply to the local/dev database to confirm it parses**

Run (from repo root, with prod pooler env loaded per root CLAUDE.md, OR against a local DB):
`set -a; source app/.env.local; set +a; cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate`
Expected: migration `0193_cron_runs` applies without error. (If running against prod, this is also the prod-apply step — see Task 11.)

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0193_cron_runs.sql
git commit -m "feat(db): cron_runs table for background-job run history"
```

---

## Task 2: Worker `price_drops` counter

**Files:**
- Modify: `worker/src/digest.ts`
- Modify: `worker/src/worker.ts:80`
- Test: `worker/tests/digest.test.ts`

- [ ] **Step 1: Add failing assertions to the digest test**

In `worker/tests/digest.test.ts`, inside the `"increments counters"` test, after `d.markedUnavailable();` add `d.priceDropped();` and these assertions before the closing brace:

```ts
    d.priceDropped();
    d.priceDropped();
    // ... existing assertions ...
    expect(s.price_drops).toBe(2);
```

And in the `"render() returns human-readable summary"` test add after `d.alertFired();`:

```ts
    d.priceDropped();
    expect(out).toContain("price_drops=1");
```

(`out` is computed after the increments — move the `priceDropped()` call above `const out = d.render();`.)

- [ ] **Step 2: Run worker tests to verify failure**

Run: `cd worker && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- digest`
Expected: FAIL — `priceDropped is not a function` / `price_drops` undefined.

- [ ] **Step 3: Add the counter to the digest**

In `worker/src/digest.ts`:
- Add `price_drops: number;` to `DigestSnapshot` (after `price_changes`).
- Add `price_drops: 0,` to the initializer in the class.
- Add the method: `priceDropped() { this.s.price_drops++; }` (next to `priceChanged`).
- In `render()`, add `` `price_drops=${s.price_drops}`, `` to the `parts` array (after the `price_changes` line).

- [ ] **Step 4: Increment it in the worker on actual decreases**

In `worker/src/worker.ts`, inside the `if (diff.decreased) {` block at line 80, add `digest.priceDropped();` as the first statement (before `const now = new Date();`):

```ts
      if (diff.decreased) {
        digest.priceDropped();
        const now = new Date();
        const oldPrice = latest!.price_usd;
```

- [ ] **Step 5: Run worker tests to verify they pass**

Run: `cd worker && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: PASS (digest + worker suites green).

- [ ] **Step 6: Commit**

```bash
git add worker/src/digest.ts worker/src/worker.ts worker/tests/digest.test.ts
git commit -m "feat(worker): count actual price drops in digest"
```

---

## Task 3: Canonical job keys + dispatch (`app/lib/cron/jobs.ts`)

**Files:**
- Create: `app/lib/cron/jobs.ts`

- [ ] **Step 1: Write the module**

```ts
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { runOnce } from "film-goblin-worker";
import { runRateReminders } from "@/lib/cron/rate-reminders";
import { runItunesAvailabilityCheck } from "@/lib/itunes-availability/check";
import { runTheaterAlerts } from "@/lib/theaters/scrape-theaters";
import { serviceRoleClient } from "@/lib/supabase/service-role";

// Canonical job keys. Used as cron_runs.job, the lock key, the manual route's
// [job] segment, and maintenance's recordCronRun labels. ONE string per job.
export const TRIGGERABLE_JOBS = [
  "refresh-prices",
  "check-itunes-availability",
  "theater-alerts",
  "send-rate-reminders",
] as const;

export type JobKey = (typeof TRIGGERABLE_JOBS)[number];

export function isJobKey(v: string): v is JobKey {
  return (TRIGGERABLE_JOBS as readonly string[]).includes(v);
}

// UI metadata. `notifies` => the job can generate user-facing notifications,
// so the dashboard shows a confirm() before a manual run.
export const JOB_META: Record<JobKey, { label: string; notifies: boolean }> = {
  "refresh-prices": { label: "Price checker", notifies: true },
  "check-itunes-availability": { label: "iTunes availability", notifies: false },
  "theater-alerts": { label: "Theater alerts", notifies: false },
  "send-rate-reminders": { label: "Rate reminders", notifies: true },
};

// Runs one job by key, setting up the right client. Returns the job's stats
// object (persisted verbatim into cron_runs.stats). DATABASE_URL-backed jobs
// open and close their own pg.Client. Throws on misconfig/job error — the
// caller (recordCronRun) catches and records.
export async function runJobByKey(key: JobKey): Promise<unknown> {
  switch (key) {
    case "refresh-prices": {
      const client = pgClient();
      try {
        await client.connect();
        const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 10000;
        const maxRuntimeMs = Number(process.env.PRICE_REFRESH_MAX_RUNTIME_MS) || 240_000;
        const staleHours = Number(process.env.PRICE_REFRESH_STALE_HOURS) || 20;
        const digest = await runOnce(client, { maxFilms, maxRuntimeMs, staleHours });
        return digest.snapshot();
      } finally {
        await client.end().catch(() => {});
      }
    }
    case "send-rate-reminders": {
      const client = pgClient();
      try {
        await client.connect();
        return await runRateReminders(client);
      } finally {
        await client.end().catch(() => {});
      }
    }
    case "check-itunes-availability":
      return runItunesAvailabilityCheck(sr());
    case "theater-alerts":
      return runTheaterAlerts(sr());
  }
}

function pgClient(): pg.Client {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  return new pg.Client({ connectionString: databaseUrl });
}

function sr(): SupabaseClient<Database> {
  return serviceRoleClient();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/cron/jobs.ts
git commit -m "feat(cron): canonical job keys + runJobByKey dispatch"
```

---

## Task 4: `recordCronRun` wrapper

**Files:**
- Create: `app/lib/cron/record-run.ts`
- Test: `app/tests/cron/record-run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { recordCronRun } from "@/lib/cron/record-run";

// Minimal fake of the service-role client's cron_runs writes.
function fakeSr() {
  const calls = { inserted: null as any, updated: null as any, updatedId: null as any };
  const sr = {
    from(_table: string) {
      return {
        insert(row: any) {
          calls.inserted = row;
          return { select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }) };
        },
        update(patch: any) {
          calls.updated = patch;
          return { eq: async (_c: string, id: any) => { calls.updatedId = id; return { error: null }; } };
        },
      };
    },
  };
  return { sr, calls };
}

describe("recordCronRun", () => {
  it("persists success with stats", async () => {
    const { sr, calls } = fakeSr();
    const res = await recordCronRun(sr as any, "refresh-prices", "manual", async () => ({ films_refreshed: 3 }));
    expect(res).toEqual({ ok: true, status: "success", stats: { films_refreshed: 3 } });
    expect(calls.inserted).toMatchObject({ job: "refresh-prices", status: "running", triggered_by: "manual" });
    expect(calls.updated).toMatchObject({ status: "success", stats: { films_refreshed: 3 } });
    expect(calls.updated.finished_at).toBeTruthy();
    expect(calls.updatedId).toBe(42);
  });

  it("persists skipped when fn returns {skipped:true}", async () => {
    const { sr, calls } = fakeSr();
    const res = await recordCronRun(sr as any, "theater-alerts", "manual", async () => ({ skipped: true, reason: "locked" }));
    expect(res).toEqual({ ok: true, status: "skipped", stats: { skipped: true, reason: "locked" } });
    expect(calls.updated).toMatchObject({ status: "skipped" });
  });

  it("persists error and returns ok:false when fn throws", async () => {
    const { sr, calls } = fakeSr();
    const res = await recordCronRun(sr as any, "refresh-prices", "cron", async () => { throw new Error("boom"); });
    expect(res).toEqual({ ok: false, error: "boom" });
    expect(calls.updated).toMatchObject({ status: "error", error_text: "boom" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- record-run`
Expected: FAIL — cannot find module `@/lib/cron/record-run`.

- [ ] **Step 3: Implement the wrapper**

```ts
import * as Sentry from "@sentry/node";
import type { serviceRoleClient } from "@/lib/supabase/service-role";

type Sr = ReturnType<typeof serviceRoleClient>;

export type RecordResult =
  | { ok: true; status: "success" | "skipped"; stats: unknown }
  | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function isSkipped(v: unknown): boolean {
  return typeof v === "object" && v !== null && (v as { skipped?: unknown }).skipped === true;
}

// Wraps a job: inserts a 'running' cron_runs row, runs fn, then updates the row
// to success/skipped/error. Never throws (mirrors maintenance's runJob).
export async function recordCronRun(
  sr: Sr,
  job: string,
  triggeredBy: "cron" | "manual",
  fn: () => Promise<unknown>,
): Promise<RecordResult> {
  let id: number | null = null;
  try {
    const { data } = await (sr as any)
      .from("cron_runs")
      .insert({ job, status: "running", triggered_by: triggeredBy })
      .select("id")
      .single();
    id = data?.id ?? null;
  } catch {
    // If we can't even open a row, still run the job; just won't be recorded.
  }

  try {
    const stats = await fn();
    const status = isSkipped(stats) ? "skipped" : "success";
    if (id != null) {
      await (sr as any).from("cron_runs")
        .update({ status, stats, finished_at: new Date().toISOString() })
        .eq("id", id);
    }
    return { ok: true, status, stats };
  } catch (err) {
    const error = errorMessage(err);
    Sentry.captureException(err);
    if (id != null) {
      await (sr as any).from("cron_runs")
        .update({ status: "error", error_text: error, finished_at: new Date().toISOString() })
        .eq("id", id)
        .catch?.(() => {});
    }
    return { ok: false, error };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- record-run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/cron/record-run.ts app/tests/cron/record-run.test.ts
git commit -m "feat(cron): recordCronRun wrapper persisting run history"
```

---

## Task 5: Route the maintenance cron through `recordCronRun`

**Files:**
- Modify: `app/app/api/cron/maintenance/route.ts`

This makes scheduled runs populate `cron_runs`, and normalizes the rate-reminders label to the canonical `send-rate-reminders`.

- [ ] **Step 1: Wire recordCronRun into the local runJob wrapper**

In `maintenance/route.ts`:
- Add imports: `import { serviceRoleClient } from "@/lib/supabase/service-role";` (already imported — confirm) and `import { recordCronRun } from "@/lib/cron/record-run";`.
- Inside `GET`, after `await client.connect();`, create one service-role client for recording: `const sr = serviceRoleClient();`
- Replace the body of `runJob` so it records. Change its signature to accept the recording client and triggered-by. Simplest: define a closure inside `GET`:

```ts
    const recordedJob = async (name: string, fn: () => Promise<unknown>): Promise<JobResult> => {
      const r = await recordCronRun(sr, name, "cron", fn);
      if (!r.ok) return { ok: false, error: "job failed" };
      if (r.status === "skipped") {
        const reason = (r.stats as { reason?: string })?.reason ?? "skipped";
        return { ok: true, skipped: true, reason };
      }
      return { ok: true, result: r.stats };
    };
```

- Replace each `await runJob("<name>", ...)` call with `await recordedJob("<name>", ...)`, and **rename the rate-reminders label** from `"rate-reminders"` to `"send-rate-reminders"`:

```ts
    jobs.refreshPrices = await recordedJob("refresh-prices", async () => { /* unchanged body */ });
    jobs.rateReminders = await recordedJob("send-rate-reminders", () => runRateReminders(client));
    // theater-alerts (inside isTheaterDay): await recordedJob("theater-alerts", async () => {...})
    // itunes (inside isMonday): await recordedJob("check-itunes-availability", async () => {...})
    // streaming: await recordedJob("streaming-availability", () => {...})
```

- Delete the now-unused module-level `runJob` function (or leave it if other code uses it — it does not; remove it).
- Leave the not-scheduled-today branches (`jobs.theaterAlerts = { ok: true, skipped: true, reason: "not scheduled today" }`) untouched — those did not run, so they write no row.

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the existing maintenance/notifications route tests**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- cron`
Expected: PASS. (If a maintenance test asserts the old `rate-reminders` label or the `runJob` name, update it to `send-rate-reminders` / `recordedJob`.)

- [ ] **Step 4: Commit**

```bash
git add app/app/api/cron/maintenance/route.ts
git commit -m "feat(cron): record maintenance job runs to cron_runs"
```

---

## Task 6: `getAdminStats` query

**Files:**
- Create: `app/lib/queries/admin-stats.ts`
- Test: `app/tests/queries/admin-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { _getAdminStats } from "@/lib/queries/admin-stats";

// Fake client: each from().select(...) resolves to a fixed count, keyed by a
// queue so we can assert order-independence via the table name.
function fakeClient(counts: Record<string, number>) {
  return {
    from(table: string) {
      const builder: any = {
        _table: table,
        _eqApplied: false,
        select() { return builder; },
        eq() { builder._eqApplied = true; return builder; },
        then(resolve: (v: any) => void) {
          // tracking filter => films-tracking key; pending filter => requests key
          let key = table;
          if (table === "films" && builder._eqApplied) key = "films_tracking";
          if (table === "film_requests") key = "film_requests_pending";
          resolve({ count: counts[key] ?? 0, error: null });
        },
      };
      return builder;
    },
  };
}

describe("_getAdminStats", () => {
  it("returns the six counts", async () => {
    const client = fakeClient({
      profiles: 12,
      films: 100,
      films_tracking: 80,
      watchlists: 30,
      watched: 45,
      film_requests_pending: 7,
    });
    const stats = await _getAdminStats(client as any);
    expect(stats).toEqual({
      users: 12,
      filmsTotal: 100,
      filmsTracking: 80,
      watchlistEntries: 30,
      watchedLogs: 45,
      pendingRequests: 7,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- admin-stats`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface AdminStats {
  users: number;
  filmsTotal: number;
  filmsTracking: number;
  watchlistEntries: number;
  watchedLogs: number;
  pendingRequests: number;
}

type Client = SupabaseClient<Database>;

async function count(client: Client, build: (c: Client) => any): Promise<number> {
  const { count } = await build(client);
  return count ?? 0;
}

export async function _getAdminStats(client: Client): Promise<AdminStats> {
  const head = { count: "exact" as const, head: true };
  const [users, filmsTotal, filmsTracking, watchlistEntries, watchedLogs, pendingRequests] =
    await Promise.all([
      count(client, (c) => (c as any).from("profiles").select("*", head)),
      count(client, (c) => (c as any).from("films").select("*", head)),
      count(client, (c) => (c as any).from("films").select("*", head).eq("tracking", true)),
      count(client, (c) => (c as any).from("watchlists").select("*", head)),
      count(client, (c) => (c as any).from("watched").select("*", head)),
      count(client, (c) => (c as any).from("film_requests").select("*", head).eq("status", "pending")),
    ]);
  return { users, filmsTotal, filmsTracking, watchlistEntries, watchedLogs, pendingRequests };
}

export async function getAdminStats(): Promise<AdminStats> {
  return _getAdminStats(serviceRoleClient());
}
```

Note: the table names are `watchlists` (plural) and `watched`, confirmed against `app/lib/supabase/types.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- admin-stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/admin-stats.ts app/tests/queries/admin-stats.test.ts
git commit -m "feat(admin): getAdminStats count query"
```

---

## Task 7: `getLatestCronRuns` query

**Files:**
- Create: `app/lib/queries/cron-runs.ts`
- Test: `app/tests/queries/cron-runs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { _getLatestCronRuns } from "@/lib/queries/cron-runs";

function fakeClient(rows: any[]) {
  return {
    from() {
      const b: any = {
        select() { return b; },
        in() { return b; },
        order() { return b; },
        then(resolve: (v: any) => void) { resolve({ data: rows, error: null }); },
      };
      return b;
    },
  };
}

describe("_getLatestCronRuns", () => {
  it("returns the most recent row per job", async () => {
    const client = fakeClient([
      { job: "refresh-prices", status: "success", finished_at: "2026-05-29T10:00:00Z", stats: { price_drops: 2 }, error_text: null, started_at: "2026-05-29T09:58:00Z" },
      { job: "refresh-prices", status: "error", finished_at: "2026-05-28T10:00:00Z", stats: null, error_text: "boom", started_at: "2026-05-28T09:58:00Z" },
      { job: "theater-alerts", status: "skipped", finished_at: "2026-05-29T10:01:00Z", stats: { skipped: true }, error_text: null, started_at: "2026-05-29T10:00:00Z" },
    ]);
    const latest = await _getLatestCronRuns(client as any, ["refresh-prices", "theater-alerts"]);
    expect(latest["refresh-prices"]).toMatchObject({ status: "success", stats: { price_drops: 2 } });
    expect(latest["theater-alerts"]).toMatchObject({ status: "skipped" });
  });

  it("omits jobs with no rows", async () => {
    const client = fakeClient([]);
    const latest = await _getLatestCronRuns(client as any, ["refresh-prices"]);
    expect(latest["refresh-prices"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- cron-runs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface CronRunRow {
  job: string;
  status: "running" | "success" | "error" | "skipped";
  startedAt: string;
  finishedAt: string | null;
  stats: unknown;
  errorText: string | null;
}

type Client = SupabaseClient<Database>;

// Returns the most recent run per job. Fetches recent rows ordered newest-first
// and keeps the first (latest) seen per job.
export async function _getLatestCronRuns(
  client: Client,
  jobs: string[],
): Promise<Record<string, CronRunRow>> {
  const { data, error } = await (client as any)
    .from("cron_runs")
    .select("job, status, started_at, finished_at, stats, error_text")
    .in("job", jobs)
    .order("started_at", { ascending: false });
  if (error || !data) return {};
  const latest: Record<string, CronRunRow> = {};
  for (const r of data as any[]) {
    if (latest[r.job]) continue;
    latest[r.job] = {
      job: r.job,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? null,
      stats: r.stats ?? null,
      errorText: r.error_text ?? null,
    };
  }
  return latest;
}

export async function getLatestCronRuns(jobs: string[]): Promise<Record<string, CronRunRow>> {
  return _getLatestCronRuns(serviceRoleClient(), jobs);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- cron-runs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/cron-runs.ts app/tests/queries/cron-runs.test.ts
git commit -m "feat(admin): getLatestCronRuns query"
```

---

## Task 8: Manual trigger route

**Files:**
- Create: `app/app/api/admin/jobs/[job]/run/route.ts`
- Test: `app/tests/routes/admin-jobs-run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdminAccess = vi.fn();
const acquireCronLock = vi.fn();
const recordCronRun = vi.fn();
const runJobByKey = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient: () => ({}) }));
vi.mock("@/lib/auth/require-admin", () => ({ checkAdminAccess }));
vi.mock("@/lib/theaters/lock", () => ({ acquireCronLock }));
vi.mock("@/lib/cron/record-run", () => ({ recordCronRun }));
vi.mock("@/lib/cron/jobs", async (orig) => ({
  ...(await orig<typeof import("@/lib/cron/jobs")>()),
  runJobByKey,
}));

const { POST } = await import("../../app/api/admin/jobs/[job]/run/route");

function call(job: string) {
  return POST(new Request("http://localhost/api/admin/jobs/x/run", { method: "POST" }), {
    params: Promise.resolve({ job }),
  });
}

describe("POST /api/admin/jobs/[job]/run", () => {
  beforeEach(() => {
    checkAdminAccess.mockReset().mockResolvedValue("ok");
    acquireCronLock.mockReset().mockResolvedValue(true);
    recordCronRun.mockReset().mockResolvedValue({ ok: true, status: "success", stats: { films_refreshed: 5 } });
    runJobByKey.mockReset().mockResolvedValue({ films_refreshed: 5 });
  });

  it("rejects non-admins with 401", async () => {
    checkAdminAccess.mockResolvedValue("not-admin");
    const res = await call("refresh-prices");
    expect(res.status).toBe(401);
  });

  it("rejects unknown job with 400", async () => {
    const res = await call("not-a-job");
    expect(res.status).toBe(400);
    expect(recordCronRun).not.toHaveBeenCalled();
  });

  it("runs a valid job and returns its result", async () => {
    const res = await call("refresh-prices");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "success", stats: { films_refreshed: 5 } });
    expect(recordCronRun).toHaveBeenCalledWith(expect.anything(), "refresh-prices", "manual", expect.any(Function));
  });

  it("returns skipped when the lock is held", async () => {
    acquireCronLock.mockResolvedValue(false);
    const res = await call("refresh-prices");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "skipped" });
    expect(recordCronRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- admin-jobs-run`
Expected: FAIL — cannot find route module.

- [ ] **Step 3: Implement the route**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { acquireCronLock } from "@/lib/theaters/lock";
import { recordCronRun } from "@/lib/cron/record-run";
import { isJobKey, runJobByKey } from "@/lib/cron/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ job: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  if (!isJobKey(job)) {
    return NextResponse.json({ error: "unknown job" }, { status: 400 });
  }

  const sr = serviceRoleClient();

  // Guard against double-runs / collision with the daily maintenance run.
  const locked = await acquireCronLock(sr, job);
  if (!locked) {
    return NextResponse.json({ ok: true, status: "skipped", stats: { skipped: true, reason: "already running" } });
  }

  const result = await recordCronRun(sr, job, "manual", () => runJobByKey(job));
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- admin-jobs-run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/app/api/admin/jobs/[job]/run/route.ts" app/tests/routes/admin-jobs-run.test.ts
git commit -m "feat(admin): manual job-trigger route (admin-guarded, lock-protected)"
```

---

## Task 9: Dashboard UI

**Files:**
- Create: `app/app/admin/site-settings/JobsSection.tsx`
- Modify: `app/app/admin/site-settings/page.tsx`
- Modify: `app/app/admin/page.tsx`

- [ ] **Step 1: Write the JobsSection client component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TRIGGERABLE_JOBS, JOB_META, type JobKey } from "@/lib/cron/jobs";
import type { CronRunRow } from "@/lib/queries/cron-runs";

function StatusPill({ run }: { run?: CronRunRow }) {
  if (!run) return <span style={{ opacity: 0.5, fontSize: 12 }}>never run</span>;
  const color =
    run.status === "success" ? "var(--accent)" :
    run.status === "error" ? "var(--danger)" : "var(--bone)";
  return (
    <span style={{ fontSize: 12, color }}>
      {run.status}
      {run.finishedAt ? <> · {new Date(run.finishedAt).toLocaleString()}</> : null}
    </span>
  );
}

function priceLine(run?: CronRunRow): string | null {
  const s = run?.stats as { films_refreshed?: number; price_drops?: number; alerts_fired?: number } | null;
  if (!s) return null;
  return `${s.films_refreshed ?? 0} indexed · ${s.price_drops ?? 0} price drops · ${s.alerts_fired ?? 0} alerts`;
}

export default function JobsSection({ runs }: { runs: Record<string, CronRunRow> }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {TRIGGERABLE_JOBS.map((job) => (
        <JobRow key={job} job={job} run={runs[job]} />
      ))}
    </div>
  );
}

function JobRow({ job, run }: { job: JobKey; run?: CronRunRow }) {
  const router = useRouter();
  const meta = JOB_META[job];
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function runNow() {
    if (meta.notifies && !window.confirm(`Run "${meta.label}" now? This can send notifications to users.`)) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/jobs/${job}/run`, { method: "POST" });
        const body = await res.json();
        if (!res.ok || body.ok === false) {
          setMsg(`Failed: ${body.error ?? res.status}`);
        } else if (body.status === "skipped") {
          setMsg("Already running — try again shortly.");
        } else {
          setMsg("Done.");
          router.refresh();
        }
      } catch {
        setMsg("Request failed.");
      }
    });
  }

  const extra = job === "refresh-prices" ? priceLine(run) : null;

  return (
    <div style={{ padding: 16, border: "2px solid var(--bone)", background: "var(--void-2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
      <div>
        <div className="head" style={{ fontSize: 18 }}>{meta.label}</div>
        <div style={{ marginTop: 2 }}><StatusPill run={run} /></div>
        {extra ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>{extra}</div> : null}
        {run?.status === "error" && run.errorText ? (
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--danger)" }}>{run.errorText}</div>
        ) : null}
        {msg ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>{msg}</div> : null}
      </div>
      <button type="button" className="btn-outline-bone" disabled={pending} onClick={runNow} style={{ cursor: pending ? "wait" : "pointer", flexShrink: 0 }}>
        {pending ? "Running…" : "Run now"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update the page to render stats + jobs + the existing toggle**

Rewrite `app/app/admin/site-settings/page.tsx`:

```tsx
import { getInviteGateSetting } from "@/lib/actions/admin/site-settings";
import { getAdminStats } from "@/lib/queries/admin-stats";
import { getLatestCronRuns } from "@/lib/queries/cron-runs";
import { TRIGGERABLE_JOBS } from "@/lib/cron/jobs";
import SiteSettingsClient from "./SiteSettingsClient";
import JobsSection from "./JobsSection";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: 18, border: "2px solid var(--bone)", background: "var(--void-2)" }}>
      <div className="head" style={{ fontSize: 30 }}>{value.toLocaleString()}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [{ enabled, updatedAt }, stats, runs] = await Promise.all([
    getInviteGateSetting(),
    getAdminStats(),
    getLatestCronRuns([...TRIGGERABLE_JOBS]),
  ]);

  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Admin Dashboard</h1>

      <section style={{ marginBottom: 36 }}>
        <div className="head" style={{ fontSize: 22, marginBottom: 12 }}>At a glance</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Films" value={stats.filmsTotal} />
          <StatCard label="Tracking prices" value={stats.filmsTracking} />
          <StatCard label="Watchlist entries" value={stats.watchlistEntries} />
          <StatCard label="Watched logs" value={stats.watchedLogs} />
          <StatCard label="Pending requests" value={stats.pendingRequests} />
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div className="head" style={{ fontSize: 22, marginBottom: 12 }}>Background jobs</div>
        <JobsSection runs={runs} />
      </section>

      <section>
        <div className="head" style={{ fontSize: 22, marginBottom: 12 }}>Site settings</div>
        <SiteSettingsClient enabled={enabled} updatedAt={updatedAt} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Update the admin tile blurb**

In `app/app/admin/page.tsx`, change the Site Settings tile to:

```tsx
        <Tile href="/admin/site-settings" title="Dashboard" blurb="Site stats, background jobs, and site-wide controls like invite gating." />
```

- [ ] **Step 4: Typecheck + full test run**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && npm run test`
Expected: typecheck PASS; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/app/admin/site-settings/page.tsx app/app/admin/site-settings/JobsSection.tsx app/app/admin/page.tsx
git commit -m "feat(admin): dashboard stats + job runner UI"
```

---

## Task 10: Build verification

- [ ] **Step 1: Production build**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build`
Expected: build succeeds, no type errors, the new route `/api/admin/jobs/[job]/run` and `/admin/site-settings` appear in the route list.

- [ ] **Step 2: Commit (if build produced any lockfile/incidental changes — otherwise skip)**

---

## Task 11: Ship

- [ ] **Step 1: Apply migration 0193 to prod** (if not already done in Task 1 against prod)

From repo root: `set -a; source app/.env.local; set +a; cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate`
Expected: `0193_cron_runs` applied. Verify: the `cron_runs` table exists.

- [ ] **Step 2: Open PR, merge** (per repo workflow — feature branch `feat/admin-dashboard`, PR, merge)

- [ ] **Step 3: Deploy from repo root**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes`
Expected: `● Ready`.

- [ ] **Step 4: Manual smoke test**

Sign in as admin, open `https://freshfromthepit.com/admin/site-settings`:
- Stat cards show non-zero counts.
- Each job row shows last-run status (likely "never run" until the next maintenance run or a manual click; refresh-prices may already show data from the daily maintenance run once one completes).
- Click **Run now** on **iTunes availability** (non-notifying, safe). Button shows "Running…", then "Done.", and the row refreshes with a fresh timestamp + status.
- Confirm a `cron_runs` row was written (Supabase dashboard or `SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT 5;`).

---

## Self-Review notes (resolved)

- **Spec coverage:** stats (Task 6/9), four run buttons (Task 8/9), last-run + price-checker detail stats (Task 7/9), persistence incl. scheduled runs (Tasks 1/4/5), price-drop counter (Task 2), retitle + tile (Task 9). All covered.
- **Type consistency:** `JobKey`/`TRIGGERABLE_JOBS`/`JOB_META`/`runJobByKey`/`isJobKey` (Task 3) are reused verbatim in Tasks 8–9. `CronRunRow` (Task 7) reused in Task 9. `recordCronRun` signature `(sr, job, triggeredBy, fn)` consistent across Tasks 4, 5, 8.
- **Table names:** `profiles`, `films`, `watchlists`, `watched`, `film_requests`, `cron_runs` — all confirmed against `app/lib/supabase/types.ts` / migrations.
