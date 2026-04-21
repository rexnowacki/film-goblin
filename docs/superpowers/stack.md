# Film Goblin — Production Stack

The stack Film Goblin is being rebuilt on. Committed direction as of 2026-04-20. Individual sub-project specs (`docs/superpowers/specs/`) may re-validate decisions in context, but default to this unless a spec overrides it.

## Frontend

- **Next.js 15 (App Router) + React + TypeScript**
- **Styling:** taste call between Tailwind and keeping the existing zine-CSS from `src/styles.css`. No commitment yet. Tailwind gives utility parity with the current design tokens; zine-CSS is already written and coherent. Decide at sub-project 3.
- SSR matters for SEO on film pages ("midsommar cheap apple tv" should rank).
- API routes for internal-only endpoints (cron, webhooks).

## Backend

- **Supabase.** Postgres + auth + RLS + realtime subscriptions + storage in one platform.
- RLS policies live in Postgres, co-located with the data.
- Realtime subscriptions handle activity feeds and future social features without a bespoke WebSocket server.
- Schema-first: SQL migrations under version control from day one. Supabase's migration tooling generates TypeScript types automatically.

**Explicitly not:** Firebase Firestore (document store fights relational shape), Convex (smaller ecosystem), Pocketbase (defer self-hosting). No custom Go/Rust/Python service — the price-tracking worker is Node for parity with the frontend.

## Price-tracking worker

- Decided in sub-project 1: **iTunes Search API** (US storefront only, 4h cadence, no affiliate, no scraping). See `specs/2026-04-20-apple-data-source-design.md`.
- Currently runs as a standalone TypeScript CLI at `worker/`. Next step (sub-project 3/4): HTTP-mount at `/api/cron/refresh-prices` behind **Vercel Cron**.
- Migration path if Vercel's serverless time limits bite: **Cloudflare Workers** (cron triggers, cheaper at scale) or a **Fly.io** machine for long-running Node.

## Notifications

- **Resend** for transactional email. Developer-friendly, good deliverability.
- **Web push** via the standard Push API + VAPID — free, works in Chrome/Firefox/Edge/Safari 16+. iOS 16+ requires Add-to-Home-Screen first; flag this as real friction in the design.

No SMS (Twilio), no native push, no React Native / Expo at launch. Web push closes ~80% of the "feels like an app" gap without the native build surface.

## Hosting

- **Vercel** — Next.js app, cron routes, preview deploys per PR.
- **Supabase Cloud** — Postgres, auth, storage.
- **Cloudflare** — DNS, static assets, future CDN.

Expected cost: $0–$25/mo pre-traffic, $50–$150/mo once real users land.

## Search

- **Postgres full-text search** with a GIN index on `tsvector` columns.
- Migration target if it stops being enough: **Meilisearch** or **Typesense** self-hosted. Not Algolia (cost) or Elasticsearch (ops overhead).

## Analytics

- **Plausible** or **PostHog.** Plausible for pageviews and clean design; PostHog for funnels, feature flags, session replay.
- Not Google Analytics — the zine-voice product shouldn't ship Google's script tag.

## Explicitly deferred / not now

- React Native / Expo (web push gets us most of the way, ship the web app first).
- Redis (Postgres is fast enough for a long time; add only when instrumentation proves otherwise).
- Kubernetes, Docker Compose, Terraform, microservices — Vercel + Supabase *is* the ops story.
- Mobile native apps — PWA + Add-to-Home-Screen first.
- Elasticsearch / Algolia — premature until Postgres FTS demonstrably can't keep up.

## Non-negotiables

- **TypeScript, not JavaScript.** Nine+ relational entities (users, films, watchlists, friendships, lists, DMs, reviews, price_history, price_alerts) pays TypeScript back within a week. Supabase CLI generates types from the schema, so the frontend knows about the DB without a duplicate.
- **Schema-first.** SQL migrations under version control, starting at sub-project 2. Easiest thing to regret skipping at month six.
