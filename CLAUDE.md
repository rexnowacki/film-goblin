# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

> **Convention:** This section is updated before each session close so the next session can pick up cold. Update it at the end of every session — what just shipped, what's next, any open threads worth carrying forward.

**Last updated:** 2026-07-01

**Last shipped (2026-07-01):** iTunes transition hardening (`feature/itunes-transition-hardening`). The weekly iTunes availability check (Mondays inside the daily maintenance cron) had silently stopped finding anything: Apple's Search API returns zero results whenever `entity=movie` is set, and the scorer couldn't match Apple's "Title (YYYY)" naming. Fixes: (1) `itunes-search.ts` drops the entity filter, searches wide (limit 50), filters `kind === "feature-movie"` client-side; (2) `score.ts` strips a trailing `(YYYY)` suffix from both sides before comparing (never a bare-year title like "1917"); (3) `check.ts` gains a Brave → Apple TV page → adamId → iTunes Lookup fallback (same pipeline as the manual admin add) when iTunes search yields nothing viable — needs `BRAVE_SEARCH_API_KEY`, fails soft to []; (4) `adminCreateFilm` promotes an existing TMDB-only twin in place (graft iTunes identity via `lib/admin/promote-tmdb-twin.ts`) instead of inserting a duplicate. Also merged the duplicate Obsession rows in prod (kept TMDB row `b4ed5896…` with all user data, grafted `itunes_id 1895945921`, moved price_history, deleted the Apple TV twin).

**Previously shipped (2026-06-09):** Tier-1 security hardening branch in progress. Migs 0203–0205 add profile column-level grants, pre-auth subject/IP rate limits, and DB CHECK constraints for profile text fields and watched notes. App changes remove client-role `profiles.select("*")`, add auth throttles with fail-open pre-auth limiter helpers, raise new-password minimum to 8, consolidate username validation, and add friendly profile length validation. **Rollout order matters:** deploy app first, then apply migrations; running 0203 before the app deploy can break old `profiles.select("*")` code.

**Last shipped (2026-05-25):** Sub-CLAUDE.md files added throughout the repo to give Claude institutional context at each layer without re-reading root CLAUDE.md. Files at: `app/CLAUDE.md`, `app/components/CLAUDE.md`, `app/lib/actions/CLAUDE.md`, `app/lib/queries/CLAUDE.md`, `app/lib/queries/fyp/CLAUDE.md`, `app/lib/supabase/CLAUDE.md`, `app/lib/theaters/CLAUDE.md`, `db/CLAUDE.md`, `db/migrations/CLAUDE.md`, `worker/CLAUDE.md`, `notifier/CLAUDE.md`.

**Last shipped (2026-05-08):** Four things. (1) **iTunes availability cron (#41):** Weekly cron at `/api/cron/check-itunes-availability` (Mondays 14:00 UTC) checks TMDB-only films for iTunes availability. Mig 0175 adds `films.tmdb_id`, `films.theatrical_release_date`, `films.last_itunes_check_at`, restores partial unique index on `films.itunes_id`, and creates `itunes_candidates` table. Score function in `app/lib/itunes-availability/score.ts` (lowercase-only/normalized title + year ±1 + director); ≥0.85 auto-promotes (writes `itunes_id` directly to films), 0.45–0.85 lands in `/admin/itunes-candidates` for review. Add Film modal (TMDB option) now captures `tmdb_id` + `theatrical_release_date` so new films get precise cron timing; older TMDB-only films use `year ≥ currentYear-1` fallback. 30-day post-theatrical threshold, 365-day cap, 6-day re-check cooldown, 14-day rejection cooldown. Spec at `docs/superpowers/specs/2026-05-08-itunes-availability-cron-design.md`. (2) **Force-change-password admin flow:** Admin sets a temp password from `/admin/users/[id]` → `must_change_password` flag (mig 0174) flips → middleware redirects flagged users to `/auth/change-password` until they pick a new one. Sign-out escape hatch on the change-password page. Coexists with the existing email-based reset (which only works for real-email users; synthetic-email signups can't receive email). (3) **Invite cookie bug fix:** `/invite/[code]` was a Server Component that couldn't write cookies — every redeemed invite was silently rejected at signup. Converted to a Route Handler; expired UI moved to its own `/invite/expired` page. (4) **Mig 0176 — invite trigger search_path fix:** Mig 0173 had pinned `create_invite_code_for_new_user()` to `SET search_path = public`, which broke `gen_random_bytes(8)` resolution (pgcrypto lives in the `extensions` schema in Supabase). Every signup hit "Database error creating new user" via the auth API. Fix widens search path to `public, extensions`. Verified end-to-end against prod via direct admin createUser. **All signups (invite-gated and otherwise) work again.**

**Previously shipped (2026-05-07):** Five things. (1) **Invite codes / cold-start gate (#40):** Hard signup gate behind multi-use invite codes (5 per code). `invite_codes` + `invite_uses` tables (mig 0172 + 0173 fixes). DB trigger auto-creates one code per user on profiles INSERT. `burn_invite_code` PL/pgSQL RPC for race-safe increment. Cookie bridge: `/invite/[code]` validates → sets `fg_invite_code` cookie (24h) → redirects to `/auth/signup`. Gate in `signUp` action (`INVITE_GATE=1` env flag — delete to open signup, no code change). Settings page: "Your Invite Link" block with copy button + usage counter. Admin panel at `/admin/invite-codes` — create batch codes, revoke, usage table. Gate shipped live, **since disabled** (env var removed; set `INVITE_GATE=1` to re-arm). (2) **og:image for film pages:** `/api/og/film/[id]` route via `ImageResponse` — poster left, title/meta/description right, Film Goblin branding. `generateMetadata` on `/film/[id]` now uses the OG URL. (3) **Delete account:** `deleteAccount()` server action + `DeleteAccountSection` in settings — username-confirm gate before hard-delete via service-role. (4) **Film request / Summon (#39):** "Summon it →" on empty discover state → `FilmRequestSheet` multi-step flow. `film_requests` + `film_request_users` tables (mig 0170, 0171). Admin queue at `/admin/film-requests`. (5) **Admin password reset + feed tab fixes + watchlist search + admin last-activity** (see prior session for details).

**Previously shipped (2026-05-05):** Sticky sidebars on /home (`LedgerPanel` left, `GoblinRecommends` right); `goblin_pick` table (mig 0164) + `/admin/goblin-pick`; Add Film modal (admin-only, `UserMenu`); merged `feature/local-theater-alerts`; `FollowedActivityFeed` rewritten to use `groupFeed` + `FeedRow`.

For full history → `docs/sub-project-history.md`.

**Next up:** Nothing queued. **Invite gate is disabled — signup is open** (re-enable by setting `INVITE_GATE=1` in Vercel env). Adjacent quick wins: comment editing + pagination (still missing — no update action exists); genre filter on `/films` (still unwired). *(Stale items removed 2026-07-01: `/lists/[id]` shipped 2026-05-25; trailer UI shipped — `TrailerButton` on `/film/[id]`; handle validation consolidated into `app/lib/auth/username.ts`, used by both onboarding and settings.)*

**Open threads:**
- **`CRON_SECRET` rotation procedure.** Vercel marks it "Sensitive" — value can't be viewed after creation. If crons go silent with no visible logs, suspect the secret first (Hobby log retention is ~1h). Local copy at `.cron-secret` (gitignored). Rotation: `openssl rand -base64 32` → save to `.cron-secret` → paste into Vercel dashboard → redeploy from repo root → smoke with `curl -H "Authorization: Bearer $(cat .cron-secret)" https://film-goblin.vercel.app/api/cron/refresh-prices` (expect `{"ok":true,"digest":{...}}`).
- **iTunes availability check runs Mondays inside the daily maintenance cron** (`/api/cron/maintenance`, 10:00 UTC daily — the standalone schedule was dropped for the Hobby cap, but the maintenance fold-in covers it). Manual smoke: `curl -H "Authorization: Bearer $CRON_SECRET" https://film-goblin.vercel.app/api/cron/check-itunes-availability`. Review candidates at `/admin/itunes-candidates`. Rejection cooldown is 14 days. Uses Brave fallback when iTunes search misses (needs `BRAVE_SEARCH_API_KEY`).
- **Rate reminders run daily inside the maintenance cron** (`jobs.rateReminders`). Manual smoke: `curl -H "Authorization: Bearer $CRON_SECRET" https://film-goblin.vercel.app/api/cron/send-rate-reminders`.
- **Theater alerts run Mondays + Thursdays inside the maintenance cron** (`jobs.theaterAlerts`, lock-guarded). Manual smoke: `curl -H "Authorization: Bearer $CRON_SECRET" https://film-goblin.vercel.app/api/cron/theater-alerts`. Details: `app/lib/theaters/CLAUDE.md`.
- **Showtimes refresh** — runs inside the daily maintenance cron on Mondays. Manual smoke endpoint: `curl -H "Authorization: Bearer $CRON_SECRET" https://film-goblin.vercel.app/api/cron/refresh-showtimes`. Scrapes Loft next-7-days showtimes into `theater_showtimes`; powers the "Now at The Loft" pill on `/film/[id]` and the `/gazing/[token]` share. Details: `docs/superpowers/specs/2026-06-03-loft-showtimes-shared-gazing-design.md`.
- **3 films untagged** — Materialists, Smashing Machine (catalog stragglers — could delete), The Surrender (needs manual review).
- **Recommender v3 unverified at user scale.** Watch `/for-you`; tuning constants in `app/lib/queries/fyp/CLAUDE.md`.
- **`fg-trailers/`** — `cargo run --release` from `fg-trailers/`. Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `fg-trailers/.env`. Trailer columns (mig 0150) are surfaced by `TrailerButton` on `/film/[id]`; TMDB enrichment also populates them on film create.
- **`passwords.txt`** at repo root (gitignored) — Supabase prod pooler URL + password. Second machine: `npx vercel env pull app/.env.local --yes --environment=production`.
- **Supabase "Confirm email" toggle stays ON.** Synthetic-email signups bypass via `email_confirm: true`. Don't flip it off.
- **Supabase dashboard hardening (manual, post-merge):** set Auth minimum password length to 8 and enable leaked-password protection if the plan allows.
- **`onboarded_at` backfill:** To force a user through onboarding again, null it directly in DB.
- **Genre filter on `/films` is unwired.** `films.genre_primary` exists but no UI reads it.
- **Sub-project #25 deferred:** comment editing/pagination/@-mentions/markdown; emoji quick-react strip.
- **Sub-project #28:** AvatarEditor `react-easy-crop` overlay against `#141414` may read dim — unverified.
- **Sub-project #29:** Chips + textarea in RecommendModal may push composer off-screen on small phones with keyboard up.
- **B2 deferred:** coven-scoped signals on `/p/[username]`, owned + review badges, most-watched sort on `/films`. Coven rating pills on poster grids is the fast follow-up.
- **`PosterQuickAdd` `initialOnWatchlist`** — do NOT drop it. Search mode lifts the watchlist filter; matched watchlisted films return `on_watchlist: true`. The prop drives button state.
- **`/wrapup` slash command** at `.claude/commands/wrapup.md` (local only, untracked).
- **iOS splash assets** baked into home-screen install. PR #66 fix only takes effect after remove + re-add.

## Remote

Private repo at [rexnowacki/film-goblin](https://github.com/rexnowacki/film-goblin). `origin/master` is default. Deployed to Vercel as `film-goblin` (skulldrinker team) at https://film-goblin.vercel.app. `.vercel/project.json` checked in at repo root.

**Deploy rule: always `npx vercel deploy --prod --yes` from the repo root.** See Gotchas below.

## Git workflow

Two machines, same codebase, same protocol.

**Always-on:**
- Never commit to `master` directly. Feature branches only.
- Open PRs; don't merge directly.
- Commit frequently; push when work pauses.

**Stay in sync with `git fetch`** — the other machine may have merged since you last looked.

- **Before starting a branch:** `git fetch origin && git checkout master && git merge --ff-only origin/master`
- **Before pushing a long-held branch:** `git fetch origin`; if `origin/master` moved, `git rebase origin/master`
- **Before deploying:** `git fetch origin` to confirm you're shipping current master
- Prefer `git fetch` + explicit `merge --ff-only` / `rebase` over `git pull`

**Collision hot spots:**
- `CLAUDE.md` "Current state" — both `/wrapup` runs edit the same paragraphs
- `app/lib/supabase/types.ts` — hand-edited; regen on the other machine will clobber. Commit type edits in their own PR.
- `db/migrations/0NNN_*.sql` — numbered sequentially. If both devs add the same number, second-to-merge renumbers.

## Packages

Six packages, deployed/run independently. Each has its own `CLAUDE.md`.

| Package | What it is | CLAUDE.md |
|---------|-----------|-----------|
| `app/` | Production Next.js 15 app. UI, auth, server actions, API routes, cron. | `app/CLAUDE.md` |
| `worker/` | Price-tracking worker. Polls iTunes, writes price_history, emits alerts. | `worker/CLAUDE.md` |
| `db/` | Schema package. All migrations, RLS, triggers, DB tests. | `db/CLAUDE.md` |
| `notifier/` | Email digests via Resend. Library only — no CLI. | `notifier/CLAUDE.md` |
| `fg-trailers/` | Rust TUI for curating trailer URLs. Local admin tool. | — |
| `src/` | Legacy Vite+React design prototype. Read-only reference; production = `app/`. | — |

Routing shorthand: UI → `app/`. Prices/iTunes → `worker/` + app cron. Schema/RLS → `db/migrations/`. Email → `notifier/`.

## Node version

Node 20 required. Repo pins via `.nvmrc` but system default is often Node 16. Before any `npm`/`tsx`/`node` call:
- `nvm use 20`, OR prefix: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`

Background/parallel bash calls don't share shell state — use the PATH prefix for one-shots.

## Sub-CLAUDE.md index

Layer-specific rules, patterns, and gotchas live in the package sub-files. Read the relevant one before working in that area.

| File | What it covers |
|------|---------------|
| `app/CLAUDE.md` | Deploy rule, Node 20, route structure, iOS PWA rules, env vars |
| `app/components/CLAUDE.md` | `"use client"`, `as never` cast, responsive helpers, design system, button conventions |
| `app/lib/actions/CLAUDE.md` | `_private`/`public` split, auth guard, `revalidatePath`, ProfileFields spread, test template |
| `app/lib/queries/CLAUDE.md` | Client injection pattern, `films_with_stats`, PostgREST embed gotcha, coven bidirectional check |
| `app/lib/queries/fyp/CLAUDE.md` | FYP v3 design, band system, cold-start, all tuning constants |
| `app/lib/supabase/CLAUDE.md` | Which factory to use, service-role guard, `types.ts` regen procedure |
| `app/lib/theaters/CLAUDE.md` | Scraper file map, adding a provider, cron trigger |
| `db/CLAUDE.md` | Two migrate commands warning, pg-mem strip list, RLS test shape, `bond()` helper |
| `db/migrations/CLAUDE.md` | Feature → migration range map, how to add a migration, prod apply procedure |
| `worker/CLAUDE.md` | Module responsibilities, NUMERIC/BIGINT coercion, no-raw-SQL rule, re-export contract |
| `notifier/CLAUDE.md` | Public API contract, sender domain status |

## Gotchas

These are global gotchas that don't belong to any single package. Package-specific gotchas live in the sub-CLAUDE.md files above.

- **`git commit -m` heredocs intermittently mangle the message** — commits land with subject `"Error:  does not exist."` when using `$(cat <<'EOF' ... EOF)`. Workaround: `Write` to `/tmp/msg.txt`, then `git commit -F /tmp/msg.txt`. `--amend -F` from the same file fixes a mangled message without losing the tree.

- **Vercel deploy must run from the repo root.** The Vercel CLI resolves `.vercel/project.json` from CWD — does NOT walk up. The project has `rootDirectory: app` set in the Vercel dashboard, so deploying from repo root is correct.
  - Deploying from `app/` silently creates a new garbage project named after CWD. Delete with `npx vercel project rm <name>`.
  - For worktrees: copy root `.vercel/project.json` into the worktree root, then deploy from the worktree root — NOT `<worktree>/app/`.

- **Supabase prod DB via session-mode pooler.** Direct connection (`db.<project>.supabase.co:5432`) is IPv6-only and unreachable from this machine. Use `aws-1-us-west-1.pooler.supabase.com:5432` with user `postgres.<project-ref>`. Connection string + password in `passwords.txt` at repo root (gitignored). Source env before `npm run migrate`: `set -a; source app/.env.local; set +a`.

- **Worktrees live under `.worktrees/`** (gitignored). The `superpowers:finishing-a-development-branch` skill cleans them up on merge.

- **`BRAVE_SEARCH_API_KEY`** — used only by `app/lib/actions/admin/apple-tv-search.ts`. Rotate: regen at brave.com/search/api/ → `npx vercel env rm BRAVE_SEARCH_API_KEY <env>` + `add` for each env → update `app/.env.local` → redeploy.

## Production stack

Committed direction lives in **`docs/superpowers/stack.md`** — read before proposing tech choices, update there (not here).

## Sub-project history

Full table at **`docs/sub-project-history.md`**. Specs under `docs/superpowers/specs/`, plans under `docs/superpowers/plans/`. Read the spec when working on a related area. New rows appended as sub-projects ship.

## Queued sub-projects

Nothing queued. See `docs/roadmap.md` for prioritized candidates.
