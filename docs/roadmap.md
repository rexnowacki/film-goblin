# Roadmap

Prioritized list of post-rebuild work. Tiers are intent, not commitment —
shuffle freely as the product finds its shape. When something graduates
into an actual build, it becomes a spec under `docs/superpowers/specs/`.

See `docs/backlog.md` for unprioritized ideas. Full list of shipped
sub-projects with spec paths lives in `CLAUDE.md` → "Sub-project
history" (twenty shipped as of 2026-04-30).

## High

- **Your Ledger home widget.** Own watchlist summary (deals, on-watchlist
  count, recent drops) in the left aside of `/home`. Explicit deferral
  from sub-project 6. `/home` still renders the placeholder text.
- **Real sender domain for email.** Buy / configure a domain, verify DNS
  with Resend, swap `NOTIFY_FROM_EMAIL`. Unblocks price-drop digests
  reaching actual users — currently restricted to the account holder's
  inbox by Resend's sandbox.
- **`/settings` handle validation.** Mirror the `/^[a-z0-9._]+$/` regex
  from `OnboardingForm` + `_completeOnboarding` into `SettingsForm` +
  `updateProfile`. Today a user editing later can still set a malformed
  handle. Small follow-up.

## Medium-high

- **Tagging system.** User-defined or staff-curated tags on films; tag
  pages; filter `/films` by tag.
- **Recommendations inbox.** Recipient-side "someone recommended you X"
  surface. Closes a gap flagged during sub-project 6.
- **List detail page `/lists/[id]`.** Activity-feed entries like "added
  X to [list]" currently dead-end on `/lists` root.
- **Review composer (staff).** The `reviews` table has no UI; add
  compose / publish / unpublish flow.
- **Zine-styled transactional email templates.** Custom reset-password
  + confirm-signup emails via Supabase dashboard, matching the price-
  drop digest aesthetic.
- **Broader genre seeding.** Deeper horror coverage (giallo, folk, body,
  found-footage, slow-burn) + arthouse branches Apple under-categorizes.
- **Threaded comment replies + comment editing.** Today `activity_comments`
  is flat 140-char one-shots (sub-project 17). Add parent_id + an edit
  flow + email notifications for comments.
- **Live handle-availability check on signup.** Today the signup action
  pre-checks via `serviceRoleClient` on submit; surface availability
  inline as the user types.
- **Persist `alert_threshold_pct` on profiles.** Let users change all
  alerts at once via `/settings` instead of per-watchlist-row tuning.

## Medium

- **Letterboxd import.** Upload .zip / .csv export → seed user's
  watchlist + optional follows.
- **TMDB fallback.** When iTunes lookup returns 0, fall back to TMDB
  for canonical metadata and cross-reference back to `itunes_id`.
- **Dead-link crawler.** Periodic background job checks every film's
  `itunes_url`; on 404 flags `available = false` and surfaces in admin.
- **Delete account flow.** Cascade cleanup + "are you sure" confirm;
  honors data-export expectations.
- **Apple + GitHub OAuth.** Same pattern as Google (Supabase provider
  config + auth-page button).
- **Realtime activity feed.** Upgrade `/home`'s feed from polling /
  focus-refresh to Supabase Realtime `postgres_changes` subscriptions.
- **Coven-overlap signals on `/p/[handle]`.** Surface owned + review
  badges and most-watched-by-coven sort. Deferred from sub-project 15
  (B2 follow-ups).
- **Year-in-review on `/watched`.** Stats hero is in place (sub-project
  14); add a yearly retrospective surface.

## Medium-low

- **Change email flow.** `updateUser({email})` with re-confirmation
  round trip.
- **Password strength meter + show-password toggle** on signin/signup.
- **Web push notifications.** Browser Push API for price-drop alerts;
  deferred from sub-project 5. Adds service worker + VAPID keys +
  `push_subscriptions` table.
- **Per-kind notification preferences.** "Email me for recs, not for
  follows." Extends `profiles.email_notifications_enabled` into a
  per-type matrix.
- **Coven invite email.** Extend the notifier's digest pipeline to
  cover coven-request events.
- **Public shareable list pages.** Unauthenticated viewers can see a
  list (requires list detail page to land first).

## Low

- **Magic link sign-in** (passwordless email-only alternative).
- **MFA / TOTP 2FA.** Supabase supports it natively; enroll flow +
  per-route gating at `aal2` required.
- **Sign out all devices.** `supabase.auth.signOut({ scope: 'global' })`.
- **Backup codes / security questions.** Secondary recovery paths.
- **Session / device management page.** Custom tracking — Supabase
  doesn't expose this natively.
- **CAPTCHA on auth forms.** hCaptcha integration; likely needs paid
  tier or external setup.
- **Invite codes.** Gate signup to a curated first cohort; useful for
  growth-metric isolation.
- **Weekly digest email.** "This week on Film Goblin: 12 deals in your
  genres, 3 recommendations from your coven."
- **Region rotation.** Seed against UK / DE / JP iTunes storefronts to
  pick up imports / exclusives; de-dupe across storefronts.
