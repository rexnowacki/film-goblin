# Landing Page Redesign — Design

**Date:** 2026-06-09
**Status:** Approved (visual direction validated via mockup in brainstorming session)

## Problem

The pre-login landing page (`app/app/page.tsx`) is the oldest surface in the app and no longer matches it:

1. **Visually** — it is all-bone (light) "newspaper front page," while the app interior is dark: `--void` background with bone header bands, grain, halftone, hard-shadow cards.
2. **Message** — copy pitches Film Goblin as a price-hunting tool ("hunting cheap movies on Apple TV", "Deals, Fresh From The Pit"). The product is now a social cinephile club — feed, covens, recommendations, watchlists, the ritual — with price-tracking as one feature.

Decisions made during brainstorming:

- Scope covers **both** visuals and messaging.
- **Invite gating is disabled** — signup is open. The landing page must not mention invites. (Root `CLAUDE.md` still says the gate is live; correct that line as part of this work.)
- Pitch leads **social-club-first**: "a coven for people who take movies seriously," price-hunting as one rite among several.
- Hero layout is **direction B**: split hero — pitch left, a card showing **real site activity with real usernames** right. Owner accepts that recent member activity (username + film) is visible to logged-out visitors.

## Page structure (top to bottom)

All sections on `--void` background unless noted. Desktop layout described; mobile stacks via existing `.stackable` pattern.

### 1. Top bar
Same content as today (wordmark + "Est. 2026 · Issue nº1" eyebrow, Films / Lists links, Sign In button) but on void background with bone text and a 2px bone bottom border. Sign In becomes `.btn-outline`.

### 2. Hero — pitch + live feed card
Two-column (`.stackable`, ~1.15fr / 1fr), stacking pitch-above-card on mobile.

**Left (pitch):**
- Yellow stamp: "✦ Watch Weirder ✦" (border + text `--highlight`, rotated, existing `.stamp`).
- `FILM / GOBLIN` display wordmark (Rubik Wet Paint), GOBLIN in `--accent`. Same clamp sizing approach as today.
- Head line (DM Serif): "A coven for people who take movies seriously."
- Body line (UI face, muted bone): "Log what you watch. Press films on your friends. Keep a watchlist that hunts price drops on Apple TV while you sleep."
- CTAs: primary `.btn btn-lg` "✦ Join The Coven" → `/auth/signup`; secondary `.btn-outline btn-lg` "Browse Films" → `/films`.

**Right (feed card):**
- Card: `--void-2` background, 3px bone border, slight rotation, hard pink shadow (`8px 8px 0 var(--accent)`), max-width ~380–420px.
- Header row: "⛧ The Feed" caps label in `--highlight`; right-aligned muted caps "live · unhallowed hours".
- ~5 rows of **real recent activity** (see Data below). Each row: actor avatar (existing avatar treatment), one-line sentence, relative timestamp, small film poster thumb right-aligned. Rows separated by dashed rules.
- Row copy per kind (real data — no invented star ratings):
  - `watch_logged` — "**username** watched *Title* 👁"
  - `review_published` — "**username** published a review of *Title*"
  - `recommendation_sent` — "**username** pressed *Title* on **recipient**"
  - `watchlist_added` — "**username** is stalking *Title*"
  - `library_added` — "**username** now owns *Title*"
  - price drop (from `price_alerts`, not `activity`) — "−NN% *Title* fell to $X.XX" with the yellow percent chip
- The card is static markup (server-rendered, no client JS, no live updates). Whole card links nowhere; film thumbs may link to `/film/[id]`.

### 3. Halftone divider
Existing `HalftoneBar` motif between hero and bone band (accent dots on void), as today between hero and marquee.

### 4. Feature band — "The Rites" (bone section)
Bone background, void text, `grain-light` — the one light band, echoing the app's page-header bands. Three columns separated by 2px void rules, stacking vertically on mobile:

| Eyebrow (in `--danger`/deep pink) | Title (DM Serif) | Body |
|---|---|---|
| ⛧ Rite I | The Feed | "Every watch, rating, and review your coven logs — one haunted scroll." |
| ⛧ Rite II | Recommendations | "Press a film on a friend. They'll see it until they watch it. No escape." |
| ⛧ Rite III | The Hunt | "Your watchlist stalks Apple TV prices and howls when one drops." |

### 5. "Recently Summoned" marquee
Keeps today's scrolling `.marquee` poster strip and `FilmPoster` components, on `--void-2`, but:
- Heading becomes "Recently **Summoned**" (accent italic on second word) — replacing "Deals, Fresh From The Pit".
- Content becomes the **latest catalog additions** (films ordered by `first_seen_at` desc) instead of recently-priced films.

### 6. Footer CTA
Centered: italic DM Serif closer "The moon is right. The prices are wrong.", a second "✦ Join The Coven" button, and a muted caps footer line "Film Goblin · Est. 2026 · Printed in a garage".

## Data

Two read paths, both following the existing `cached.ts` pattern: `unstable_cache` + `serviceRoleClient()`, 300s revalidate. Both are public, non-user-scoped queries — the documented correct use of service role inside the cache boundary.

### `getLandingFeed(client, limit = 5)` — new, in `app/lib/queries/landing.ts`
Purpose-built lightweight query; do **not** reuse `getEnrichedActivity` (it is viewer-scoped and fetches reactions/comments/gazing rosters the landing card doesn't need).

1. Select recent `activity` rows: `id, kind, payload, created_at, actor_user_id`, `kind IN (watch_logged, review_published, recommendation_sent, watchlist_added, library_added)`, newest first, fetch ~3× limit to survive filtering.
2. Batch-fetch actors (`profiles`: `id, username, display_name, avatar_url` — explicit columns per the column-grant rule), films (`id, title, artwork_url`), and recommendation recipients.
3. Drop rows whose actor or film is missing; return first `limit` rows shaped as a discriminated union the page can render with a per-kind sentence.
4. Additionally fetch the single most recent `price_alerts` row (`film_id, old_price_usd, new_price_usd, created_at` — note multiple watchlists can alert on the same drop; take the newest row, it doesn't matter which watchlist it belongs to). Compute percent off from old/new price. If present and recent (≤ 14 days), splice it into the returned rows by timestamp.
5. If the result is empty (dead site window), the page hides the feed card and centers the pitch column. No staged fallback rows.

Cached wrapper `getLandingFeed` in `app/lib/supabase/cached.ts` (`revalidate: 300`, tag `landing-feed`). No mutation currently revalidates the tag — TTL expiry is the only refresh, which is fine for a landing page.

### `getRecentlySummoned(client, limit = 10)` — new, in `app/lib/queries/films.ts`
Same column list as `getLandingMarquee` but ordered by `first_seen_at` desc, `available = true`. Cached in `cached.ts` with tag `films` (admin film mutations already revalidate that tag). `getLandingMarquee` and its cached wrapper are deleted if no other caller remains.

## Components & files touched

- `app/app/page.tsx` — full rewrite per structure above. Stays a server component; no client JS needed.
- `app/components/LandingFeedCard.tsx` — new server component rendering the feed card from `getLandingFeed` rows. (Server component in `components/` is acceptable; it uses no hooks. If the `components/` sub-CLAUDE "all client" convention is enforced, inline the markup in `page.tsx` instead — implementer's choice.)
- `app/lib/queries/landing.ts` — new query module.
- `app/lib/queries/films.ts` — add `getRecentlySummoned`, remove `getLandingMarquee` if unused.
- `app/lib/supabase/cached.ts` — swap cached wrappers accordingly.
- `app/app/styles/00-core.css` — the `.hero-posters` mobile override block (~lines 458–470) becomes dead with the tilted-poster hero gone; delete it. Add nothing landing-specific to core; if the page needs new classes, add `app/app/styles/220-landing.css` to the manifest.
- Root `CLAUDE.md` — correct the stale "Gate is LIVE on production" line to reflect that invite gating is disabled (signup open).

## Behavior notes

- Middleware already redirects authenticated users from `/` to `/home`; the page only ever renders logged-out. No auth branching needed in the page.
- iOS PWA rules apply: `100dvh` wrapper, `env(safe-area-inset-top)` padding on the top bar (the current page already does both — preserve).
- Films / Lists nav links stay — both routes are public.
- No new tables, migrations, or env vars.

## Error handling

- Both cached queries throw on DB error today (`getLandingMarquee` pattern). Keep that for the films query; for `getLandingFeed`, catch and return `[]` so a feed-query failure degrades to the hidden-card state rather than a 500 on the front door.

## Testing

- Unit-test `getLandingFeed` row-shaping (kind filtering, missing-actor/film drops, price-alert splice, empty result) with a mocked client, following the existing query-test patterns.
- Visual verification logged-out on desktop + mobile widths (720px breakpoint), including the empty-feed fallback.
- `npm run typecheck` + existing test suite.

## Out of scope

- Any change to `/auth/*` pages (they keep their bone card styling — auth pages as "paper documents" is a deliberate contrast that still fits, and they weren't raised).
- Live-updating/animated feed card.
- Reintroducing invite-gate messaging in any form.
