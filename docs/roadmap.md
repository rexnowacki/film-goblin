# Roadmap

Prioritized list of post-rebuild work. Tiers are intent, not commitment —
shuffle freely as the product finds its shape. When something graduates
into an actual build, it becomes a spec under `docs/superpowers/specs/`.

See `docs/backlog.md` for unprioritized ideas. Full list of shipped
sub-projects with spec paths lives in `docs/sub-project-history.md`
(thirty-two shipped as of 2026-05-02).

## High

- **Your Ledger home widget.** Own watchlist summary (deals, on-watchlist
  count, recent drops) in the left aside of `/home`. Explicit deferral
  from sub-project 6. `/home` still renders the placeholder text.
- **Real sender domain for email.** Buy / configure a domain, verify DNS
  with Resend, swap `NOTIFY_FROM_EMAIL`. Unblocks price-drop digests
  reaching actual users — currently restricted to the account holder's
  inbox by Resend's sandbox.
- **Curate film tags.** Sub-project 32 shipped the content
  infrastructure but every film starts untagged. Walk the catalog via
  `/admin/films?untagged=1`, pick a sub-genre + up to three vibes per
  film. Unblocks the FYP recommender (sub-project B) and the
  poster-grid sub-genre pill. Operational, not engineering.
- **`/settings` handle validation.** Mirror the `/^[a-z0-9._]+$/` regex
  from `OnboardingForm` + `_completeOnboarding` into `SettingsForm` +
  `updateProfile`. Today a user editing later can still set a malformed
  handle. Small follow-up.

## Medium-high

- **FYP recommender (sub-project B of tagging).** Affinity scoring per
  user from their `watched.recommended` history × `film_tags`; a
  candidate ranker; a `/for-you` route; tag listing pages at
  `/tags/<name>`; onboarding lane-picker so new users seed an initial
  affinity vector. Builds on the content infra shipped in #32.
- **Rating pills on poster grids.** Surface
  `films_with_stats.coven_rating_pct` on `FilmPoster` everywhere a
  rating-eligible grid renders (`/films`, `/library`, `/watched`,
  `/p/[username]`). Tier the pill by score (Anointed / approved /
  divided / Cursed) to match `<CovenScore />` on `/film/[id]`.
- **List detail page `/lists/[id]`.** Activity-feed entries like "added
  X to [list]" currently dead-end on `/lists` root.
- **Review composer (staff).** The `reviews` table has no UI; add
  compose / publish / unpublish flow.
- **Zine-styled transactional email templates.** Custom reset-password
  + confirm-signup emails via Supabase dashboard, matching the price-
  drop digest aesthetic.
- **Threaded comment replies + comment editing.** Today
  `activity_comments` is flat 140-char one-shots (sub-project 17,
  polished in #25, with like notifications in #27). Add `parent_id` +
  "Reply" / "View N replies" UI, an edit flow, comment pagination,
  email notifications for comments, and @-mentions / markdown.
- **Comment composer enhancements.** Emoji quick-react strip above
  composer; send-icon header variant (proto 2 from the #25 brainstorm);
  `LikersBottomSheet` for comment likes (tap the count → see who
  liked, mirroring the activity-row pattern).
- **Mobile poster-tap action sheet on `/films` discovery.** Long-press
  / tap a poster → bottom sheet with watchlist / library / share /
  recommend, reusing `PosterQuickAdd` patterns. Today the only path is
  navigating into the film detail page.
- **Live handle-availability check on signup.** Today the signup action
  pre-checks via `serviceRoleClient` on submit; surface availability
  inline as the user types.
- **Persist `alert_threshold_pct` on profiles.** Let users change all
  alerts at once via `/settings` instead of per-watchlist-row tuning.
- **Feed page parity + user-search.** Bring `/home` in line with
  `/library` / `/watchlist` / `/films` visually — bone-stripe hero
  with `.h-display` headline, accent `<em>`, the same body shell.
  Functionally, add a search input that lets the viewer pull up another
  user's activity stream inside the feed surface (today the only path
  is `/p/[username]`, which is profile-shaped, not feed-shaped). Pairs
  with the infinite-scroll item below.
- **Feed infinite scroll.** Today `getEnrichedFeed` loads 50 items in
  one shot. Switch to 20-at-a-time with intersection-observer-driven
  pagination, fetching the next 20 each time the user scrolls the
  bottom into view. Cursor-based on `created_at` to avoid drift if
  new activity lands mid-scroll.

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
- **Display-name column drop.** After sub-project 26 flipped 37 render
  sites to bare `username`, `display_name` is only used on
  `/p/[username]` h1 + main avatar. Decide whether to drop the column
  entirely (and the `/settings` input) or keep it as a per-profile
  flourish.
- **Trailer surfaces on `/film/[id]`.** Mig `0150` and `fg-trailers`
  populate `films.trailer_url` etc. but no UI reads them yet. Add a
  trailer button / embedded YouTube player on the film detail page
  once enough rows are curated.

## Medium-low

- **Password strength meter + show-password toggle** on signin/signup.
- **Web push notifications.** Browser Push API for price-drop alerts;
  deferred from sub-project 5. Adds service worker + VAPID keys +
  `push_subscriptions` table.
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
