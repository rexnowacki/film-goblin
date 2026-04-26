# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

> **Convention:** This section is updated before each session close so the next session can pick up cold. Update it at the end of every session — what just shipped, what's next, any open threads worth carrying forward.

**Last updated:** 2026-04-26 (post-B2 polish: PR #18 film hero padding fix + PR #19 git-fetch workflow docs)

**Last shipped:** B2 — Social signal on posters. Two corner-pill badges (👁 N eyeing, ✓ N watched) overlaid on `/films` Archive cards via additive props on `FilmPoster`; each badge hides when its own count is 0 so clean poster art stays clean. Goblin-voice caption ("43 goblins are eyeing this · 12 have watched it") on the `/film/[id]` hero. View extension `films_with_stats.watcher_count` (count DISTINCT user_id from watched). No new tables, RLS, or actions. Spec `2026-04-25-social-signal-posters-design.md`, plan `2026-04-25-social-signal-posters.md`. Migration 0125 applied to prod. Live at https://film-goblin.vercel.app/films.

**Next up:** Queue is empty. The Library / Watched / Social-signal trio (C1, C2, B2) is fully shipped. Future micro-projects on deck per the deferred lists in C2's spec and B2's spec — coven-overlap signals on profile pages, owned/review badges, year-in-review, ratings on diary, etc. Brainstorm the next pick when there's appetite.

**Open threads worth knowing about:**
- `passwords.txt` at repo root holds the Supabase prod pooler URL + password (gitignored). See the "Passwords scratchpad" auto-memory.
- B2 deferred: coven-scoped signals (future profile-page sub-project), owned + review badges (additive props on FilmPoster + view extensions), most-watched sort on `/films`, badges on other poster surfaces (`/library`, `/home` marquee, `/watched` strip), `/film/[id]` stat block beyond the single caption, compact unit display (1.2K, 12K) past 99+.
- **`/wrapup` slash command** lives at `.claude/commands/wrapup.md` (untracked, project-local on this machine only). Restart Claude Code to pick it up. Open question: commit `.claude/commands/` to the repo (gitignoring `.claude/settings.local.json`) so the other machine gets the command too — or keep both machines local-only.
- **`docs/in-repo-tickets-setup.md`** — proposal for `tasks/{todo,in-progress,done}/` file-per-ticket coordination, still local/uncommitted. Decide whether to implement now that two-machine work has bumped against itself a few times.

## Remote

Private repo at [rexnowacki/film-goblin](https://github.com/rexnowacki/film-goblin). `origin/master` is the default branch. Deployed to Vercel as project `film-goblin` (skulldrinker team) at https://film-goblin.vercel.app. Vercel is linked via CLI — `.vercel/project.json` is checked in at the repo root.

**Deploy rule: always run `npx vercel deploy --prod --yes` from the repo root.** See the Vercel gotcha in the Gotchas section before deploying from anywhere else.

## Git workflow

I am working on the same codebase on two separate machines, as if I'm two devs. Both devs follow the same protocol so we don't step on each other.

**Always-on rules:**

- Never commit directly to `master`. Always work on a feature branch.
- Use descriptive branch names like `feature/spell-card-balance` or `fix/rulebook-typos`.
- Commit frequently with clear messages.
- Push the branch to origin when work is paused or complete.
- Open pull requests rather than merging directly.

**Stay in sync with `git fetch`** — the other dev may have merged work since you last looked. `git fetch` updates `origin/*` refs without touching your working tree, so it's always safe.

- **Before starting a new branch:** `git fetch origin && git checkout master && git merge --ff-only origin/master`. Fast-forwards local `master` to the remote tip, then branch from there. The `--ff-only` flag refuses to silently create a merge commit if local `master` somehow diverged (it shouldn't — see rule #1).
- **Before pushing a branch you've held for a while:** `git fetch origin` and check whether `origin/master` moved while you worked. If it did, rebase: `git rebase origin/master`. Resolves conflicts locally instead of dumping them onto the PR.
- **Before deploying to prod:** `git fetch origin` so you confirm you're shipping the actual current `master`, not a stale local snapshot.
- Prefer `git fetch` + explicit `merge --ff-only` / `rebase` over `git pull`. `pull` is fine in practice but hides whether a fast-forward, merge, or rebase happened — explicit is better for two-machine coordination.

**Coordination hot spots** — files where two devs are most likely to collide. Touch carefully and merge fast:

- `CLAUDE.md` "Current state" section — both `/wrapup` runs edit the same paragraphs.
- `app/lib/supabase/types.ts` — hand-edited on machines without the Supabase CLI; regen on the other machine will clobber. Commit type edits in their own PR.
- `db/migrations/0NNN_*.sql` — numbered sequentially. If both devs add the same number independently, the second-to-merge renumbers and bumps any consumers.

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
| 13 | Activity Feed Grouping (D1 / #52) — read-time `groupFeed` pass over `getEnrichedFeed`, `FeedItem` discriminated union (`single \| group`), new `ActivityWatchlistAddedGroup` component + `FeedRow` dispatcher, 30-min event-to-event window + 24-hr span ceiling + min-3 size, watchlist-adds only in v1 | `2026-04-25-activity-feed-grouping-design.md` |
| 14 | Watched Action (C2) — `watched` event-stream table + `/watched` route (stats hero + month-grouped diary), shared `WatchModal` for new+edit, `WatchedButton` as 3rd peer in `FilmActions`, `watch_logged` activity kind + trigger + `groupFeed` registration, `broadcast_watched` Settings toggle | `2026-04-25-watched-action-design.md` |
| 15 | Social signal on posters (B2) — `films_with_stats.watcher_count` view extension; `FilmPoster` opt-in `watchlistCount`/`watcherCount` props with corner-pill render; `/films` archive grid badges; `/film/[id]` hero goblin-voice caption | `2026-04-25-social-signal-posters-design.md` |

## Queued sub-projects

The Library / Watched / Social-signal trio (C1, C2, B2) is shipped. No formally-locked next project. When ready, brainstorm a new sub-project from the deferred lists in C2's and B2's specs (coven-overlap signals on `/p/[handle]`, year-in-review on `/watched`, owned/review badges, etc.) or pick a fresh direction.

**Tier-zero hygiene:** Done 2026-04-25. pg-mem smoke fixed at the helper layer (not the migration), all action+admin test files retrofitted with `describe.skipIf`, `/watchlist` hero compressed to match `/films` + `/library`.

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
- **pg-mem (used by `db/ npm test`) doesn't parse `GRANT`, `DROP VIEW`, or correlated-subquery views.** The smoke helper at `db/tests/helpers/pg-mem.ts` strips these from migrations before applying — RLS, GRANT, CREATE/DROP VIEW, and any file with `backfill` in the name. The smoke only asserts table presence, so views and grants don't need to execute. New migrations can use any production-correct DDL (CREATE OR REPLACE VIEW, GRANT, DROP VIEW IF EXISTS) — the helper handles them. If you add a new pattern pg-mem can't parse, extend the strip filters in `pg-mem.ts` rather than rewriting the migration.
- **`coven_members` is a graph-edge table**, not a (coven_id, user_id) membership table. Schema is `(user_a_id, user_b_id, created_at)` with a `user_a_id < user_b_id` CHECK constraint. To check "are A and B coven mates", query both directions: `(cm.user_a_id = A AND cm.user_b_id = B) OR (cm.user_a_id = B AND cm.user_b_id = A)`. Tests should use a `bond(client, x, y)` helper that swaps args to respect the invariant — see `db/tests/rls/library.test.ts`.
- **PostgREST nested embed types may emit as array even when a single object is returned.** A `.select(\`film:films!inner(…)\`)` query is always one row per parent (FK guarantees it), but the generated `Database` types model it as `T[]` in some cases. The established workaround is `as never` on the consumer boundary (e.g. `<FilmPoster film={r.film as never} />`) — see `/films` and `/library` page templates. Don't sprinkle `as any`; the cast belongs at one location.
- **iOS Safari standalone PWA needs both `100dvh` and safe-area padding.** Plain `100vh` on iOS includes the URL bar's reserved space and breaks layouts; `100dvh` (dynamic viewport height) sizes correctly. Body min-height + page-level wrappers all use `100dvh`. With `appleWebApp.statusBarStyle: "black-translucent"`, content extends behind the notch — `TopNavChrome` adds `paddingTop: "env(safe-area-inset-top)"` so the wordmark sits below the iOS status bar. New pages with their own sticky chrome should do the same.
- **`describe.skipIf` plus per-hook env guards** — env-blocked integration tests (e.g. `app/tests/actions/library.test.ts`, `reactions.test.ts`) need both `describe.skipIf(!hasEnv)(…)` AND `if (!hasEnv) return;` early-returns inside `beforeAll` / `beforeEach` / `afterAll`. Without the hook guards, the lifecycle crashes on missing env BEFORE the describe gets to skip, and the file reports red. New integration tests should follow the library file as the template.
- **Adding a new `profiles` field is automatic via the `{ ...fields }` spread.** `_updateProfile` in `app/lib/actions/profile.ts` does `const patch: ProfileUpdate = { ...fields };` — any field added to the `ProfileFields` interface flows through to the UPDATE. To wire a new profile column end-to-end: add the column in a migration, regenerate types (`npm run gen:types`), add the field to `ProfileFields`, add the form input + `save()` field-extraction in `SettingsForm.tsx`. No new server action needed.
