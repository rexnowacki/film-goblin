# Film Goblin — Price-tracking Worker

A standalone Node.js package that polls the iTunes Search API for Apple TV
movie prices, diffs against what's in Postgres, writes new `price_history`
rows when prices change, and creates `price_alerts` for watchlisting users
when prices drop.

Implements the spec at `../docs/superpowers/specs/2026-04-20-apple-data-source-design.md`.

## Setup

Requires Node 20 (an `.nvmrc` at the repo root pins it). From `worker/`:

```
npm install
cp .env.example .env        # fill in DATABASE_URL and (optionally) SENTRY_DSN
npm run migrate             # apply SQL migrations
npm run seed                # seed ~500 curated films
```

## Run the worker

```
npm run worker
```

One pass: selects tracked films ordered by stalest `last_checked_at`,
refreshes prices in batches of 100, writes history and alerts, prints a
digest line like:

```
films_refreshed=87 price_changes=12 alerts_fired=4 parse_failures=0 unavailable_marked=1
```

Intended to be invoked every 4 hours. The HTTP cron mount
(`/api/cron/refresh-prices` on Vercel) lands in sub-project 3 when the
Next.js scaffold exists; for now invoke this script directly.

## Admin: add a single film

```
npm run add-film -- 1468845007
```

Looks up by iTunes `trackId`, parses, upserts into `films`. Used when
the seed searches miss something obvious.

## Tests

```
npm test
```

Tests use pg-mem for the database (in-memory Postgres) and MSW for HTTP.
No external services required to run the suite.

## What this worker does NOT do

- **Deliver notifications** (email, push). `price_alerts` is a
  consumption surface for the notification worker in sub-project 5.
- **Host any HTTP endpoint.** The worker is a library + CLI. The
  Next.js cron mount is sub-project 3.
- **Own user/auth/watchlist schema.** `watchlists` is stubbed here
  with the minimum surface required; the full schema lands in
  sub-project 2.
