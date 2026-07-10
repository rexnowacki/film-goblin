# FROM THE PIT: Aging / TTL — Design

**Date:** 2026-07-09
**Status:** Approved
**Sub-project:** Give system feed events a time-to-live on the signed-in `/home` feed so stale events age out instead of resurfacing when the feed is quiet — sub-project #2 of the five sketched from the owner's cadence feedback (see `2026-07-08-pit-cadence-caps-design.md`, which shipped #1).

## Problem

Sub-project #1 (cadence caps) capped how *many* Pit events surface and *where*, but placed no floor on how *old* a surfaced event can be. `getRecentSystemEvents` fetches the 12 most-recent events ordered by `created_at DESC` with no age filter, and `getEligiblePitEventsForUser` only excludes events the user has already seen. So a week-old, never-seen event can still surface whenever the feed is quiet enough that it lands in the top 12 — exactly the "graveyard of old Pit cards" the owner flagged: a Pit post is usually timely utility (a price drop, a now-free window), not evergreen content, and reads as stale the moment its moment has passed.

The owner's aging sketch:

| Age | Behavior |
|---|---|
| 0–24h | Eligible for the main feed |
| 24–48h | Only if relevant to the viewer's watchlist |
| 48h+ | Removed from the main feed (kept for a future Ledger / Pit tab) |
| Already seen | Do not resurface unless the status changed again |

## Reconciliation with #1 (no conflict)

**"Do not resurface unless the status changed again" is already satisfied by #1's permanent per-event exclusion.** Each `feed_events` row is a distinct event with its own `id`. A status change — a film going free again, a fresh price drop — emits a *new* row with a *new* id, which is not in the user's all-time `seenEventIds` and is therefore eligible. "Do not resurface *the same event*" (permanent exclusion) and "*unless status changed*" (a new row) are the same rule from two sides. This sub-project changes nothing about impression exclusion, the daily cap, the watchlist boost, or the position rules from #1.

## Decision summary

| Decision | Choice |
|---|---|
| What #2 adds | A time-based eligibility gate on the candidate side of `getEligiblePitEventsForUser` — pure selection logic, nothing else |
| Age tiers | `fresh` (<24h, always eligible), `aging` (<48h, eligible only if watchlist-relevant), `stale` (≥48h, never selected into the main feed) |
| "Relevant" for the aging tier | Watchlist only — `event.film_id ∈ watchlist`. Not library: a price/now-free event on a film the viewer already *owns* is a moot signal, so folding library in would surface the wrong things. Events with `film_id = null` (e.g. `milestone`) or a non-watchlisted film get a hard 24h shelf life |
| 48h+ "keep" half | Deferred. #2 does only the removal (48h+ events aren't selected). Events are never deleted — they remain in `feed_events` forever, so the future Ledger (#4) and Pit tab (#5) query them un-aged. No archival table, no new storage, no migration in #2 |
| Age boundaries | Rolling hours from `created_at` (not UTC-calendar-day like #1's daily cap — age is naturally "how old is this event"). Upper-bound-exclusive: exactly 24.000h is `aging`, exactly 48.000h is `stale` |
| Where the filter lives | `app/lib/feed-events/pitSelection.ts` (signed-in path only) — NOT in the shared `getRecentSystemEvents` |
| Constants | Named/exported (`PIT_FRESH_HOURS = 24`, `PIT_AGING_HOURS = 48`), matching #1's convention |

Rejected alternatives:
- **Age floor in `getRecentSystemEvents`'s SQL** (`.gte("created_at", …)`) — that query also feeds the anonymous landing page (`getLandingFeed`), which #1 deliberately left un-aged. An SQL floor there would regress the landing feed. The filter must live in the signed-in-only selection path, matching #1's scope boundary.
- **Watchlist ∪ library as the relevance set** — semantically wrong for these event types (you don't care about a price drop on a film you own) and adds a second lookup.
- **Building a minimal archive surface now** to hold 48h+ events — pulls scope from #5 (Pit tab) forward; that surface deserves its own design pass. Events already persist in `feed_events`, so nothing is lost by deferring.
- **UTC-calendar-day age boundaries** — the daily *cap* uses UTC-day because it's a per-day budget; event *age* is a rolling duration and the owner's "0–24h / 24–48h" reads as rolling hours.

## 1. New pure module — `app/lib/feed-events/pitAge.ts`

```ts
import type { SystemFeedEvent } from "./types";

export const PIT_FRESH_HOURS = 24;
export const PIT_AGING_HOURS = 48;

export type PitAgeTier = "fresh" | "aging" | "stale";

// Upper-bound-exclusive: exactly PIT_FRESH_HOURS old is "aging", exactly
// PIT_AGING_HOURS old is "stale". `now` is injected for testability.
export function classifyPitEventAge(createdAt: string, now: Date): PitAgeTier {
  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000;
  if (ageHours < PIT_FRESH_HOURS) return "fresh";
  if (ageHours < PIT_AGING_HOURS) return "aging";
  return "stale";
}

// fresh → always kept; stale → always dropped; aging → kept only when the
// event's film is on the watchlist. Builds its own Set (signature mirrors
// rankPitCandidatesByWatchlist, which also takes a string[] and builds a
// Set internally) so the call site passes the same watchlistFilmIds array
// to both. Never mutates input.
export function filterPitByAge(
  events: SystemFeedEvent[],
  watchlistFilmIds: string[],
  now: Date,
): SystemFeedEvent[] {
  const watchlist = new Set(watchlistFilmIds);
  return events.filter(e => {
    const tier = classifyPitEventAge(e.created_at, now);
    if (tier === "fresh") return true;
    if (tier === "stale") return false;
    return e.film_id != null && watchlist.has(e.film_id);
  });
}
```

`SystemFeedEvent` already carries `created_at: string` and `film_id: string | null`, so no type changes are needed.

## 2. Insertion into `getEligiblePitEventsForUser`

The function already fetches `watchlistFilmIds` after the candidate fetch. The age filter slots in immediately after that fetch, before the existing ranking step. Only these lines change (everything above — the impression fetch, `seenEventIds`, `todayCount`, the daily-cap early-exit, the candidate fetch and seen-filter — stays exactly as shipped):

Current:
```ts
  const watchlistFilmIds = await getWatchlistedFilmIds(client, userId);
  const ranked = rankPitCandidatesByWatchlist(candidates, watchlistFilmIds);

  return ranked.slice(0, PIT_DAILY_CAP - todayCount);
```

Becomes:
```ts
  const watchlistFilmIds = await getWatchlistedFilmIds(client, userId);
  const fresh = filterPitByAge(candidates, watchlistFilmIds, new Date());
  if (fresh.length === 0) return [];
  const ranked = rankPitCandidatesByWatchlist(fresh, watchlistFilmIds);

  return ranked.slice(0, PIT_DAILY_CAP - todayCount);
```

Add the `filterPitByAge` import from `./pitAge`.

## 3. Why `limit = 12` still suffices

`getRecentSystemEvents` returns the 12 most-recent events, `created_at DESC` — i.e. the freshest possible. The age filter only ever *removes* the older tail; it never needs events beyond the top 12, because anything past that window is strictly older and thus more likely stale, not less. If all 12 are stale, the feed is genuinely quiet and showing no Pit items is correct. No change to the fetch limit.

## 4. Interaction map (all unchanged from #1)

- **Impression exclusion / daily cap**: upstream of the age filter — a seen event is already gone before aging runs; a capped-out user returns `[]` before the candidate fetch. Unchanged.
- **Watchlist boost (`rankPitCandidatesByWatchlist`)**: runs on the age-filtered survivors. The boost is a *soft* ranking preference; the aging tier's watchlist check is a *hard* gate — different mechanisms, same signal, coherent (fresh events need not be relevant; aging events survive only if relevant; the boost then orders whatever survived). Unchanged.
- **Position rules (`enforcePitPositionRules`)**: run later, in `FeedTabs` at compose time, on whatever selection produced. Purely downstream. Unchanged.
- **Anonymous landing page (`getLandingFeed`) and signed-out `/home`**: never call `getEligiblePitEventsForUser`, so no aging applies. Unchanged.

## 5. Testing

- `app/tests/feed-events/pitAge.test.ts` — pure:
  - `classifyPitEventAge` boundaries: 23h59m → fresh, exactly 24.000h → aging, 47h59m → aging, exactly 48.000h → stale, 72h → stale, 0h → fresh.
  - `filterPitByAge`: fresh non-watchlist kept; aging watchlist-film kept; aging non-watchlist-film dropped; aging `film_id: null` dropped; stale watchlist-film dropped (stale beats relevance); empty input → empty; does not mutate input.
- Extend `app/tests/feed-events/getEligiblePitEventsForUser.test.ts` (env-gated integration): a stale (>48h) unseen event with a watchlisted film is NOT returned; a 24–48h event with a watchlisted film IS returned; a 24–48h event with a non-watchlisted film is NOT returned. Backdate `feed_events.created_at` via a direct service-role insert (the same backdating pattern the cross-day-permanence test already uses for `pit_impressions.shown_at`).

No migration, no new table, no new action, no UI change.

## Out of scope (deferred)

- The Ledger page (#4) and Pit archive tab (#5) — the surfaces that will show 48h+ events. #2 only stops selecting them into the main feed; they persist in `feed_events` for those surfaces to query later.
- Digest events (#3).
- Any age signal other than watchlist for the aging tier (coven relevance, library).
- Configurable per-user or per-event-type TTLs — the two constants are global.
