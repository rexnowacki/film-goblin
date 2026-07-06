# The Living Pit v2 — Eight New System Feed Events — Design

**Date:** 2026-07-06
**Status:** Approved for planning
**Prerequisite:** Living Pit v1 (spec `2026-07-05-living-pit-feed-events-design.md`, shipped PR #180/#181/#183). This spec extends it; all v1 rules (frozen copy, FROM THE PIT presentation, composer caps, service-role-only writes) carry over unchanged.

## Goal

Eight new system event types that widen what the pit notices: theatrical presence, free-streaming transitions, the theatrical→Apple TV crossing, coven verdicts, moon rituals, and monthly communion. Owner-picked from the 2026-07-06 ideation (items 1, 2, 4, 5, 6, 8 plus the Apple crossing).

## New event types

Migration 0210: `ALTER TYPE feed_event_type ADD VALUE` for each of:

| Type | Trigger | Priority | Dedup |
|---|---|---|---|
| `left_free` | film loses its **last** free-category provider (categories `flatrate`/`free`/`ads` in `film_watch_providers`) | 88 | 7-day (film, type) |
| `now_free` | film **gains** a free-category provider it did not have | 85 | 7-day (film, type) |
| `now_on_apple` | `films.itunes_id` transitions NULL→set (theatrical/TMDB-only film becomes purchasable) | 82 | 7-day (film, type) — transition is one-way so this is effectively once-ever |
| `last_showing` | a film's latest active future `theater_showtimes.starts_at` falls within today (UTC-adjusted to theater-local day is out of scope v2 — accepted) | 78 | 7-day (film, type) |
| `verdict_anointed` | `films_with_stats.coven_rating_pct` ≥ 90 (CovenScore "Anointed" tier) with the same minimum-rating-count gate `CovenScore.tsx` applies | 75 | **once ever** per film (payload dedup, milestone-style) — ratings can oscillate around 90 |
| `now_at_theater` | film (matched `film_id`) gains active future showtimes in the weekly Loft scrape where it had none | 65 | 7-day (film, type) |
| `full_moon` | tonight is a full moon (pure phase computation, ±12h of syzygy; no external API); pick one film from the pool | 45 | 7-day (film, type); at most 1 per day — lunar cycle (~29.5d) provides natural cadence |
| `monthly_communion` | 1st of month: the single most-watched film of the previous calendar month, minimum 2 watches (ties: earliest to reach the count wins; implementation may use max watch count + film id as deterministic tiebreak) | 40 | payload dedup on month (kind+month, once ever) |

`summon_answered` is **not** a new type: when `adminCreateFilm`'s fresh-insert path fulfills an open `film_requests` row, the `new_film` event uses a dedicated summon copy variant and records `payloadExtra: { summoned: true }`. Same type, same dedup.

## Copy (goblin voice, no emoji — per the 2026-07-06 FROM THE PIT amendment)

Templates live in `copy.ts` beside the v1 sets; variant rotation rules unchanged. "Apple TV" naming law applies. Drafts (final wording at implementation, same register):

- `left_free`: "**{title}** has left {service}. The free ride is over — the goblin still tracks the price." / "{service} took **{title}** back. The goblin mourns. The goblin also watches the price."
- `now_free`: "**{title}** is free on {service}. No tithe required. Go." / "{service} offers **{title}** for nothing. Suspicious. Take it anyway."
- `now_on_apple`: "The theatrical veil lifts. **{title}** crosses over — now on Apple TV." / "The wait ends. **{title}** is on Apple TV. The pit tracks its price from tonight."
- `last_showing`: "Tonight is the last showing of **{title}** at {theater}. Then: the small screen, and regret." / "Final night for **{title}** at {theater}. The projector forgets; the goblin does not."
- `verdict_anointed`: "The coven has spoken. **{title}** is Anointed." / "Ninety percent of the coven cannot be wrong. **{title}** ascends."
- `now_at_theater`: "**{title}** haunts {theater} this week. The big screen is the proper altar." / "{theater} summons **{title}**. Attend."
- `full_moon`: "The moon is full. The pit suggests **{title}**. Lock the doors either way." / "Full moon tonight. **{title}** knows what that means."
- `monthly_communion`: "The coven gathered around **{title}** this month — {n} watchings." (single variant)
- `new_film` summon variant: "The summons was answered. **{title}** claws its way into the pit."

`{theater}` is "The Loft" (single provider today; the theaters module map is the source).

## Emission sites (all existing hooks; no new crons, no new tables)

1. **Daily job** (`app/lib/feed-events/daily.ts`, already in the maintenance cron): gains `last_showing`, `verdict_anointed`, `full_moon`, and `monthly_communion` (inside the existing 1st-of-month gate). Moon-phase calculation is a pure function (synodic-month arithmetic from a known epoch, accuracy within hours — sufficient for a daily check) with unit tests against known full-moon dates.
2. **Showtimes refresh** (`runLoftShowtimes`, Mondays): after upserting showtimes, emit `now_at_theater` for matched films that now have active future showtimes. (Implementation may diff pre/post within the job or rely on 7-day dedup to absorb an engagement's repeat Mondays; a multi-week engagement re-announcing weekly is acceptable — cap is the composer's job.)
3. **Streaming-availability refresh** (`runStreamingAvailabilityRefresh`, existing job): read each film's free-category provider set **before** writing the refreshed rows, diff after — the current table is the snapshot, no new table. Gained provider → `now_free` (name the service); set becomes empty from non-empty → `left_free` (name the departed service).
4. **`itunes_id` graft points** (three): `lib/admin/promote-tmdb-twin.ts`, the availability cron auto-promote (`lib/itunes-availability/check.ts`), and the admin candidate-approval action — each emits `now_on_apple` after a successful graft, try/catch-guarded like the v1 admin emissions (a feed failure never fails the graft). Precedent cases: Hokum and Obsession crossed this way; Backrooms is expected next via the Monday cron.

## Full-moon pool (owner decision 2026-07-06)

Prefer films tagged `subject: werewolves` (tag exists; owner will tag candidates via the admin tagging UI). Until any exist, fall back to creature/monster-subject films so the event works from day one. Within the pool: exclude films dismissed via `fyp_not_interested`-style signals is out of scope; pick deterministically by (fewest prior full_moon appearances, then highest watchlist count, then film id) so the pool rotates rather than repeating one favorite.

## What does NOT change

- Composer: no changes — caps and no-stacking already govern volume. Expected added volume is small by construction (moon ~13/yr, communion 12/yr, verdict/apple/theater bounded by real transitions).
- `PUSH_KINDS`: none of the new types push in v2.
- RLS, table schema (beyond the enum), rendering (new types render through the same SystemEventRow/landing path automatically — copy is self-contained).
- Deferred still: `death_day` (no person dates), ritual events (no rituals).

## Testing

- Copy: template tests per type (verbatim expectations, variant counts).
- Moon phase: pure-function tests against published full-moon dates (e.g., 2026-07-29, 2026-08-28) and near-miss days.
- Provider diff, showtime gain, verdict crossing, communion pick: pure decision functions extracted and unit-tested (v1 discipline); SQL/orchestration verified by typecheck + suite + rollout smoke.
- Enum migration: pg-mem strip-list check; RLS unaffected (no new policies).

## Rollout

Migration 0210 first (only new code reads new enum values), then deploy, then smoke: trigger maintenance cron (daily set), verify `now_on_apple` fires on the next candidate promotion (Backrooms), and watch the streaming-refresh diff on its next run.
