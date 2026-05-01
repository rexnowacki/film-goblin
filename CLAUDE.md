# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

> **Convention:** This section is updated before each session close so the next session can pick up cold. Update it at the end of every session — what just shipped, what's next, any open threads worth carrying forward.

**Last updated:** 2026-05-01 (#25 comment polish+likes, #26 username on utility, #27 like_on_comment notification)

**Last shipped:** Four sub-projects + polish/fix PRs. 13 PRs merged (#61–#73), 7 migrations applied to prod (0137 → 0143):

1. **Username rename (#21, PRs #62/#63):** `profiles.handle` → `profiles.username` everywhere (column, route param `[username]`, types, actions, copy). Migration `0137` renames + recreates unique-on-lower index + replaces `on_auth_user` trigger to read `raw_user_meta_data->>'username'`. Signup drops email — synthetic `<username>@noreply.film-goblin.app` minted via `auth.admin.createUser({ email_confirm: true })`. Signin takes one "Username or Email" identifier (sniffs `@`). New `profiles.email_added_at` (mig `0138`) + email-change trigger. /settings gains "Add Email" / "Update Email" branch. Notifier filters on `email_added_at IS NOT NULL`. PR #65 also dropped display name from signup — defaults to username via trigger COALESCE.
2. **Per-kind email toggles (#22, PR #64):** mig `0139` adds 4 bool cols (`email_price_drops`, `email_coven_recs`, `email_comments`, `email_coven_invites`); backfilled `email_price_drops` from `email_notifications_enabled`. /settings shows "Email me when…" checklist. Notifier filters on `email_price_drops`. Unsubscribe sets all four FALSE. Token rotation triggers when re-enabling any kind from fully-opted-out.
3. **Roles + badges (#23, PRs #68/#69):** 3-tier — `goblin` / `witch` / `high_goblin` (premium, dormant). Mig `0140` adds `profiles.role` w/ CHECK + tightened RLS UPDATE policy (clients can't write role). New `<RoleBadge />` (inline-SVG pentagram + goblin head) renders only on `/p/[username]`. /admin/users/[id] gets pill-button Role section that auto-toggles staff row. /admin/users list shows tiny role pill.
4. **Coven rating (#24, PRs #70/#72/#73):** RT-style binary recommend per watch. Mig `0141` adds `watched.recommended BOOLEAN NULL`; extends `films_with_stats` w/ `coven_rating_count` + `coven_rating_pct` (latest-per-user dedup, NULL until count≥5). WatchModal "Verdict (optional)" pill pair. New `<CovenScore />` on `/film/[id]` w/ tiers — Anointed ≥90, Coven approved ≥60, Coven divided ≥40, Cursed <40. Mig `0142` extended `activity_on_watch_insert` trigger to write `recommended` into payload (verdict pills on `watch_logged` feed rows). Mig `0143` backfilled the 4 existing rated watches via ±5s `created_at` join.

Polish: (a) /onboarding canvas match (PR #61) — void wrapper, restored TopNav/BottomNav, dropped #2a2a2a dividers; (b) iOS PWA splash fix (PR #66) — dropped no-media `apple-touch-startup-image` fallback that confused WebKit on 15 Pro Max; (c) onboarding film picker alignment (PR #67) — `<button>` cells leak inline-block baseline alignment, fixed w/ `display: block; align-self: start`; (d) comment thread fix (PR #71) — kept thread open after posting; switched viewer-id from `getUser()` (network) to `getSession()` (cached) so Post button enables on fast taps.

All 7 migrations + 13 PRs deployed. Live at https://film-goblin.vercel.app.

**Next up:** Nothing queued. Sub-project #25 just shipped — likes on comments work end-to-end. Deferred follow-ups for the comment surface: threaded replies, emoji quick-react strip, send-icon header variant (proto 2), comment-likers sheet, `like_on_comment` notification kind. Older quick wins still open: rating pills on poster grids, watch-note staleness UPDATE trigger (now closed by mig 0145), /settings username regex gate, OAuth `email_added_at` backfill. Real projects offered: Your Ledger widget on /home, real sender email domain via Resend, list detail page `/lists/[id]`. Roadmap entries: rate-reminder for unrated watches, feed page parity + user-search, feed infinite scroll (20-at-a-time, cursor on `created_at`).

**Open threads:**
- **Sub-project #25 deferred follow-ups:** threaded comment replies + "Reply"/"View N replies" UI; emoji quick-react strip above composer; send-icon header variant (proto 2); `LikersBottomSheet` for comment likes (tap count → see who liked); comment editing/pagination/@-mentions/markdown. (`like_on_comment` notification shipped in #27.)
- `passwords.txt` at repo root holds Supabase prod pooler URL + password (gitignored). On the second machine `passwords.txt` is missing — pull `DATABASE_URL` via `npx vercel env pull app/.env.local --yes --environment=production` from repo root instead.
- **Supabase dashboard "Confirm email" toggle stays ON.** Synthetic-email signups bypass it via `email_confirm: true`; toggle now only governs email-CHANGE confirmation from /settings. Don't flip it off.
- **`/settings` username validation gap.** OnboardingForm + `_completeOnboarding` + signUp action enforce `/^[a-z0-9._]+$/`, but `/settings` `_updateProfile` does a bare string update. Small follow-up.
- **OAuth users land with `email_added_at = NULL`** post-PR-#63. Email-change trigger only fires on transitions; OAuth users come in with email already set. Effect: no email notifications until they touch /settings. Five-line fix in `/api/auth/callback/route.ts`.
- **`email_notifications_enabled` is now redundant** post-#22. Settings stops writing it; notifier reads `email_price_drops`. Kept for backward compat — drop after a soak window.
- **Notifier test helper inline-ALTER pattern is brittle.** `notifier/tests/helpers/db.ts` inline-applies migs 0137/0138/0139 because pg-mem can't parse `CREATE OR REPLACE FUNCTION`. Each new profile-touching migration needs another inline patch. Worth a one-time refactor to apply ALL `db/migrations/*.sql` w/ a generic strip pass (like `db/tests/helpers/pg-mem.ts` does).
- **Watch-note + verdict staleness — closed by 0145.** Mig `0145` adds an AFTER UPDATE trigger on `watched` that syncs `note` + `recommended` into the matching `watch_logged` activity payload via the same ±5s `created_at` window 0143 used for backfill.
- **`tooth tony` handle was patched in prod** (`teeth tony` → `teethtony`, display_name preserved) — see PR #58.
- **`onboarded_at` backfill premise.** Mig 0135 backfills existing profiles w/ `onboarded_at = created_at`. If a pre-mig user didn't actually finish onboarding and you want to force them through the new flow, null `onboarded_at` directly in DB.
- **Captured-but-not-persisted onboarding fields are gone.** `genres`/`storefronts`/`followUserIds` removed from `OnboardingPayload` in PR #52. To restore: add columns + types + `SettingsForm` fields together (Path B from onboarding-redesign spec).
- **Genre filter on `/films` is unwired.** `films.genre_primary` exists (iTunes raw category strings) but no UI reads it. Data source if we add a genre chip to `FilmsSortChips`.
- **Notifications deferred:** threaded comment replies, comment editing, email notifications for comments, comments on grouped feed rows, @-mentions / markdown, spam reporting, comment pagination.
- **Rate-reminder cron (mig 0146 + `/api/cron/send-rate-reminders`)** runs daily at 11:00 UTC. Inserts one `rate_reminder` notification per user with ≥1 unrated `watched` row older than 7 days, deduped on existing reminders within the past 7 days. Opt-out via `profiles.notify_rate_reminders` (Settings toggle). Bell row deep-links to `/watched?rate=<watched_id>` which auto-opens WatchModal in edit mode for the oldest unrated watch.
- **B2 deferred:** coven-scoped signals on `/p/[username]`, owned + review badges, most-watched sort on `/films`, badges on `/library`/`/home` marquee/`/watched` strip, `/film/[id]` stat block beyond single caption, compact unit display past 99+. Coven rating pills on poster grids (using new `coven_rating_pct`) is a fast follow-up here.
- **`PosterQuickAdd` `initialOnWatchlist`** is always `false` for visible films on `/films` (since #40 filtered watchlisted). Kept for defensive correctness if reused on a non-filtering surface.
- **Types regen.** `app/lib/supabase/types.ts` hand-edited for `profiles.email_added_at`, `profiles.email_*` (4 cols), `profiles.role`, `watched.recommended`, `films_with_stats.coven_rating_*`. Future regen on the other machine will need to preserve all unless every migration has been re-applied locally.
- **`/wrapup` slash command** at `.claude/commands/wrapup.md` (untracked, project-local on this machine only). Open question: commit `.claude/commands/` (gitignoring `.claude/settings.local.json`) so the other machine gets it — or keep both local-only.
- **`docs/in-repo-tickets-setup.md`** — proposal for `tasks/{todo,in-progress,done}/` file-per-ticket coordination, still local/uncommitted.
- **PR #30 (activity-comments spec + plan docs)** status unchecked this session.
- **`feedback_ios_zoom_horizontal_overflow.md`** auto-memory: when a user reports "page is zooming in" on iOS w/o tap, suspect horizontal overflow + scroll-x:0 before reaching for `touch-action` / 16px-input fixes. Ask for a screenshot first.
- **iOS splash assets are baked into the home-screen install.** PR #66 fix only takes effect after remove + re-add of the icon. Stale installs keep the cached splash.

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

Five packages, deployed/run independently:

- **`app/`** — production Next.js 15 app (App Router, TS, Supabase SSR). UI, auth, server actions, API routes, cron endpoints. Deployed to Vercel. "The app" / "the UI" = this.
- **`worker/`** — price-tracking worker (TS, Node). Polls iTunes Search API, writes `price_history`, emits `price_alerts`. CLI (`npm run worker`) or via app's cron route at `app/app/api/cron/refresh-prices`. Tests: pg-mem + MSW.
- **`db/`** — schema package. All migrations (`db/migrations/0100_*` onward), RLS, triggers, DB-side tests. Applies to Supabase Postgres.
- **`notifier/`** — notifications package. Email via Resend + web push. Consumed by `app/app/api/cron/send-notifications`.
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

Every sub-project gets a spec + plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`. Read the spec when working on related areas — canonical record of design decisions. Shipped to date:

| # | Name | Spec |
|---|---|---|
| 1 | Apple data source — `worker/` package | `2026-04-20-apple-data-source-design.md` |
| 2 | Database schema + RLS — migrations `0100`–`0117` | `2026-04-21-schema-rls-design.md` |
| 3 | Next.js scaffold + auth + UI port — `app/` | `2026-04-21-nextjs-app-design.md` |
| 4 | Worker HTTP mount (Vercel Cron) | `2026-04-22-worker-cron-mount-design.md` |
| 5 | Notifications pipeline — `notifier/` + Resend | `2026-04-22-notifications-pipeline-design.md` |
| 6 | Social — coven, follows, recommendations, activity | `2026-04-23-social-features-design.md` |
| 7 | Auth polish — password reset, email verification, Google sign-in | `2026-04-23-auth-polish-design.md` |
| 8 | Mobile responsive (Tier-A) — 720px breakpoint, hamburger nav | `2026-04-23-mobile-responsive-design.md` |
| 9 | Mobile polish — filter rows, `.h-display` tuning, `.check-zine`, font-usage rule | `2026-04-23-mobile-polish-design.md` |
| 10 | Coven feed hearts (A) — `activity_reactions`, `HeartButton`, `LikersBottomSheet`, universal heart | `2026-04-24-coven-feed-hearts-design.md` |
| 11 | Discovery chrome polish (B1) — chip-row sort on `/films`, dropped Chapter II eyebrow, installable PWA shell | `2026-04-25-discovery-chrome-polish-design.md` |
| 12 | Library — Owned (C1) — `library` table + RLS, `/library`, `OwnedButton` + `FilmActions`, auto-watchlist-cleanup, `films_with_stats.owned_count` | `2026-04-25-library-owned-design.md` |
| 13 | Activity Feed Grouping (D1 / #52) — read-time `groupFeed`, `FeedItem` discriminated union, `ActivityWatchlistAddedGroup`, 30-min window + 24-hr ceiling + min-3 size, watchlist-adds only in v1 | `2026-04-25-activity-feed-grouping-design.md` |
| 14 | Watched Action (C2) — `watched` event-stream + `/watched` (stats hero + month-grouped diary), `WatchModal`, `WatchedButton`, `watch_logged` activity kind + trigger + groupFeed registration, `broadcast_watched` toggle | `2026-04-25-watched-action-design.md` |
| 15 | Social signal on posters (B2) — `films_with_stats.watcher_count`; `FilmPoster` opt-in `watchlistCount`/`watcherCount` w/ corner pill; `/films` badges; `/film/[id]` hero caption | `2026-04-25-social-signal-posters-design.md` |
| 16 | Covenfolk merge — unified `/people` + `/coven` into one page at `/coven`. Pending-invites strip + two-pane "Your Coven \| Find People" body. Inline four-state invite button. New `getRelationshipMap`, `excludeUserIds` arg on `getProfilesBySearch`, new `SearchPersonRow`. `/people` redirects. No schema. | `2026-04-26-covenfolk-merge-design.md` |
| 17 | Activity comments — flat 140-char comments on single-event rows. New `activity_comments` (0129) + `comment_on_activity` notification kind + trigger (0130/0131). `CommentButton` + `ActivityCommentThread` w/ optimistic insert/delete, "Hide"/"Delete" pills. Bell rows deep-link to `/home?activity=<id>` w/ auto-expand. | `2026-04-27-activity-comments-design.md` |
| 18 | Watchlist redesign — collapsed row layout to a poster grid like `/library`. New `PosterDropBadge` (≥10% threshold) + caption-line "Apple TV · $9.99 →". `WatchlistSortChips` replaced native `<select>`. `WatchlistRow.tsx`, `WatchlistSortSelect.tsx`, ~110 lines `.watchlist-row*` CSS deleted. On-poster buy pill tried then removed; price folded into caption link. No migration. | `2026-04-29-watchlist-redesign-design.md` |
| 19 | Onboarding redesign — collapsed 723-line five-chapter ritual into a single-page form (handle, threshold slider, pick three films). Hero matches `/library`/`/watchlist`. Chapter labels, progress bar, blood-pact certificate, signature flourish — all gone. `OnboardingPayload` 7→3 fields (genres/storefronts/follow-seeding dropped). Films query server-rendered. No migration. | `2026-04-29-onboarding-redesign-design.md` |
| 20 | Identity at signup — handle + display_name on signup form; trigger reads `raw_user_meta_data` (mig 0136) w/ email-derived fallback for OAuth. `signUp` validates both, pre-checks handle uniqueness via `serviceRoleClient`. Handle auto-suggests from display_name and locks on manual edit. `OnboardingForm` pre-fills handle. Structural fix for the "teeth tony" 404 bug class. | `2026-04-29-identity-at-signup-design.md` |
| 21 | Username login + optional email at signup — PRs #62 (mechanical rename `handle`→`username` across ~64 files) + #63 (auth changes). Migs `0137` (rename + trigger update) + `0138` (`email_added_at` + email-change trigger). Synthetic `<username>@noreply.film-goblin.app` via `auth.admin.createUser({ email_confirm: true })`. Signin sniffs `@`. /settings "Add Email"/"Update Email" via new `updateEmail` action. Notifier filters on `email_added_at IS NOT NULL`. Dashboard "Confirm email" toggle stays ON for email-CHANGE confirmation. PR #65 dropped display name from signup too. | `2026-04-30-username-and-optional-email-design.md` |
| 22 | Per-kind email toggles — mig `0139` adds 4 bool cols (price drops, coven recs, comments, coven invites), backfill `email_price_drops` from `email_notifications_enabled`. /settings "Email me when…" subsection (only price drops actually send today). Notifier swap to `email_price_drops`. Unsubscribe sets all four FALSE. Token rotation on re-enable from fully-opted-out. `email_notifications_enabled` kept for compat. | (no spec) |
| 23 | User roles + badges (goblin / witch / high goblin) — mig `0140` adds `profiles.role` w/ CHECK; tightened RLS UPDATE to forbid client role changes. New `<RoleBadge />` (inline-SVG glyphs) on `/p/[username]` next to display_name h1, 28px. /admin/users/[id] Role section auto-toggles staff row. /admin/users list shows tiny role pill. high_goblin dormant — no billing yet. | (no spec) |
| 24 | Coven rating — RT-style binary recommend per watch. Mig `0141` adds `watched.recommended BOOLEAN NULL`; extends `films_with_stats` w/ `coven_rating_count` + `coven_rating_pct` (latest-per-user dedup, NULL until count≥5). WatchModal verdict pill pair. `<CovenScore />` on `/film/[id]` w/ tiers (Anointed/Coven approved/Coven divided/Cursed). Mig `0142` writes `recommended` into `watch_logged` activity payload. Mig `0143` backfilled the 4 existing rated watches via ±5s join. | (no spec) |
| 25 | Comment sheet polish + likes — mig `0147` adds `activity_comment_reactions` (composite PK `(user_id, comment_id)`, `TO authenticated` policies, `acr_bump_count()` trigger w/ `SECURITY DEFINER` maintaining `like_count` on `activity_comments`). New `toggleCommentReaction` action mirrors `toggleReaction`. Restyled `CommentSheet` to prototype 1: serif "Comments • N" header, 36px avatars, stacked username/timestamp/body, heart+count column, inline muted "Delete" text-link, viewer-avatar + rounded-pill composer w/ inline `N/140` counter and smart Post (text-link disabled / solid pink pill enabled). `BottomSheet.title` widened to ReactNode. `HeartIcon` extracted to shared component. `CommentItem` gains `like_count` + `liked_by_me`; `getCommentSummariesForActivities` takes a `viewerId` arg. | `2026-05-01-comment-sheet-polish-and-likes-design.md` |
| 26 | Username on utility surfaces — flipped 37 render sites from `display_name ?? username` to bare `username` across 17 files (10 activity components + LikersBottomSheet, SearchPersonRow, TopNavChrome, both notification rows, /coven, /p/[username] coven chips). `/p/[username]` h1 + main avatar still use `display_name ?? username`; /settings Display name input still editable; admin surfaces unchanged. No schema, no migration. | `2026-05-01-username-on-utility-surfaces-design.md` |
| 27 | `like_on_comment` notification — migs `0148` (enum + `notify_comment_likes` opt-out) + `0149` (`notify_like_on_comment` SECURITY DEFINER trigger on `activity_comment_reactions`). Recipient = comment author; self-likes filtered; opt-out skips the INSERT entirely. Bell row mirrors `comment_on_activity` payload + copy. Smarter grouping: `like_on_comment` keys on `payload.comment_id` (not actor) with threshold 2 — single liker reads "<liker> liked your comment", 2+ reads "N people liked your comment". /settings adds "Notify me when someone likes my comment" checkbox. | `2026-05-01-like-on-comment-notification-design.md` |

## Queued sub-projects

Nothing queued. Quick wins offered: rating pills on poster grids, watch-note staleness UPDATE trigger, /settings username regex gate, OAuth `email_added_at` backfill (the watch_logged verdict pill quick win shipped as PRs #72/#73). Real projects offered: Your Ledger widget on /home, real sender email domain via Resend, list detail page `/lists/[id]`. New roadmap entries: rate-reminder for unrated watches, feed page parity + user-search, feed infinite scroll (20-at-a-time, cursor on `created_at`).

**Tier-zero hygiene:** Done 2026-04-25. pg-mem smoke fixed at the helper layer, all action+admin test files retrofitted w/ `describe.skipIf`, `/watchlist` hero compressed to match `/films` + `/library`.

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
