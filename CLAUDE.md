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

- `db/ npm run migrate` applies `db/migrations/0100_*` onward — the **canonical schema** for the production app (profiles, follows, coven, watchlists, lists, reviews, recommendations, activity, activity_reactions, library, notifications, avatars).
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

- `app/app/` — routes. One folder per route (`home/`, `films/`, `film/[id]/`, `watchlist/`, `library/`, `lists/`, `people/`, `coven/`, `p/[handle]/`, `settings/`, `onboarding/`, `admin/`, `auth/{signin,signup,forgot,reset}/`, `api/{auth/callback,cron/*,unsubscribe/[token]}/`). Plus the landing page at `app/app/page.tsx` and the typed PWA manifest at `app/app/manifest.ts` (Next 15 manifest route).
- `app/app/globals.css` — single CSS file, the entire design system. Tokens at `:root`, responsive overrides at `@media (max-width: 720px)`, utilities (`.h-display`, `.container`, `.stackable`, `.grid-auto`, `.check-zine`, `.btn` family, `.films-sort-chip`, `.heart-*`, `.bottom-sheet-*`, `.likers-*`), grain/halftone effects, hero overrides. **Font-usage rule lives here in a comment block above `.h-display`** — Rubik Wet Paint for chrome/page titles; DM Serif Display for content titles. Secondary-button rule (destructive blood-outline vs non-destructive bone-outline) is documented above `.btn`.
- `app/components/` — client components (`TopNavChrome`, `FeedTabs`, `FilmPoster`, `UserMenu`, `RecommendModal`, `AvatarEditor`, `WatchlistButton`, `OwnedButton`, `FilmActions`, `FollowButton`, `CovenButton`, `HeartButton`, `BottomSheet`, `LikersBottomSheet`, `Avatar`, etc.). `TopNav.tsx` is a thin server shim that calls the client-side `TopNavChrome`. **`TopNavChrome` pads itself with `env(safe-area-inset-top)`** so iOS standalone PWA mode doesn't overlap the notch.
- `app/lib/supabase/` — SSR + client Supabase factories. Use `createClient()` from `server.ts` in server components and route handlers; from `client.ts` in `"use client"` components. `types.ts` is generated via `npm run gen:types`; regenerate after every migration.
- `app/lib/queries/` — read-side DB helpers, one file per aggregate (`films`, `watchlists`, `library`, `reviews`, `activity`, `activity-reactions`, `coven`, `profiles`, `lists`, `sort-watchlist`). Import a Supabase client and return shaped data.
- `app/lib/actions/` — server actions (form submits, mutations). `auth`, `profile`, `watchlists`, `library`, `lists`, `recommendations`, `reactions`, `follows`, `coven`, `onboarding`.

**Conventions to follow** when adding to any of the above:
- **Composite PK on join tables.** `activity_reactions` and `library` both use `(user_id, target_id)` as the natural unique key — no surrogate `id` column. Saves a SELECT-then-INSERT race on toggles.
- **Private-action + public-wrapper.** Server actions split into `_doThing(client, …)` (Supabase client injected, testable) and `doThing(…)` (creates the server client, calls the private form, calls `revalidatePath`). Mirrors `_addToLibrary` / `addToLibrary` and `_toggleReaction` / `toggleReaction`.
- **`films_with_stats` view extends additively.** Migrations that change the view use `DROP VIEW IF EXISTS … CREATE VIEW …` and add new columns at the END of the select list. All consumers pick explicit column lists, never `select("*")`, so additive extensions can't break callers.
- **PostgREST nested embeds may type as array-vs-object.** When using `films:films!inner(…)` selects, the generated types occasionally emit the embed as `T[]` even though it's always one row. The established workaround is `as never` on the prop boundary (e.g. `<FilmPoster film={r.film as never} />`); see `/films` and `/library` page templates.
- **RLS test bootstrap.** New RLS suites copy `db/tests/rls/library.test.ts`'s shape: `seedFixtures` once in `beforeAll` for `userA/B/C + filmId`, `beforeEach` resets state via service_role, `bond()` helper for `coven_members` edges respecting the `user_a_id < user_b_id` invariant.
- **Env-blocked action tests.** Integration tests that need a real Supabase use `describe.skipIf(!hasEnv)(…)` plus `if (!hasEnv) return;` guards on lifecycle hooks so the file reports green-skipped instead of red-crashed when `TEST_SUPABASE_SERVICE_ROLE_KEY` is unset. See `app/tests/actions/library.test.ts`.
- **iOS standalone PWA quirks.** Use `100dvh` (not `100vh`) on top-level page wrappers, set `viewportFit: "cover"` and `themeColor` on the `Viewport` export in `layout.tsx`, set `appleWebApp.statusBarStyle: "black-translucent"` on the metadata, and pad the sticky TopNav with `paddingTop: "env(safe-area-inset-top)"` so the goblin wordmark sits below the iOS status bar.

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

Every sub-project gets a spec + plan under `docs/superpowers/specs/` and `docs/superpowers/plans/` before implementation. Read the spec when working on related areas — it's the canonical record of design decisions and why they were made. Shipped to date (chronological):

| # | Name | Spec |
|---|---|---|
| 1 | Apple data source — the `worker/` package | `2026-04-20-apple-data-source-design.md` |
| 2 | Database schema + RLS — migrations `0100`–`0117` | `2026-04-21-schema-rls-design.md` |
| 3 | Next.js scaffold + auth + UI port — the `app/` package | `2026-04-21-nextjs-app-design.md` |
| 4 | Price-tracking worker HTTP mount (Vercel Cron) | `2026-04-22-worker-cron-mount-design.md` |
| 5 | Notifications pipeline — `notifier/` + Resend | `2026-04-22-notifications-pipeline-design.md` |
| 6 | Social features — coven, follows, recommendations, activity | `2026-04-23-social-features-design.md` |
| 7 | Auth polish — password reset, email verification, Google sign-in | `2026-04-23-auth-polish-design.md` |
| 8 | Mobile responsive (Tier-A) — 720px breakpoint, hamburger nav | `2026-04-23-mobile-responsive-design.md` |
| 9 | Mobile polish — filter rows, `.h-display` tuning, `.check-zine`, font-usage rule | `2026-04-23-mobile-polish-design.md` |
| 10 | Coven feed hearts (sub-project A) — `activity_reactions` table, `HeartButton`, `LikersBottomSheet`, universal heart on every Activity\* row | `2026-04-24-coven-feed-hearts-design.md` |
| 11 | Discovery chrome polish (B1) — chip-row sort on `/films`, dropped Chapter II eyebrow, installable PWA shell with goblin-skull glyph | `2026-04-25-discovery-chrome-polish-design.md` |
| 12 | Library — Owned (C1) — new `library` table + RLS, `/library` route, `OwnedButton` + `FilmActions` wrapper, auto-watchlist-cleanup on add, `films_with_stats.owned_count` exposed for B2 | `2026-04-25-library-owned-design.md` |

## Queued sub-projects

Three pieces of follow-on work, in suggested execution order. Brainstorm + spec each before implementation. Order is suggested, not locked — talk to the user before starting.

1. **B2 — Social signal on posters.** Surface coven-watchlist / coven-owned / coven-reviewed counts as small badges on `/films` Archive cards. Reads from `films_with_stats` (already exposes `watchlist_count` and `owned_count` via C1's view extension; reviews count would need a similar additive extension). No new schema for the read path. Originally deferred to ship after Library so the signal vocabulary could include "owned" — that's now true. Open design questions: which signals matter most, how to render badges at small card sizes without crowding, whether to surface row-level "Sarah owns this" or stick to aggregate counts only.
2. **C2 — Watched action.** Track when a user watches a film (timestamps + counts). Builds directly on C1's data model. Needs a new `watched` event-stream table (event-shaped, not flag-shaped — multiple watch entries per `(user, film)`), a server action distinct from `addToLibrary` (logging an event vs setting a flag), a `/watched` page with history view + per-film count + most-watched stats. Bigger surface than C1 because of the temporal dimension. Likely also gets a `watched_at` activity event for the coven feed.
3. **#52 — Coven feed grouping.** Originally sub-project B of the hearts work; deferred because the hearts side grew. Collapse consecutive `watchlist_added` rows from the same actor into one feed item (and apply similar grouping to future high-volume event kinds — e.g., bulk library-add when C2 ships might want this too). Touches activity enrichment + feed render only — no schema work.

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
- **Supabase prod DB is reached via the session-mode pooler, not the direct host.** `db.<project>.supabase.co:5432` is IPv6-only and unreachable from this machine. The migrate runner connects through `aws-1-us-west-1.pooler.supabase.com:5432` with user `postgres.<project-ref>`. The full connection string + password live in `passwords.txt` at the repo root (gitignored — see the "Passwords scratchpad" auto-memory). Source the URL via `set -a; source app/.env.local; set +a` before `npm run migrate`.
- **pg-mem (used by `db/ npm test`) does not support `CREATE OR REPLACE VIEW`.** Migration `0119_films_with_stats_view.sql` uses that statement, which makes the pg-mem migration smoke fail on `master` even before any new work. Newer migrations that touch views (e.g. `0122_library.sql`) use `DROP VIEW IF EXISTS … CREATE VIEW …` — copy that pattern. The smoke breakage is pre-existing; eventual fix is to split `0119` similarly, or register a pg-mem extension shim for the OR-REPLACE form.
- **`coven_members` is a graph-edge table**, not a (coven_id, user_id) membership table. Schema is `(user_a_id, user_b_id, created_at)` with a `user_a_id < user_b_id` CHECK constraint. To check "are A and B coven mates", query both directions: `(cm.user_a_id = A AND cm.user_b_id = B) OR (cm.user_a_id = B AND cm.user_b_id = A)`. Tests should use a `bond(client, x, y)` helper that swaps args to respect the invariant — see `db/tests/rls/library.test.ts`.
- **PostgREST nested embed types may emit as array even when a single object is returned.** A `.select(\`film:films!inner(…)\`)` query is always one row per parent (FK guarantees it), but the generated `Database` types model it as `T[]` in some cases. The established workaround is `as never` on the consumer boundary (e.g. `<FilmPoster film={r.film as never} />`) — see `/films` and `/library` page templates. Don't sprinkle `as any`; the cast belongs at one location.
- **iOS Safari standalone PWA needs both `100dvh` and safe-area padding.** Plain `100vh` on iOS includes the URL bar's reserved space and breaks layouts; `100dvh` (dynamic viewport height) sizes correctly. Body min-height + page-level wrappers all use `100dvh`. With `appleWebApp.statusBarStyle: "black-translucent"`, content extends behind the notch — `TopNavChrome` adds `paddingTop: "env(safe-area-inset-top)"` so the wordmark sits below the iOS status bar. New pages with their own sticky chrome should do the same.
- **`describe.skipIf` plus per-hook env guards** — env-blocked integration tests (e.g. `app/tests/actions/library.test.ts`, `reactions.test.ts`) need both `describe.skipIf(!hasEnv)(…)` AND `if (!hasEnv) return;` early-returns inside `beforeAll` / `beforeEach` / `afterAll`. Without the hook guards, the lifecycle crashes on missing env BEFORE the describe gets to skip, and the file reports red. New integration tests should follow the library file as the template.
- **Adding a new `profiles` field is automatic via the `{ ...fields }` spread.** `_updateProfile` in `app/lib/actions/profile.ts` does `const patch: ProfileUpdate = { ...fields };` — any field added to the `ProfileFields` interface flows through to the UPDATE. To wire a new profile column end-to-end: add the column in a migration, regenerate types (`npm run gen:types`), add the field to `ProfileFields`, add the form input + `save()` field-extraction in `SettingsForm.tsx`. No new server action needed.
