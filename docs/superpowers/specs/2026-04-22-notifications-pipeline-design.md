# Notifications Pipeline — Design Spec

**Sub-project:** 5 of 6 (production rebuild).
**Status:** design.
**Predecessors:** sub-project 2 (schema + RLS — `price_alerts` table), sub-project 4 (worker cron mount — populates `price_alerts`).
**Successors:** sub-project 6 (social features) will add more notifiable event types. Web push notifications are deferred to a follow-up spec.

## Goal

Deliver one daily email digest per user summarizing the previous day's
price drops on watchlisted films. Ends when a Vercel Cron invocation
reads undelivered `price_alerts` rows, groups them by user, renders a
zine-styled HTML+text email, sends it via Resend, and marks the alerts
delivered. Ships with a one-click unsubscribe link and a Settings-page
toggle.

## Scope

- **In:** Email via Resend · daily digest (one email per user per day) ·
  `profiles.email_notifications_enabled` flag · token-based unsubscribe
  route · Settings page toggle · `notified_at` tracking on alerts.
- **Out:** Web push · recommendation/follow/review emails · per-type
  preferences · user-selectable cadence · real domain / production
  sending (MVP uses Resend sandbox → account-holder inbox only) · bounce
  handling · in-app notifications inbox.

## Architecture

### New cron route

`app/app/api/cron/send-notifications/route.ts` — a GET Route Handler
that mirrors `refresh-prices`:

1. Checks `Authorization: Bearer ${process.env.CRON_SECRET}` (same
   secret the refresh-prices route uses) → 401 otherwise.
2. Asserts `DATABASE_URL` + `RESEND_API_KEY` are set → 500 on missing.
3. Opens a `pg.Client`, calls `sendDailyDigests(client, resend, opts)`
   from the new `notifier` package.
4. Logs the digest via `console.log`, returns `{ ok: true, digest }`.
5. On error: 500 + Sentry capture; `client.end()` in `finally`.

Scheduled daily at **10:00 UTC** via `app/vercel.json` — one hour after
`refresh-prices` runs at 09:00, so the notifier sweeps the fresh batch.

### New workspace package: `notifier/`

Same pattern as `worker/`: pure logic, no Next.js imports, no HTTP
framework. Owns three files:

- `notifier/src/query.ts` — `findPendingDigests(client): PendingDigest[]`.
  One SQL query that joins `price_alerts → watchlists → films →
  profiles → auth.users`, filtered `WHERE notified_at IS NULL AND
  email_notifications_enabled = TRUE`, grouped into one row per user with
  their alerts aggregated.
- `notifier/src/render.ts` — pure function
  `renderDigestEmail(user, alerts): { subject, html, text }`.
- `notifier/src/resend.ts` — thin wrapper over the Resend SDK exposing
  `sendDigest(resend, user, rendered)`.
- `notifier/src/index.ts` — orchestrator `sendDailyDigests(client,
  resend, opts)`: queries pending digests, renders each, sends via
  Resend, stamps `notified_at = now()` on every included alert inside a
  transaction, returns a `{ sent, skipped, failed }` counter.

`notifier/package.json` exports `./src/index.ts` so the app can import
`{ sendDailyDigests } from "film-goblin-notifier"`. App workspace adds
`"film-goblin-notifier": "file:../notifier"` as a dep, identical
pattern to the worker.

### Data flow per invocation

```
Cron hits /api/cron/send-notifications
  → Route handler auths + opens pg
  → sendDailyDigests()
      → findPendingDigests(pg) returns [{user, alerts}, ...]
      → for each user:
          rendered = renderDigestEmail(user, alerts)
          try:
            await resend.emails.send(rendered)
            BEGIN; UPDATE price_alerts SET notified_at=now()
              WHERE id IN (...alertIds); COMMIT;
            counters.sent++
          catch e:
            log + Sentry; counters.failed++
      → return counters
  → Route returns {ok: true, digest: counters}
```

Failure isolates to the per-user send. One user's bounced email doesn't
stop the rest of the batch. Failed sends leave `notified_at` NULL and
get retried next day.

## Schema changes

Two new migrations under `db/migrations/`:

### `0114_email_notifications.sql`

```sql
-- Default-on email notification preference for every user.
ALTER TABLE profiles
  ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Per-alert delivery marker. NULL = not yet delivered.
ALTER TABLE price_alerts
  ADD COLUMN notified_at TIMESTAMPTZ;

-- Speeds up the notifier's "find undelivered alerts" scan.
CREATE INDEX price_alerts_notified_at_null_idx
  ON price_alerts (created_at)
  WHERE notified_at IS NULL;
```

### `0115_unsubscribe_token.sql`

```sql
ALTER TABLE profiles
  ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX profiles_unsubscribe_token_idx
  ON profiles (unsubscribe_token);
```

Existing rows auto-populate via `DEFAULT gen_random_uuid()`. No new RLS
policies — the notifier reads via service_role (bypasses RLS), and the
unsubscribe route matches on token (no auth context).

## Digest content

### Subject line

- 1 deal: `A film just dropped: {title}`
- N deals (N≥2): `{N} films from your watchlist just dropped`

### Body structure (HTML, inline-styled)

1. Zine header — "Film Goblin" wordmark, bone-on-void accent stripe.
2. Eyebrow: `Chapter I · The Pit`.
3. Deal blocks (one per alert):
   - Film title (DM Serif Display → Georgia serif fallback).
   - Director · Year · Runtime.
   - Old price struck through → new price in accent color.
   - "X% off" stamp.
   - 150×225 artwork thumbnail from `films.artwork_url` (Apple CDN URL,
     embedded via `<img src>`).
   - Primary CTA: "Summon on Apple TV" → `films.itunes_url`.
   - Secondary: "View on Film Goblin" →
     `https://film-goblin.vercel.app/film/{id}`.
4. Footer:
   - Unsubscribe link: `https://film-goblin.vercel.app/api/unsubscribe/{token}`.
   - Manage preferences link: `https://film-goblin.vercel.app/settings`.

### Rendering module

`notifier/src/render.ts` exports one pure function:

```ts
export function renderDigestEmail(
  user: { handle: string; email: string; unsubscribe_token: string },
  alerts: Array<{
    film: { id: string; title: string; director: string; year: number;
            runtime_min: number; artwork_url: string; itunes_url: string };
    old_price_usd: number;
    new_price_usd: number;
  }>
): { subject: string; html: string; text: string };
```

Both HTML and text outputs emit together — Resend bundles both into the
MIME envelope, improving deliverability and giving no-HTML clients
readable content.

### Email client constraints

- **Inline CSS only.** No `<style>` blocks — Gmail strips them in many
  contexts; Outlook mangles them.
- **Web fonts declared but not required.** `font-family: "Rubik Wet
  Paint", Georgia, serif` — users whose clients load the font see zine
  typography; everyone else gets a serviceable serif.
- **`<img src>` embedding only.** No base64 inlining, no MIME
  attachments.
- **List-Unsubscribe header** included:
  `<https://film-goblin.vercel.app/api/unsubscribe/{token}>`. Tells
  Gmail/Apple Mail to render a native Unsubscribe button.

## Unsubscribe + Settings toggle

### `GET /api/unsubscribe/[token]`

Public, unauthenticated route. Handler at
`app/app/api/unsubscribe/[token]/route.ts`:

1. Reads `token` from `params`.
2. `UPDATE profiles SET email_notifications_enabled = FALSE WHERE
   unsubscribe_token = token RETURNING handle, email`. If no row
   returned → 404 HTML: "This unsubscribe link is no longer valid."
3. On match → 200 HTML confirmation: "You're off the list. You can turn
   emails back on under `/settings` any time." with a link to
   `/settings`.

One-click. No "are you sure?" — per RFC 8058 and email-client
expectations. Tokens never expire.

### Settings page toggle

The existing `/settings` page gains an "Email Notifications" section
below the profile form. Implementation extends `updateProfile`:

- `ProfileFields` interface gains
  `email_notifications_enabled?: boolean`.
- `SettingsForm.tsx` renders a `<label><input type="checkbox"
  name="email_notifications">` row with `defaultChecked={profile.email_notifications_enabled}`.
- When a user re-enables via the toggle (transitioning `false → true`),
  `_updateProfile` additionally rotates `unsubscribe_token =
  gen_random_uuid()` in the same UPDATE. This invalidates any leaked
  token from the prior subscription period.

## Environment variables

New entries on Vercel (and in `app/.env.local.example`):

- **`RESEND_API_KEY`** — required. From https://resend.com/api-keys.
  Dev and prod use the same sandbox-scoped key until a verified domain
  is added.
- **`NOTIFY_FROM_EMAIL`** — required. The sender address. In sandbox
  mode this must be a Resend-reserved sandbox address (e.g.
  `onboarding@resend.dev`); emails only reach the account-holder's
  verified inbox. Flipping this to `deals@yourdomain.com` after domain
  verification lights up real user delivery with no other code changes.
- **`APP_BASE_URL`** — required. `https://film-goblin.vercel.app` in
  prod, `http://localhost:3000` locally. Used for unsubscribe + film
  detail links in the rendered email.

Reused from sub-project 4:
- `CRON_SECRET` — same bearer as `refresh-prices`.
- `DATABASE_URL` — same staging Supabase session pooler.

## Testing strategy

### 1. `notifier/tests/` — pure logic

- `render.test.ts` — unit tests against `renderDigestEmail`:
  - Subject pluralization (1 vs N).
  - HTML contains film titles, prices, CTAs.
  - Unsubscribe URL contains the user's token.
  - Text output mirrors HTML content.
  - No DB, no network.
- `query.test.ts` — pg-mem integration (same pattern as
  `worker/tests/db.test.ts`):
  - Users with `email_notifications_enabled = false` excluded.
  - Alerts with `notified_at IS NOT NULL` excluded.
  - Multiple alerts per user grouped.
  - Users with zero pending alerts produce no digest.

### 2. `app/tests/routes/cron-send-notifications.test.ts`

Mirrors `cron-refresh-prices.test.ts`. Mocks `pg` + `film-goblin-notifier`.
Six tests: missing auth → 401, wrong bearer → 401, missing
`DATABASE_URL` → 500, missing `RESEND_API_KEY` → 500, happy path → 200
with counter JSON, notifier throws → 500 + `client.end()`.

### 3. `app/tests/routes/unsubscribe.test.ts`

Mocks `pg`. Three tests: invalid token → 404 HTML, valid token → 200
HTML + UPDATE called, valid token with already-disabled flag → still
200 (idempotent).

### 4. Manual smoke — not automated

- Hitting Resend sandbox during T-deploy with a real curl to the live
  endpoint; verify the account-holder inbox receives the digest.
- Spam-score check on the delivered email via Gmail's "Show original".
- Email client rendering — we pick conservative inline-styled HTML and
  accept that Outlook 2013 looks worse than Gmail. No Litmus / Email on
  Acid integration.

## Failure semantics

Per-invocation errors isolate to individual sends:

| Failure | Effect |
|---------|--------|
| `pg.Client.connect()` throws | 500, no work done, retry next day |
| `findPendingDigests()` throws | 500, no work done |
| `renderDigestEmail()` throws (shouldn't; pure) | skip user, counter++, continue batch |
| `resend.emails.send()` rejects | log + Sentry, skip user, counter++, continue batch; `notified_at` stays NULL |
| `UPDATE price_alerts SET notified_at` fails | Sentry; CRITICAL because we may double-send the next day. Mitigation: single transaction per user, so partial stamping can't happen |
| All users' emails succeed | counters.sent = N, 200 |

No retry logic inside the handler. Failed sends retry on the next
daily cron run via the `notified_at IS NULL` filter.

## Dependencies

New npm packages:
- `resend` — in `notifier/` (not app/). Latest 4.x.

Reused:
- `pg` — already in `worker/`, now also in `notifier/`.
- `@sentry/node` — already in `worker/` and `app/`.

Root `workspaces` adds `notifier`. `app/package.json` adds
`film-goblin-notifier: file:../notifier`.

## Out of scope

- **Web push notifications.** Original plan mentioned email + push;
  this sub-project is email-only. Push gets its own future spec.
  Backlog entry added.
- **Recommendation / follow / review emails.** Sub-project 6 adds
  those events; notification pipeline extends when they exist.
- **Per-type preferences.** Single email-on/off toggle for now.
- **User-selectable cadence.** Backlog.
- **Real domain / production sending.** Sandbox only. Domain upgrade
  is a post-merge env-var flip.
- **Bounce / complaint handling.** Backlog.
- **In-app notifications inbox.** Backlog.
- **Unsubscribe rate limiting.** YAGNI — token-gated + idempotent.
