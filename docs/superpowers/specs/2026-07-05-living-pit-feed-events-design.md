# The Living Pit — System Feed Events (v1) — Design

**Date:** 2026-07-05
**Status:** Approved for planning
**Origin:** Owner-provided spec ("System Feed Events Spec — The Living Pit"), reconciled against existing feed infrastructure during brainstorming.

## Goal

Keep the feed alive with automated system events (price drops, anniversaries, goblin picks, milestones) so the site never reads as empty at small user scale. System events appear interleaved with user activity on both the signed-in `/home` feed and the anon landing card — the feed is the storefront; lock the actions, not the theater.

## Decision record (deltas from the owner spec)

1. **System-only table, merged at read time.** The owner spec's unified `feed_events` table absorbing user events (`user_watched`/`user_added`/`user_joined`) is rejected. The existing `activity` table + `groupFeed` + reactions/comments/rosters machinery stays untouched; `feed_events` holds **system events only** and a read-time composer interleaves the two. Rationale: user and system events differ structurally (actor, reactions, comments vs. pre-baked copy), and migrating the richest working code in the app buys nothing user-visible.
2. **v1 event types — Core 7:** `price_drop`, `all_time_low`, `price_rise`, `new_film`, `anniversary`, `goblin_pick`, `milestone`.
   Deferred: `now_free`/`left_free` (provider change-detection is a snapshot/diff sub-project of its own — TMDB provider rows exist in `film_watch_providers` but nothing diffs them), `ritual_open`/`badge_earned` (badge-rituals don't exist; today's `/ritual` is the weekly goblin-pick reveal), `death_day` (no person death dates in DB; spec's own anti-scope-creep says skip).
3. **No DB triggers for emission.** The owner spec suggests triggers/RPC for `new_film` etc. We emit from app/worker code paths instead, following existing repo patterns (server actions + cron jobs). Fewer moving parts in the DB; emission sites are testable.
4. **`goblin_pick` emits from the existing flow.** The `goblin_pick` table (migs 0164/0169/0183) and `/admin/goblin-pick` already exist. Saving a pick additionally emits a `feed_events` row. No parallel admin UI.
5. **Release-date backfill required.** Only 10/322 films have `theatrical_release_date` (month/day); 253 have `tmdb_id`. A one-time script backfills dates from TMDB so the anniversary fallback guarantee is real. The ~69 TMDB-less films simply never have anniversaries (no fuzzy matching — iTunes-scorer lesson).
6. **No `user_id` column in v1.** `badge_earned` (the only user-attributed system event) is deferred; add the column when rituals ship.

## Data model

One migration:

```sql
CREATE TYPE feed_event_type AS ENUM (
  'price_drop','all_time_low','price_rise','new_film',
  'anniversary','goblin_pick','milestone'
);

CREATE TABLE feed_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type feed_event_type NOT NULL,
  film_id    UUID REFERENCES films(id) ON DELETE CASCADE,  -- nullable (milestone has none)
  payload    JSONB NOT NULL DEFAULT '{}',   -- prices, age, variant index, n, etc.
  copy       TEXT NOT NULL,                 -- rendered at creation time; emoji included
  priority   INT NOT NULL DEFAULT 0,        -- from the weighting table
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feed_events_created_idx ON feed_events (created_at DESC);
CREATE INDEX feed_events_dedup_idx ON feed_events (film_id, event_type, created_at);
```

- **RLS:** SELECT granted to `anon` + `authenticated` (the landing page is the storefront). No client-role INSERT/UPDATE/DELETE — all writes go through service role (cron/actions/worker).
- **Copy is frozen at creation** so historical events don't change when templates are edited.
- Priority values (higher surfaces first): `all_time_low=100, price_drop=90, new_film=70, price_rise=60, goblin_pick=80, milestone=50, anniversary=10`. (`now_free=85`/`left_free=88` reserved for v2.)

## Copy module — `app/lib/feed-events/copy.ts`

Pure, unit-tested. Owner-spec templates verbatim (goblin voice, emoji embedded in template, "Apple TV" naming where a storefront is named). Interface:

```ts
renderCopy(type, vars, variantIndex): string     // deterministic
pickVariant(type, prevVariantIndex, rng): number // never repeats prev for that type
```

The chosen `variant` index is stored in `payload`; at emission time the generator reads the previous event of the same type to honor "don't repeat the same variant twice in a row" without in-memory state.

## Generators

All emission enforces **dedup: one event per (film, event_type) per 7 days**, checked at write time against `feed_events_dedup_idx`. All-time-low supersedes and suppresses a same-day `price_drop` for the same film.

| Event | Trigger | Emission site |
|---|---|---|
| `price_drop` | new price < previous by ≥20% OR ≥$3 | price sweep, alongside existing price-alert emission |
| `all_time_low` | new price ≤ min(price_history over ≥180d) | same site; suppresses same-day price_drop |
| `price_rise` | price returns to ≥ median after ≥7 days below | same site |
| `new_film` | film created + published | `adminCreateFilm` server action |
| `anniversary` | release month/day == today; prefer age % 5 == 0, else most-watchlisted film with an anniversary today; max 1/day | daily job in maintenance cron |
| `milestone` | catalog count crosses 250/300/…; monthly coven watch total (on the 1st, with "Appropriate." iff n ∈ {13, 66, 666}); nth member joined | daily job in maintenance cron |
| `goblin_pick` | admin saves weekly pick | existing `/admin/goblin-pick` action |

The daily job joins the existing **maintenance cron fan-out** (no new Vercel cron slot — Hobby cap). Price emission lives wherever the price diff already happens (worker/app cron price sweep); the plan phase pins the exact file, honoring the worker's no-raw-SQL / re-export contract if it lands there.

## Composer — `app/lib/feed-events/compose.ts`

Pure function: `compose(userItems, systemEvents, dateSeed) → FeedItem[]`, unit-tested exhaustively. Rules (from the owner spec):

1. **Ratio cap:** system ≤ 2:1 against user activity in the rendered window; if user activity is zero, surface at most ~6 system events/day.
2. **No stacking:** never two consecutive events of the same `event_type`; interleave.
3. **Freshness:** at least one system event per 24h window surfaced (anniversary is the guaranteed fallback once backfill lands).
4. **Priority weighting** selects which system events surface when there are more than fit.
5. **Determinism:** ordering within a response is seeded by date, so refreshes don't reshuffle.

## Rendering

- `FeedItem` union (in `app/lib/queries/activity.ts`) gains `{ type: "system"; event: FeedEventRow }`.
- New `SystemEventRow` client component: renders `copy` (emoji already in the string) + film poster/link when `film_id` present. **No reactions, no comments, no actor row.**
- `/home`: `FollowedActivityFeed` consumes the composed feed.
- Landing: `landing.ts` retires its ad-hoc price-drop merge and consumes the same composer; `LandingFeedCard` renders system rows. Anon visitors see the same feed.

## Backfill — one-time script

`scripts/` script (run manually, service role): for the 253 films with `tmdb_id`, fetch TMDB release dates, write `theatrical_release_date` where null. Idempotent, logs a summary, no fuzzy matching. Run **before** the daily job first fires.

## Testing

- Copy module: unit tests per type (template rendering, variant non-repetition).
- Composer: unit tests for ratio cap, no-stacking, priority, determinism, zero-user-activity cap.
- RLS: testcontainers test — anon/authenticated can SELECT, cannot write.
- Generators: pure decision logic (thresholds, dedup, supersession) extracted and unit-tested; emission sites integration-tested where the env-blocked template applies.

## Rollout

1. Migration first (only new code reads the table — safe, and keeps the convention).
2. Deploy app + worker changes.
3. Run the release-date backfill.
4. Verify: next price sweep emits events; force one maintenance-cron run; landing + `/home` show interleaved rows.

## Out of scope (v1)

`now_free`/`left_free` (needs provider snapshot/diff), `ritual_open`/`badge_earned` (needs rituals), `death_day` (needs person death dates), per-user personalized feeds, emoji configuration, any migration of existing `activity` rows.
