# FROM THE PIT: Cadence Caps — Design

**Date:** 2026-07-08
**Status:** Approved
**Sub-project:** Tame how often and where FROM THE PIT system events interrupt the main `/home` feed, so the Pit reads as a rare, valuable interruption rather than a "deals board" competing with social activity — the first of a five-part decomposition (see Problem section).

## Problem

The three-tier visual treatment (shipped `2026-07-07-pit-tier-system-design.md`) fixed *how* Pit events look, but did nothing to constrain *how often* or *where* they appear. The owner's feedback: the feed currently interleaves Pit cards freely enough that opening `/home` can surface several Pit interruptions before any real social activity, making the product feel goblin-driven rather than people-driven.

The owner's full brief described five largely-independent pieces of work: (1) cadence/position caps on the existing feed, (2) an aging/TTL model with watchlist-relevance-gated visibility, (3) digest events bundling multiple same-kind occurrences into one card, (4) a new "Ledger" page for personal utility, (5) a new "Pit tab" archive surface. Per the project's decomposition discipline, these were split into separate sub-projects rather than one oversized spec. **This spec covers only #1** (with a small pull-forward of watchlist-aware selection, per the owner's explicit choice below). #2 is the natural next sub-project, since it needs the same per-user tracking infrastructure this one builds. #3–#5 are backlog-level future design conversations, not scoped here.

Explicitly deferred: digest/bundled events, the Ledger page, the Pit archive tab, coven-relevance signals (as opposed to the viewer's own watchlist), per-user timezone tracking (day boundaries use UTC — this is a single-market product with no existing per-user timezone storage anywhere).

## Decision summary

| Decision | Choice |
|---|---|
| Daily cap mechanism | Real, persistent impression tracking (`pit_impressions` table, mirroring the existing `fyp_impressions` pattern) — not a stateless deterministic-seed trick |
| Daily cap value | 3 distinct new Pit events introduced per user per UTC calendar day |
| "Already seen" | Permanent, all-time exclusion once an event has an impression row — not just a same-day dedup |
| Selection scope | This sub-project changes both *how many/where* (caps) and, per explicit owner choice, adds a basic watchlist-match boost to *which* events win a user's daily slots. Coven-relevance and full aging/TTL-based relevance are deferred to the next sub-project |
| First-screen cap | At most 1 Pit item (any tier) within the first 6 positions of the composed feed |
| Min-gap rule | At least 2 user items between any two Pit items, uniformly across all tiers (including whisper) |
| Violation handling | Drop the offending Pit item for this render (no impression recorded, remains eligible on a later render) — never reorder or defer |
| Scope boundary | Signed-in `/home` only. The anonymous landing page (`LandingFeedCard`/`getLandingFeed`) is untouched — no user identity exists there to key impressions on |

Rejected alternatives:
- **Deterministic per-user+date seed instead of a real table** — would give "same 3 events all day" cheaply with zero writes, but can't express permanent cross-day "already seen" exclusion, which the owner's aging model requires. Real tracking chosen instead, at the cost of a new table and writes.
- **Reordering/deferring position-rule violations** rather than dropping — reordering would fight `composeFeed`'s recency-ordering contract and risked cascading complexity. Dropping (with no impression recorded, so nothing is wasted) is simpler and composes cleanly with the existing pipeline.
- **Modifying `composeFeed` directly** to add the two new position rules — rejected in favor of a new pipeline stage (`enforcePitPositionRules`, sibling to the existing `resolvePitTiers`) to avoid touching a carefully-tuned, already-amended-once, fully deterministic function. Lower risk, matches the established pattern of small composable pure stages.
- **Per-user timezone-aware day boundaries** — no infrastructure for this exists anywhere in the app (a single-market product); UTC calendar day chosen as the simplest correct-enough default.

## 1. Data model (new migration)

```sql
CREATE TABLE pit_impressions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES feed_events(id) ON DELETE CASCADE,
  shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE pit_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pit_impressions_select_own ON pit_impressions
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON pit_impressions TO authenticated;

-- Race-safe batch insert, mirrors record_fyp_impressions. ON CONFLICT DO
-- NOTHING (not UPDATE): first-shown time is what matters, no repeat-count
-- needed for pit_impressions' purposes (permanent exclusion + today's
-- distinct count, both satisfied by row presence alone).
CREATE OR REPLACE FUNCTION record_pit_impressions(p_event_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_event_ids IS NULL
     OR array_length(p_event_ids, 1) IS NULL
     OR array_length(p_event_ids, 1) > 10 THEN
    RETURN;
  END IF;

  INSERT INTO pit_impressions (user_id, event_id)
  SELECT auth.uid(), e.id
  FROM unnest(p_event_ids) AS ids(id)
  JOIN feed_events e ON e.id = ids.id
  ON CONFLICT (user_id, event_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION record_pit_impressions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_pit_impressions(uuid[]) TO authenticated;
```

Batch cap of 10 (vs. `fyp_impressions`' 50) — a single feed render shows far fewer Pit items than FYP shelf posters; 10 is generous headroom.

## 2. Candidate selection — `getEligiblePitEventsForUser`

New function in `app/lib/feed-events/query.ts` (or a new co-located file), signed-in call sites only:

```ts
async function getEligiblePitEventsForUser(
  client: Client, userId: string, limit: number,
): Promise<SystemFeedEvent[]>
```

1. Fetch recent system events as `getRecentSystemEvents` does today.
2. Exclude any event whose id has a `pit_impressions` row for this user (all-time — a `NOT IN (SELECT event_id FROM pit_impressions WHERE user_id = ?)` filter, or an equivalent left-join-and-filter-null).
3. Compute `todayCount` = `COUNT(DISTINCT event_id)` from `pit_impressions` where `user_id = ?` and `shown_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`. If `todayCount >= 3`, return `[]` immediately (budget exhausted for today — zero Pit items enter the feed).
4. Otherwise, fetch the viewer's watchlist film-ids via the existing `getWatchlistedFilmIds(client, userId)` (`app/lib/queries/watchlists.ts`) and boost: for each candidate whose `film_id` is in that set, return a **copy** with `priority: event.priority + 1000` (never mutate the original — this is a display-time boost, not a stored value). The +1000 magnitude guarantees any watchlist match outranks any non-match on the existing 10–100 scale, while preserving existing relative ordering within each group.
5. Sort by (boosted) priority descending, take the top `3 - todayCount`.
6. Return that trimmed list, in the exact `SystemFeedEvent[]` shape `composeFeed` already expects — no changes to `composeFeed` itself.

## 3. Position enforcement — `enforcePitPositionRules`

New pure module, `app/lib/feed-events/pitPosition.ts`, sibling to `pitCadence.ts`:

```ts
export const PIT_FIRST_SCREEN_WINDOW = 6;
export const PIT_MIN_GAP = 2;

export function enforcePitPositionRules<U>(
  items: Array<ComposedItem<U>>,
): Array<ComposedItem<U>>
```

Single forward pass. Tracks: (a) how many Pit items have been kept so far within the first `PIT_FIRST_SCREEN_WINDOW` positions, (b) how many user items have appeared since the last kept Pit item. For each item: if it's a system item and keeping it would violate either the first-screen cap (already 1 Pit item kept within the first 6, and this position is still within the first 6) or the min-gap rule (fewer than `PIT_MIN_GAP` user items since the last kept Pit item), **drop it** (omit from the output array — do not replace with anything). Otherwise keep it and update the tracking counters. User items are never dropped.

Pipeline order: `composeFeed` (unchanged) → `enforcePitPositionRules` (new) → `resolvePitTiers` (unchanged internally, now sees the trimmed array — its own sliding-window counts are computed over survivors only, so a dropped item doesn't consume full-card cadence budget either).

## 4. Wiring

- `app/app/home/page.tsx` — the only signed-in call site of `getRecentSystemEvents` (confirmed: the only other call site is `landing.ts`, deliberately untouched, and `query.ts` itself, where `getRecentSystemEvents` is defined and remains unchanged): swap to `getEligiblePitEventsForUser(client, user.id, limit)`.
- `app/components/FeedTabs.tsx`: insert `enforcePitPositionRules` between the existing `composedRaw` computation and the `resolvePitTiers` call.
- New action `recordPitImpressions(eventIds: string[])` in new file `app/lib/actions/feed-events.ts` (no action file exists for this domain yet — `feed-events` logic today is pure modules under `lib/feed-events/` plus service-role-only emission in `emit.ts`; this is the first user-facing action), mirroring `recordFypImpressions` exactly: `_recordPitImpressions(client, eventIds)` calls the RPC, public wrapper creates the client, fire-and-forget with `console.warn` on failure, capped at 10 ids client-side too (defense in depth alongside the RPC's own cap).
- `SystemEventRow` (or a thin wrapper around it) calls `recordPitImpressions([event.id])` once mounted — client-side, on actual render, not on server-side selection.
- **`LandingFeedCard`/`getLandingFeed` are untouched** — no cap, no position rules, no impressions, per the explicit scope boundary.

## 5. Edge cases

- User with zero watchlist films: boost step is a no-op, falls through to today's plain priority ordering.
- Fewer than 3 eligible candidates exist (e.g., only 1 unseen event in the whole system): budget isn't "wasted" — tomorrow's `todayCount` resets and any candidate that existed yesterday but wasn't selected is still eligible (it was never impressed).
- A user who never has any Pit items enter their feed (e.g., budget exhausted early in the day) sees a purely social feed for the rest of that day — expected behavior, not a bug.
- Position-rule drops on a page with very few user items (e.g., a brand-new coven-less user): the min-gap rule can end up suppressing most/all Pit items on that render — acceptable; the composer's existing "floor of 1 system item when any exist" rule already only applies when user items exist at all.

## 6. Testing

- `app/tests/feed-events/pitPosition.test.ts` — pure: first-screen cap with 0/1/2 Pit candidates in the first 6, min-gap at gap 0/1/2/3, whisper items subject to the same gap rule, drops don't corrupt survivor ordering/indices, empty input, all-system input.
- Watchlist-boost ranking — pure function extracted for testability: a low-priority watchlist match outranks a high-priority non-match; relative order preserved within each group.
- `getEligiblePitEventsForUser` — env-gated integration test (house `describe.skipIf(!hasEnv)` pattern): budget-exhausted returns `[]`; an impressed event never reappears; boost actually reorders a real query result; UTC-day boundary behaves correctly around midnight.
- `pit_impressions` RLS — testcontainers (per this repo's standing rule: pg-mem cannot prove RLS).

## Out of scope (deferred)

- Aging/TTL visibility windows (0–24h / 24–48h watchlist-only / 48h+ removed) — next sub-project, builds on this one's impression infrastructure.
- Digest/bundled events ("5 films are free tonight").
- The Ledger page and the Pit archive tab.
- Coven-relevance as a selection signal.
- Per-user timezone-aware day boundaries.
