# Release Scout — design

**Date:** 2026-10-07
**Status:** Approved in conversation; awaiting written-spec review.

## Problem

The catalog only grows when someone adds a film by hand. Monthly additions: Apr 136, May 168, Jun 5, Jul 56, Aug 1, Sep 1, Oct (to date) 2. New horror releases never reach Film Goblin unless the owner remembers to add them.

## Goal

A weekly job finds new horror releases on TMDB and queues them for one-tap owner approval. Approval reuses the existing request-fulfilment flow, so everything downstream (TMDB-only → Apple TV promotion, `new_film` / `now_on_apple` Pit events) works unchanged.

**Success:** after four weeks the queue receives roughly 10–15 scouted picks per week with the re-release trap filtered out, and the owner can clear the queue in a few minutes.

## Decisions (owner-confirmed 2026-10-07)

| Question | Decision |
|---|---|
| Genre scope | Horror only (TMDB genre 27) |
| What counts as new | Digital/physical releases in the last 14 days, plus theatrical releases in the next 30 days |
| How picks reach the catalog | Owner approval in the existing `/admin/film-requests` queue. No auto-add. |
| How the owner learns of picks | A "Scouted" section in the queue plus a count on the `/admin` dashboard. No notifications. |
| Storage | Reuse `film_requests` (approach A). A separate table and auto-add were rejected. |

## Live API findings (verified 2026-10-07)

- `GET /3/discover/movie?with_genres=27&region=US&with_release_type=4|5&release_date.gte=…&release_date.lte=…` returns 200. Over a 14-day digital window it returned 62 results (4 pages); over a 30-day theatrical window, 42.
- **The re-release trap.** The date filter matches *any* US release of the requested type inside the window, so older films resurface: *Friday the 13th* (1980), *Pet Sematary* (1989) and *The Substance* (2024) all came back. Each result's `release_date` is its primary (original) date, so filtering on it removes them.
- With "original release within the last 12 months" plus "popularity ≥ 10", the kept counts were 11 digital and 5 theatrical. Two of those were already in the catalog (*Backrooms*, *Obsession*).
- Upcoming theatrical films have near-zero `vote_count`, so popularity is the floor, not votes. Low-buzz titles (e.g. *V/H/S/Mixtape*, 5.8) fall below 10 before release. They usually re-qualify through the digital window once released. This is an accepted trade-off.

## Architecture

```
maintenance cron (Mondays)
  └─ recordedJob("release-scout")
       └─ runReleaseScout(svc)                      app/lib/scout/run.ts
            ├─ discoverHorrorReleases("digital")    app/lib/search/tmdb.ts
            ├─ discoverHorrorReleases("theatrical")
            ├─ load known tmdb_ids (films ∪ film_requests, any status)
            ├─ pickScoutReleases(raw, today, known) app/lib/scout/pick.ts (pure)
            └─ insert film_requests rows (source='scout')
```

### 1. Pure picker — `app/lib/scout/pick.ts`

`pickScoutReleases(input) → ScoutPick[]`. No I/O.

- **Input:**
  - `digital` and `theatrical` arrays of raw TMDB discover results;
  - `today` (UTC date);
  - `knownTmdbIds: Set<number>`.
- **Keep a result only when all of these hold:**
  - `adult !== true`;
  - `release_date` is present and ≥ `today − SCOUT_MAX_AGE_DAYS` (365);
  - `popularity ≥ SCOUT_MIN_POPULARITY` (10);
  - `id` is not in `knownTmdbIds`.
- **Overlap:** a film present in both windows is kept once. The theatrical entry wins, because its release date is the one the Apple TV check needs.
- **Output fields:** `tmdb_id`, `title`, `year` (from `release_date`), `release_date`, `window: "digital" | "theatrical"`, `artwork_url` (TMDB w780 poster, matching the existing `IMG_BASE`, or null), `description` (overview).
- Constants are exported for tuning.

### 2. Fetcher — `discoverHorrorReleases(window, today)` in `app/lib/search/tmdb.ts`

- Uses the same `TMDB_API_KEY` auth helper as the rest of the file.
- **Digital:** `with_release_type=4|5`, `release_date.gte = today − 14d`, `release_date.lte = today`.
- **Theatrical:** `with_release_type=2|3`, `release_date.gte = today + 1d`, `release_date.lte = today + 30d`.
- **Both windows:** `with_genres=27`, `region=US`, `include_adult=false`, `sort_by=popularity.desc`. Pages through `total_pages`, capped at 10 pages.
- Returns `{ ok: true, results } | { ok: false, error }`. It never throws for HTTP errors.

### 3. Job — `runReleaseScout(svc, now)` in `app/lib/scout/run.ts`

1. The job takes no lock itself. The caller does: the maintenance wrapper calls `acquireCronLock(sr, "release-scout")` and returns `{ skipped: true, reason: "locked" }` when it is held. The manual runner already locks by job key before running. A lock inside the job would collide with the manual runner's own lock and always skip.
2. Fetch both windows. If either fails, throw. `recordedJob` records the error, and the remaining maintenance jobs still run.
3. Load known IDs: `films.tmdb_id` (non-null) ∪ `film_requests.tmdb_id` (non-null, any status, including dismissed and fulfilled).
4. `pickScoutReleases(…)`.
5. For each pick, insert a `film_requests` row with:
   - `source='scout'`, `status='pending'`, `needs_itunes_id=true`, `request_count=0`;
   - `release_date`, `scout_window`, `tmdb_id`, `title`, `year`, `artwork_url`, `description`;
   - `director` null (filled in at "Review & Add" time).
   - Insert one row at a time, so a unique-violation race skips just that row.
6. Return stats `{ fetchedDigital, fetchedTheatrical, kept, inserted, skippedKnown }`.

**Scheduling:** wire it into `app/app/api/cron/maintenance/route.ts` inside the existing `isMonday` block, as `jobs.releaseScout = await recordedJob("release-scout", …)`. Register `release-scout` in the admin manual job runner (`/api/admin/jobs/[job]/run` + `JobsSection`) and in the diagnostics `cron-health.mjs` cadence table (Monday-only, 8 days).

### 4. Migration — `db/migrations/0225_film_requests_scout.sql`

- Drop `film_requests_source_check` and re-add it allowing `('itunes','tmdb','manual','scout')`.
- Drop `film_requests_status_check` and re-add it allowing `('pending','fulfilled','dismissed')`.
- `ALTER TABLE film_requests ADD COLUMN release_date DATE, ADD COLUMN scout_window TEXT CHECK (scout_window IN ('digital','theatrical'));`
- `CREATE UNIQUE INDEX film_requests_tmdb_id_uniq ON film_requests (tmdb_id) WHERE tmdb_id IS NOT NULL;`
  - Pre-check run against prod on 2026-10-07: `SELECT tmdb_id, count(*) FROM film_requests WHERE tmdb_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1` returned zero rows.
  - Re-run it immediately before applying.
- **No RLS change.** Scout writes go through the service-role client; reads stay staff-only through the existing "staff can manage" policy. Members' "read their own requested films" policy is keyed on `film_request_users`, so scout rows (which have no users) stay invisible to members.

**Rollout order:** migration first, then app. The changes are additive: old code never writes `scout`/`dismissed`, never reads `release_date`, and is unaffected by the index. New code writes all three.

### 5. Admin queue — `/admin/film-requests`

- **Scouted section** above the existing list. It shows pending `source='scout'` rows ordered by `release_date` ascending, with a window chip (DIGITAL / IN THEATERS + date). The existing list below excludes scout rows.
- **Dismiss button** on every pending row (scouted and member), backed by the new admin-only `dismissFilmRequest(id)` server action. It sets `status='dismissed'` and `updated_at`, then revalidates `/admin/film-requests`. Member requesters are not notified.
- The "Show fulfilled" toggle stays as it is; dismissed rows are hidden in both views.
- **`/admin` dashboard:** a "Scouted picks waiting: N" count, linking to the queue, shown only when N > 0.

### 6. Add-flow corrections

- **`fulfillFilmRequest`:**
  - Passes `theatrical_release_date: req.scout_window === 'theatrical' ? req.release_date : null`. This rule depends on the stored window, not on today's date, so approving a pick after it opens still keeps the date.
  - Digital picks pass null. Their primary date can be the digital date, and the Apple TV check's 30-day post-theatrical threshold would then delay a film that is already buyable.
  - Passes `summoned: req.source !== 'scout'`.
- **"Review & Add" path:** `/api/admin/film-request` returns `release_date`, `scout_window` and `source`. `AddFilmClient` prefills `theatrical_release_date` from it under the same rule, and the "summoned" flag follows the same `source` rule.

  Scout picks always have `needs_itunes_id=true`, so in practice they go through "Review & Add" rather than the direct-add button. Both paths must be correct anyway.

## Error handling

| Failure | Behaviour |
|---|---|
| TMDB HTTP error or timeout | The job throws; `cron_runs` row `status='error'` with the message; other maintenance jobs continue. |
| `TMDB_API_KEY` missing | Same path, via the existing helper's error. |
| Unique violation on insert (race) | Skip that row; count it as `skippedKnown`. |
| Lock held | The maintenance wrapper returns `{ skipped: true, reason: "locked" }`; `recordCronRun` records it as skipped. |

## Testing

- **`pick.test.ts`:** recency cutoff (includes re-release fixtures shaped like the live 1980/1989/2024 results), popularity floor boundary (exactly 10 kept), adult excluded, known IDs excluded, theatrical-wins overlap, year derivation, missing `release_date` dropped.
- **`tmdb` discover test:** URL/params per window, pagination stops at `total_pages` and the 10-page cap, non-200 → `{ ok:false }` (fetch mocked).
- **`run.test.ts`:** mocked client. Known-ID set built from both tables, insert payload shape, lock-held skip, a unique violation skipped rather than thrown, stats.
- **`film-requests` action tests:**
  - `dismissFilmRequest` requires admin and sets status;
  - `fulfillFilmRequest` passes `summoned:false` and the release date for theatrical scout rows (including one approved after opening day), null for digital scout rows, and `summoned:true` / null date for member rows.
- **db:** the pg-mem migration smoke test passes. The RLS suite in CI covers the unchanged policies.
- **Post-ship:** run `release-scout` manually from `/admin/site-settings`; confirm rows in the Scouted section and a `cron_runs` row with stats.

## Out of scope

- Auto-adding high-popularity picks. Revisit after four weeks, using the share of picks the owner approves.
- Genres beyond horror.
- Notifying members when their request is dismissed.
- Back-filling releases older than the windows.
