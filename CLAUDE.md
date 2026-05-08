# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

> **Convention:** This section is updated before each session close so the next session can pick up cold. Update it at the end of every session — what just shipped, what's next, any open threads worth carrying forward.

**Last updated:** 2026-05-08

**Last shipped (2026-05-08):** Three things. (1) **iTunes availability cron (#41):** Weekly cron at `/api/cron/check-itunes-availability` (Mondays 14:00 UTC) checks TMDB-only films for iTunes availability. Mig 0175 adds `films.tmdb_id`, `films.theatrical_release_date`, `films.last_itunes_check_at`, restores partial unique index on `films.itunes_id`, and creates `itunes_candidates` table. Score function in `app/lib/itunes-availability/score.ts` (lowercase-only/normalized title + year ±1 + director); ≥0.85 auto-promotes (writes `itunes_id` directly to films), 0.45–0.85 lands in `/admin/itunes-candidates` for review. Add Film modal (TMDB option) now captures `tmdb_id` + `theatrical_release_date` so new films get precise cron timing; older TMDB-only films use `year ≥ currentYear-1` fallback. 30-day post-theatrical threshold, 365-day cap, 6-day re-check cooldown, 14-day rejection cooldown. Spec at `docs/superpowers/specs/2026-05-08-itunes-availability-cron-design.md`. (2) **Force-change-password admin flow:** Admin sets a temp password from `/admin/users/[id]` → `must_change_password` flag (mig 0174) flips → middleware redirects flagged users to `/auth/change-password` until they pick a new one. Sign-out escape hatch on the change-password page. Coexists with the existing email-based reset (which only works for real-email users; synthetic-email signups can't receive email). (3) **Invite cookie bug fix:** `/invite/[code]` was a Server Component that couldn't write cookies — every redeemed invite was silently rejected at signup. Converted to a Route Handler; expired UI moved to its own `/invite/expired` page.

**Previously shipped (2026-05-07):** Five things. (1) **Invite codes / cold-start gate (#40):** Hard signup gate behind multi-use invite codes (5 per code). `invite_codes` + `invite_uses` tables (mig 0172 + 0173 fixes). DB trigger auto-creates one code per user on profiles INSERT. `burn_invite_code` PL/pgSQL RPC for race-safe increment. Cookie bridge: `/invite/[code]` validates → sets `fg_invite_code` cookie (24h) → redirects to `/auth/signup`. Gate in `signUp` action (`INVITE_GATE=1` env flag — delete to open signup, no code change). Settings page: "Your Invite Link" block with copy button + usage counter. Admin panel at `/admin/invite-codes` — create batch codes, revoke, usage table. **Gate is LIVE on production.** Delete `INVITE_GATE` from Vercel env to open signup. (2) **og:image for film pages:** `/api/og/film/[id]` route via `ImageResponse` — poster left, title/meta/description right, Film Goblin branding. `generateMetadata` on `/film/[id]` now uses the OG URL. (3) **Delete account:** `deleteAccount()` server action + `DeleteAccountSection` in settings — username-confirm gate before hard-delete via service-role. (4) **Film request / Summon (#39):** "Summon it →" on empty discover state → `FilmRequestSheet` multi-step flow. `film_requests` + `film_request_users` tables (mig 0170, 0171). Admin queue at `/admin/film-requests`. (5) **Admin password reset + feed tab fixes + watchlist search + admin last-activity** (see prior session for details).


**Previously shipped (2026-05-05):** Sticky sidebars on /home (`LedgerPanel` left, `GoblinRecommends` right); `goblin_pick` table (mig 0164) + `/admin/goblin-pick`; Add Film modal (admin-only, `UserMenu`); merged `feature/local-theater-alerts`; `FollowedActivityFeed` rewritten to use `groupFeed` + `FeedRow`.

For full history of all 39 sub-projects → `docs/sub-project-history.md`.

**Next up:** Nothing queued. **Invite gate is live**, **iTunes availability cron is live** (first scheduled run Mon 2026-05-11 14:00 UTC). Pre-launch high-priority: real sender email domain via Resend (Resend sandbox blocks digests reaching real users); list detail page `/lists/[id]` (currently dead-ends from feed). Adjacent quick wins: review fuzzy-match candidates at `/admin/itunes-candidates` after first cron run; trailer surface on `/film/[id]` (mig 0150 + `fg-trailers` populate columns, no UI); threaded comment replies; `/settings` handle validation (regex mismatch with onboarding).

**Open threads:**
- **iTunes cron first run.** First scheduled trigger Mon 2026-05-11 14:00 UTC. Watch `/admin/itunes-candidates` after — backfill of existing TMDB-only films may queue 5–15 entries. Use the `Confirm match` / `Reject` buttons. Rejection cooldown is 14 days before the cron retries that film. Manual smoke-test requires CRON_SECRET (encrypted in Vercel env, view-only via dashboard).
- **3 films still untagged** — Materialists, Smashing Machine (both not-horror catalog stragglers — could be deleted from `films` entirely), and The Surrender (2025 indie I haven't seen — needs manual review).
- **Sub-project #33 RLS tests not run locally.** Colima Docker socket issue. Run on the other machine / in CI.
- **Recommender v3 unverified at user scale.** Watch /for-you; tune `LENGTH_PENALTY_GAMMA`, `AVERSION_LAMBDA`, or IDF clamp bounds (all single-line constants) if rankings feel off. `calibration.ts` deleted in PR #139 — if %-display is revived, rebuild from scratch with LOO validation.
- **Sub-project #25 deferred:** threaded comment replies + "Reply"/"View N replies" UI; emoji quick-react strip; `LikersBottomSheet` for comment likes; comment editing/pagination/@-mentions/markdown.
- **Sub-project #28:** AvatarEditor `react-easy-crop` overlay against `#141414` may read dim — unverified.
- **Sub-project #29:** Chips + textarea in RecommendModal may push composer off-screen on small phones with keyboard up. Fix: shrink chips to 32px or collapse chip row when keyboard opens.
- **`fg-trailers/`** in monorepo. `cargo run --release` from `fg-trailers/`. Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `fg-trailers/.env`. Trailer columns exist (mig 0150), no UI reads them yet.
- **`passwords.txt`** at repo root (gitignored) — Supabase prod pooler URL + password. Second machine: pull via `npx vercel env pull app/.env.local --yes --environment=production`.
- **Supabase "Confirm email" toggle stays ON.** Synthetic-email signups bypass via `email_confirm: true`. Don't flip it off.
- **`onboarded_at` backfill:** Mig 0135 sets `onboarded_at = created_at` for existing profiles. To force a user through onboarding again, null it directly in DB.
- **Genre filter on `/films` is unwired.** `films.genre_primary` exists (iTunes raw category strings) but no UI reads it.
- **Rate-reminder cron** (mig 0146 + `/api/cron/send-rate-reminders`) runs daily at 11:00 UTC. Opt-out via `profiles.notify_rate_reminders`. Bell deep-links to `/watched?rate=<watched_id>`.
- **B2 deferred:** coven-scoped signals on `/p/[username]`, owned + review badges, most-watched sort on `/films`. Coven rating pills on poster grids (`coven_rating_pct`) is the fast follow-up.
- **`PosterQuickAdd` `initialOnWatchlist`** — do NOT drop it. Search mode lifts the watchlist filter; matched watchlisted films return `on_watchlist: true`. The prop drives button state.
- **Types regen.** `app/lib/supabase/types.ts` has a hand-edit warning block listing all manually-added columns. Run `gen:types`, then re-apply every listed edit before committing.
- **`/wrapup` slash command** at `.claude/commands/wrapup.md` (local only, untracked).
- **iOS splash assets** baked into home-screen install. PR #66 fix only takes effect after remove + re-add. Stale installs keep cached splash.

## Remote

Private repo at [rexnowacki/film-goblin](https://github.com/rexnowacki/film-goblin). `origin/master` is default. Deployed to Vercel as `film-goblin` (skulldrinker team) at https://film-goblin.vercel.app. Vercel linked via CLI; `.vercel/project.json` checked in at repo root.

**Deploy rule: always run `npx vercel deploy --prod --yes` from the repo root.** See the Vercel gotcha below before deploying from anywhere else.

## Git workflow

I work on the same codebase on two machines, as if I'm two devs. Both follow the same protocol so we don't step on each other.

**Always-on rules:**
- Never commit directly to `master`. Always work on a feature branch.
- Use descriptive branch names like `feature/spell-card-balance`.
- Commit frequently with clear messages; push when work pauses.
- Open PRs rather than merging directly.

**Stay in sync with `git fetch`** — the other dev may have merged work since you last looked. `git fetch` updates `origin/*` refs without touching the working tree.

- **Before starting a branch:** `git fetch origin && git checkout master && git merge --ff-only origin/master`. `--ff-only` refuses to silently create a merge commit if local diverged.
- **Before pushing a long-held branch:** `git fetch origin`; if `origin/master` moved, `git rebase origin/master`. Resolves conflicts locally instead of in the PR.
- **Before deploying to prod:** `git fetch origin` so you confirm you're shipping current `master`.
- Prefer `git fetch` + explicit `merge --ff-only` / `rebase` over `git pull` — explicit is better for two-machine coordination.

**Coordination hot spots** — files where the two devs are most likely to collide:
- `CLAUDE.md` "Current state" section — both `/wrapup` runs edit the same paragraphs.
- `app/lib/supabase/types.ts` — hand-edited on machines without the Supabase CLI; regen on the other will clobber. Commit type edits in their own PR.
- `db/migrations/0NNN_*.sql` — numbered sequentially. If both devs add the same number, second-to-merge renumbers and bumps consumers.

## Packages in this repo

Six packages, deployed/run independently:

- **`app/`** — production Next.js 15 app (App Router, TS, Supabase SSR). UI, auth, server actions, API routes, cron endpoints. Deployed to Vercel. "The app" / "the UI" = this.
- **`worker/`** — price-tracking worker (TS, Node). Polls iTunes Search API, writes `price_history`, emits `price_alerts`. CLI (`npm run worker`) or via app's cron route at `app/app/api/cron/refresh-prices`. Tests: pg-mem + MSW.
- **`db/`** — schema package. All migrations (`db/migrations/0100_*` onward), RLS, triggers, DB-side tests. Applies to Supabase Postgres.
- **`notifier/`** — notifications package. Email via Resend + web push. Consumed by `app/app/api/cron/send-notifications`.
- **`fg-trailers/`** — Rust TUI for curating YouTube trailer URLs on `films` rows. Local-only admin tool; talks to Supabase via service-role REST. Build: `cargo run --release` from the package dir. Schema lives in `db/migrations/0150_film_trailers.sql`.
- **`src/`** — original Vite + React design prototype. Legacy reference, mocked data. Don't make feature changes here; production = `app/`.

Plus `film-goblin/` — original Claude Design handoff bundle (HTML/JSX + chats). Read-only.

Routing: UI → `app/`. Prices/iTunes/scheduled → `worker/` + app cron. Schema/RLS/triggers → `db/migrations/`. Email/push → `notifier/`.

## Node version

Node 20 required. Repo pins via `.nvmrc` but system default is often Node 16 (too old for Vitest and Vite 5). Before any `npm`/`tsx`/`node`:
- `nvm use 20` (sets PATH for the shell), OR
- Prefix one-shot: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`

Background/parallel bash tool calls don't share shell state, so `nvm use 20 && npm …` then `npm …` in another call won't work. Use the PATH prefix for one-shots.

## Commands

### Frontend prototype (`src/`) — from repo root
```
npm run dev        # Vite dev server on 5173
npm run build      # → dist/
npm run preview    # serve build
```
No tests; visual prototype. Verify via dev server + the route switcher (top-left).

### Production app (`app/`) — from `app/`
```
npm run dev           # next dev :3000
npm run build         # next build (also runs in Vercel deploy)
npm run start         # serve build locally
npm run typecheck     # tsc --noEmit
npm run test          # vitest run (currently none)
npm run gen:types     # regen lib/supabase/types.ts from local Supabase
```
Real Supabase needed for auth-gated pages — env in `app/.env.local`. Deploy: `npx vercel deploy --prod --yes` **from repo root only** — see Gotchas.

### Database (`db/`) — from `db/`
```
npm test              # migrations smoke (pg-mem)
npm run test:rls      # RLS + trigger suite (testcontainers Postgres)
npm run test:all
npm run typecheck
npm run migrate       # apply db/migrations/*.sql against DATABASE_URL
```
`test:rls` uses real Postgres via Docker so RLS, triggers, JSON aggregates execute for real. `test` is fast pg-mem and does NOT exercise RLS.

### Notifier (`notifier/`) — from `notifier/`
```
npm test              # vitest
npm run typecheck
```
Library only — no CLI. Consumed by `app/app/api/cron/send-notifications/` via the `film-goblin-notifier` file: dependency.

### Worker (`worker/`) — from `worker/`
```
npm test                            # vitest
npm run test:watch
npm test -- tests/diff.test.ts      # single file
npm test -- -t "shouldAlert"        # single test
npm run typecheck
npm run migrate                     # apply SQL migrations against DATABASE_URL
npm run seed                        # curated iTunes search → ~500 films
npm run worker                      # one pass of price-refresh
npm run add-film -- 1468845007      # admin: upsert by iTunes trackId
```
Tests use pg-mem + MSW (no real DB or network). Seed/worker/add-film expect real `DATABASE_URL` in `worker/.env`. Production refresh runs via Vercel Cron hitting `app/app/api/cron/refresh-prices/`; `runOnce` is imported as a file: dependency. `npm run worker` is still valid for local invocation.

### Gotcha: `npm run migrate` lives in two places
Both `worker/` and `db/` have `migrate`. They are NOT the same.
- `db/ npm run migrate` — `db/migrations/0100_*` onward, the **canonical schema** (profiles, follows, coven, watchlists, lists, reviews, recommendations, activity, activity_reactions, library, notifications, avatars).
- `worker/ npm run migrate` — `worker/migrations/`, the worker's legacy stub schema (films, price_history, price_alerts, watchlists stub). Mig `0100_drop_watchlists_stub.sql` in `db/` drops the stub.

Run `db/` migrations against prod Supabase; `worker/` migrations only when bootstrapping a fresh local worker DB.

## Architecture

### Worker pipeline (`worker/src/`)

One responsibility per module — don't blur boundaries:

- `itunes.ts` — HTTP + parsing. `fetchPrices` (retry on 429/5xx), `searchFilms`, `parseFilm`, `upscaleArtworkUrl`.
- `diff.ts` — pure decisions. `computeDiff`, `shouldAlert`. No DB, no HTTP.
- `db.ts` — every SQL statement. Read helpers + transactional write helpers. **NUMERIC and BIGINT coerced to JS numbers at this boundary** (`numOrNull`, `Number(itunes_id)`). Downstream never sees strings from these columns.
- `digest.ts` — in-memory per-run stats. `render()` emits one log line.
- `worker.ts` — orchestrator. `runOnce(client, opts)` selects stalest, fetches in 100s, diffs, writes history, fires alerts. No raw SQL — all via `db.ts`.
- `seed.ts` — bootstrap only.
- `migrate.ts` — lightweight SQL runner. Applies `migrations/*.sql` in order against `_migrations`.

`worker/scripts/` are thin CLI adapters — no business logic.

### Production app (`app/`)

Next.js 15 App Router, TS, Supabase SSR. File map:

- `app/app/` — routes. One folder per route (`home/`, `films/`, `film/[id]/`, `watchlist/`, `library/`, `lists/`, `people/`, `coven/`, `p/[username]/`, `settings/`, `onboarding/`, `admin/`, `auth/{signin,signup,forgot,reset}/`, `api/{auth/callback,cron/*,unsubscribe/[token]}/`). Plus landing page at `app/app/page.tsx` and typed PWA manifest at `app/app/manifest.ts`.
- `app/app/globals.css` — single CSS file, the entire design system. Tokens at `:root`, responsive overrides at `@media (max-width: 720px)`, utilities (`.h-display`, `.container`, `.stackable`, `.grid-auto`, `.check-zine`, `.btn` family, `.films-sort-chip`, `.heart-*`, `.bottom-sheet-*`, `.likers-*`), grain/halftone, hero overrides. **Font-usage rule lives in a comment block above `.h-display`** — Rubik Wet Paint for chrome/page titles; DM Serif Display for content titles. Secondary-button rule (destructive blood-outline vs non-destructive bone-outline) above `.btn`.
- `app/components/` — client components (`TopNavChrome`, `FeedTabs`, `FilmPoster`, `UserMenu`, `RecommendModal`, `AvatarEditor`, `WatchlistButton`, `OwnedButton`, `FilmActions`, `FollowButton`, `CovenButton`, `HeartButton`, `BottomSheet`, `LikersBottomSheet`, `Avatar`, etc.). `TopNav.tsx` is a server shim around `TopNavChrome`. **`TopNavChrome` pads itself with `env(safe-area-inset-top)`** so iOS standalone PWA mode doesn't overlap the notch.
- `app/lib/supabase/` — SSR + client Supabase factories. `createClient()` from `server.ts` in server components/route handlers; from `client.ts` in `"use client"`. `types.ts` regenerated via `npm run gen:types`; redo after every migration.
- `app/lib/queries/` — read-side DB helpers, one file per aggregate (`films`, `watchlists`, `library`, `reviews`, `activity`, `activity-reactions`, `coven`, `profiles`, `lists`, `sort-watchlist`).
- `app/lib/actions/` — server actions (form submits, mutations). `auth`, `profile`, `watchlists`, `library`, `lists`, `recommendations`, `reactions`, `follows`, `coven`, `onboarding`.

**Conventions:**
- **Composite PK on join tables.** `activity_reactions` and `library` use `(user_id, target_id)` — no surrogate `id`. Saves a SELECT-then-INSERT race on toggles.
- **Private-action + public-wrapper.** Actions split `_doThing(client, …)` (Supabase injected, testable) and `doThing(…)` (creates server client, calls private form, calls `revalidatePath`). See `_addToLibrary`/`addToLibrary`, `_toggleReaction`/`toggleReaction`.
- **`films_with_stats` extends additively.** `DROP VIEW IF EXISTS … CREATE VIEW …` and add new columns at the END. Consumers pick explicit column lists, never `select("*")`.
- **PostgREST nested embeds may type as array-vs-object.** `films:films!inner(…)` always returns one row but generated types sometimes emit `T[]`. Workaround: `as never` on the prop boundary (e.g. `<FilmPoster film={r.film as never} />`); see `/films` and `/library`.
- **RLS test bootstrap.** New suites copy `db/tests/rls/library.test.ts` shape: `seedFixtures` once in `beforeAll` (`userA/B/C + filmId`), `beforeEach` resets state via service_role, `bond()` helper for `coven_members` edges respecting the `user_a_id < user_b_id` invariant.
- **Env-blocked action tests.** Integration tests needing real Supabase use `describe.skipIf(!hasEnv)(…)` PLUS `if (!hasEnv) return;` guards on lifecycle hooks so the file reports green-skipped instead of red-crashed. See `app/tests/actions/library.test.ts`.
- **iOS standalone PWA quirks.** `100dvh` (not `100vh`) on top-level page wrappers. `viewportFit: "cover"` + `themeColor` on `Viewport` export in `layout.tsx`. `appleWebApp.statusBarStyle: "black-translucent"` on metadata. Sticky TopNav padded w/ `paddingTop: "env(safe-area-inset-top)"`.

Single 720px mobile breakpoint set in `globals.css`'s `@media (max-width: 720px)` blocks + `.mobile-only` / `.desktop-only` / `.mobile-only-flex` helpers. `.stackable` grids force `grid-template-columns: 1fr` at ≤720px regardless of `--stack-template`.

### Design prototype (`src/`) — legacy

Visual reference for the zine aesthetic. Vite + React, no auth, mocked data. Not deployed; doesn't reflect production. Make UI changes in `app/`.

- `App.jsx` — route switcher (top-left), tweaks panel (bottom-right ✦), picks one page by route id from localStorage. 12 routes.
- `data.js` — mocked data.
- `components/` — 6 reusable primitives (`FilmPoster`, `PriceDrop`, `Stars`, `Avatar`, `HalftoneBar`, `TopNav`, `IOSFrame`).
- `pages/` — one file per route. `MobilePage` is a single-page showcase of 10 mobile artboards.
- `styles.css` — original design system; `app/app/globals.css` is the evolved version.

### Design system

Aesthetic lock-ins (don't drift without buy-in):
- Palette: bone `#F3ECD8`, void `#0A0A0A`, accent ink ∈ {hot pink `#FF2D88` (default), acid yellow `#F5D300`, orange `#FF6A1F`, blood `#D93A2E`}. Live-switched via `[data-accent="..."]` on `<html>`; tweaks panel drives it.
- Type: Rubik Wet Paint for display/wordmark, DM Serif Display for heads, IBM Plex Sans/Serif/Mono for UI + review body. Prior blackletter (UnifrakturCook) was reverted — keep Rubik Wet Paint.
- **Storefront labeling:** user-facing strings say "Apple TV" only. Internal identifiers (`itunes_id`, `itunes_url`, `itunes.apple.com/lookup`) stay because those are the API's names.
- No faked illustrations. Posters are colored `bg`/`accent`/`fg` blocks w/ a shape primitive plus halftone + SVG grain.

## Production stack

Committed direction (Next.js + Supabase + Vercel Cron, etc.) lives in **`docs/superpowers/stack.md`** — read before proposing tech choices, update there (not here).

## Sub-project history

Full table moved to **[`docs/sub-project-history.md`](docs/sub-project-history.md)**. 27 sub-projects shipped to date, each with a spec under `docs/superpowers/specs/` and (usually) a plan under `docs/superpowers/plans/`. Read the spec when working on a related area — canonical record of design decisions. New rows get appended to the history file as sub-projects ship.

## Queued sub-projects

Nothing queued. See `docs/roadmap.md` for prioritized candidates.

## Gotchas

- **`git commit -m` heredocs intermittently mangle the message** in this environment — commits land w/ subject `"Error:  does not exist."` when using `$(cat <<'EOF' ... EOF)`. Workaround: `Write` to `/tmp/msg.txt`, then `git commit -F /tmp/msg.txt`. `--amend -F` from the same file fixes a mangled message without losing the tree.
- **pg returns NUMERIC and BIGINT as strings.** Worker coerces at the `db.ts` boundary. New DB reads should do the same — don't let string-typed numbers leak into `diff.ts` or `worker.ts`.
- **pg-mem 3.0.4 does NOT silently no-op `CREATE EXTENSION`** — it throws on unknown extensions. `worker/tests/helpers/db.ts` uses `mem.registerExtension("pgcrypto", ...)` to bridge so real-Postgres migration text stays unchanged.
- **Vite dev server needs Node ≥ 18** — Node 16 fails w/ `crypto$2.getRandomValues is not a function`. Always `nvm use 20`.
- **Worktrees live under `.worktrees/`** (gitignored). The `superpowers:finishing-a-development-branch` skill cleans them up on merge.
- **Vercel deploys must run from the repo root. Never from `app/` and never from `<worktree>/app/`.** Vercel CLI resolves `.vercel/project.json` from CWD only — does NOT walk up. Real project `film-goblin` has `rootDirectory: app` set in dashboard, so building from repo root is correct; Vercel applies that on top of the uploaded tree.
  - Running `vercel deploy --yes` from `app/` w/o a pre-populated `app/.vercel/project.json` silently **creates a new project** named after CWD (e.g. `skulldrinker/app`) — garbage URL. Delete w/ `npx vercel project rm <name>`.
  - Copying root's `.vercel/project.json` into `app/.vercel/` and deploying from there: Vercel uses the right project but applies `rootDirectory: app` on top of CWD `app/`, tries to build `app/app/`, fails w/ "Couldn't find any `pages` or `app` directory".
  - **For worktrees**, copy root's `.vercel/project.json` into the **worktree root** (`.worktrees/<name>/.vercel/project.json`), then deploy from the worktree root — NOT from `<worktree>/app/`. Sanity: `ls -la .vercel/project.json && pwd` — path should end in worktree root or repo root, never `/app`.
- **`BRAVE_SEARCH_API_KEY` lives in Vercel env (Production, Preview, Development — sensitive) and `app/.env.local`.** Used only by `app/lib/actions/admin/apple-tv-search.ts` (admin "Search Apple TV" widget on `/admin/films/new`). Rotate: regen at https://brave.com/search/api/ → `npx vercel env rm BRAVE_SEARCH_API_KEY <env>` + `add` for each of production/preview/development → update `app/.env.local` → redeploy from repo root.
- **Supabase prod DB via session-mode pooler.** `db.<project>.supabase.co:5432` is IPv6-only and unreachable from this machine. Migrate runner connects through `aws-1-us-west-1.pooler.supabase.com:5432` w/ user `postgres.<project-ref>`. Connection string + password in `passwords.txt` at repo root (gitignored). Source via `set -a; source app/.env.local; set +a` before `npm run migrate`.
- **pg-mem (used by `db/ npm test`) doesn't parse `GRANT`, `DROP VIEW`, or correlated-subquery views.** `db/tests/helpers/pg-mem.ts` strips these from migrations before applying — RLS, GRANT, CREATE/DROP VIEW, and any file w/ `backfill` in name. Smoke only asserts table presence. New migrations can use any production-correct DDL — extend the strip filters in `pg-mem.ts` rather than rewriting the migration.
- **`coven_members` is a graph-edge table**, not (coven_id, user_id). Schema is `(user_a_id, user_b_id, created_at)` w/ `user_a_id < user_b_id` CHECK. Check "are A and B coven mates" both directions: `(cm.user_a_id = A AND cm.user_b_id = B) OR (cm.user_a_id = B AND cm.user_b_id = A)`. Tests use a `bond(client, x, y)` helper that swaps args.
- **PostgREST nested embed types may emit as array even when one row.** `.select(\`film:films!inner(…)\`)` always returns one row but `Database` types sometimes emit `T[]`. Workaround: `as never` on the consumer boundary (`<FilmPoster film={r.film as never} />`). Don't sprinkle `as any` — cast at the prop boundary.
- **iOS Safari standalone PWA needs `100dvh` AND safe-area padding.** Plain `100vh` includes URL bar's reserved space — `100dvh` (dynamic viewport) sizes correctly. Body min-height + page wrappers all use `100dvh`. With `appleWebApp.statusBarStyle: "black-translucent"`, content extends behind the notch — `TopNavChrome` adds `paddingTop: "env(safe-area-inset-top)"`. New pages w/ their own sticky chrome should do the same.
- **`describe.skipIf` PLUS per-hook env guards** — env-blocked integration tests (e.g. `app/tests/actions/library.test.ts`, `reactions.test.ts`) need both `describe.skipIf(!hasEnv)(…)` AND `if (!hasEnv) return;` in `beforeAll`/`beforeEach`/`afterAll`. Without hook guards, the lifecycle crashes on missing env BEFORE describe skips, file reports red. New integration tests follow the library file as template.
- **Adding a new `profiles` field is automatic via `{ ...fields }` spread.** `_updateProfile` in `app/lib/actions/profile.ts` does `const patch: ProfileUpdate = { ...fields };` — any field added to `ProfileFields` flows through to UPDATE. To wire end-to-end: add column in migration → regen types → add field to `ProfileFields` → add input + `save()` field-extraction in `SettingsForm.tsx`. No new server action needed.
