# Local Haunts v1 - Integrated Spec and Build Plan

**Date:** 2026-05-05  
**Status:** Draft plan  
**Branch:** `feature/local-theater-alerts`  
**Worktree:** `/Users/christophernowacki/film-goblin-theater-alerts`

## Goal

Local Haunts checks selected independent theaters' Coming Soon listings and
creates in-app notifications when a film in a user's Hoard/watchlist is playing
locally.

Core promise:

> A film from your Hoard has found a screen.

This is a low-risk MVP:

- Two theater sources:
  - The Loft Cinema: `https://loftcinema.org/coming-soon/`
  - Guild Cinema: `https://www.guildcinema.com/comingsoon`
- Twice-weekly scrape: Monday and Thursday at 14:00 UTC
- In-app bell notifications only
- Watchlist/Hoard matching only in v1
- High-confidence automatic matches only
- Admin review for ambiguous matches
- Detail page for each local showing

## Repo-Specific Decisions

Production code belongs in `app/`, not root `src/`.

- Library code: `app/lib/theaters/...`
- Cron route: `app/app/api/cron/theater-alerts/route.ts`
- Detail page: `app/app/local-haunts/[id]/page.tsx`
- Admin page: `app/app/admin/theater-showings/page.tsx`
- Vercel cron config: `app/vercel.json`
- Schema: `db/migrations/0163_*` onward

Do not add production feature code under root `src/`; that directory is the
legacy Vite prototype.

## Source Reality Check

### The Loft Cinema

The Loft Coming Soon page currently exposes a listing-like structure with:

- Film title links
- Poster/image URLs
- Runtime/rating labels such as `2 HR 7 MIN | R`
- Category/program labels such as `Cult Classics`, `Mondo Mondays`, and `Loft Staff Selects`
- Date labels such as `Now Playing`, `Starts May 8`, `Wednesday, May 6`, and `Saturday, Jun 20`
- Title variants such as subtitle screenings, restorations, live commentary, and 70mm presentations

Important implication: v1 should store all scrape results, but notification
logic should be conservative. `Now Playing` rows can be stored, but do not
notify on them in v1 unless explicitly enabled later.

### Guild Cinema

The Guild Coming Soon page currently exposes the first batch of upcoming films
as HTML-visible entries with:

- Poster/image links
- Uppercase title headings, sometimes with year in parentheses
- Short descriptions
- Date range labels such as `May 6 & 7 plus 29`, `May 9 thru 11`, and `May 15`
- Showtime/price text such as `Fri 10:30pm only`
- `Read More` links
- A `Load More Movies!` button

Important implication: the Guild provider must not assume the initial HTML
contains all upcoming films. It needs a pagination/load-more strategy. Prefer
discovering and calling the underlying XHR/API endpoint used by the button. If
that endpoint is not stable, use a minimal browser-rendering fallback only for
Guild, with tests built from saved full-page/full-result fixtures.

## Out of Scope

- Email alerts
- Push notifications
- User ZIP collection and location-radius filtering in the UI
- Ticket prices
- Seat availability
- Calendar sync
- RSVP/social planning
- Daily or high-frequency scraping
- Scraping individual event detail pages unless needed for stable IDs
- Library/watched/liked notifications

## Future Location Model

This feature should be built as multi-theater from the start, even though v1
only notifies globally for two configured theaters. The near-term product
direction is:

- Collect a user's ZIP code.
- Geocode the ZIP to latitude/longitude.
- Select indie theaters within 25 miles of the user.
- Notify only for showings at theaters inside that radius.

Do not hard-code Tucson or Albuquerque into matching/notification logic. The
schema should store theater location metadata now so the later ZIP/radius work
is additive instead of a rewrite.

For v1 notification behavior, use all active theaters because user locations do
not exist yet. Once ZIP codes land, notification eligibility becomes:

```txt
user has film in watchlist
AND theater distance from user <= 25 miles
AND notification not already created
```

## Cron Schedule

Add to `app/vercel.json`:

```json
{
  "path": "/api/cron/theater-alerts",
  "schedule": "0 14 * * 1,4"
}
```

Vercel cron schedules are UTC. `0 14 * * 1,4` is 7:00 AM
America/Phoenix. Vercel Hobby allows jobs no more frequent than once per day;
this twice-weekly schedule is within that limit. Hobby timing precision is
hourly, so the job may run any time within the 14:00 UTC hour.

The endpoint must use the existing `CRON_SECRET` authorization pattern from the
other cron routes.

## Data Model

Use separate migrations for enum changes and tables. Existing notification
migrations in this repo add `notification_kind` values in dedicated migrations,
so follow that pattern.

### Migration 0163: notification kind

`db/migrations/0163_theater_showing_notification_kind.sql`

```sql
ALTER TYPE notification_kind ADD VALUE 'theater_showing_match';
```

### Migration 0164: theater tables

`db/migrations/0164_local_haunts_tables.sql`

```sql
CREATE TABLE theaters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  coming_soon_url TEXT NOT NULL,
  street_address TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timezone TEXT NOT NULL DEFAULT 'America/Phoenix',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE theater_showings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,

  source_url TEXT NOT NULL,
  source_id TEXT,
  source_hash TEXT NOT NULL,

  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,

  starts_at TIMESTAMPTZ,
  starts_on DATE,
  date_precision TEXT NOT NULL DEFAULT 'label'
    CHECK (date_precision IN ('datetime','date','label','unknown')),
  date_label TEXT,

  runtime_label TEXT,
  rating_label TEXT,
  category_labels TEXT[] NOT NULL DEFAULT '{}',

  poster_url TEXT,
  description TEXT,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (theater_id, source_hash)
);

CREATE TABLE theater_showing_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showing_id UUID NOT NULL REFERENCES theater_showings(id) ON DELETE CASCADE,
  film_id UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,

  match_type TEXT NOT NULL CHECK (
    match_type IN (
      'exact_title',
      'normalized_title',
      'title_year',
      'fuzzy_title',
      'manual_admin'
    )
  ),
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (
    status IN ('auto','needs_review','confirmed','rejected','ignored')
  ),

  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (showing_id, film_id)
);

CREATE INDEX theater_showings_theater_active_idx
  ON theater_showings (theater_id, is_active, last_seen_at DESC);

CREATE INDEX theater_showings_normalized_title_idx
  ON theater_showings (normalized_title);

CREATE INDEX theater_showing_matches_showing_idx
  ON theater_showing_matches (showing_id);

CREATE INDEX theater_showing_matches_film_status_idx
  ON theater_showing_matches (film_id, status);

INSERT INTO theaters (
  name,
  slug,
  base_url,
  coming_soon_url,
  street_address,
  city,
  region,
  postal_code,
  country,
  latitude,
  longitude,
  timezone
)
VALUES (
  'The Loft Cinema',
  'loft-cinema',
  'https://loftcinema.org',
  'https://loftcinema.org/coming-soon/',
  '3233 E Speedway Blvd',
  'Tucson',
  'AZ',
  '85716',
  'US',
  32.2368,
  -110.9229,
  'America/Phoenix'
),
(
  'Guild Cinema',
  'guild-cinema',
  'https://www.guildcinema.com',
  'https://www.guildcinema.com/comingsoon',
  '3405 Central Avenue NE',
  'Albuquerque',
  'NM',
  '87106',
  'US',
  35.0805,
  -106.6055,
  'America/Denver'
)
ON CONFLICT (slug) DO NOTHING;
```

Latitude/longitude values are seed conveniences for v1 and should be verified
before production rollout. Later ZIP/radius work can add `profiles.postal_code`,
`profiles.latitude`, and `profiles.longitude`, plus a distance query helper.

### Migration 0165: notification duplicate guard

`db/migrations/0165_local_haunts_notification_guard.sql`

```sql
CREATE UNIQUE INDEX notifications_theater_showing_once
  ON notifications (user_id, kind, ((payload->>'showing_id')))
  WHERE kind = 'theater_showing_match';
```

## RLS and Access Model

For v1, use service-role/server-side access for all write operations.

Recommended table policies:

- Authenticated users can read active `theater_showings`.
- Authenticated users can read non-rejected matches for active showings.
- Admin pages use `requireAdmin` plus service-role queries for full review data.
- No client INSERT/UPDATE/DELETE on theater tables in v1.

If the showing detail page is intended to be public later, explicitly add public
read policy or fetch with a server route. For this v1, authenticated read is
sufficient unless product wants public share pages.

## Scraper Types

`app/lib/theaters/types.ts`

```ts
export type DatePrecision = 'datetime' | 'date' | 'label' | 'unknown';

export interface ScrapedTheaterShowing {
  title: string;
  sourceUrl: string;
  sourceId?: string;
  theaterSlug: string;

  startsAt?: string;
  startsOn?: string;
  datePrecision: DatePrecision;
  dateLabel?: string;

  runtimeLabel?: string;
  ratingLabel?: string;
  categoryLabels: string[];

  posterUrl?: string;
  description?: string;
  showtimeLabel?: string;

  rawTitle?: string;
  rawDateText?: string;
  rawShowtimeText?: string;
}

export interface TheaterScraperProvider {
  theaterSlug: string;
  sourceName: string;
  sourceUrl: string;
  scrapeComingSoon: () => Promise<ScrapedTheaterShowing[]>;
}
```

## Title Normalization

`app/lib/theaters/normalize-title.ts`

Keep both raw and normalized titles. Never display normalized titles to users.

```ts
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+[-–—]\s+spanish subtitles$/i, "")
    .replace(/\s+with live commentary.*$/i, "")
    .replace(/\s+in 70mm$/i, "")
    .replace(/\s+4k restoration!?$/i, "")
    .replace(/^the\s+/i, "")
    .replace(/^a\s+/i, "")
    .replace(/^an\s+/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

Also add tests for:

- Curly apostrophes: `Howl's Moving Castle`
- Subtitle suffixes
- `in 70mm`
- `4K restoration!`
- Article stripping
- `The Room with live commentary from Greg Sestero!`

## Date Handling

Do not fake showtimes.

Rules:

- `Starts May 8` -> `starts_on = YYYY-05-08`, `date_precision = 'date'`
- `Wednesday, May 6` -> `starts_on = YYYY-05-06`, `date_precision = 'date'`
- `Saturday, Jun 20` -> `starts_on = YYYY-06-20`, `date_precision = 'date'`
- `Now Playing` -> no `starts_on`, no `starts_at`, `date_precision = 'label'`
- Unknown or complex labels -> preserve `date_label`, `date_precision = 'label'`
- Guild labels such as `May 6 & 7 plus 29` and `May 9 thru 11` -> preserve
  `date_label`, set `date_precision = 'label'`, and keep showtime text in
  `showtimeLabel` for display. Do not split into multiple dated showings in v1.

Year inference should use the current Phoenix date and roll forward if the
parsed month/day would otherwise be implausibly in the past.

## Source Hash

Generate `source_hash` from stable normalized fields:

```txt
theater_slug + normalized_title + canonical_source_url + normalized_date_key
```

Where `normalized_date_key` is:

- `starts_at` if exact datetime exists
- `starts_on` if only date exists
- normalized `date_label` if no date can be parsed

Do not use title alone. Do not use raw labels when a safe parsed date exists.

## Matching Logic

Auto-match only when `confidence >= 0.95` and the match is unambiguous.

| Match type | Confidence | v1 behavior |
| --- | ---: | --- |
| Exact raw title | 1.00 | Auto-match if unique |
| Exact normalized title | 0.95 | Auto-match if unique |
| Title + year | 0.98 | Auto-match if unique |
| Fuzzy high confidence | 0.85-0.94 | Admin review |
| Fuzzy medium confidence | 0.70-0.84 | Admin review |
| Low confidence | < 0.70 | Ignore |

Duplicate/remake safety:

- If multiple Film Goblin films share the same normalized title and the Loft
  listing does not include a year, create `needs_review`, not `auto`.
- Examples requiring caution: `Suspiria`, `The Thing`, `Nosferatu`,
  `Black Christmas`, `The Fly`, `The Blob`, `The Host`, `The Shining`.

Fuzzy matching in v1 should only produce review candidates, never automatic
notifications.

## Notification Logic

Trigger notifications only for:

- `theater_showing_matches.status IN ('auto','confirmed')`
- `confidence >= 0.95`
- Users with `film_id` in `watchlists`
- Active showing
- Not `Now Playing` in v1 unless explicitly enabled
- No existing notification for `(user_id, kind, showing_id)`

Notification row:

```json
{
  "kind": "theater_showing_match",
  "payload": {
    "showing_id": "uuid",
    "film_id": "uuid",
    "theater_name": "The Loft Cinema",
    "title": "Suspiria",
    "date_label": "Starts May 8"
  }
}
```

Target URL:

```txt
/local-haunts/[showing_id]
```

Bell copy:

```txt
Your Hoard has found a screen.
Se7en is coming to The Loft Cinema.
```

## Cron Job Behavior

`app/app/api/cron/theater-alerts/route.ts`

Route steps:

1. Verify `Authorization: Bearer ${CRON_SECRET}`.
2. Acquire a job lock.
3. Load active theater providers.
4. Scrape The Loft and Guild Coming Soon pages.
5. If scrape fails or result count is suspiciously low, abort before stale marking.
6. Normalize and hash results.
7. Upsert showings.
8. Mark previously seen but now-missing showings inactive.
9. Run matching.
10. Create notifications.
11. Return a summary payload.

Example response:

```json
{
  "ok": true,
  "sources": ["loft-cinema", "guild-cinema"],
  "scraped": 64,
  "inserted": 3,
  "updated": 39,
  "staleMarkedInactive": 1,
  "matchedAuto": 4,
  "needsReview": 2,
  "notificationsCreated": 12
}
```

## Locking

Reuse an existing lock table if one lands before this feature. Otherwise add:

```sql
CREATE TABLE cron_locks (
  key TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Lock key:

```txt
theater-alerts
```

Implementation should be race-safe. Prefer a single SQL statement/RPC that
claims the lock only when the existing lock is expired.

## Site Etiquette

Before enabling production cron, manually check:

```bash
curl -I https://loftcinema.org/robots.txt
curl https://loftcinema.org/robots.txt
curl -I https://www.guildcinema.com/robots.txt
curl https://www.guildcinema.com/robots.txt
```

Scraper rules:

- Use a clear User-Agent, e.g. `FilmGoblinBot/0.1 (+contact email)`
- Scrape only each theater's Coming Soon page or its load-more endpoint in v1
- Use request timeout
- Store poster URLs only; do not scrape image binaries
- Do not hammer detail pages
- Abort gracefully on non-2xx responses

## Pages

### Detail page

`app/app/local-haunts/[id]/page.tsx`

Content:

- Header: `Local Haunt`
- Film title
- Theater name
- Theater city/region
- Date label or parsed date
- Showtime label when available
- Matched Film Goblin film card/link
- External Loft link
- Optional actions: `View at The Loft`, `View Film`, `Mark as Seen`

When no exact time exists:

```txt
Coming soon at The Loft Cinema.
Exact showtime has not been posted yet.
```

### Admin review page

`app/app/admin/theater-showings/page.tsx`

Columns:

- Scraped title
- Theater
- Date label
- Category labels
- Matched film candidate
- Confidence
- Status
- Source URL
- Actions

Admin actions:

- Confirm match
- Reject match
- Choose different Film Goblin film
- Ignore showing
- Re-run matching

Actions should live under `app/lib/actions/admin/theater-showings.ts` and use
`requireAdmin`.

## Notification UI Changes

Update:

- `app/components/notifications/NotificationRow.tsx`
- `app/lib/queries/group-notifications.ts`
- `app/lib/queries/notifications.ts` only if extra enrichment is needed
- Supabase generated types in `app/lib/supabase/types.ts`

`NotificationRow` must route `theater_showing_match` to `/local-haunts/[id]`
and render copy from payload.

Grouping can either:

- Leave theater notifications as singles, or
- Group by `showing_id` if multiple matching events ever produce rows close
  together.

For v1, singles are simpler.

## Test Strategy

Use pure-unit tests heavily for parser and matcher code.

Suggested tests:

- `app/tests/theaters/normalize-title.test.ts`
- `app/tests/theaters/date-label.test.ts`
- `app/tests/theaters/source-hash.test.ts`
- `app/tests/theaters/match-showings.test.ts`
- `app/tests/theaters/notification-targets.test.ts`
- `app/tests/routes/cron-theater-alerts.test.ts`
- `db/tests/rls/theater-showings.test.ts` if RLS policies are added

Run:

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Run `db npm run test:rls` if new RLS policies are non-trivial.

## Build Tickets

### Ticket 1 - Worktree and branch

Status: done.

Acceptance:

- Worktree exists at `/Users/christophernowacki/film-goblin-theater-alerts`
- Branch is `feature/local-theater-alerts`
- Branch tracks `origin/master`

### Ticket 2 - Schema migrations

Files:

- `db/migrations/0163_theater_showing_notification_kind.sql`
- `db/migrations/0164_local_haunts_tables.sql`
- `db/migrations/0165_local_haunts_notification_guard.sql`
- `app/lib/supabase/types.ts`

Tasks:

- Add notification enum value in its own migration.
- Add theater/showing/match tables and indexes.
- Seed The Loft Cinema and Guild Cinema, including location metadata.
- Add duplicate guard for theater notifications.
- Update generated/manual Supabase types.

Acceptance:

- `db npm test` passes.
- `app npm run typecheck` passes.

### Ticket 3 - Core scraper types and utilities

Files:

- `app/lib/theaters/types.ts`
- `app/lib/theaters/normalize-title.ts`
- `app/lib/theaters/date-label.ts`
- `app/lib/theaters/source-hash.ts`
- Tests under `app/tests/theaters/`

Tasks:

- Define provider and scraped showing types.
- Implement title normalization.
- Implement safe date-label parsing.
- Implement stable source-hash generation.
- Unit-test edge cases.

Acceptance:

- Parser utilities are pure and covered by focused tests.
- No network calls in utility tests.

### Ticket 4 - Loft provider

Files:

- `app/lib/theaters/providers/loft.ts`
- `app/tests/theaters/loft-provider.test.ts`
- Fixture HTML under `app/tests/fixtures/`

Tasks:

- Fetch `https://loftcinema.org/coming-soon/`.
- Use a clear User-Agent and timeout.
- Parse title, source URL, poster URL, runtime/rating, category labels, date label.
- Convert relative URLs to absolute URLs.
- Preserve raw title/date text.
- Do not fetch individual detail pages.

Acceptance:

- Provider can parse saved fixture HTML.
- Provider returns stable `ScrapedTheaterShowing[]`.
- Failed fetch throws a useful error.

### Ticket 5 - Guild provider

Files:

- `app/lib/theaters/providers/guild.ts`
- `app/tests/theaters/guild-provider.test.ts`
- Fixture HTML under `app/tests/fixtures/`

Tasks:

- Fetch `https://www.guildcinema.com/comingsoon`.
- Use a clear User-Agent and timeout.
- Parse title, optional year in title, source URL, poster URL, description, date label, and showtime/price text.
- Preserve raw title/date/showtime text.
- Implement the `Load More Movies!` path:
  - First preference: identify and call the underlying load-more/XHR endpoint.
  - Fallback: use a constrained browser-rendering strategy for Guild only.
  - In either case, tests should use saved fixtures and not depend on the live site.
- Convert relative URLs to absolute URLs.

Acceptance:

- Provider parses initial-page fixture.
- Provider parses full/load-more fixture.
- Provider returns all visible coming-soon entries, not only the first batch.
- Failed fetch/load-more failure throws a useful provider-specific error.

### Ticket 6 - Upsert and stale marking job

Files:

- `app/lib/theaters/scrape-theaters.ts`
- `app/lib/theaters/upsert-showings.ts`
- `app/lib/theaters/providers/index.ts`
- Tests under `app/tests/theaters/`

Tasks:

- Load active theaters from DB.
- Run the Loft and Guild providers.
- Normalize and hash results.
- Upsert by `(theater_id, source_hash)`.
- Update `last_seen_at`, `is_active`, and mutable fields.
- Mark missing rows inactive only after a successful scrape.
- Add suspiciously-low result guard.

Acceptance:

- Re-running the job does not create duplicates.
- Missing rows are marked inactive only on successful scrape.
- Summary counts inserted/updated/stale rows.

### Ticket 7 - Matching engine

Files:

- `app/lib/theaters/match-showings.ts`
- `app/tests/theaters/match-showings.test.ts`

Tasks:

- Build candidate film lookup by raw and normalized title.
- Auto-match exact raw title when unique.
- Auto-match normalized title when unique.
- Support title+year if a year is available.
- Create review candidates for fuzzy matches.
- Never auto-match ambiguous duplicate titles without year evidence.

Acceptance:

- Duplicate/remake cases produce `needs_review`.
- Fuzzy matches never auto-notify in v1.
- Auto matches require confidence `>= 0.95`.

### Ticket 8 - Notification creation

Files:

- `app/lib/theaters/create-theater-notifications.ts`
- `app/tests/theaters/create-theater-notifications.test.ts`

Tasks:

- Find eligible auto/confirmed matches.
- Find users with matching `watchlists.film_id`.
- In v1, notify for all active configured theaters because user location data
  does not exist yet.
- Structure the eligibility helper so a later ZIP/radius filter can be added
  in one place.
- Skip library/watched in v1.
- Skip inactive showings.
- Skip `Now Playing` in v1.
- Insert `notifications` rows with kind `theater_showing_match`.
- Rely on DB unique index to avoid duplicates.

Acceptance:

- Same showing does not notify the same user twice.
- Users without watchlist rows are not notified.
- Payload includes `showing_id`, `film_id`, `theater_name`, `title`, `date_label`.

### Ticket 9 - Cron route and locking

Files:

- `app/app/api/cron/theater-alerts/route.ts`
- Optional lock helper under `app/lib/theaters/lock.ts`
- `app/tests/routes/cron-theater-alerts.test.ts`

Tasks:

- Verify `CRON_SECRET`.
- Acquire lock.
- Run scrape/upsert/match/notify pipeline.
- Return summary JSON.
- Capture/log errors consistently with existing cron routes.

Acceptance:

- Unauthorized requests return 401.
- Authorized request returns summary.
- Lock contention returns a clean skipped response.

### Ticket 10 - Detail page

Files:

- `app/app/local-haunts/[id]/page.tsx`
- `app/lib/queries/theater-showings.ts`

Tasks:

- Fetch active showing and match by ID.
- Render theater/date/source details.
- Render theater city/region.
- Render Guild showtime label when available.
- Render Film Goblin film link.
- Render external Loft link.
- Handle missing/inactive showing with `notFound()`.

Acceptance:

- Notification target opens a useful page.
- No exact time is displayed when no exact time exists.

### Ticket 11 - Notification UI integration

Files:

- `app/components/notifications/NotificationRow.tsx`
- `app/lib/queries/group-notifications.ts`
- Tests if existing notification tests cover copy/routing

Tasks:

- Route `theater_showing_match` to `/local-haunts/[showing_id]`.
- Render bell copy for local haunt notifications.
- Ensure TypeScript exhaustiveness handles new enum value.

Acceptance:

- Bell dropdown renders local haunt rows without runtime errors.
- Link target is correct.

### Ticket 12 - Admin review page and actions

Files:

- `app/app/admin/theater-showings/page.tsx`
- `app/lib/queries/admin/theater-showings.ts`
- `app/lib/actions/admin/theater-showings.ts`
- Tests for admin action helpers

Tasks:

- List showings and match statuses.
- Filter by theater.
- Filter by status.
- Confirm match.
- Reject match.
- Ignore showing.
- Choose a different Film Goblin film.
- Re-run matching for one showing.

Acceptance:

- Page is admin-gated.
- Confirmed matches can create notifications.
- Rejected matches never notify.

### Ticket 13 - Vercel cron config

Files:

- `app/vercel.json`

Tasks:

- Add `/api/cron/theater-alerts` with schedule `0 14 * * 1,4`.
- Preserve existing cron jobs.

Acceptance:

- JSON is valid.
- Existing cron entries remain unchanged.

### Ticket 14 - Manual QA and rollout

Tasks:

- Check Loft and Guild `robots.txt`.
- Run scraper locally against fixture and live page.
- Verify Guild load-more behavior captures entries beyond the first batch.
- Verify known current examples such as `Se7en`, `The Rocky Horror Picture Show`,
  `The Shining`, `Twilight`, and `The Big Lebowski`.
- Verify Guild examples from the fixture, especially titles with year suffixes
  and date ranges such as `TIKI TIKI (1971)`, `FERRIS BUELLER'S DAY OFF (1986)`,
  and `SERIAL MOM (1994)`.
- Seed a test watchlist row and verify notification creation.
- Open notification and verify detail page.
- Verify admin review flow with an ambiguous/remake title.

Acceptance:

- All automated checks pass.
- Manual smoke path works end to end.
- Production cron is only enabled after robots/site etiquette check.

## Final Acceptance Criteria

The feature is complete when:

- The cron route scrapes The Loft and Guild Coming Soon pages.
- Guild scraping includes rows behind `Load More Movies!`.
- Scraped showings are stored without duplicates.
- Existing showings update `last_seen_at`.
- Missing showings become inactive only after a successful scrape.
- High-confidence Film Goblin matches are created automatically.
- Ambiguous matches go to admin review.
- Users with matching watchlist films receive one in-app notification.
- Notifications link to `/local-haunts/[id]`.
- The showing page includes theater, date label/date, external Loft link, and Film Goblin film link.
- The cron job is secured.
- The job is idempotent.
- Admins can confirm/reject/override matches.
- Theater rows include location metadata so future ZIP/radius matching can be
  added without remodeling the core showing tables.
