# notifier/ — Notifications Package

Library only. No CLI, no standalone process, no cron entrypoint.

## What it does

Sends daily price-drop digest emails via Resend. Consumed by `app/app/api/cron/send-notifications/` as a file dependency (`film-goblin-notifier`).

## Files

- `src/index.ts` — exports `sendDailyDigests(client, resend, opts)`. This is the only public API.
- `src/query.ts` — `findPendingDigests`: reads `price_alerts` rows that haven't been notified yet, grouped by user.
- `src/render.ts` — `renderDigestEmail`: builds the HTML/text email from a digest payload.
- `src/resend.ts` — `sendDigest`: calls the Resend API and marks alerts as notified in a transaction.

## Usage

```ts
import { sendDailyDigests } from "film-goblin-notifier";

const counters = await sendDailyDigests(pgClient, resendClient, {
  from: "Film Goblin <noreply@film-goblin.app>",
  baseUrl: "https://film-goblin.vercel.app",
});
```

The `pgClient` is a raw `pg.Client` (not Supabase). The cron route in `app/` creates and manages the connection.

## Sender domain

`goblin@freshfromthepit.com` — domain verified in Resend, fully out of sandbox. `NOTIFY_FROM_EMAIL` in Vercel is set to `"Fresh From The Pit <goblin@freshfromthepit.com>"`.

## Tests (run from `notifier/`)

```bash
npm test       # vitest
npm run typecheck
```

Tests mock the Resend API and pg client — no real network or DB needed.
