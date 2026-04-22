# Film Goblin — Next.js App

The user-facing application. Implements the spec at
`../docs/superpowers/specs/2026-04-21-nextjs-app-design.md`.

Seven MVP routes (Landing, Onboarding, Home, Film Detail, Films, Lists, Settings)
backed by Supabase Auth + the sub-project-2 schema. Styles come verbatim from
the prototype at `../src/styles.css`; no Tailwind.

## Local setup

Requires Node 20 (pinned via repo-root `.nvmrc`), Docker (for Supabase CLI),
and the Supabase CLI.

From repo root:

```
supabase start                          # spins up local Postgres, GoTrue, etc.
cd worker && npm run migrate            # apply 0001-0003
cd ../db && npm run migrate             # apply 0100-0113
# grant PostgREST role access (plan's migrations declare RLS policies but
# don't emit GRANT statements; apply these after migrations):
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db) \
  psql -U postgres -d postgres -c \
  "GRANT USAGE ON SCHEMA public TO anon, authenticated; \
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated; \
   GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated; \
   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;"
cd ../app && cp .env.local.example .env.local
# paste the anon key + service_role key from `supabase start` output
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run typecheck` — tsc --noEmit
- `npm test` — Vitest (requires `supabase start` running)
- `npm run gen:types` — regenerate `lib/supabase/types.ts` from local DB

## Test prerequisites

Action tests use the local Supabase stack (`supabase start`). Set
`TEST_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to the service_role key
printed by `supabase start`.

## Manual test plan (MVP)

1. Sign up with fresh email + password.
2. If email confirmations are enabled, click the confirm link; otherwise the
   signup auto-confirms and creates a session.
3. Land on `/onboarding`; walk 5 chapters; click "Enter The Coven".
4. Land on `/home`; see feed (empty unless you follow someone with activity).
5. Visit `/films`; click a film; see detail.
6. Click "+ Watchlist"; reload; confirm state persists.
7. Visit `/settings`; edit handle; save; reload; confirm persists.
8. Sign out; confirm `/home` redirects to `/auth/signin`.

## Deploy

Staging: https://film-goblin.vercel.app

Vercel project: `skulldrinker/film-goblin`. Deploys are driven by
`vercel --prod` from the `app/` directory (GitHub auto-deploy not yet wired).

Supabase project: `film-goblin-staging`. URL and anon key live only in Vercel's
env vars and local `.env.staging` (never in the repo).

## What this package does NOT do

- Host the price-tracking worker's cron endpoint (sub-project 4).
- Send notifications (sub-project 5).
- Deals page, Friends page, Alerts inbox, List Detail, Mobile showcase
  (later sub-projects).
