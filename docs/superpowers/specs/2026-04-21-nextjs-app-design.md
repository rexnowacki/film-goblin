# Next.js App + Auth + MVP UI Port — Design

Sub-project 3 of the Film Goblin production rebuild. Builds a Next.js 15 App Router application under `app/`, wires it to Supabase Auth + the sub-project-2 schema, ports seven of the prototype's routes against real data, and ships to Vercel against a hosted-staging Supabase project. Ends when a fresh browser can visit the deployed URL, sign up with email + password, complete onboarding, add a film to a watchlist, and see it persisted — via `git push` triggering Vercel, via Supabase Auth's email-confirm flow, via RLS-protected queries.

## Scope

**In scope** — seven routes, end-to-end against real Supabase:
- `/` — Landing (public, SEO-critical)
- `/onboarding` — 5-chapter ritual (authed)
- `/home` — authed feed
- `/film/[id]` — film detail (public, SEO-critical)
- `/films` — archive + search (public)
- `/lists` — grimoires browse + subscribe
- `/settings` — profile + oath (authed; other tabs are "coming soon" placeholders)

Plus supporting surfaces: `/auth/signin`, `/auth/signup`, `/api/auth/callback`, middleware for session management and redirects.

**Explicitly deferred** to later sub-projects (5/6) or never:
- Deals page, Friends page, Alerts inbox, List Detail page, Mobile showcase (Vite prototype remains visual reference)
- Realtime subscriptions (activity feed is read-only for MVP; Supabase realtime wires up in sub-project 6)
- Notification delivery UI (sub-project 5)
- Playwright / E2E / visual regression tests
- Custom domain
- Worker cron mount at `/api/cron/refresh-prices` (sub-project 4)

## Package layout

A new package at repo root: **`app/`**. Parallel to `worker/` and `db/`. The existing Vite prototype at `src/` stays as read-only visual reference and is not deleted in this sub-project.

```
app/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── .env.local.example
├── .gitignore
├── middleware.ts
├── app/
│   ├── layout.tsx                  # root layout, imports globals.css + Google Fonts
│   ├── globals.css                 # verbatim copy of src/styles.css
│   ├── page.tsx                    # /  → Landing; redirects to /home if authed
│   ├── onboarding/page.tsx
│   ├── home/page.tsx
│   ├── film/[id]/page.tsx
│   ├── films/page.tsx
│   ├── lists/page.tsx
│   ├── settings/page.tsx
│   ├── auth/signin/page.tsx
│   ├── auth/signup/page.tsx
│   └── api/auth/callback/route.ts  # exchanges email-confirm code → session
├── components/                     # TSX ports of the prototype's components
├── lib/
│   ├── supabase/
│   │   ├── server.ts               # createClient() for Server Components / Server Actions
│   │   ├── client.ts               # createBrowserClient() for "use client" islands
│   │   └── types.ts                # generated via `supabase gen types typescript`
│   ├── queries/                    # async read functions, take a Supabase client
│   └── actions/                    # server actions, "use server"
└── tests/
    ├── helpers/
    │   ├── testcontainers.ts       # thin wrapper / copy of db/tests/helpers/testcontainers.ts
    │   └── supabase.ts             # createServerClient with injected test JWT
    ├── actions/*.test.ts           # per-action unit tests
    └── middleware.test.ts
```

Server Components use `lib/supabase/server.ts`. Client islands use `lib/supabase/client.ts`. Server actions use the server client and run in a Node context with cookies available.

## Styling

`src/styles.css` from the prototype is copied verbatim to `app/app/globals.css`. Root layout imports it once. Google Fonts (Rubik Wet Paint, DM Serif Display, IBM Plex Sans/Serif/Mono) imported in `app/layout.tsx` via Next.js's `next/font/google`. No Tailwind, no CSS Modules — the zine's hand-tuned `.display`, `.eyebrow`, `.stamp`, `.btn`, `.halftone`, `.grain` classes + CSS custom properties carry the design system as-is.

Component JSX is ported from `src/components/*.jsx` and `src/pages/*.jsx` to TSX with prop types. Logic stays identical where possible; data sourcing changes from mocked `src/data.js` imports to Supabase queries.

## Per-route breakdown

### `/` — Landing (Server Component, public)
- Renders zine-cover hero, deal-poster marquee, featured grimoires, "How It Works", footer.
- Fetches: 10 recently-priced tracked films for the marquee; 4 public + official lists for featured grimoires.
- If the request has a valid session cookie, redirects to `/home` server-side before render.
- "Join the Coven" → `/auth/signup`. "Sign In" → `/auth/signin`.

### `/auth/signup` and `/auth/signin` — Client Components
- Email + password forms. Client-rendered so inline error states (weak password, email taken, bad credentials) render without page reload.
- Signup flow: Supabase sends a confirm email via its default SMTP. UI shows "Check your email." The link in the email hits `/api/auth/callback`, which exchanges the code for a session and redirects to `/onboarding`.
- Signin flow: session cookie set server-side, redirect to `/home`.

### `/api/auth/callback` — Route Handler
- Reads `?code=` from URL, calls `supabase.auth.exchangeCodeForSession(code)`, sets cookie, redirects. Target is `/onboarding` for first signup, `/home` thereafter (determined by checking whether the user's profile has been customized past its trigger-seeded default — handle != auto-generated pattern).

### `/onboarding` — Client Component (full ritual)
- 5 chapters (Prologue → Poisons → Storefronts → Altar → Oath), local `useState` per chapter.
- Final "Enter The Coven" button calls `completeOnboarding` server action:
  - Updates `profiles` (handle from coven field, `broadcast_watchlist_adds` if chosen).
  - Inserts watchlists for the 3+ seeded films. The `threshold_pct` from the Oath is applied to these rows as `max_price_usd`, computed per film as `film.current_price * (1 - threshold_pct/100)`.
  - Inserts follows for the seeded coven members.
  - Quiet hours are captured in the form but NOT persisted in MVP — no schema column exists yet, and nothing consumes them until sub-project 5 (notifications). The Settings UI displays quiet hours with a "coming soon" stamp.
- Users who already completed onboarding (detected by profile being past its bootstrap defaults) are redirected to `/home` if they hit `/onboarding`.

### `/home` — Server Component shell + Client islands (authed)
- Server fetches: activity feed (public events from followed users), "Deals Tracked For You" (top 4 watchlist films with price drops), popular grimoires (3 public lists), coven avatars.
- Client islands: the feed tab switcher (All / Reviews / Recs / Lists — client-side filter over server-fetched data; no re-fetch).

### `/film/[id]` — Server Component (public, SEO-critical)
- Public, server-rendered so search engines see title, director, synopsis, current price, and "Buy on Apple TV" link in initial HTML.
- Fetches: `films` row, last 180 days of `price_history`, published `reviews` with author join.
- Renders 180-day SVG price chart server-side (pure SVG, no interactivity).
- Client islands: "+ Watchlist" button, "Recommend" modal (user picker). Both call server actions.

### `/films` — Server Component shell + Client search island (public)
- Server renders the filtered/sorted grid based on URL params.
- Client island: debounced search input that updates URL params via `router.push`; Next.js re-renders the server component. URL-driven state means each search is shareable.

### `/lists` — Server Component (public, browse + subscribe)
- Renders public lists in featured layout + full grid. Official lists get the stamp.
- Subscribe button is a client island (needs session): calls `subscribeToList(listId)` server action.

### `/settings` — Client Component (authed, forms)
- Six tabs. MVP implements Profile (handle, display_name, bio, avatar_url, `broadcast_watchlist_adds`). Other tabs render a "coming soon" stamp — they'd require schema extensions (quiet hours, notification prefs, bound storefronts) that don't exist yet and aren't MVP-required.
- Oath-tab threshold shows the user's current default (stored in localStorage — MVP is fine with ephemeral client state since only the onboarding flow uses it at launch). Persisting to DB is deferred to sub-project 5 when the notifications pipeline consumes it.

### `middleware.ts` — runs on every route
- Refreshes Supabase session cookies via `@supabase/ssr`.
- Redirects:
  - Unauth visit to `/home`, `/onboarding`, `/settings` → `/auth/signin?redirect=<path>`
  - Authed visit to `/` → `/home`
  - Authed visit to `/auth/signin`, `/auth/signup` → `/home`
  - Public: `/film/[id]`, `/films`, `/lists`, `/auth/callback`, `/auth/signin`, `/auth/signup`

## Supabase client wiring

Three entry points, each with distinct context and security posture.

### Server Components (`lib/supabase/server.ts`)
Uses `createServerClient` from `@supabase/ssr` with a cookie adapter reading `next/headers`' `cookies()`. Every query runs with the user's JWT if one exists — RLS evaluates `auth.uid()` correctly. Anonymous requests see only `anon`-scoped data.

### Client islands (`lib/supabase/client.ts`)
Uses `createBrowserClient` from `@supabase/ssr`. Minimal MVP use — most client islands call server actions rather than issuing direct queries. Kept for realtime subscriptions in sub-project 6.

### Server actions
Same `lib/supabase/server.ts` client, called from functions marked `"use server"`. Form handlers and client islands invoke actions; actions issue the real mutation with the session-bound client.

### What's NOT in `app/`:
- The `service_role` key. Only `worker/` and `db/` hold it; those are the packages that legitimately bypass RLS. The app never escalates.

### Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Both are `NEXT_PUBLIC_` — they ship to the browser. That's fine: the anon key is intentionally public-safe, and RLS protects everything sensitive. No server-only secret is required for the MVP.

### Query organization — `lib/queries/*.ts`
- `films.ts` — `getFilm(client, id)`, `getFilms(client, opts)`, `getDealsForUser(client, userId)`, `getLandingMarquee(client)`
- `watchlists.ts` — `getMyWatchlist(client)`, `isOnWatchlist(client, filmId)`
- `lists.ts` — `getPublicLists(client, opts)`, `getList(client, id)`, `getSubscribedLists(client, userId)`
- `profiles.ts` — `getProfile(client, handleOrId)`
- `activity.ts` — `getFeed(client, userId, limit)`
- `reviews.ts` — `getPublishedReviewsForFilm(client, filmId)`

Each takes a Supabase client as first arg so callers control context. Each returns rows typed from `lib/supabase/types.ts`.

### Action organization — `lib/actions/*.ts`
- `auth.ts` — `signUp(email, password)`, `signIn(email, password)`, `signOut()`
- `watchlists.ts` — `addToWatchlist(filmId, maxPriceUsd?)`, `removeFromWatchlist(filmId)`
- `lists.ts` — `subscribeToList(listId)`, `unsubscribeFromList(listId)`
- `onboarding.ts` — `completeOnboarding(payload)`
- `profile.ts` — `updateProfile(fields)` (MVP: handle, display_name, bio, avatar_url, broadcast_watchlist_adds)
- `recommendations.ts` — `recommendFilm(filmId, toUserId, note)`

Every action opens `const supabase = await createClient()` and issues mutations. RLS is the sole authorization layer. Action code is just the happy path plus input validation.

## Dev environment + staging + Vercel

### Local dev (Supabase CLI local stack)
Install Supabase CLI. From repo root:
```
supabase init
supabase start
```
`supabase start` spins up Postgres, GoTrue, PostgREST, Studio, Realtime, Storage in Docker. Prints local URLs + generated anon/service keys. Copy into `app/.env.local`.

Apply migrations against the local stack:
```
cd worker && npm run migrate
cd ../db && npm run migrate
```

Then `cd app && npm run dev`. Full offline dev loop.

### Hosted staging
One Supabase project at supabase.com named `film-goblin-staging`. Migrations applied once via `DATABASE_URL` pointing at the hosted DB. Worker's `npm run seed` seeds ~500 films. A single manual worker run from laptop (`npm run worker`) populates price history.

Hosted anon key + URL go into Vercel's env vars. The project's service_role key stays in a password manager — never in the repo, never in Vercel if Vercel is only running `app/`.

### Vercel setup
- `rexnowacki/film-goblin` already connected to GitHub.
- Link via dashboard: root directory = `app/`. Framework preset = Next.js (auto-detected).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from the staging Supabase project).
- Trunk-based: push to `master` → production deploy. PR branches get preview URLs automatically (useful but not spec-gated).

### Supabase Site URL allowlist
In Supabase project settings → Authentication → URL Configuration, add both:
- `http://localhost:3000`
- `https://<vercel-production-url>`

Required so confirm-email callbacks work from both environments without leaking redirects.

### Scripts on `app/package.json`
```
"dev": "next dev"
"build": "next build"
"start": "next start"
"lint": "next lint"
"typecheck": "tsc --noEmit"
"test": "vitest run"
"gen:types": "supabase gen types typescript --local > lib/supabase/types.ts"
```

## Testing

Thin by design. Sub-projects 1 and 2 invested heavily in tests at the layers that matter (price diffing, RLS enforcement). Sub-project 3 is mostly glue.

### What's tested
1. **Server action unit tests** (`app/tests/actions/*.test.ts`) — Vitest. Per action: seed a user in testcontainers Postgres (reuse `db/tests/helpers/testcontainers.ts`), call the action with a mocked cookie/session, assert DB state and RLS behavior. ~10–15 tests total.
2. **Middleware redirect tests** (`app/tests/middleware.test.ts`) — 3 tests: unauth → signin redirect, authed root → home, public routes unaffected.
3. **Type safety** — `npm run typecheck` in CI. Generated Supabase types give compile-time guarantees on query shapes.

### What's not tested
- React component rendering (no snapshot tests, no @testing-library/react)
- End-to-end auth flow in a real browser (no Playwright)
- Vercel preview deploys as correctness gates

A manual test plan lives in `app/README.md` as a checklist for the MVP flow: signup → confirm email → onboard → add to watchlist → verify in Supabase Studio.

### CI
`.github/workflows/ci.yml` runs on push:
- `npm install` in `worker/`, `db/`, `app/`
- `npm test` in each
- `npm run typecheck` in `app/`
- `npm run build` in `app/`

GitHub-hosted runners have Docker; testcontainers works there the same as locally.

## Deferred / future

- Deals, Friends, Alerts, List Detail, Mobile showcase pages (sub-projects 5/6 or standalone).
- Playwright E2E, visual regression.
- Realtime subscriptions (sub-project 6).
- Notifications pipeline UI (sub-project 5).
- Custom domain.
- Service-role secret in Vercel (only needed when worker moves to `/api/cron/refresh-prices` — sub-project 4).
- Sentry, analytics.

## What this spec does not produce

- A fully feature-complete Film Goblin. Seven routes is MVP; the remaining five are explicitly punted.
- A cron-running worker. The worker still runs manually against staging DB until sub-project 4 mounts it at `/api/cron/`.
- Notifications delivery. Drops in `price_alerts` exist; sending email / push is sub-project 5.

This spec ends when `git push origin master` produces a Vercel deploy where a new user can sign up, onboard, add a film to a watchlist, and reload to see it — backed by the real staging Supabase DB.
