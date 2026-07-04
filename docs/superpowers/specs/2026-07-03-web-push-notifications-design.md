# Web Push Notifications — Design

**Date:** 2026-07-03
**Status:** Approved
**Branch:** `feature/web-push-notifications`

## Problem

Film Goblin has in-app notifications (bell) and email digests, but no push. A price
drop, a coven invite, or a gazing summon only reaches a user who chooses to return.
Push is the cheapest retention lever at small N (engagement-frontier Frontier 5),
and the iOS PWA install habit the app already cultivates is the prerequisite
(iOS 16.4+ requires Home-Screen install for Web Push).

## Decisions (owner-approved 2026-07-03)

- **v1 events:** social kinds + price drops. No goblin-pick/ritual kinds, no
  rate reminders, no likes.
- **Opt-in UI:** a single toggle in Settings. No per-kind preferences in v1.
- **Send path:** `pg_net` trigger on `notifications` INSERT (approach A below).

### Send-path alternatives considered

- **A (chosen): `pg_net` AFTER INSERT trigger on `notifications`** posting to an
  app fanout route. One choke point catches every producer — server actions, DB
  triggers (comments, coven), and the worker (price drops). Config versioned in a
  migration. Async and fail-soft: a dead endpoint loses the push, never blocks
  the insert.
- **B: Supabase dashboard Database Webhook.** Same mechanism (pg_net underneath)
  but hand-configured in the dashboard — invisible to the repo. Rejected for
  unversioned config.
- **C: cron sweep of unsent notifications.** Vercel Hobby crons are daily;
  next-day push is not push. Rejected.

## Architecture

```
producer (action / DB trigger / worker)
      └─ INSERT INTO notifications
            └─ AFTER INSERT trigger (SECURITY DEFINER)
                  └─ pg_net http_post → POST /api/push/fanout  (bearer secret)
                        └─ kind ∈ PUSH_KINDS?
                              └─ web-push send → each push_subscriptions row
                                    └─ 404/410 → delete dead subscription
```

## Components

### 1. Migration 0208 — `push_subscriptions` + trigger

```sql
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One row per device/browser. No `push_enabled` profile flag — the Settings toggle
subscribes/unsubscribes the *current device*; the row's existence is the state.

RLS: owner `SELECT`/`INSERT`/`DELETE` (`user_id = auth.uid()`); no UPDATE
policy. Fanout reads via service role. Endpoint collision (same device
re-subscribing, possibly under a different account) is resolved in the action:
the delete-by-endpoint step runs via **service role** — an owner-scoped delete
could not clear another user's stale row and the unique index would block the
insert. Endpoints are unguessable push-service URLs, so possession of the
endpoint is proof of device control.

Trigger: `AFTER INSERT ON notifications FOR EACH ROW` → `SECURITY DEFINER`
function `notify_push_fanout()` reads the fanout URL and secret from a
service-role-only settings row and calls
`net.http_post(url, jsonb_build_object('notification_id', NEW.id), headers)`.
Requires `CREATE EXTENSION IF NOT EXISTS pg_net`. The secret is **not** in the
migration file — it is inserted manually post-migration (same discipline as
`CRON_SECRET`). If the secret row is absent, the function returns without
calling out (fail-soft, logged via `RAISE WARNING` — no silent `||` fallback
masking; the absence is visible in Postgres logs).

pg-mem note: trigger + SECURITY DEFINER means this migration joins the pg-mem
strip list per `db/CLAUDE.md`.

### 2. Fanout route — `app/app/api/push/fanout/route.ts`

`POST` only. Verifies `Authorization: Bearer $PUSH_FANOUT_SECRET`. Loads the
notification row by id via service role. Filters against `PUSH_KINDS`:

```
coven_invite_pending, coven_invite_accepted, recommendation_received,
comment_on_activity, reply_on_comment, gazing_rsvp, price_drop
```

(Excluded in v1: `like_on_comment`, `rate_reminder`, `theater_showing_match`,
`film_request_fulfilled`, `goblin_summon` — trivial to add later by extending
the allowlist.)

Builds the payload with a pure function `buildPushPayload(kind, payload, actor)`
→ `{ title, body, url, tag }`. Copy in the goblin/zine voice (register rules:
film-goblin-docs-and-writing). `tag` = `"{kind}:{subject-id}"` so repeat events
collapse instead of stacking. `url` deep-links to the relevant surface (film
page, activity thread, coven page).

Sends via the `web-push` npm package to every subscription for `user_id`. On
`WebPushError` with status 404/410, deletes that subscription row. Returns 200
in all handled cases (pg_net does not retry; there is nothing useful to signal).

### 3. Service worker — `app/public/sw.js`

Single-purpose, no caching, no fetch handler (offline caching is out of scope;
the repo's iOS PWA history argues for a minimal worker):

- `push` → `self.registration.showNotification(title, { body, tag, data: { url }, icon })`
- `notificationclick` → close, focus an existing client on that URL or `clients.openWindow(url)`

### 4. Opt-in UI + actions

`PushToggle` client component in Settings ("Push notifications" block):

- On mount, reflects state: worker registered + `pushManager.getSubscription()` non-null.
- Enable: register `/sw.js` → `Notification.requestPermission()` →
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })`
  → `subscribeToPush(subscription)` server action.
- Disable: `subscription.unsubscribe()` → `unsubscribeFromPush(endpoint)`.
- Capability gating: if `!("PushManager" in window)` (iOS Safari outside a
  Home-Screen install), render a hint — "Install Film Goblin to your Home
  Screen to enable push" — instead of a dead switch. If permission is
  `denied`, say so plainly with a pointer to browser settings.

Actions in `app/lib/actions/push.ts`, standard `_private`/public split with
`requireAuthUser`; `subscribeToPush` validates endpoint is an `https:` URL,
deletes any existing row with that endpoint via service role (see RLS note in
§1), then inserts the caller-owned row. No `revalidatePath` needed (no
rendered reads).

### 5. Env vars

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel all envs + `.env.local` | client subscribe key |
| `VAPID_PRIVATE_KEY` | Vercel (sensitive) + `.env.local` | web-push signing |
| `VAPID_SUBJECT` | Vercel + `.env.local` | `mailto:` contact per RFC 8292 |
| `PUSH_FANOUT_SECRET` | Vercel (sensitive) + `.env.local` + DB settings row | trigger→route auth |

Generate keys once: `npx web-push generate-vapid-keys`. Rotation: VAPID rotation
invalidates all subscriptions (users must re-toggle) — document that in the env
catalog; `PUSH_FANOUT_SECRET` rotation mirrors the `CRON_SECRET` procedure plus
updating the DB settings row.

## Rollout order

**App deploy first, then migration 0208, then insert the secret settings row.**
The trigger only starts firing once the migration lands; the route must already
exist. (Even a premature fire is harmless — pg_net is async fail-soft.)

## Error handling summary

- Trigger: missing secret/URL → `RAISE WARNING`, skip. Never blocks the insert.
- Route: bad secret → 401; unknown notification id → 200 (drop); non-allowlisted
  kind → 200 (drop); per-subscription send failures logged, 404/410 prunes.
- Client: permission denied / unsupported → honest inline copy, no dead toggle.

## Testing

- **Unit (app):** `buildPushPayload` per kind (title/body/url/tag); `PUSH_KINDS`
  membership; fanout route auth rejection (401 without secret).
- **Integration (env-blocked, `library.test.ts` template):** `_subscribeToPush`
  insert/replace/unsubscribe round-trip.
- **RLS (`db/tests/rls/`):** owner can insert/select/delete own subscription;
  cannot read another user's; service role reads all.
- **Manual smoke:** deploy → enable toggle on iOS Home-Screen install → send a
  coven invite from moss.witch → push arrives, tap deep-links correctly; then a
  desktop Chrome pass.

## Out of scope (v1)

Per-kind preferences, notification batching/digesting, push analytics /
delivery tracking table, offline caching in the service worker, likes and
ritual kinds in the allowlist.

## Success signal (engagement-frontier Frontier 5)

≥ 20% of active iOS users grant push; watch absolute return counts from
push-originated sessions (tag entry URLs with `?src=push`).
