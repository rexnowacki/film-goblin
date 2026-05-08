# iTunes Availability Cron — Design

**Date:** 2026-05-08
**Status:** Approved (brainstorm), pending spec review

## Goal

Automate the discovery of Apple iTunes `itunes_id`s for theatrical-only films
that admins have added via the TMDB option in `/admin/films/new`. When a TMDB
film becomes available for purchase on Apple, the system promotes the existing
`films` row from "TMDB-only" to fully tracked: `itunes_id` populated, `tracking
= true`, the worker's price-refresh cron picks it up on the next pass.

## Non-goals

- Auto-ingesting TMDB's `/now_playing` list. Admins still curate the catalog
  by hand via the existing Add Film flow.
- Re-checking films that already have an `itunes_id` for availability
  changes. The worker's price-refresh cron handles availability via
  `films.available`.
- Writing new TMDB metadata onto films at cron time (only the iTunes-side
  fields are filled). TMDB enrichment stays an add-time concern.

## Why this works for our timeline

Theatrical-to-digital window in 2026 is roughly 30–45 days for major studios,
with the long tail closing by ~120 days. Indies sometimes go day-and-date. The
cron runs **weekly** (Mondays 14:00 UTC = 7am Phoenix), only considers films
whose theatrical release was **≥30 days ago**, and gives up after **365
days**. Re-check cooldown is **6 days** so we don't double-hit a film inside
one cron week.

## Schema changes — mig 0175

```sql
-- 0175_itunes_availability_check.sql

-- 1. Films: add the three columns the cron + admin flow need.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS tmdb_id INT,
  ADD COLUMN IF NOT EXISTS theatrical_release_date DATE,
  ADD COLUMN IF NOT EXISTS last_itunes_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS films_tmdb_id_idx ON films(tmdb_id)
  WHERE tmdb_id IS NOT NULL;

-- Cron read pattern: pull untracked, theatrical-aged films cheaply.
CREATE INDEX IF NOT EXISTS films_itunes_check_pending_idx
  ON films(last_itunes_check_at NULLS FIRST, theatrical_release_date)
  WHERE itunes_id IS NULL AND tracking = FALSE;

-- 2. Restore the unique-itunes-id invariant. The original constraint was
--    dropped in mig 0118 when itunes_id became nullable. Partial unique
--    index handles the nullable case correctly.
CREATE UNIQUE INDEX IF NOT EXISTS films_itunes_id_unique
  ON films(itunes_id) WHERE itunes_id IS NOT NULL;

-- 3. Candidates table for low-confidence matches that need admin eyes.
CREATE TABLE IF NOT EXISTS itunes_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id             UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  itunes_id           BIGINT NOT NULL,
  itunes_url          TEXT NOT NULL,
  match_title         TEXT NOT NULL,
  match_year          INT,
  match_artwork_url   TEXT,
  confidence          NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  match_type          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','rejected')),
  reviewed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending candidate per film at a time. Cron upserts on conflict.
CREATE UNIQUE INDEX IF NOT EXISTS itunes_candidates_one_pending_per_film
  ON itunes_candidates(film_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS itunes_candidates_status_idx
  ON itunes_candidates(status, created_at DESC);

-- 4. RLS — admin-only via service role. No client-side reads.
ALTER TABLE itunes_candidates ENABLE ROW LEVEL SECURITY;
-- (no policies — only service role + staff queries via server actions)
```

## Match scoring — pure function

`app/lib/itunes-availability/score.ts` — single exported function, no I/O,
fully unit-testable.

```ts
export interface FilmInput {
  title: string;
  year: number;
  director: string;
}

export interface ItunesCandidate {
  trackId: number;
  trackName: string;
  releaseDate: string;       // ISO; year extracted by scorer
  artistName: string;        // iTunes' "director" field
  trackViewUrl: string;
  artworkUrl100: string;
}

export interface MatchScore {
  confidence: number;        // 0..1
  matchType:
    | "exact_title_year_director"
    | "exact_title_year"
    | "exact_title_fuzzy_year"
    | "normalized_title_year"
    | "normalized_title_fuzzy_year"
    | "below_threshold";
}

export function scoreMatch(film: FilmInput, candidate: ItunesCandidate): MatchScore;
```

**Scoring weights** (title scores are mutually exclusive — only one applies):

| Component | Weight |
|---|---|
| Title matches by lowercase only (no other transforms) | +0.6 |
| Title matches by full normalization (articles + punctuation stripped) but NOT by lowercase only | +0.4 |
| Year exact | +0.3 |
| Year ±1 | +0.15 |
| Director matches `artistName` (case-insensitive equality) | +0.1 |

Confidence is the sum, capped at 1.0. `matchType` is derived from which
components scored.

**Lowercase-only match:** lowercase both sides, compare. Preserves articles
and punctuation. `"The Substance"` matches `"the substance"` but not
`"Substance"`.

**Full normalization:** lowercase → strip leading articles (the / a / an) →
strip all non-alphanumeric punctuation → collapse whitespace → NFKC. Then
compare. `"The Substance"` and `"Substance"` both normalize to
`"substance"`. `"Don't Breathe"` and `"Dont Breathe"` both normalize to
`"dont breathe"`.

**Thresholds:**

- `confidence >= 0.85` → **auto-promote** (typical hit: exact title + exact year + director, or exact title + exact year on a clearly unique title)
- `0.45 <= confidence < 0.85` → **queue** in `itunes_candidates` (`pending`)
- `confidence < 0.45` → discard

## Cron endpoint

`app/app/api/cron/check-itunes-availability/route.ts`. Pattern matches
`/api/cron/theater-alerts`: `runtime = "nodejs"`, `maxDuration = 300`,
`Authorization: Bearer <CRON_SECRET>` check, optional Sentry init.

**Selection query (≤30 films per run):**

```sql
SELECT id, title, year, director, theatrical_release_date
FROM films
WHERE itunes_id IS NULL
  AND tracking = false
  AND (
    (theatrical_release_date IS NOT NULL
     AND theatrical_release_date BETWEEN
           (NOW() - INTERVAL '365 days')::date AND
           (NOW() - INTERVAL '30 days')::date)
    OR
    (theatrical_release_date IS NULL
     AND year >= EXTRACT(YEAR FROM NOW())::INT - 1)
  )
  AND (last_itunes_check_at IS NULL
       OR last_itunes_check_at < NOW() - INTERVAL '6 days')
  AND NOT EXISTS (
    SELECT 1 FROM itunes_candidates ic
    WHERE ic.film_id = films.id
      AND ic.status = 'rejected'
      AND ic.reviewed_at > NOW() - INTERVAL '14 days'
  )
ORDER BY last_itunes_check_at NULLS FIRST
LIMIT 30;
```

**Per-film flow (sequential, ~1 req/sec to stay under iTunes' rate limit):**

1. `GET https://itunes.apple.com/search?term=<normalized title>&entity=movie&country=us&limit=10`
2. Score every result via `scoreMatch`. Take the highest confidence.
3. If `confidence >= 0.85`: update the films row in place (auto-promote).
4. Else if `confidence >= 0.45`: upsert into `itunes_candidates` (replacing any prior `pending` row for that film).
5. Else: nothing.
6. Always: `UPDATE films SET last_itunes_check_at = NOW() WHERE id = $1`.

**Cron schedule** (vercel.json):

```json
{
  "crons": [
    { "path": "/api/cron/check-itunes-availability", "schedule": "0 14 * * 1" }
  ]
}
```

## Auto-promote write

```sql
UPDATE films SET
  itunes_id      = $1,
  itunes_url     = $2,
  tracking       = true,
  available      = true,
  artwork_url    = CASE WHEN artwork_url = '' THEN $3 ELSE artwork_url END,
  runtime_min    = CASE WHEN runtime_min = 0 THEN $4 ELSE runtime_min END,
  content_advisory = CASE WHEN content_advisory = '' THEN $5 ELSE content_advisory END,
  last_itunes_check_at = NOW()
WHERE id = $6
  AND itunes_id IS NULL;  -- defensive against races
```

The TMDB metadata (title, year, director, description, genre_primary) is
preserved as-is. Only blank fields get backfilled from iTunes.

## Admin review UI

`/admin/itunes-candidates/page.tsx` — server component lists pending rows
joined to their source films. Plain admin layout matching
`/admin/film-requests`.

Per row, side-by-side cards:

```
┌─ TMDB film ──────┐    ┌─ iTunes candidate ─┐
│ poster           │    │ poster             │
│ Title (Year)     │    │ Title (Year)       │
│ Director         │    │ Director           │
│ confidence: 0.62 │    │ matchType: …       │
└──────────────────┘    └────────────────────┘
[Confirm] [Reject] [Open on Apple TV ↗]
```

**Server actions** (`app/lib/actions/admin/itunes-candidates.ts`):

- `adminConfirmItunesCandidate(candidateId)` — copies iTunes fields to films
  row (same write as auto-promote), marks candidate `confirmed` with
  `reviewed_by` + `reviewed_at`. Wrapped in transaction.
- `adminRejectItunesCandidate(candidateId)` — marks candidate `rejected`. The
  cron skips this film for 14 days (cooldown).

Both gated by `requireAdmin`.

## Add Film modal change

`app/lib/search/tmdb.ts` already returns the TMDB API response for a movie
lookup, which includes `id` and `release_date`. Currently `lookupTmdb`
discards both. Surface them in `TmdbFilmFields`:

```ts
export interface TmdbFilmFields {
  // …existing…
  tmdb_id: number;
  theatrical_release_date: string | null;  // ISO date or null
}
```

`saveFilm` (admin films action) accepts and persists both columns. Form
includes them as hidden fields populated from TMDB lookup. Manual / iTunes
add paths leave both null.

## File map

| Path | New / Modified |
|---|---|
| `db/migrations/0175_itunes_availability_check.sql` | new |
| `app/lib/supabase/types.ts` | modified (hand-edit, per warning block) |
| `app/lib/itunes-availability/score.ts` | new |
| `app/lib/itunes-availability/itunes-search.ts` | new |
| `app/lib/itunes-availability/check.ts` | new |
| `app/app/api/cron/check-itunes-availability/route.ts` | new |
| `app/app/admin/itunes-candidates/page.tsx` | new |
| `app/app/admin/itunes-candidates/CandidateRow.tsx` | new |
| `app/lib/actions/admin/itunes-candidates.ts` | new |
| `app/lib/queries/admin/itunes-candidates.ts` | new |
| `app/lib/actions/admin/films.ts` | modified (capture tmdb_id + release_date in saveFilm) |
| `app/lib/search/tmdb.ts` | modified (surface tmdb_id + release_date in lookupTmdb) |
| `app/app/admin/films/FilmForm.tsx` | modified (hidden fields for new columns) |
| `vercel.json` | modified (add cron schedule) |

## Tests

**Unit:** `app/tests/itunes-availability/score.test.ts`
- Exact title + exact year → 0.9 (above auto threshold)
- Exact title + year ±1 → 0.75 (queue)
- Normalized title + exact year → 0.7 (queue)
- Director match adds +0.1 correctly
- "The Substance" / "substance" normalization
- Year mismatch by 2 → no year score
- Below 0.45 → discard tag

**Integration:** `app/tests/itunes-availability/check.test.ts`
- MSW intercepts `https://itunes.apple.com/search`
- Seeds two films: one auto-promotable, one queue-bound, one below threshold
- Asserts: films row updated for auto, candidate row written for queue,
  `last_itunes_check_at` updated for all three
- Cooldown: rejected candidate within 14 days excludes the film from
  selection

Pattern matches `worker/tests/` MSW + pg-mem setup, but lives in `app/`
because the cron is an app route.

## Edge cases handled

- **iTunes rate limits** — sequential per-film loop, ~30 calls per cron run
  spread over ~30 seconds. Well under iTunes' soft 20-req/min limit.
- **Foreign-character titles** — normalization is NFKC + punctuation strip;
  preserves CJK / Cyrillic. iTunes search handles non-ASCII reasonably.
- **Multiple TMDB films matching same iTunes ID** — partial unique index on
  `films(itunes_id)` rejects the second auto-promote. Loud failure logged;
  the colliding row stays untracked, gets a candidate row instead so admin
  can decide which TMDB row to keep.
- **Race against the worker** — auto-promote uses `WHERE itunes_id IS NULL`
  guard; if the worker already populated it (won't happen unless an admin
  manually adds the iTunes ID between cron read and write), the UPDATE
  no-ops.
- **Admin rejects then film genuinely shows up later** — 14-day cooldown,
  then cron retries. Adequate for the common "wrong match → eventually
  finds the right one" case.

## Not handled / explicit cuts

- **No auto-discovery of iTunes ID via TMDB IMDB-id lookup.** The iTunes
  `/lookup?id=<imdb_id>` endpoint works in some cases but isn't reliable
  enough to skip the search-and-score step. Could be added as a "first try"
  path later if false-positive rate is low.
- **No bulk "check now" admin button.** Wait for the cron. If you need
  faster, hit the cron URL with the secret manually.
- **No notifications when something auto-promotes.** Admin can see the new
  tracked films in `/admin/films` (and the price-drop digest will fire if
  the film qualifies).

## Deployment

1. Apply mig 0175 to prod (same path as 0174 — Vercel env pull → `npm run migrate`).
2. Hand-edit `app/lib/supabase/types.ts` per the warning block at the top of
   that file. (Local Docker for `gen:types` isn't available on every dev
   machine; hand-edit is the documented workflow.)
3. Deploy.
4. Cron picks up the schedule on next deploy automatically (Vercel reads
   `vercel.json` at deploy time).
5. First run: backfill — could match 5–15 existing TMDB-only films
   immediately. Watch `/admin/itunes-candidates` for the queue.
