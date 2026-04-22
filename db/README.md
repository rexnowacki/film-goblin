# Film Goblin — Database Package

Owns the sub-project-2 schema: full user/profile, social graph, watchlists
(real, replacing the worker's stub), lists, editorial reviews, recommendations,
and activity feed — plus RLS policies and triggers.

Implements the spec at `../docs/superpowers/specs/2026-04-21-schema-rls-design.md`.

## Setup

Requires Node 20 (pinned via repo-root `.nvmrc`) and Docker (for the RLS test
suite — testcontainers spins up a real Postgres 16).

```
cd db
npm install
cp .env.example .env          # fill in DATABASE_URL
npm run migrate               # apply migrations 0100+
```

## Migrations

Numbered from `0100` to leave space above the worker's `0001–0003`. The
worker and this package share one `_migrations` tracking table in Postgres.
In production, apply worker migrations first, then sub-project-2 migrations.

To apply in sequence against a real DB:

```
cd worker && npm run migrate
cd ../db && npm run migrate
```

The first sub-project-2 migration (`0100_drop_watchlists_stub.sql`) drops the
worker's stubbed `watchlists` and `price_alerts`. They're recreated in
`0105_watchlists.sql` with proper FK constraints to `auth.users`.

## Tests

Two layers:

- `npm test` — Layer 1, pg-mem smoke test. Fast (<1s). Verifies DDL parses and
  every expected table exists. Skips trigger migrations (pg-mem doesn't support
  `SECURITY DEFINER`).
- `npm run test:rls` — Layer 2, testcontainers + real Postgres. Exercises every
  RLS policy with user-scoped JWTs, plus every trigger. ~10s cold, ~3s warm.
  Required in CI.
- `npm run test:all` — both.

### How RLS tests work

Each test runs inside `BEGIN; SET LOCAL ROLE ...; SET LOCAL request.jwt.claim.sub TO ...;`
and rolls back. Sessions mimic Supabase's JWT-claim mechanism without actually
signing JWTs — the test helper writes the claim directly to the session.

A test-only `auth-mock.sql` creates the `auth` schema, `auth.users` table,
and `auth.uid()` / `auth.role()` functions that our RLS policies reference.
In production, Supabase provides these; the mock exists solely so RLS policies
are evaluable against a plain Postgres container.

## What this package does NOT do

- **Host any app code.** The Next.js scaffold is sub-project 3.
- **Own notification delivery state.** The `recommendations` and `price_alerts`
  tables are producers; the consumer pipeline (email, push) is sub-project 5.
- **Wire up realtime subscriptions.** The `activity` table is shape-ready for
  Supabase realtime; filter-by-follow-graph logic lands in sub-project 6.
- **Build on top of the existing Vite prototype in `../src/`.** That's
  prototype-stage UI against mocked data; this package runs against a real DB.

## Worker coordination

`worker/src/db.ts` connects to the same Postgres instance via `DATABASE_URL`.
When this package's migrations replace the worker's `watchlists` / `price_alerts`
stubs, the worker's code continues to work unchanged because:
- Column names and types remain identical
- The worker uses service-role credentials, which bypass RLS

The only behavior change: the real `watchlists` now requires `user_id` to exist
in `auth.users` (FK). The worker's integration tests (pg-mem + stub) still pass
because they apply the stub, not this package's migrations.
