# Apple Data Source — Design

Sub-project 1 of the Film Goblin production rebuild. Decides *where* Film Goblin gets its price data and *how* that data flows from Apple's servers into our database. Ends at the point a `price_alert` row is written; notification delivery (email, push), watchlist UI, and alert UI are out of scope and live in other specs.

## Decision

**Film Goblin uses the iTunes Search API, US storefront only, polling each tracked film every 4 hours.**

- No Affiliate API (requires Apple Performance Partners approval; we don't want affiliate revenue).
- No scraping (against Apple's TOS; strict constraint).
- No non-US storefronts at launch.
- No affiliate tagging on `itunes.apple.com` buy links; plain URLs only.

The iTunes Search API is the public, sanctioned, keyless endpoint at `itunes.apple.com/lookup` and `itunes.apple.com/search`. It returns movie pricing for Apple's "Buy/Rent" catalog — the catalog the Apple TV app surfaces under Buy/Rent. Apple TV+ (subscription originals) has no per-film prices and is out of scope.

## Naming

Everywhere user-facing, the storefront is called **"Apple TV"**. Internal code and schema may reference `itunes_id`, `itunes_url`, etc., because those are the endpoint / field names the API uses — but no UI string contains the word "iTunes."

## Catalog & scale

- **Target catalog size:** 1,000–3,000 films, grown organically from user behavior. Not a mirror of Apple's full catalog.
- **Launch seed:** ~500 films pre-seeded across curated searches aligned with the zine's editorial voice: "folk horror", "a24", "ari aster", "robert eggers", "kiyoshi kurosawa", "midnight movies", plus specific title/director searches. This ensures the Films index and Deals page aren't empty on day one.
- **Growth:** when a user searches-and-adds a film via `itunes.apple.com/search`, the result is upserted into `films` with `tracking = true`. The worker picks it up on its next run.
- **Admin override:** a hidden admin path (authenticated) to add a film by `itunes_id` directly, for cases where seed search misses something obvious.
- **Films not on Apple TV:** the search UI shows "Not on Apple TV yet. We can't track what we can't see." No placeholder rows in `films`.

## Pipeline architecture

A scheduled job runs every 4 hours (Vercel Cron hitting `/api/cron/refresh-prices`). Each run:

1. **Select** films from `films` where `tracking = true`, oldest `last_checked_at` first. Page in batches of 100.
2. **Fetch** `GET https://itunes.apple.com/lookup?id=<comma-separated-itunes-ids>&country=US&entity=movie` — one request per batch.
3. **Diff** each returned film's `trackPrice` against the most recent `price_history` row for that film. If changed, insert a new `price_history` row (append-only). If same, update only `films.last_checked_at`.
4. **Alert** when a price *strictly decreased*. For every user with the film on their watchlist whose threshold is satisfied, insert a `price_alert` row — subject to the duplicate-alert rule (see Failure Modes). The user-threshold and watchlist columns are defined in the schema spec (sub-project 2); this spec only *consumes* them.

**Throughput:** 3,000 films ÷ 100 per request = 30 requests per run × 6 runs/day = 180 requests/day. iTunes Search API's documented soft limit is ~20 req/min. We are ~3 orders of magnitude under the limit. Large headroom for retries, backfills, and growth.

**Timeouts:** each cron invocation processes one batch and returns (function-per-batch). A full refresh of 3,000 films fits in <1 minute wall clock across parallel invocations. Each individual function runs for seconds, well inside Vercel's free-tier limits.

**If the catalog grows past ~20K films** and a full refresh can't fit in the 4-hour window, shard by `film_id % N` across N parallel cron schedules. Not a day-one concern.

## Data captured per film

### `films` table (denormalized from iTunes response)

| Column | Source | Notes |
|---|---|---|
| `id` | uuid generated | primary key |
| `itunes_id` | `trackId` | unique index; how we dedupe across seed / search / admin-add |
| `title` | `trackName` | |
| `director` | `artistName` | |
| `year` | `releaseDate` | extracted from ISO date |
| `runtime_min` | `trackTimeMillis` | divided by 60000, rounded |
| `genre_primary` | `primaryGenreName` | single genre; we ignore `genreIds[]` |
| `description` | `longDescription` \|\| `shortDescription` | longDescription preferred |
| `content_advisory` | `contentAdvisoryRating` | e.g. "R", "PG-13", "NR" |
| `artwork_url` | `artworkUrl100` | with `100x100bb.jpg` string-replaced to `600x600bb.jpg` |
| `itunes_url` | `trackViewUrl` | the Apple TV deep link used for "Buy on Apple TV" button |
| `tracking` | literal `true` | set `false` to stop polling without deleting |
| `available` | literal `true` | set `false` when lookup returns 0 results (removed from Apple TV) |
| `first_seen_at` | `now()` | on insert only |
| `last_checked_at` | `now()` | updated every run regardless of price change |
| `last_priced_at` | `now()` | updated only when `price_history` row is written |

### `price_history` table (append-only)

| Column | Notes |
|---|---|
| `id` | uuid |
| `film_id` | FK → `films.id` |
| `captured_at` | `now()` at insert time |
| `price_usd` | numeric(6,2); the "own" price (`trackPrice`) |
| `hd_price_usd` | numeric(6,2), nullable; from `trackHdPrice` when present |
| `is_sale` | bool; computed as `price_usd < max(price_usd over last 180d)` |

Rental prices (`trackRentalPrice`) are ignored — users want to *own*.

### Intentionally not captured

- Trailer and preview video URLs.
- `collectionName` / `collectionId` (inconsistent; not useful for our UI).
- Cast and crew beyond director (iTunes doesn't return it reliably; future TMDb/OMDb integration is a separate spec).
- MSRP / list price as a separate column — the "was" price in UI is computed as `max(price_usd)` over the trailing 180 days from `price_history`. Same source drives the "all-time low" stamp.

### Artwork upscale trick

iTunes serves `artworkUrl100` ending in `/100x100bb.jpg`. Replacing with `/600x600bb.jpg` gets 6× resolution; `/1200x1200bb.jpg` gets poster-size. Free, no rate-limited image CDN. We store the upscaled URL directly in `artwork_url`.

## Failure modes

### Rate-limit or 5xx from iTunes

Exponential backoff, 3 retry attempts per batch. On final failure: leave `last_checked_at` stale, log, continue to next batch. Stale films get priority on the next run.

### Film removed from Apple TV

iTunes `/lookup` returns `resultCount: 0` for a removed `trackId`. Set `films.available = false`, set `films.tracking = false`, stop polling. Keep `price_history` and film metadata intact for the UI ("no longer on Apple TV" state on the film detail page — UI handled in a later spec).

### Invalid price reads

iTunes occasionally returns `trackPrice: 0`, `null`, or anomalously low values for films that are temporarily mispriced in their system. Rule: any `price_usd` that is `null`, `0`, or `< $0.50` is treated as an invalid read — no `price_history` row written, no alert fired. `last_checked_at` is still updated so we don't loop on the same film.

### Duplicate alerts

A price oscillating between $4.99 / $5.99 across three runs must not produce three alerts to the same user. Rule:

- An alert is created only when the new `price_usd` is **strictly lower** than the previous `price_history` row for that film, AND
- the user's `watchlists` row for that film has `last_alerted_at` more than 24 hours ago (or null).

Enforced with a `last_alerted_at` timestamp on the `watchlists` join row (column owned by the schema spec but required by this pipeline). Updated atomically when the alert is inserted.

### API response-shape changes

Apple can change the response shape without notice. Each film's parse is wrapped in a try/catch. On parse failure: log raw response + `itunes_id`, leave `last_checked_at` unchanged, surface count in the daily digest (see Ops).

### Missed cron runs

Vercel Cron can misfire or overlap with a deploy. Acceptable: since we process oldest `last_checked_at` first, the next successful run catches up by prioritizing stalest films. Consistent misses show up as growing `last_checked_at` skew in the daily digest.

### Catalog drift at scale

When the catalog exceeds ~20K films and a single 4-hour refresh window can't fit the workload, shard by `film_id % N` across N parallel crons. Not a day-one concern.

## Ops surface

Minimal, but nonzero — a silent worker is the worst failure.

- **Sentry** (or equivalent) capturing exceptions from the worker. Required.
- **Daily digest email** to the operator: films refreshed, price changes detected, alerts fired, parse failures, films marked unavailable. Thirty seconds per day to eyeball.
- **Admin re-run endpoint** (authenticated): manually kick the worker outside its cron schedule. Used during development and after bug fixes.

## Deferred / future considerations

- **Additional storefronts** (UK, CA, AU, other regions): adding later requires `price_history` PK to extend to `(film_id, country_code, captured_at)`. Schema designed to accommodate but not implemented now.
- **HD vs SD price delta UI:** we capture `hd_price_usd` but don't currently surface the difference. Keeping the column means we can add that surface later without a backfill.
- **Cast / richer metadata:** TMDb or OMDb integration is a separate later spec.
- **Affiliate tagging:** if the project ever justifies applying to Apple Performance Partners, all buy URLs become `{itunes_url}?at=<affiliate-token>` — a single-column migration and no pipeline changes.
- **Notification delivery** (email via Resend, web push): consumer of the `price_alerts` table. Separate spec (sub-project 5).

## What's not in this spec

- The Next.js app, auth, UI routes (sub-project 3).
- The database's full schema beyond `films` and `price_history` — users, watchlists, friendships, lists, reviews, recommendations (sub-project 2).
- Notification delivery (sub-project 5).
- Social graph and realtime feed (sub-project 6).

This spec ends exactly at "a `price_alert` row exists in the database."
