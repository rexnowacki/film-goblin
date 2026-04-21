# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Two packages, one repo

This repo contains two independent packages that are deployed separately and share nothing at runtime:

- **`src/`** — the Vite + React **frontend prototype**. Ported from a Claude Design HTML/JS handoff bundle. All data is mocked in `src/data.js`. Twelve routes in a single-page app with a built-in route switcher. This is a design artifact, not production code yet; the production rebuild is tracked as sub-projects in `docs/superpowers/`.
- **`worker/`** — the **price-tracking worker** (TypeScript, Node). Standalone package with its own `package.json`, migrations, tests, and CLI scripts. Polls the iTunes Search API for Apple TV movie prices, writes `price_history` rows, creates `price_alerts` for watchlisting users. Implements the spec at `docs/superpowers/specs/2026-04-20-apple-data-source-design.md`. This is sub-project 1 of the production rebuild.

When a request touches "the app" / "the UI" / "the design" it's `src/`. When it touches prices, alerts, the database, or anything scheduled it's `worker/`. Do not merge them.

`film-goblin/` is the original Claude Design handoff bundle (prototype HTML/JSX + chat transcripts). Read-only reference material; don't edit it.

## Node version

Node 20 is required. The repo pins it via `.nvmrc` but the system default is often Node 16 (too old for Vitest and Vite 5). Before running any `npm`/`tsx`/`node` command, either:

- `nvm use 20` (sets PATH for the shell), OR
- Prefix with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` for a single command.

Background/parallel bash tool calls don't share shell state, so `nvm use 20 && npm …` in one call and `npm …` in the next won't work. Use the PATH prefix for one-shot invocations.

## Commands

### Frontend prototype (`src/`)

From the repo root:

```
npm run dev        # Vite dev server on 5173
npm run build      # production build → dist/
npm run preview    # serve the production build
```

No test suite — this is a visual prototype. Verify UI changes by running the dev server and tabbing through the route switcher (top-left of every page).

### Worker (`worker/`)

From `worker/`:

```
npm test                            # vitest run (full suite)
npm run test:watch                  # vitest in watch mode
npm test -- tests/diff.test.ts      # single file
npm test -- -t "shouldAlert"        # single test by name
npm run typecheck                   # tsc --noEmit
npm run migrate                     # apply SQL migrations against DATABASE_URL
npm run seed                        # curated iTunes search → upserts ~500 films
npm run worker                      # one pass of the price-refresh pipeline
npm run add-film -- 1468845007      # admin: upsert a single film by iTunes trackId
```

Tests use pg-mem (in-memory Postgres) and MSW (HTTP mocking). No real DB or network required for `npm test`.

The migrate/seed/worker/add-film scripts expect a real `DATABASE_URL` in `worker/.env`. The HTTP cron mount (`/api/cron/refresh-prices`) is deferred to the Next.js scaffold in a future sub-project; for now the worker is invoked via `npm run worker`.

## Architecture

### Worker pipeline (`worker/src/`)

Each module has one responsibility — do not blur the boundaries:

- `itunes.ts` — HTTP + parsing. `fetchPrices` (retry on 429/5xx), `searchFilms`, `parseFilm`, `upscaleArtworkUrl`.
- `diff.ts` — pure decisions. `computeDiff(latest, newPrice)`, `shouldAlert(watchlist, newPrice, now)`. No DB, no HTTP.
- `db.ts` — every SQL statement lives here. Read helpers and transactional write helpers. **NUMERIC and BIGINT columns are coerced to JS numbers at this boundary** (`numOrNull`, `Number(itunes_id)`). Downstream code should never see strings from these columns.
- `digest.ts` — in-memory per-run stats. `render()` emits a single log line.
- `worker.ts` — the orchestrator. `runOnce(client, opts)` selects stalest films, fetches in batches of 100, diffs, writes history, fires alerts. Contains no raw SQL — all queries go through `db.ts`.
- `seed.ts` — bootstrap only. Runs curated genre/director searches and upserts results.
- `migrate.ts` — lightweight SQL runner. Applies `migrations/*.sql` in order against `_migrations` tracking table.

Scripts under `worker/scripts/` are thin CLI adapters — no business logic.

### Frontend prototype (`src/`)

- `App.jsx` — renders the route switcher (top-left), tweaks panel (bottom-right ✦), and picks one page by route id from localStorage. Twelve routes.
- `data.js` — all mocked data (`FILMS`, `LISTS`, `USERS`, `ACTIVITY`, `genPriceHistory`). Every page imports from here.
- `components/` — six reusable primitives (`FilmPoster`, `PriceDrop`, `Stars`, `Avatar`, `HalftoneBar`, `TopNav`, `IOSFrame`). `TopNav` is the logged-in 7-item nav; `IOSFrame` is just the iPhone bezel used by `MobilePage`.
- `pages/` — one file per route. `MobilePage` is a single-page showcase of 10 mobile artboards; the pan/zoom design-canvas wrapper from the original bundle was intentionally dropped.
- `styles.css` — the whole design system (color tokens, `.display`/`.eyebrow`/`.stamp`/`.btn` utilities, grain/halftone effects). Single CSS file, ported verbatim from the design bundle.

### Design system

Aesthetic lock-ins that should not drift without user buy-in:

- Palette: bone `#F3ECD8`, void `#0A0A0A`, and an accent ink from {hot pink `#FF2D88` (default), acid yellow `#F5D300`, orange `#FF6A1F`, blood `#D93A2E`}. Accent is live-switched via `[data-accent="..."]` on `<html>`; the tweaks panel UI drives it.
- Type: Rubik Wet Paint for display/wordmark, DM Serif Display for heads, IBM Plex Sans/Serif/Mono for UI and review body. A prior blackletter experiment (UnifrakturCook) was reverted — keep Rubik Wet Paint.
- **Storefront labeling:** user-facing strings say "Apple TV" only. Internal identifiers (`itunes_id`, `itunes_url`, `itunes.apple.com/lookup`) stay because those are the API's names.
- No faked illustrations. Posters are colored `bg`/`accent`/`fg` blocks with a shape primitive plus halftone + SVG grain.

## Production stack

Committed direction (Next.js + Supabase + Vercel Cron, etc.) lives in **`docs/superpowers/stack.md`** — read it before proposing tech choices, and update it there (not here) when decisions change.

## Sub-project decomposition (production rebuild)

The production rebuild is sequenced as six independent sub-projects, each with its own spec → plan → implementation cycle under `docs/superpowers/`:

1. **Apple data source** — ✅ Done. See `specs/2026-04-20-apple-data-source-design.md`.
2. **Database schema + RLS policies** — not started. Owns the full `users`, `watchlists` (beyond the stub in migration 0003), `friendships`, `lists`, `reviews`, `recommendations` schema.
3. **Next.js scaffold + auth + UI port** — not started. Replaces the Vite prototype with an App Router + TS + Supabase-backed app.
4. **Price-tracking worker HTTP mount** — glue; lands when sub-project 3 exists.
5. **Notifications pipeline** — email via Resend + web push. Consumes `price_alerts`.
6. **Social features** — friends, recommendations, realtime activity feed.

The worker's `watchlists` table is intentionally a stub — sub-project 2 owns the real schema. Migration `0003_watchlists_stub.sql` header flags this.

## Gotchas

- **`git commit -m` heredocs intermittently mangle the message** in this environment — commits land with subject `"Error:  does not exist."` when using `$(cat <<'EOF' ... EOF)`. Workaround: `Write` the message to `/tmp/msg.txt`, then `git commit -F /tmp/msg.txt`. `--amend -F` from the same file fixes a mangled message without losing the tree.
- **pg returns NUMERIC and BIGINT as strings** (JS lacks arbitrary precision). The worker coerces at the `db.ts` boundary. If you add a new DB read, do the same — don't let string-typed numbers leak into `diff.ts` or `worker.ts`.
- **pg-mem 3.0.4 does NOT silently no-op `CREATE EXTENSION`** — it throws on unknown extensions. The test helper `worker/tests/helpers/db.ts` uses `mem.registerExtension("pgcrypto", ...)` to bridge this so the real-Postgres migration text stays unchanged.
- **Vite dev server needs Node ≥ 18** — Node 16 fails with `crypto$2.getRandomValues is not a function`. Always `nvm use 20` first.
- **Worktrees live under `.worktrees/`** (gitignored). The `superpowers:finishing-a-development-branch` skill cleans them up automatically on merge.
