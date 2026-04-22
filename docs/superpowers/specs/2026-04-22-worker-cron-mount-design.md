# Worker HTTP Cron Mount — Design Spec

**Sub-project:** 4 of 6 (production rebuild).
**Status:** design.
**Predecessors:** sub-project 1 (Apple data source worker), sub-project 3 (Next.js app).
**Successors:** sub-project 5 (notifications) consumes `price_alerts` rows written by scheduled runs.

## Goal

Run the existing price-tracking pipeline (`worker/src/worker.ts runOnce()`)
on a schedule in production without changing the pipeline's logic. Ends
when a daily Vercel Cron invocation against staging refreshes a bounded
number of films, writes `price_history` rows, fires `price_alerts` for
any matching watchlists, and returns a JSON digest.

## Architecture

### npm workspace

Convert the repo to an npm workspace. Root `package.json` declares:

```json
{ "workspaces": ["app", "worker", "db"] }
```

`worker/package.json` gains proper export metadata:

```json
{
  "name": "film-goblin-worker",
  "type": "module",
  "exports": { ".": "./src/worker.ts" }
}
```

`app/package.json` adds:

```json
{
  "dependencies": { "film-goblin-worker": "*" }
}
```

`app/next.config.mjs` adds `transpilePackages: ["film-goblin-worker"]` so
Next.js/Vercel bundle the worker's TypeScript directly. No separate
`tsc` build step for the worker — edits in `worker/src/` land immediately
in `next dev` and in the next `vercel --prod`.

The `db` package goes into the workspace for consistency but exports
nothing to the others (its current consumers are its own test suite).

### Route

One new file: `app/app/api/cron/refresh-prices/route.ts`. A Next.js
Route Handler exporting `async function GET(request: Request)`. The
handler:

1. Checks `Authorization: Bearer ${process.env.CRON_SECRET}` — anything
   else → `401`.
2. Asserts `process.env.DATABASE_URL` is set — otherwise `500` with a
   clear error.
3. Opens a `pg.Client` against `DATABASE_URL`, connects.
4. Calls `runOnce(client, { maxFilms: Number(process.env.MAX_FILMS_PER_RUN) || 100 })`
   inside `try { ... } finally { await client.end(); }`.
5. Logs `digest.render()` (one-line summary) via `console.log`, returns
   `200` with body `{ ok: true, digest: digest.toJSON() }`.
6. On error in steps 3–4 → `500 { error: msg }`, `Sentry.captureException`
   if `SENTRY_DSN` is configured.

The worker package stays pure: no HTTP, no Next.js imports. `runOnce`
doesn't know a route handler is calling it.

### Digest shape

The existing `Digest` class exposes `render(): string`. This sub-project
adds `toJSON(): object` returning the raw counters (`filmsRefreshed`,
`priceChanges`, `alertsFired`, `markedUnavailable`, `parseFailures`) so
the HTTP response body carries structured data, not a parsed log line.

## Schedule and configuration

`app/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/refresh-prices", "schedule": "0 9 * * *" }
  ]
}
```

Runs daily at 09:00 UTC (~01:00 PT). This is the minimum cadence
supported on Vercel's Hobby tier (once per 24h) and the maximum we need
— Apple doesn't change movie prices more than a few times a day.

### Environment variables

Production (Vercel project env):

- `CRON_SECRET` — required. A 32+ char random string. Vercel's cron
  scheduler injects it as `Authorization: Bearer <value>` on the
  scheduled request. Same value must be available to the function.
- `DATABASE_URL` — required. Hosted-staging Supabase Session Pooler URI
  with URL-encoded password.
- `MAX_FILMS_PER_RUN` — optional, defaults to `100`. Caps `runOnce`'s
  work per invocation so total wall-clock stays inside Vercel's
  function-duration limits across tiers.
- `SENTRY_DSN` — optional. No-op when unset.

Local development:

- Schedule doesn't apply locally; the endpoint is stateless. Hit it with
  `curl -H 'Authorization: Bearer <secret>' http://localhost:3000/api/cron/refresh-prices`
  on whatever cadence you want.
- `.env.local.example` grows a commented `CRON_SECRET=dev-secret` line so
  copy/paste onboarding still works.

## Timeout strategy

`runOnce` already supports `maxFilms`. With `MAX_FILMS_PER_RUN=100`:

- Wall clock per invocation: ~100–120 seconds (iTunes lookups + DB
  writes, dominated by network latency).
- Comfortably inside Vercel Pro's 15-minute cap and Hobby's 10-second cap
  breaks — this sub-project targets **Pro**. If the user downgrades to
  Hobby, the cap drops to ~10 films/run and the refresh cycle grows
  proportionally. That's a tier-tradeoff note, not a code change.

`selectFilmsToRefresh` already orders stalest-first, so a partial daily
run still converges: every film gets refreshed eventually over
`catalog_size / MAX_FILMS_PER_RUN` days.

## Failure semantics

Any in-pipeline error terminates the request with 500. Vercel Cron
marks the run failed and does not auto-retry. That's acceptable:

- The next day's run picks up the same stalest-first queue.
- Sentry captures the error for human follow-up.
- No partial-state corruption — each film refresh is self-contained
  (one iTunes fetch + up to 3 DB writes, each atomic).

We explicitly reject exponential backoff / retry logic inside the
handler. Vercel's 15-minute function cap doesn't leave room for it, and
stalest-first scheduling handles the recovery loop organically.

## Testing strategy

### 1. Unit test of the route handler

`app/tests/routes/cron-refresh-prices.test.ts` imports the handler
directly and exercises its gates with a fake `Request`:

- No `Authorization` header → 401.
- `Authorization: Bearer wrong` → 401.
- `Authorization: Bearer <match>` but no `DATABASE_URL` → 500 with the
  env-missing message.
- Correct bearer + env set → handler calls through to `pg.Client` (we
  mock `pg.Client` via Vitest module-mocking to avoid a real DB).

No local Supabase needed for this test — it stops at the pg boundary.

### 2. No new tests for the pipeline

`runOnce` is already covered by `worker/tests/worker.test.ts` (integration
against pg-mem + MSW). The route handler is a thin wrapper; duplicating
pipeline coverage at the app layer adds noise without catching bugs.

### 3. Manual smoke test

After `vercel --prod`:

```
curl -H 'Authorization: Bearer <secret>' \
  https://film-goblin.vercel.app/api/cron/refresh-prices
```

Expect a 200 with a JSON body and non-zero `filmsRefreshed`. Confirm a
handful of fresh `price_history` rows in the Supabase dashboard.

## Out of scope

- **Notifications.** `runOnce` writes `price_alerts` when a watchlisted
  film drops; sub-project 5 delivers them.
- **Admin manual-trigger UI.** A "Refresh prices now" button in a
  staff-only admin panel. Backlog.
- **Per-film on-demand refresh.** `/api/cron/refresh-film/:id` variant
  for when a user adds a brand-new `itunes_id`. YAGNI.
- **Observability dashboard.** Run-history UI. Backlog.
- **Historic price-history backfill.** One-off bulk populate so film
  detail charts have data on day one. Separate one-shot invocation, not
  cron.
- **Multi-region cron.** YAGNI.

## Dependencies and predecessors

- Sub-project 1 delivered `runOnce` and its db/itunes/diff modules.
- Sub-project 3 delivered the Next.js app shell this route lives in and
  the hosted-staging Supabase project this cron writes against.
- No new npm packages. Reuses `pg`, `@sentry/node`, and the worker's
  existing imports.
