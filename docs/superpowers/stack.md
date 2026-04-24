# Film Goblin — Production Stack

The stack Film Goblin runs on. Most of the rebuild is shipped as of 2026-04-23; individual sub-project specs (`docs/superpowers/specs/`) capture the per-decision reasoning. This file is the evergreen reference — if a future decision supersedes one here, update this file too.

## Frontend

- **Next.js 15 (App Router) + React 19 + TypeScript.** Shipped, deployed at https://film-goblin.vercel.app.
- **Styling: zine-CSS** (ported to `app/app/globals.css`). Decided at sub-project 3; Tailwind rejected. Custom properties + utility classes (`.h-display`, `.stackable`, `.grid-auto`, `.check-zine`, `.btn` family) over a framework. Single 720px mobile breakpoint.
- SSR on film pages for SEO ("midsommar cheap apple tv" should rank).
- API routes for internal-only endpoints (cron, auth callback, unsubscribe).

## Backend

- **Supabase.** Postgres + auth + RLS + realtime subscriptions + storage in one platform.
- RLS policies live in Postgres, co-located with the data.
- Realtime subscriptions handle activity feeds and future social features without a bespoke WebSocket server.
- Schema-first: SQL migrations under version control from day one. Supabase's migration tooling generates TypeScript types automatically.

**Explicitly not:** Firebase Firestore (document store fights relational shape), Convex (smaller ecosystem), Pocketbase (defer self-hosting). No custom Go/Rust/Python service — the price-tracking worker is Node for parity with the frontend.

## Price-tracking worker

- **iTunes Search API** (US storefront only, 4h cadence, no affiliate, no scraping). Decided in sub-project 1. See `specs/2026-04-20-apple-data-source-design.md`.
- Runs in two shapes: CLI (`worker/ npm run worker`) for local admin/debug, and a **Vercel Cron** route at `app/app/api/cron/refresh-prices/` for production. The cron route imports the worker's `runOnce` via a `file:` dependency.
- Migration path if Vercel's serverless time limits bite: **Cloudflare Workers** (cron triggers, cheaper at scale) or a **Fly.io** machine for long-running Node.

## Notifications

- **Resend** for transactional email. Shipped in sub-project 5; price-drop digests go through the `notifier/` package, fired from `app/app/api/cron/send-notifications/`. Real sender domain is queued in the roadmap — currently in Resend's sandbox (limited to account-holder inbox).
- **Web push** via the standard Push API + VAPID — free, works in Chrome/Firefox/Edge/Safari 16+. **Not shipped yet;** queued in the roadmap. iOS 16+ requires Add-to-Home-Screen first.

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

- **TypeScript, not JavaScript.** Nine+ relational entities pay TypeScript back within a week. `app/ npm run gen:types` regenerates `lib/supabase/types.ts` from the local Supabase so the frontend knows about the DB without a duplicate.
- **Schema-first.** SQL migrations under version control at `db/migrations/`. Canonical for the production app — `worker/migrations/` is a legacy stub that `0100_drop_watchlists_stub.sql` retires.
