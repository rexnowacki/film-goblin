# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

> **Convention:** This section is updated before each session close so the next session can pick up cold. Update it at the end of every session — what just shipped, what's next, any open threads worth carrying forward.

**Last updated:** 2026-05-05 (sticky sidebars, Goblin Recommends, Add Film modal, local-theater-alerts merge)

**Last shipped (2026-05-05):** Four things. (1) **Sticky sidebars on /home (desktop):** Left = `LedgerPanel` — 5 most-recently-price-dropped watchlist films ordered by `price_alerts.created_at DESC` (no shuffle; shuffle caused flicker on every `revalidatePath`). Right = `GoblinRecommends` — admin-set film pick + hardcoded dummy coven reviews. Both `position: sticky; top: calc(46px + env(safe-area-inset-top))` with `alignItems: "start"` on the grid parent. (2) **`goblin_pick` table (mig 0164):** single-row (`CHECK id=1`), admin-writable via staff RLS. New `/admin/goblin-pick` search page; Goblin Pick tile on `/admin`. Set via `/admin/goblin-pick` — WEAPONS is the current pick. (3) **Add Film modal:** `+ Add Film` button in UserMenu (admin only) opens `AddFilmModal` — fixed overlay wrapping `AddFilmClient`, Escape/scrim/success all close it. `FilmForm` gained `onSuccess?: () => void`; when absent + mode=create now redirects to `/admin/films/new` instead of the list. (4) **Merged `feature/local-theater-alerts`:** only conflict was `types.ts` Functions section; kept `acquire_cron_lock` (theirs) + `get_coven_watchers_for_film` / `get_other_watchers_for_film` (ours). 276 tests passing. Also: `FollowedActivityFeed` rewritten to use `groupFeed` + `FeedRow` — same grouping/language as main coven feed.

**Previously shipped (#38): Onboarding ritual redesign.** Replaced the single-page onboarding form with a three-step wizard that seeds taste preferences, watchlist, and social graph so new users land on `/home` with a meaningful feed. Step 1 (TasteStep): username input + 8 horror flavor cards (Folk Rot/Velvet Murder/Witchcraft/Flesh Trouble/Star Madness/Holy Terror/Slow Doom/Trash Magic) mapping to tag UUIDs via `laneTagMap`. Step 2 (FilmsStep): poster grid filtered client-side by selected lanes; ≥6 matches required before filtering kicks in, otherwise full editorial_starter set shown; min 3 picks to proceed. Step 3 (CovenStep): grid of `is_starter = true` profile chips, all pre-selected, user can deselect; zero is valid. `completeOnboarding` action extended to write `lane_tag_ids`, `max_price_usd: null` watchlist rows, and `follows` rows (drops `thresholdPct`). Mig `0163` adds `is_starter BOOLEAN NOT NULL DEFAULT false` + `starter_order INT` to `profiles`. New `getFollowedActivity` query (follows-scoped, enriched same as `getEnrichedActivity`). New `FollowedActivityFeed` component + "From the Goblins" section on `/home` (appears only when `followedActivity.length > 0`). Pure-logic layer fully unit-tested (taste-step-logic: 6 specs, films-step-logic: 6 specs, coven-step-logic: 4 specs). 267 unit specs total passing. Spec at `docs/superpowers/specs/2026-05-04-onboarding-ritual-design.md`, plan at `docs/superpowers/plans/2026-05-04-onboarding-ritual-plan.md`. Deployed to https://film-goblin.vercel.app. **Post-ship:** set `is_starter = true` + `starter_order` on staff profiles in Supabase dashboard — done.

**Previously shipped (#37): Recommender v3.** External math expert reviewed `algo.md` and flagged five concerns; this sub-project ships the corresponding patches. (1) Drop μ at scoring time — was applied at both affinity-construction and scoring, compounding to μ² (Primary subgenre matches were 36× content). Now scoring is `score = Σ aff(t) × idf(t) × β(t,F) + B_coven` — single μ application, at construction. (2) Length penalty γ=0.5 — divide raw score by √|tags(F)| so densely-tagged films don't win on breadth alone. (3) Smoothed + clamped IDF — `clamp(log(1 + N/(1+df)), 0.75, 3.0)` replaces raw `log(N/df)` for stability on small catalogs. (4) Aversion vector — new `getUserAversion()` parallel to own-affinity, accumulating dislike magnitude. Scoring subtracts `0.8 × aversion-mass`, so explicitly-disliked tags now actively suppress films (not just zero out positive matches). (5) Score bands — replaces the v2 percentage pill with rank-percentile bands (Hexed for You / Strong Match / Good Omen / Strange Pull) plus a Coven Favorite badge. Calibration helper unwired from the display path; the circularity concern (rated films feed BOTH user vector AND calibration anchors) sidestepped because bands depend on rank, not anchored percentages. 92 unit specs pass. No schema changes. Spec at `docs/superpowers/specs/2026-05-02-recommender-v2-design.md` (delta in `algo.md`).

**Previously shipped (#36): Recommender v2.** Six layered algorithmic improvements over #35 plus a `<MatchPill>` UI component overlaid on every `/for-you` poster. (1) TF-IDF tag weighting computed per-request, so distinctive tags outweigh near-universal ones; (2) per-tag affinity cap of 30 prevents runaway dominance; (3) visible-tag (positions 1-4) get a 1.3× boost honoring the staff-guide editorial capsule; (4) signal decay at half-life 1 year (`0.5^years`); (5) coven-borrowed signal now weighted by cosine similarity to the user's own vector — close-taste mates contribute more, orthogonal mates zero out — with cold-start fallback to interaction-score weighting; (6) verdict-anchored percentage maps raw scores to `(score − meanDisliked) / (meanLiked − meanDisliked) × 100`, stable across catalog growth. `<MatchPill>` on `/for-you` shows the calibrated % when `totalRatings ≥ 3`, falls back to verbal pill ("strong match" / "your kind" / "interesting pick") when cold-start. New `app/lib/queries/fyp/calibration.ts` (pure-function, 23 specs). Total recommender test count: 80 unit specs. No schema changes. Spec at `docs/superpowers/specs/2026-05-02-recommender-v2-design.md`, plan at `docs/superpowers/plans/2026-05-02-recommender-v2-plan.md`.

**Previously shipped (#35): FYP recommender.** New `/for-you` route ranks the catalog by personal affinity built from 6 weighted user signals × per-facet tag multipliers, floored at 0 per tag. Cold-start is 4 additive layers — editorial starter pack (20 hand-curated films, true cold) → coven-borrowed × 0.3 (any bond, weighted by #34's interaction score) → lanes × 1.5 per picked tag → own behavior. Each `/for-you` row carries a tiny italic "why" caption (5 reason kinds). New `/tags/[name]` listing pages — every `<FilmTagsRow>` pill (except director) links to one. New LanePicker section on `/settings` for sub-genre / tone / theme lanes. Mig `0154` adds `profiles.lane_tag_ids UUID[]` + `films.editorial_starter BOOLEAN`. Affinity computation is on-demand v1; cache seams at `getUserAffinity` / `getCovenBorrowedAffinity` for mid-scale. Pure-function bits (53 unit specs) cover scoring + signal model. Spec at `docs/superpowers/specs/2026-05-02-fyp-recommender-design.md`, plan at `docs/superpowers/plans/2026-05-02-fyp-recommender-plan.md`.

**Previously shipped (#34): Coven page chip rework.** `/coven` left pane no longer scrolls a wall of cards once you have 5+ covenfolk. Top 4 chips ranked by 90-day interaction score (recommendations sent + reactions on their activity + comments on their activity, equal weights, alphabetical tie-break) + search input + "See all (N)" button that opens a `BottomSheet` with the full ranked roster. Search uses the same `filterCovenMembers` helper as RecommendModal (#29). Chips and rows tap to `/p/<username>`. New `getRankedCovenfolk` query in `app/lib/queries/coven-interactions.ts` aggregates the three signals in JS (PostgREST has no `GROUP BY`). New `<CovenChipRow>` + `<CovenSeeAllSheet>` components live under `app/components/coven/`. No schema, no migration. Spec at `docs/superpowers/specs/2026-05-02-coven-page-chip-rework-design.md`.

**Previously shipped (#33): Tagging system v2.** Replaces #32's two-facet (`subgenre` + `vibe`) tag system with the seven-facet positional system from the v2 staff style guide (`/Users/christophernowacki/Downloads/filmgoblin-tagging-guide-v2.pdf`). Mig `0152` truncates v1, expands `tags.type` CHECK to six values (`subgenre`/`subject`/`tone`/`theme`/`setting`/`content`), reseeds 88 canonical tags including the new `breakup horror` (theme), adds `film_tags.position SMALLINT` + `is_primary BOOLEAN` with partial unique idx `(film_id) WHERE is_primary = TRUE`, adds `films.horror_adjacent BOOLEAN`. `setFilmTags` rewritten with 14 distinct validation paths (per-facet caps, "Secondary in tail" rule, type defense, ordered-set equality, "exactly 1 Primary, must be subgenre"). New two-stage `<FilmTagEditor>`: chip-group picker (six facets, per-facet caps) → `@dnd-kit/sortable` drag-to-reorder list with Primary locked at slot 1, virtual director row at slot 2, dashed accent divider between slots 5 and 6 reading "visible above · hidden below". `<FilmTagsRow>` renders the 5-slot capsule from new `{visible, hidden}` shape on `/film/[id]`. `/admin/films` "Untagged only" filter simplified to "any film_tags row = tagged". Spec at `docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md`, plan at `docs/superpowers/plans/2026-05-02-tagging-system-v2-plan.md`. Deployed to https://film-goblin.vercel.app.

**Previous session (2026-05-01) shipped:** Five sub-projects + 7 polish/fix PRs across two sessions. Five sub-projects shipped end-to-end (brainstorm → spec → plan → implementation → migration where applicable → merge → prod deploy). Three new prod migrations (0147, 0148, 0149) plus an unrelated 0150 picked up incidentally — see Open threads.

1. **Comment sheet polish + likes (#25, PR #84):** mig `0147` adds `activity_comment_reactions` (composite PK `(user_id, comment_id)`, `TO authenticated` RLS, `acr_bump_count()` SECURITY DEFINER trigger maintaining `like_count` on `activity_comments`). New `toggleCommentReaction` action mirrors `toggleReaction`. Restyled `CommentSheet`: serif "Comments • N" header w/ accent-dot separator, 36px avatars, stacked username/timestamp/body, heart+count column, inline muted "Delete" text-link, viewer-avatar + rounded-pill composer w/ inline `N/140` counter and smart Post button. `BottomSheet.title` widened to ReactNode. `HeartIcon` extracted. `CommentItem` gains `like_count` + `liked_by_me`.
2. **Username on utility surfaces (#26, PR #85):** flipped 37 render sites from `display_name ?? username` to bare `username` across 17 files. `/p/[username]` h1 + main avatar still use display_name; /settings input editable; admin unchanged. No schema.
3. **`like_on_comment` notification (#27, PR #86):** migs `0148` + `0149`. Recipient = comment author; self-likes filtered; opt-out skips the INSERT entirely. New per-kind grouping in `group-notifications.ts`: `like_on_comment` keys on `payload.comment_id` (not actor) with `MIN_GROUP_SIZE = 2` — single liker reads "<liker> liked your comment", 2+ reads "N people liked your comment". /settings adds opt-out checkbox.
4. **Modal visual unification (#28, PR #94):** `RecommendModal` converts to `BottomSheet` (drops the rotated zine-card overlay; ritual copy "Cast the Rune • {filmTitle}" moves into the sheet header). `AvatarEditor` keeps its centered fullscreen overlay but adopts the dark `#141414` + accent top border + serif title visual language. Form inputs retoned for dark panels; Submit unified to `.btn` solid-pink. Bundled fix: RecommendModal sent-state resets on close.
5. **RecommendModal picker (#29, PR #95):** replace native `<select>` (the iOS wheel picker that ignored all our styling) with in-sheet UI: search input + horizontal "top covenfolk" avatar chips (people the user recommends to most often, computed from `activity` rows of `kind = 'recommendation_sent'`) + substring-filtered list. New query `getTopRecommendedCovenMemberIds` + pure `filterCovenMembers` helper (7 unit specs). Falls back to alphabetical chips for users with no recommendation history.

Polish/fix PRs: PR #88 (extract sub-project history table to its own file), PR #89 (rate-reminder modal opens on same-route soft-nav via `useSearchParams()`), PR #90 (drop "Chapter IV" eyebrow on /coven), PR #91 (prune 5 stale Open Threads), PR #92 (/settings saved-toast w/ auto-hide), PR #93 (shared ToastProvider — 9 silent-feedback mutation surfaces), PR #96 (BottomSheet focus-stealing bug — primitive-level fix; mount-time focus call shared a useEffect with the escape-key listener, so any parent re-render with a fresh `onClose` identity stole focus back to the sheet panel; surfaced when typing in RecommendModal's new search input).

All deployed via `npx vercel deploy --prod --yes` from repo root. Live at https://film-goblin.vercel.app.

**Next up:** Nothing queued. Onboarding ritual (#38) just shipped. Adjacent candidates: tag the remaining 42 films via `/admin/films?untagged=1` (unblocks better FYP signal); validate recommender v3 math-review fixes with real user behavior; rating pills on poster grids using `films_with_stats.coven_rating_pct`; list detail page `/lists/[id]`; Your Ledger widget on /home; real sender email domain via Resend. Comment-surface deferred follow-ups: threaded replies, emoji quick-react strip, editing/pagination/@-mentions/markdown.

**Open threads:**
- **Sub-project #25 deferred follow-ups:** threaded comment replies + "Reply"/"View N replies" UI; emoji quick-react strip above composer; send-icon header variant (proto 2); `LikersBottomSheet` for comment likes (tap count → see who liked); comment editing/pagination/@-mentions/markdown. (`like_on_comment` notification shipped in #27.)
- **Sub-project #28 cropper-overlay-on-dark-panel risk is unverified.** AvatarEditor's `react-easy-crop` overlay was tuned against the old bone panel; against the new `#141414` it might read dim. User said "we can always roll back." Verify on next pass through /settings.
- **Sub-project #29 mobile real-use feedback open.** The chips + textarea layout pushes the "A Whisper" field further down the sheet. On a small phone with the keyboard up, the field could be partially obscured. Cheap fix if it surfaces: shrink chips to 32px or collapse the chip row when the keyboard opens.
- **Tagging + FYP proposal review** — `docs/proposals/2026-05-01-tagging-and-fyp-review.md` is local-only. Tagging shipped in #32 + #33; FYP is sub-project B (the next big feature).
- **115 of 157 films tagged after PR #113's editorial pass.** 42 remain untagged: 16 explicit non-horror catalog cleanup (Eighth Grade, The Smashing Machine, etc), 26 needing manual editorial review (mostly future 2026 releases + obscure indie horror). Walk `/admin/films?untagged=1` to chip away.
- **Sub-project #33 RLS tests still not run locally.** Docker socket bind-mount issue on this machine (colima). Will run on the other machine / in CI. The unit-style validation logic was reviewed inline; tests are env-gated.
- **`algo.md` committed** — PR #139. Math expert's review reference now tracked at repo root.
- **Recommender v3 changes are unverified at user scale.** TF-IDF + length penalty + aversion vector + match bands shipped without held-out validation. Watch /for-you over the next few days; if rankings feel wrong, tune `LENGTH_PENALTY_GAMMA`, `AVERSION_LAMBDA`, or the IDF clamp bounds — all are single-line constants.
- **Calibration helper deleted (PR #139).** `calibration.ts` + 23 specs removed — unwired in v3, was creating false coverage signal. `VerbalKind` type moved to `score.ts`. If %-display is ever revived, rebuild from scratch with proper LOO validation.
- **`fg-trailers/` is now in the monorepo** alongside the four TS packages. Rust TUI for curating YouTube trailer URLs on `films` rows; talks to Supabase via service-role REST. Build/run with `cargo run --release` from `fg-trailers/`; needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `fg-trailers/.env` (gitignored). Mig `0150_film_trailers.sql` is the canonical schema for the trailer columns; the mirror at `fg-trailers/sql/add_trailer_fields.sql` is a portability copy.
- `passwords.txt` at repo root holds Supabase prod pooler URL + password (gitignored). On the second machine `passwords.txt` is missing — pull `DATABASE_URL` via `npx vercel env pull app/.env.local --yes --environment=production` from repo root instead.
- **Supabase dashboard "Confirm email" toggle stays ON.** Synthetic-email signups bypass it via `email_confirm: true`; toggle now only governs email-CHANGE confirmation from /settings. Don't flip it off.
- **`tooth tony` handle was patched in prod** (`teeth tony` → `teethtony`, display_name preserved) — see PR #58.
- **`onboarded_at` backfill premise.** Mig 0135 backfills existing profiles w/ `onboarded_at = created_at`. If a pre-mig user didn't actually finish onboarding and you want to force them through the new flow, null `onboarded_at` directly in DB.
- **Captured-but-not-persisted onboarding fields are gone.** `genres`/`storefronts`/`followUserIds` removed from `OnboardingPayload` in PR #52. To restore: add columns + types + `SettingsForm` fields together (Path B from onboarding-redesign spec).
- **Genre filter on `/films` is unwired.** `films.genre_primary` exists (iTunes raw category strings) but no UI reads it. Data source if we add a genre chip to `FilmsSortChips`.
- **Notifications deferred:** threaded comment replies, comment editing, email notifications for comments, comments on grouped feed rows, @-mentions / markdown, spam reporting, comment pagination.
- **Rate-reminder cron (mig 0146 + `/api/cron/send-rate-reminders`)** runs daily at 11:00 UTC. Inserts one `rate_reminder` notification per user with ≥1 unrated `watched` row older than 7 days, deduped on existing reminders within the past 7 days. Opt-out via `profiles.notify_rate_reminders` (Settings toggle). Bell row deep-links to `/watched?rate=<watched_id>` which auto-opens WatchModal in edit mode for the oldest unrated watch.
- **B2 deferred:** coven-scoped signals on `/p/[username]`, owned + review badges, most-watched sort on `/films`, badges on `/library`/`/home` marquee/`/watched` strip, `/film/[id]` stat block beyond single caption, compact unit display past 99+. Coven rating pills on poster grids (using new `coven_rating_pct`) is a fast follow-up here.
- **`PosterQuickAdd` `initialOnWatchlist`** is meaningful — do NOT drop it. Default browse hides watchlisted films (prop is `false`), but search mode lifts the filter and matched watchlisted films return `on_watchlist: true`; the "✓ On watchlist" button state depends on the prop. Earlier note calling it "safe to drop" was wrong.
- **Types regen.** `app/lib/supabase/types.ts` has a hand-edit warning block at the top listing all manually-added columns. Run `gen:types`, then diff and re-apply every listed column before committing the result. See the comment block in the file for the full list.
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

Nothing queued. Adjacent quick wins still open: rating pills on poster grids using `films_with_stats.coven_rating_pct`; finish the editorial tag pass on the remaining 42 films; commit `algo.md` to git for future re-reviews. Real projects offered: Your Ledger widget on /home, real sender email domain via Resend, list detail page `/lists/[id]`, threaded comment replies, review composer, trailer surfaces on `/film/[id]` (mig 0150 + `fg-trailers` populate the columns; no UI reads them yet). Display-name column drop (eventual — only used on `/p/[username]` h1 + main avatar after #26).

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
