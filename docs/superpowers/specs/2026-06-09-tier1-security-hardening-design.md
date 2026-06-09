# Tier 1 Security Hardening — Design

**Date:** 2026-06-09
**Status:** Approved
**Driver:** Pre-launch security review (this session). Three Tier-1 findings must land
before the invite gate (`site_settings.invite_gate`) is opened to the public.

## Problem

1. **`profiles` is world-readable, including `unsubscribe_token`.** The
   `profiles_read` policy (mig 0101) is `FOR SELECT TO anon, authenticated USING (true)`.
   The anon key ships in the JS bundle, so anyone — no account — can
   `GET /rest/v1/profiles?select=*` and scrape every column of every user:
   `unsubscribe_token` (mass-unsubscribe attack), `must_change_password`, and all
   email-pref flags. (Identity-subset enumeration remains possible by design — see
   "Accepted residual risk" under Fix 1.)
2. **No abuse controls on the auth surface.** `signIn` allows unlimited password
   brute force (and `signUp` uses `admin.createUser`, which bypasses Supabase's own
   auth rate limits). `checkUsernameAvailability` is an unauthenticated, unlimited,
   service-role-backed username enumeration oracle. Password minimum is 6.
   The existing rate-limit infra (mig 0190, `consume_app_rate_limit`) is keyed by
   `user_id` and can't cover pre-auth endpoints.
3. **Server-action validation is bypassable.** Any user's JWT works directly against
   PostgREST, skipping `USERNAME_RE` and all length caps. The DB has no CHECK
   constraints on `profiles.username` format or on `display_name`/`bio`/`avatar_url`/
   `watched.note` lengths — unbounded writes and malformed usernames (broken
   `/p/[username]` routes, impersonation) are one curl away.

## Decisions (locked with Rex)

- **Anon (logged-out) visitors keep a public identity subset** of profiles:
  `id, username, display_name, avatar_url, bio, role, created_at`. Public pages
  (`/film/[id]` comments, `/p/[username]`, `/gazing/[token]`) keep rendering for
  logged-out visitors exactly as today.
- **The 3 legacy mixed-case usernames (`RyLoCrow`, `Jarbo`, `Moss.whorre`) get
  lowercased** in the constraints migration, then the strict lowercase CHECK applies.
  Sign-in and profile lookups are `ilike`, so logins and URLs are unaffected.

## Fix 1 — Profiles column-level grants

**Migration `0203_profiles_column_grants.sql`** (RLS policies unchanged; grants layer
on top of row policies):

```sql
REVOKE ALL ON profiles FROM anon, authenticated;

-- Public identity subset for logged-out visitors
GRANT SELECT (id, username, display_name, avatar_url, bio, role, created_at)
  ON profiles TO anon;

-- Authenticated: everything EXCEPT unsubscribe_token (now server-only)
GRANT SELECT (id, username, display_name, bio, avatar_url, broadcast_watchlist_adds,
  created_at, updated_at, broadcast_library, broadcast_watched, onboarded_at,
  email_added_at, email_price_drops, email_coven_recs, email_comments,
  email_coven_invites, role, notify_rate_reminders, notify_comment_likes,
  lane_tag_ids, discoverable, is_starter, starter_order, notify_film_requests,
  must_change_password)
  ON profiles TO authenticated;

-- Only the columns user-facing actions legitimately write
GRANT UPDATE (username, display_name, bio, avatar_url, broadcast_watchlist_adds,
  broadcast_library, broadcast_watched, email_price_drops, email_coven_recs,
  email_comments, email_coven_invites, notify_rate_reminders, notify_comment_likes,
  notify_film_requests, discoverable, lane_tag_ids, onboarded_at, unsubscribe_token)
  ON profiles TO authenticated;
```

Notes:
- `unsubscribe_token`: SELECT revoked from both client roles. The notifier and
  unsubscribe route use service role / direct `pg` — unaffected. UPDATE stays granted
  because `_updateProfile` rotates the token with the user client on email re-opt-in
  (self-row only via RLS; setting your own token harms nobody).
- No client UPDATE on `must_change_password`, `role`, `is_starter`, `starter_order`,
  `email_added_at`, `id`, `created_at`, `updated_at`. This also closes the
  "user can self-clear `must_change_password`" hole. `must_change_password` is
  cleared via service role in `completeForcedPasswordChange` — unaffected.
- `onboarded_at` stays UPDATE-granted: `_completeOnboarding` sets it with the user
  client. A user "skipping" onboarding via REST only hurts themselves.
- No INSERT/DELETE grants (RLS already denied them; defense in depth).
- SECURITY DEFINER triggers (profile bootstrap, invite-code creation) run as owner —
  unaffected by client grants.

**App changes:** under column-level privileges, PostgREST `select=*` expands to
`SELECT *` and fails with `permission denied` for client roles. Three call sites
select `*` from profiles and must switch to explicit column lists (multi-line-aware
sweep, 2026-06-09):

- `app/app/settings/page.tsx:36` — settings page (authenticated).
- `app/lib/queries/profiles.ts` `getMyProfile()` — serves `/film/[id]`, `/films`,
  `/library`, `/watchlist`; missing this would 500 those pages for signed-in users.
- `app/lib/queries/profiles.ts` `getProfileByUsername()` — zero callers today (dead
  export), narrowed to the public identity subset anyway in case the other machine
  has WIP against it.

All other profile call sites use explicit lists within the granted sets.

**Accepted residual risk — anonymous identity enumeration.** With the public identity
subset granted to `anon`, `GET /rest/v1/profiles?select=id,username,…` still lists
every member's public identity. That is the explicit product posture chosen for this
design (public profile pages, film-page comments, and gazing shares render for
logged-out visitors). The `discoverable` flag does not promise otherwise: its
checkbox copy is "Show me in 'who's watching' on film pages," and it is enforced
inside the `get_other_watchers_for_film` SECURITY DEFINER RPC (mig 0161); zero
production users have it disabled today. Revisit (auth-gated profile reads, or a row
policy on a future privacy flag) if the launch posture changes.

## Fix 2 — IP-keyed rate limiting on the auth surface

**Migration `0204_ip_rate_limits.sql`:**

- Table `app_ip_rate_limits (ip_hash TEXT NOT NULL, key TEXT NOT NULL,
  window_start TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (ip_hash, key, window_start))`.
- `ENABLE ROW LEVEL SECURITY` with **zero policies** — server-only, same posture as
  `app_rate_limits` (0190).
- RPC `consume_ip_rate_limit(p_ip_hash TEXT, p_key TEXT, p_limit INT,
  p_window_start TEXT) RETURNS (allowed BOOLEAN, count INT, remaining INT)` —
  same race-safe insert-or-increment shape as `consume_app_rate_limit` in 0190
  (plpgsql SECURITY DEFINER; pg-mem smoke auto-skips such files).
- `window_start` is a caller-chosen text bucket: 15-minute buckets
  (`2026-06-09T14:15`) for sign-in/username-check, hour buckets (`2026-06-09T14`)
  for signup. Lexicographic comparison against a `YYYY-MM-DD` string works for
  cleanup.

**App (`app/lib/rate-limit.ts`):**

- `getClientIpHash()` — `headers()` → first hop of `x-forwarded-for` (fallback
  `x-real-ip`, then `"unknown"`) → sha256 hex truncated. No raw IPs stored.
- `consumeIpRateLimit(svc, { ipHash, key, limit, windowStart })` — mirrors
  `consumeRateLimit`, calls the new RPC.
- Bucket helpers `utcQuarterHourBucket()` / `utcHourBucket()`.

**Applied limits:**

| Action | Key | Limit / window |
|---|---|---|
| `signIn` | `signin-ip` per IP | 30 / 15 min |
| `signIn` | `signin-id:<sha256(identifier)>` per IP | 10 / 15 min |
| `signIn` | `signin-global` per identifier, across all IPs | 50 / 15 min |
| `signUp` | `signup-ip` per IP | 5 / hour |
| `checkUsernameAvailability` | `username-check` per IP | 60 / 15 min |

- Limits are consumed **before** the credential check / user creation.
- The identifier-global bucket caps distributed (many-IP) attacks on a single
  account, which the per-IP buckets can't see. It reuses the same RPC: `p_ip_hash`
  is a generic subject hash — IP buckets pass `sha256(ip)`, the global bucket passes
  `id:<sha256(identifier)>`. Trade-off: an attacker who burns the bucket locks that
  account's sign-in for the remainder of the 15-minute window — transient and
  preferable to unbounded brute force.
- **Trusted IP source:** on Vercel, `x-forwarded-for` is set by the platform and
  client-supplied values are stripped, so the first hop is trustworthy; `x-real-ip`
  is the fallback. Header parsing lives in a pure `parseClientIp()` helper,
  unit-tested against multi-value/garbage/missing headers. Revisit this trust
  assumption if hosting ever moves off Vercel.
- Over-limit `signIn`/`signUp` return
  `{ error: "Too many attempts. Try again in a few minutes." }`.
- Over-limit `checkUsernameAvailability` returns `{ status: "ok" }` (neutral): the
  enumeration oracle goes blind, but the UI never blocks a legit signup — `signUp`
  re-validates availability authoritatively.
- **Fail-open on RPC error** (with a loud `console.error`): a rate-table problem must
  not brick login, and it makes deploy order safe — the app can ship before the
  migration is applied (limits no-op until then). This intentionally differs from the
  fail-closed film-request limiter, where blocking on error is harmless.

**Password minimum 6 → 8** in `signUp`, `resetPassword`,
`completeForcedPasswordChange`, and `changePassword` (new password only — existing
6–7-char passwords still sign in).

**Cleanup:** the daily maintenance cron (`/api/cron/maintenance`) gains
`DELETE FROM app_ip_rate_limits WHERE window_start < <today - 2 days>` and the
equivalent for `app_rate_limits` at 7 days (it was never cleaned).

**Manual dashboard steps (Rex, not in repo):** Supabase Auth → set minimum password
length to 8; enable leaked-password protection if the plan allows.

## Fix 3 — DB CHECK constraints

**Migration `0205_input_check_constraints.sql`:**

```sql
UPDATE profiles SET username = lower(username) WHERE username <> lower(username);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format CHECK (
    username ~ '^[a-z0-9._]{1,24}$'
    AND username ~ '[a-z0-9]'
    AND username !~ '^\.'
    AND username !~ '\.$'
  ),
  ADD CONSTRAINT profiles_display_name_len CHECK (char_length(display_name) <= 50),
  ADD CONSTRAINT profiles_bio_len          CHECK (char_length(bio) <= 500),
  ADD CONSTRAINT profiles_avatar_url_len   CHECK (char_length(avatar_url) <= 1000);

ALTER TABLE watched
  ADD CONSTRAINT watched_note_len CHECK (note IS NULL OR char_length(note) <= 500);
```

- The username rule is tighter than the app's historical regex: it additionally
  requires at least one alphanumeric and bans leading/trailing dots, killing
  path-weird handles (`.`, `..`, `a.`) that break `/p/[username]` URLs. The app's
  four duplicated `USERNAME_RE` checks (signup, onboarding, profile action, settings
  form) consolidate into a shared `app/lib/auth/username.ts` validator so the app
  and DB rules can't drift.
- Verified against prod (2026-06-09): max display_name 20, bio 35, avatar_url 135,
  note 211; only the 3 lowercased usernames violated the format, and zero usernames
  violate the tightened rule (no edge dots, all contain alphanumerics). Constraints
  apply cleanly.
- The unique index is on `lower(username)`, so lowercasing the 3 rows cannot collide.
- Note cap matches `MAX_NOTE = 500` in `WatchModal`.

**App polish:** `_updateProfile` gains display_name (≤50) / bio (≤500) length
validation with friendly messages; settings inputs get matching `maxLength`
attributes. Without this, an over-limit submit would surface a raw Postgres error.

## Testing

- **`db/tests/rls/profiles-grants.test.ts`** (testcontainers, real Postgres):
  - anon: can SELECT the public subset; `permission denied` selecting
    `unsubscribe_token` (explicit and via `*`).
  - authenticated: `permission denied` on `unsubscribe_token` SELECT; UPDATE of
    `must_change_password` / `role` denied; UPDATE of own `bio` succeeds.
  - constraints: bad username format, >500 bio, >500 note all rejected;
    boundary values accepted.
- **pg-mem smoke (`db/ npm test`):** 0204 auto-skips (SECURITY DEFINER). GRANT is
  already stripped; extend `db/tests/helpers/pg-mem.ts` strip list for REVOKE and/or
  the regex CHECK if pg-mem chokes (per db/CLAUDE.md guidance).
- **`app/tests/`:** unit tests for `parseClientIp` (multi-value/garbage/missing
  headers), `hashKey`/bucket helpers, `consumeIpRateLimit` (mocked rpc, fail-open
  behavior), the shared username validator (edge dots, no-alphanumeric), and
  auth-action tests for limit responses (including the identifier-global bucket) +
  password-min-8 messages, following the existing `app/tests/auth` patterns.

## Rollout

1. One branch `security/tier1-hardening`, one PR (migrations 0203–0205 + app changes).
2. After merge: apply migrations against prod via the session pooler
   (`set -a; source app/.env.local; set +a; cd db && npm run migrate`).
3. `npx vercel deploy --prod --yes` from repo root.
4. Either order is safe: explicit selects work under old and new grants; the limiter
   fails open until the RPC exists.
5. Smoke after deploy: signed-out `/film/[id]` and `/p/[username]` render; settings
   page loads; `curl` the REST API for `unsubscribe_token` with the anon key →
   permission denied; 11 rapid bad-password sign-ins → throttle message.

## Out of scope (tracked in the review, Tier 2+)

Sharer-watch token leak, password-reset `origin`, security headers, PostgREST `.or()`
injection pattern, avatar bucket MIME/size limits, CAPTCHA on signup (revisit the day
`invite_gate` opens).
