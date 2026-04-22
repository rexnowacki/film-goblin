# Backlog — Post-Rebuild

Ideas that don't fit into the six-sub-project decomposition in `CLAUDE.md`.
Land these after sub-projects 4–6 are done (worker cron, notifications, social),
unless one becomes urgent. Each entry should be brief; if it grows into a proper
feature it graduates to `docs/superpowers/specs/`.

## Catalog / data

- **Broader genre seeding.** Current `worker/scripts/run-seed.ts` runs a curated
  set of genre + director searches. Expand with deeper horror coverage (giallo,
  folk horror, found-footage, slow-burn, body horror subgenres) and arthouse
  branches that Apple under-categorizes.
- **Region rotation.** iTunes API returns different catalogs per `country` param.
  Seed against US + UK + DE + JP to pick up imports/exclusives; de-dupe by
  director + year + title rather than `itunes_id`.
- **TMDB fallback.** When iTunes lookup returns empty (increasingly common for
  older titles), cross-reference TMDB for canonical metadata and `itunes_id`.
- **Letterboxd import.** Optional: ingest a user's Letterboxd diary export on
  onboarding to seed their watchlist rather than the manual picker.

## Admin

- **Film admin UI.** Add/remove/edit films from the app, gated by
  `staff.role = 'admin'`. Includes: manual `itunes_id` lookup, toggle
  `tracking`/`available`, override artwork/description, merge duplicates.
- **User admin.** View users, suspend accounts, clear a user's sessions,
  inspect their watchlists + alert history.
- **Review editor.** Staff reviews currently only have a `reviews` table with no
  UI; add a composer + publish/unpublish workflow.
- **Dead-link crawler.** Periodic check on every film's `itunes_url` — if the
  page 404s or the storefront pulled the title, flag `available = false` and
  surface it in admin.

## Auth / profile

- **Log out button.** Currently there is no sign-out affordance anywhere in the
  UI (the `signOut` action exists in `app/lib/actions/auth.ts` but nothing calls
  it). Wire it into `TopNav` for authed users and/or `/settings`.
- **Password reset.** `supabase.auth.resetPasswordForEmail` flow + the
  `/auth/reset` route pair that confirms the token.
- **Change email.** Supabase supports `auth.updateUser({ email })`; needs UI.
- **OAuth providers.** Add "Continue with Google / Apple / GitHub" to
  `/auth/signin`. Requires provider config in Supabase project settings.
- **Account deletion.** Per-user data export + hard delete. Cascades across
  watchlists, follows, reviews, recommendations, lists.

## UX polish

- **Real recipient picker in RecommendModal.** Currently a UUID paste box. Land
  this in sub-project 6 if it hasn't already.
- **Onboarding resumability.** If a user bails halfway through the 5-chapter
  ritual, redirect them back to where they stopped on next login (persist a
  `onboarding_step` enum on profiles).
- **Skip onboarding.** Some users want to bypass the ritual and start empty.
  Add a "Skip for now" link on chapter I.
- **Rich activity feed items.** `FeedTabs` renders raw JSON per `activity.kind`;
  write a per-kind renderer (review_published, recommendation_sent,
  list_created, list_film_added, follow).
- **Price chart y-axis.** The 180-day price chart on film detail pages has no
  axis labels — add min/max/midpoint tick marks.
- **Dark/light mode toggle.** Design system has accent switching but no
  light-mode inversion yet. Could be a `[data-theme="light"]` attribute on
  `<html>` with CSS variables.

## Price tracking

- **Per-user threshold types.** MVP onboarding stores `max_price_usd`; extend
  with "% off all-time-high", "drops below $N", "any drop from current price".
- **Bundle deals.** Apple TV sometimes sells trilogies or director collections.
  Worker should detect and surface those as separate deal entities.
- **Historic price archive beyond 180 days.** Current query caps at 180d;
  decide retention policy for older `price_history` rows (downsample? drop?).

## Engineering

- **Supabase migration grants.** Current migrations don't emit `GRANT` statements
  (see `project_supabase_grants_gap` memory). Refactor so each migration that
  creates a table also grants the expected privileges, eliminating the CI and
  local bootstrap grants step.
- **Next.js App Router deploy from GitHub.** Currently Vercel deploys are driven
  by `vercel --prod` from local. Wire the GitHub integration so pushes to
  `master` auto-deploy.
- **Supabase migration via Supabase CLI.** Currently `worker/` and `db/` each
  have their own `npm run migrate` scripts. Consolidate under
  `supabase/migrations/` + `supabase db push` to leverage the platform's
  migration tracking instead of a handcrafted `_migrations` table.
- **E2E tests.** Playwright against the deployed staging URL, covering the
  signup → onboarding → watchlist → reload flow.
- **Observability.** Structured logs from the worker + Next.js app routed to a
  dashboard (Axiom / Logtail / Vercel's native log drains).

## Business / growth

- **Invite codes.** Gate signup behind one-use invite codes for the first
  cohort; lets you control who joins and surfaces organic growth metrics.
- **Weekly digest email.** "This week on Film Goblin: 12 deals in your genres,
  3 recommendations from your coven." Consumes notifications pipeline data.
- **Public shareable list pages.** `/lists/[id]` that anyone (authed or not)
  can view and subscribe to. Requires list_detail feature plus SEO polish.
