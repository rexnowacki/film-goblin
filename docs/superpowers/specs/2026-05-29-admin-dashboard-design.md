# Admin Dashboard — stats + manual job runners

**Date:** 2026-05-29
**Status:** Approved (design)

## Problem

The admin Site Settings page (added 2026-05-28, `/admin/site-settings`) holds a single invite-gate toggle. Admins have no at-a-glance view of site scale, and no way to run the background jobs on demand — they currently run only via the daily `maintenance` cron (or manual `curl` with the `CRON_SECRET`). There's also no record of *when* a job last ran or *what it did*: the price worker's digest is logged to the console (Vercel Hobby retention ~1h) and returned in the HTTP response, but never persisted.

## Goals

1. Show site stats on the page: users, films (total + price-tracked), watchlist + watched activity, pending film requests.
2. A **Run now** button for four jobs: price checker (`refresh-prices`), iTunes availability, theater alerts, rate reminders.
3. For each job, show **last run time, status, and key stats** — for the price checker specifically: films indexed, price drops found, alerts fired.
4. Persist run history so the above survives log expiry and reflects scheduled (maintenance) runs too.

## Non-goals

- No charts/time-series UI — latest run + counts only.
- No new scheduling; the `maintenance` cron schedule is unchanged.
- Other crons (`send-notifications`, `maintenance` itself, `streaming-availability`) get persistence via the shared wrapper but **no dedicated Run-now button** this round.

## Existing context

- **Admin** is tile-based (`/admin` → one route per tool), guarded by `checkAdminAccess` / `requireAdminUser` (`app/lib/auth/require-admin.ts`).
- **`maintenance` cron** (the only scheduled cron, daily 10:00 UTC, `app/app/api/cron/maintenance/route.ts`) is the real driver. It runs each job through a local `runJob(name, fn)` wrapper that logs the result and catches errors into a `JobResult`. Jobs: `refresh-prices` (daily), `rate-reminders` (daily), `theater-alerts` (Mon/Thu), `check-itunes-availability` (Mon), `streaming-availability` (daily).
- **Job functions already exist and are clean**:
  - prices: `runOnce(client, opts)` → `Digest` (worker package; needs a `pg.Client` + `DATABASE_URL`)
  - iTunes: `runItunesAvailabilityCheck(supabase)` → summary (service-role client)
  - theater: `runTheaterAlerts(supabase)` → summary (service-role; uses `acquireCronLock`)
  - rate reminders: `runRateReminders(pgClient)` → `{ inserted }`
- **`acquire_cron_lock` RPC** + `acquireCronLock(client, key, ttlMs)` helper (`app/lib/theaters/lock.ts`) already exist for cron coordination.
- **Worker digest** (`worker/src/digest.ts`) snapshot: `films_refreshed, price_changes, alerts_fired, parse_failures, unavailable_marked, stopped_reason`. No drop counter yet. `diff.ts.computeDiff` already returns `decreased`, and `worker.ts:80` has an `if (diff.decreased)` block.
- **Counts**: `profiles` (users), `films` (+ `tracking` boolean), `watchlist`, `watched`, `film_requests` (`status IN ('pending','fulfilled')`).
- Latest migration: `0192_site_settings.sql`. Next: `0193`.

## Decisions

- **Run-button transport — Approach A:** a dedicated admin route handler `POST /api/admin/jobs/[job]/run` with `export const maxDuration = 300`, guarded by **admin session** (not `CRON_SECRET`), dispatching by job name to the existing job functions. Chosen over a server action (can't set `maxDuration` cleanly; the ~4-min price job would risk being cut off) and over server-side fetch to the cron route (extra hop, doesn't solve persistence).
- **Run UX:** synchronous — the button awaits the result and displays the digest. Because the run is persisted, closing the tab doesn't lose the result; it appears on next page load.
- **Page:** extend `/admin/site-settings`, retitled **"Admin Dashboard"** (tile blurb updated accordingly).
- **Price drops** = actual price decreases (new < old), counted via a new `price_drops` digest field.
- **Canonical job keys** — one string per job used everywhere (the `cron_runs.job` value, the lock key, the dispatch map, and the manual route's `[job]` segment): `refresh-prices`, `check-itunes-availability`, `theater-alerts`, `send-rate-reminders` (plus `streaming-availability`, recorded but not buttoned). When `maintenance/route.ts` is refactored onto `recordCronRun`, its job labels are normalized to these keys (it currently passes `"rate-reminders"` — that becomes `"send-rate-reminders"`) so scheduled and manual runs of the same job share one history. Defined once in `app/lib/cron/jobs.ts` and imported by both the maintenance route and the manual route.

## Design

### 1. `cron_runs` table — migration `0193_cron_runs.sql`

```sql
CREATE TABLE cron_runs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job          TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','success','error','skipped')),
  stats        JSONB,
  error_text   TEXT,
  triggered_by TEXT        NOT NULL DEFAULT 'cron'   -- 'cron' | 'manual'
);
CREATE INDEX cron_runs_job_started_idx ON cron_runs (job, started_at DESC);
```

RLS: enable, no public policies — accessed only via service-role (admin reads, server writes). `stats` holds the job's result object verbatim (price digest, or `{ inserted }`, etc.). `triggered_by` distinguishes manual clicks from the scheduled run.

Retention: a `DELETE FROM cron_runs WHERE started_at < now() - interval '90 days'` line added to the existing maintenance cleanup block (alongside the notifications cleanup). Keeps the table from growing unbounded.

### 2. `recordCronRun` helper — `app/lib/cron/record-run.ts`

```ts
export async function recordCronRun<T>(
  sr: ServiceRoleClient,           // for writing the cron_runs row
  job: string,
  triggeredBy: "cron" | "manual",
  fn: () => Promise<T>,
): Promise<{ ok: true; status: "success" | "skipped"; stats: T }
          | { ok: false; error: string }>
```

Inserts a `running` row (captures `id`), runs `fn`, then updates the row to `success`/`error` with `finished_at`, `stats` (the returned value), or `error_text`. A returned value of shape `{ skipped: true, reason }` is persisted as `status='skipped'`. Errors are caught, persisted, re-reported to Sentry, and returned as `{ ok: false }` (never thrown — mirrors maintenance's existing `runJob` contract). Private/public split per repo convention; the row-writing client is injected so it can be tested with a fake.

`maintenance/route.ts` is refactored to call `recordCronRun(sr, name, "cron", fn)` in place of its local `runJob`, so **scheduled runs populate the history**. The standalone single-job cron routes (`refresh-prices`, etc.) are left as-is (redundant manual-curl entry points; not the primary path) but may be wrapped opportunistically — not required for this feature.

### 3. Concurrency guard

The manual route wraps each job in `acquireCronLock(sr, job)` before running. If the lock is held (e.g. the daily maintenance run is in flight, or a double-click), it records/returns `{ skipped: true, reason: "already running" }` and the UI shows "already running". Lock TTL (10 min default) auto-releases.

### 4. Manual trigger route — `app/app/api/admin/jobs/[job]/run/route.ts`

```ts
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  // 1. admin guard via session (checkAdminAccess / requireAdminUser)
  // 2. validate `job` ∈ { refresh-prices, check-itunes-availability,
  //    theater-alerts, send-rate-reminders }  → else 400
  // 3. dispatch: build the right client (pg.Client for prices/rate-reminders,
  //    service-role for itunes/theater), wrap in acquireCronLock + recordCronRun(…,"manual")
  // 4. return the recordCronRun result as JSON
}
```

A small dispatch map keeps each job's client setup + fn together. `DATABASE_URL`-backed jobs open and `finally`-close a `pg.Client` exactly as the existing routes do.

### 5. Worker change — `price_drops`

- `digest.ts`: add `price_drops: number` to `DigestSnapshot` (default 0), a `priceDropped()` method, and include it in `render()`.
- `worker.ts`: call `digest.priceDropped()` inside the existing `if (diff.decreased)` block.
- Update worker tests that assert the digest snapshot shape.

### 6. Stats query — `app/lib/queries/admin-stats.ts`

`getAdminStats()` (service-role) returns cheap `head:true` COUNTs:
`users` (profiles), `filmsTotal`, `filmsTracking` (`films` where `tracking=true`), `watchlistEntries`, `watchedLogs`, `pendingRequests` (`film_requests` where `status='pending'`). Runs the counts in parallel.

### 7. Run-history read — `app/lib/queries/cron-runs.ts`

`getLatestCronRuns(jobs: string[])` returns the most recent `cron_runs` row per job (latest `started_at`), shaped for the UI: `{ job, status, finishedAt, stats, errorText }`.

### 8. UI — `/admin/site-settings` (retitled "Admin Dashboard")

Server component fetches `getAdminStats()` + `getLatestCronRuns([...])` and renders three sections:

- **At a glance** — stat cards (users, films total, films tracking, watchlist, watched, pending requests).
- **Background jobs** — one row per job: name, last-run timestamp + status pill (green success / red error / grey skipped / "never run"), per-job key stats (price checker: films indexed · price drops · alerts fired; others: their summary), and a **Run now** button. Client component: button enters a spinner/pending state, `fetch('/api/admin/jobs/<job>/run', {method:'POST'})`, then refreshes the row from the JSON response (and `router.refresh()` to re-pull server stats). Jobs that notify users — rate reminders, and price refresh (fires drop alerts) — show a `window.confirm` before firing.
- **Invite gating** — the existing toggle, unchanged.

Styling reuses the existing card idiom from `SiteSettingsClient` (bordered `var(--void-2)` panels, `.head`, serif blurbs). The admin tile (`/admin/page.tsx`) blurb for this entry is updated to "Site stats, background jobs, and site-wide controls."

## Error handling

- Job throw → caught in `recordCronRun`, persisted `status='error'` + `error_text`, Sentry capture, returned `{ ok:false }`. Row in UI shows red with the message.
- Missing `DATABASE_URL` (prices/rate-reminders) → route returns 500 with a clear message; no `cron_runs` row written for a config error.
- Non-admin → route 401/redirect via the standard guard. Unknown job name → 400.
- Lock held → `skipped`, UI shows "already running", no error.

## Testing

- `recordCronRun`: success persists stats + `finished_at`; thrown error persists `error` + message; `{skipped}` persists `skipped` (injected fake client).
- `getAdminStats`: returns the six counts (injected client with stubbed count responses).
- `getLatestCronRuns`: returns latest row per job.
- Manual route: rejects non-admin; rejects unknown job (400); dispatches the right fn for a valid job (mock the job fns + recordCronRun).
- Worker: `price_drops` increments only on decrease; snapshot/`render()` include it.

Follows the repo's `_private`/public + injected-client pattern; integration tests guard on `NEXT_PUBLIC_SUPABASE_URL` per `app/lib/actions/CLAUDE.md`.

## Migration & rollout

- `0193_cron_runs.sql` applied to prod via the documented pooler procedure.
- No env changes. No type-regen blocker — `cron_runs` / `site_settings` accessed via `as any` casts where not yet in `types.ts`, consistent with current `site_settings` usage (regen can follow in a separate PR).
- Deploy from repo root.
