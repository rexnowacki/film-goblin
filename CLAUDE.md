# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Remote

Private repo at [rexnowacki/film-goblin](https://github.com/rexnowacki/film-goblin). `origin/master` is the default branch. Deployed to Vercel as project `film-goblin` (skulldrinker team) at https://film-goblin.vercel.app. Vercel is linked via CLI — `.vercel/project.json` is checked in at the repo root.

**Deploy rule: always run `npx vercel deploy --prod --yes` from the repo root.** See the Vercel gotcha in the Gotchas section before deploying from anywhere else.

## Packages in this repo

Five packages, deployed/run independently:

- **`app/`** — the **production Next.js 15 app** (App Router, TS, Supabase SSR). The thing users touch. Owns UI, auth, server actions, API routes including cron endpoints. Deployed to Vercel. When a request says "the app" / "the UI" — it's this.
- **`worker/`** — the **price-tracking worker** (TypeScript, Node). Polls iTunes Search API, writes `price_history`, emits `price_alerts`. Invocable as a CLI (`npm run worker`) or via the Next.js cron route at `app/app/api/cron/refresh-prices`. Has its own tests using pg-mem + MSW.
- **`db/`** — the **schema package**. Owns all migrations (`db/migrations/0100_*` onward), RLS policies, triggers, DB-side tests. Migrations apply to the Supabase Postgres instance.
- **`notifier/`** — the **notifications package**. Email via Resend + web push. Consumed by `app/app/api/cron/send-notifications`.
- **`src/`** — the original Vite + React **design prototype**. Legacy reference material — mocked data, the zine look preserved intact for visual comparison. Don't make feature changes here; the production app is `app/`.

Plus one top-level reference dir:

- **`film-goblin/`** — the original Claude Design handoff bundle (HTML/JSX + chat transcripts). Read-only; don't edit.

Routing rule: "UI / user-facing behavior" → `app/`. "Prices, iTunes, scheduled jobs" → `worker/` + the app's cron route. "Schema / RLS / triggers" → `db/migrations/`. "Email / push" → `notifier/`.

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

### Production app (`app/`)

From `app/`:

```
npm run dev           # next dev on :3000
npm run build         # next build (also runs during Vercel deploy)
npm run start         # serve production build locally
npm run typecheck     # tsc --noEmit
npm run test          # vitest run (if any tests exist; currently none)
npm run gen:types     # regen lib/supabase/types.ts from local Supabase
```

UI changes: `npm run dev` and hit http://localhost:3000. A real Supabase instance is required for auth-gated pages — expects env in `app/.env.local`. Deploy via `npx vercel deploy --prod --yes` **from the repo root only** — see Gotchas.

### Database (`db/`)

From `db/`:

```
npm test              # migrations smoke (pg-mem)
npm run test:rls      # RLS policy + trigger suite (testcontainers Postgres)
npm run test:all      # both
npm run typecheck
npm run migrate       # apply db/migrations/*.sql against DATABASE_URL
```

`test:rls` spins up a real Postgres via Docker (testcontainers) so RLS, triggers, and JSON aggregates execute for real. `test` uses pg-mem and is fast but does NOT exercise RLS.

### Notifier (`notifier/`)

From `notifier/`:

```
npm test              # vitest run
npm run typecheck
```

Library code only — no CLI. Consumed by `app/app/api/cron/send-notifications/` via the `film-goblin-notifier` file: dependency.

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

The seed/worker/add-film scripts expect a real `DATABASE_URL` in `worker/.env`. Production refresh runs via the Vercel Cron hitting `app/app/api/cron/refresh-prices/` — the worker package's `runOnce` is imported as a file: dependency by the app. `npm run worker` is still a valid local-invocation path.

### Gotcha: `npm run migrate` lives in two places

Both `worker/` and `db/` have a `migrate` script. They are NOT the same.

- `db/ npm run migrate` applies `db/migrations/0100_*` onward — the **canonical schema** for the production app (profiles, follows, coven, watchlists, lists, reviews, recommendations, activity, notifications, avatars).
- `worker/ npm run migrate` applies `worker/migrations/` — the worker's own legacy stub schema (films, price_history, price_alerts, watchlists stub). Migration `0100_drop_watchlists_stub.sql` in `db/` drops the stub and hands over to the real schema.

Run `db/` migrations against the production Supabase; run `worker/` migrations only when bootstrapping a fresh local worker DB.

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

### Production app (`app/`)

Next.js 15 App Router, TypeScript, Supabase SSR. The file map:

- `app/app/` — routes. One folder per route (`home/`, `films/`, `film/[id]/`, `lists/`, `people/`, `coven/`, `p/[handle]/`, `settings/`, `onboarding/`, `auth/{signin,signup,forgot,reset}/`, `api/{auth/callback,cron/*,unsubscribe/[token]}/`). Plus the landing page at `app/app/page.tsx`.
- `app/app/globals.css` — single CSS file, the entire design system. Tokens at `:root`, responsive overrides at `@media (max-width: 720px)`, utilities (`.h-display`, `.container`, `.stackable`, `.grid-auto`, `.check-zine`, `.btn` family), grain/halftone effects, hero overrides. **Font-usage rule lives here in a comment block above `.h-display`** — Rubik Wet Paint for chrome/page titles; DM Serif Display for content titles. Secondary-button rule (destructive blood-outline vs non-destructive bone-outline) is documented above `.btn`.
- `app/components/` — client components (`TopNavChrome`, `FeedTabs`, `FilmPoster`, `UserMenu`, `RecommendModal`, `AvatarEditor`, `WatchlistButton`, `FollowButton`, `CovenButton`, etc.). `TopNav.tsx` is a thin server shim that calls the client-side `TopNavChrome`.
- `app/lib/supabase/` — SSR + client Supabase factories. Use `createClient()` from `server.ts` in server components and route handlers; from `client.ts` in `"use client"` components.
- `app/lib/queries/` — read-side DB helpers, one file per aggregate (`films`, `watchlists`, `reviews`, `activity`, `coven`, `profiles`, `lists`). Import a Supabase client and return shaped data.
- `app/lib/actions/` — server actions (form submits, mutations). `auth`, `profile`, `watchlists`, `lists`, `recommendations`, `follows`, `coven`, `onboarding`.

The single 720px mobile breakpoint is set in `globals.css`'s `@media (max-width: 720px)` blocks and the `.mobile-only` / `.desktop-only` / `.mobile-only-flex` helpers. `.stackable` grids force `grid-template-columns: 1fr` at ≤720px regardless of `--stack-template`.

### Design prototype (`src/`) — legacy

Kept as a visual reference for the zine aesthetic. Vite + React, no auth, all mocked data. If you're changing UI, change it in `app/` — `src/` is not deployed and does not reflect production behavior. Architecture (for historical context only):

- `App.jsx` — route switcher (top-left), tweaks panel (bottom-right ✦), picks one page by route id from localStorage. Twelve routes.
- `data.js` — all mocked data.
- `components/` — six reusable primitives (`FilmPoster`, `PriceDrop`, `Stars`, `Avatar`, `HalftoneBar`, `TopNav`, `IOSFrame`).
- `pages/` — one file per route. `MobilePage` is a single-page showcase of 10 mobile artboards.
- `styles.css` — the original design system, ported verbatim from the Claude Design handoff bundle. `app/app/globals.css` is the evolved version.

### Design system

Aesthetic lock-ins that should not drift without user buy-in:

- Palette: bone `#F3ECD8`, void `#0A0A0A`, and an accent ink from {hot pink `#FF2D88` (default), acid yellow `#F5D300`, orange `#FF6A1F`, blood `#D93A2E`}. Accent is live-switched via `[data-accent="..."]` on `<html>`; the tweaks panel UI drives it.
- Type: Rubik Wet Paint for display/wordmark, DM Serif Display for heads, IBM Plex Sans/Serif/Mono for UI and review body. A prior blackletter experiment (UnifrakturCook) was reverted — keep Rubik Wet Paint.
- **Storefront labeling:** user-facing strings say "Apple TV" only. Internal identifiers (`itunes_id`, `itunes_url`, `itunes.apple.com/lookup`) stay because those are the API's names.
- No faked illustrations. Posters are colored `bg`/`accent`/`fg` blocks with a shape primitive plus halftone + SVG grain.

## Production stack

Committed direction (Next.js + Supabase + Vercel Cron, etc.) lives in **`docs/superpowers/stack.md`** — read it before proposing tech choices, and update it there (not here) when decisions change.

## Sub-project history

Every sub-project gets a spec + plan under `docs/superpowers/` before implementation. Shipped sub-projects in order:

1. **Apple data source** — ✅ `specs/2026-04-20-apple-data-source-design.md`. The `worker/` package. Lives at `worker/src/*.ts`.
2. **Database schema + RLS** — ✅ `specs/2026-04-21-schema-rls-design.md`. Migrations `db/migrations/0100_drop_watchlists_stub.sql` through `0117_avatars_bucket.sql`. RLS policies, triggers (profile creation, coven broadcast, activity fan-out).
3. **Next.js scaffold + auth + UI port** — ✅ `specs/2026-04-21-nextjs-app-design.md`. The `app/` package. App Router, Supabase SSR auth, server actions, all 12 routes from the prototype.
4. **Price-tracking worker HTTP mount** — ✅ `specs/2026-04-22-worker-cron-mount-design.md`. Route at `app/app/api/cron/refresh-prices/`. Uses Vercel Cron.
5. **Notifications pipeline** — ✅ `specs/2026-04-22-notifications-pipeline-design.md`. The `notifier/` package. Route at `app/app/api/cron/send-notifications/` + `app/app/api/unsubscribe/[token]/`. Email via Resend.
6. **Social features** — ✅ `specs/2026-04-23-social-features-design.md`. Coven (friends with a name), follows, recommendations, activity feed.
7. **Auth polish** — ✅ `specs/2026-04-23-auth-polish-design.md`. Password reset, email verification, Google sign-in, settings password change.
8. **Mobile responsive (Tier-A "usable")** — ✅ `specs/2026-04-23-mobile-responsive-design.md`. Responsive tokens at 720px breakpoint, hamburger nav, grid reflow, hero restack.
9. **Mobile polish** — ✅ `specs/2026-04-23-mobile-polish-design.md`. Feed filter row cleanup, film detail reorder, `.h-display` clamp tuning, custom `.check-zine` checkboxes, input contrast bump, font-usage rule (Rubik Wet Paint for chrome; DM Serif Display for content titles).

Queued:

- No queued sub-projects as of 2026-04-23. Roadmap-level next work is open — see `docs/superpowers/stack.md` and ask the user before starting anything new.

## Gotchas

- **`git commit -m` heredocs intermittently mangle the message** in this environment — commits land with subject `"Error:  does not exist."` when using `$(cat <<'EOF' ... EOF)`. Workaround: `Write` the message to `/tmp/msg.txt`, then `git commit -F /tmp/msg.txt`. `--amend -F` from the same file fixes a mangled message without losing the tree.
- **pg returns NUMERIC and BIGINT as strings** (JS lacks arbitrary precision). The worker coerces at the `db.ts` boundary. If you add a new DB read, do the same — don't let string-typed numbers leak into `diff.ts` or `worker.ts`.
- **pg-mem 3.0.4 does NOT silently no-op `CREATE EXTENSION`** — it throws on unknown extensions. The test helper `worker/tests/helpers/db.ts` uses `mem.registerExtension("pgcrypto", ...)` to bridge this so the real-Postgres migration text stays unchanged.
- **Vite dev server needs Node ≥ 18** — Node 16 fails with `crypto$2.getRandomValues is not a function`. Always `nvm use 20` first.
- **Worktrees live under `.worktrees/`** (gitignored). The `superpowers:finishing-a-development-branch` skill cleans them up automatically on merge.
- **Vercel deploys must run from the repo root. Never from `app/` and never from `<worktree>/app/`.** The Vercel CLI resolves `.vercel/project.json` from CWD only — it does NOT walk up the directory tree. The real project `film-goblin` is configured with `rootDirectory: app` in the Vercel dashboard, so building from the repo root is correct; Vercel applies that setting on top of the uploaded tree.
  - If you run `vercel deploy --yes` from `app/` without a pre-populated `app/.vercel/project.json`, it silently **creates a new project** named after the CWD (e.g. `skulldrinker/app`) — a garbage project linked to a garbage URL. Delete with `npx vercel project rm <name>`.
  - If you copy the root's `.vercel/project.json` into `app/.vercel/` and deploy from there, Vercel uses the correct project but then applies `rootDirectory: app` on top of CWD `app/`, so it tries to build `app/app/` and fails with "Couldn't find any `pages` or `app` directory".
  - **For worktrees**, copy the root's `.vercel/project.json` into the **worktree root** (`.worktrees/<name>/.vercel/project.json`), then deploy from the worktree root — NOT from `<worktree>/app/`. A quick sanity grep before deploying: `ls -la .vercel/project.json && pwd` — the path should end in the worktree root or the repo root, never in `/app`.
- **`BRAVE_SEARCH_API_KEY` lives in Vercel env (Production, Preview, Development — all sensitive) and `app/.env.local` for local dev.** Used only by `app/lib/actions/admin/apple-tv-search.ts` (the admin "Search Apple TV" widget on `/admin/films/new`). To rotate: regenerate at https://brave.com/search/api/ → `npx vercel env rm BRAVE_SEARCH_API_KEY <env>` + `npx vercel env add BRAVE_SEARCH_API_KEY <env>` for each of production/preview/development → update `app/.env.local` with the new key → redeploy with `npx vercel deploy --prod --yes` from the repo root.
