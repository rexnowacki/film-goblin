# FROM THE PIT: Digest Events — Design

**Date:** 2026-07-09
**Status:** Draft — awaiting owner review
**Sub-project:** Bundle same-kind system feed events into one digest card instead of a wall of individual posts — sub-project #3 of the five sketched from the owner's cadence feedback (#1 cadence caps and #2 aging/TTL have shipped).

## Problem

When a generator emits several same-kind events in one run — the streaming refresh finding five films newly free, the price sweep catching four drops — the feed renders them as five separate FROM THE PIT posts. Even with #1's caps (max 3/day) and #2's aging, the *selection* is still one-event-one-card, so a burst of `now_free` events fills the user's entire daily Pit budget with near-identical cards. The owner's framing: the goblin "dumping its entire sack on the floor." The wanted shape:

```
FROM THE PIT · NO TITHE
The free pile is glowing.
5 films are free tonight.
[Lake Mungo] [Carrie] [Black Christmas]  +2 more
See all →
```

Individual (non-digest) cards should remain only for events the viewer specifically cares about: watchlist matches, major price drops, leaving soon, back on a service the user uses, unusually strong recommendation match.

## Decision summary

| Decision | Choice |
|---|---|
| Bundling point | Read-time, in the signed-in selection path (`getEligiblePitEventsForUser`) — never at emission. `feed_events` stays one-event-one-row |
| Digest representation | A **synthetic `SystemFeedEvent`** (id `digest:{event_type}:{YYYY-MM-DD}`, `payload.digest` carrying member ids/films/count) — flows through the untouched `composeFeed`/`enforcePitPositionRules`/`resolvePitTiers` with zero type changes to those modules |
| Grouping rule | Group surviving (seen-, cap-, age-filtered) non-exempt events by `event_type`; a group of ≥ `DIGEST_MIN_SIZE = 2` becomes one digest; a group of 1 stays an individual card |
| Individual-card exemptions (never digested) | Watchlist-matched events (any type); `all_time_low` (the "major price drop" full-tier type); `last_showing` ("leaving soon"). "Back on a service the user uses" and "strong recommendation match" are deferred — no per-user streaming-service data and no rec-strength signal on events exist today |
| Budget accounting | A digest consumes **one** slot of `PIT_DAILY_CAP = 3`. Requires mig 0214: `pit_impressions.digest_key TEXT NULL`; the daily count becomes `COUNT(DISTINCT COALESCE(digest_key, event_id::text))`. Permanent per-event exclusion is unchanged |
| Impressions | Rendering a digest records impressions for **all** member events (one RPC call, digest_key set), so no member ever resurfaces individually |
| Member cap | `DIGEST_MAX_MEMBERS = 10`, aligned with the existing impression batch cap; overflow members are simply left unselected (no impression, eligible later) |
| Digest tier | Always **standard** (falls out of the type system: every digestible type is standard-tier; the only full-tier type, `all_time_low`, is exempt) |
| Digest copy | Rendered at read time from per-type templates (goblin action-first voice), NOT frozen at emission — membership isn't knowable at emission |
| "See all →" link | **Omitted until sub-project #5 (Pit tab) ships**; then a one-line change to link `/home?tab=pit`. Soft dependency, not a blocker |
| Surfaces | Signed-in `/home` only. The anonymous landing page never digests (stays on its simple per-event rendering) |

Rejected alternatives:
- **Emission-time bundling** (generators write one "digest row" instead of N rows) — destroys per-event granularity that #1's dedup/impressions, #2's aging, and the future Pit tab archive (#5) all depend on; also makes membership immutable the moment the first event fires, so a film going free an hour later couldn't join.
- **Changing `composeFeed`/`ComposedItem` to carry a first-class digest variant** — `composeFeed` is the carefully tuned, thrice-shipped core; the synthetic-event representation gets identical ordering/anti-stacking/position behavior with zero changes to it.
- **Digest consumes N slots (one per member)** — defeats the entire purpose; three free films would exhaust the daily budget as thoroughly as the wall of cards did, just prettier.
- **No schema change; accept that member impressions inflate the daily count** — silently makes one digest consume the whole day's budget (N members ≥ 3 → `todayCount` ≥ cap). This is the hidden interaction that forces mig 0214; documented here so nobody "simplifies" it back.
- **Digest threshold ≥ 3** — leaves 2-event pairs as two separate cards, which is exactly the clutter being solved. ≥ 2 chosen; "2 films are free" reads fine.
- **Same-UTC-day grouping constraint** — unnecessary; #2's age filter already bounds candidates at <48h (<24h for non-watchlist films, which is what digest members are, being non-exempt). The age filter *is* the recency bound.

## 1. Data model (mig 0214)

```sql
-- 0214_pit_impressions_digest_key.sql
-- Digest events (spec 2026-07-09-pit-digest-events): a rendered digest
-- records impressions for ALL its member events so none resurface, but
-- must consume only ONE slot of the daily cap. digest_key groups member
-- impressions into one budget unit; NULL for ordinary individual events.
ALTER TABLE pit_impressions ADD COLUMN digest_key TEXT;

CREATE OR REPLACE FUNCTION record_pit_impressions(p_event_ids uuid[], p_digest_key text DEFAULT NULL)
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

  INSERT INTO pit_impressions (user_id, event_id, digest_key)
  SELECT auth.uid(), e.id, p_digest_key
  FROM unnest(p_event_ids) AS ids(id)
  JOIN feed_events e ON e.id = ids.id
  ON CONFLICT (user_id, event_id) DO NOTHING;
END;
$$;
```

Replacing the function with a defaulted second parameter keeps the existing one-arg call sites (`_recordPitImpressions`) working unchanged until they're updated in the same sub-project. Note the PostgreSQL caveat for the implementation plan: `CREATE OR REPLACE` cannot change a function's signature, so the migration must `DROP FUNCTION record_pit_impressions(uuid[])` first, then recreate with the new signature and re-issue `REVOKE ALL ... FROM PUBLIC` / `GRANT EXECUTE ... TO authenticated`.

`getEligiblePitEventsForUser`'s daily count changes from distinct `event_id` to distinct `COALESCE(digest_key, event_id::text)` — computed client-side exactly as today (the select adds the `digest_key` column). Permanent exclusion (`seenEventIds`) is unchanged: still per `event_id`, so every digest member is individually excluded forever after one render.

Rollout order: migration first, then deploy (the app selects the new column; same convention as migs 0206/0207/0212).

## 2. Bundling — new pure module `app/lib/feed-events/pitDigest.ts`

```ts
import type { SystemFeedEvent } from "./types";
import type { FeedEventType } from "./copy";

export const DIGEST_MIN_SIZE = 2;
export const DIGEST_MAX_MEMBERS = 10; // aligned with the impression RPC batch cap

// Types that never digest, regardless of how many fire together.
// all_time_low = the owner's "major price drop" (also the only full-tier
// type); last_showing = "leaving soon". Watchlist-match exemption is
// per-event, handled in bundlePitDigests, not per-type.
export const DIGEST_EXEMPT_TYPES: ReadonlySet<FeedEventType> =
  new Set(["all_time_low", "last_showing"]);

export interface PitDigestPayload {
  digest: true;
  memberIds: string[];                                                  // all members, ≤ DIGEST_MAX_MEMBERS
  memberFilms: { id: string; title: string; artwork_url: string | null }[]; // first 3, for chips
  memberCount: number;
}

// Type guard the renderers branch on.
export function isPitDigest(event: SystemFeedEvent): boolean;

// Partitions events into exempt individuals, digest units, and singleton
// individuals. Returns a SystemFeedEvent[] in which each digest is ONE
// synthetic event:
//   id:         `digest:${event_type}:${YYYY-MM-DD}` (UTC date of `now`)
//   event_type: the members' shared type
//   film_id:    null (digests are general-interest; no watchlist boost)
//   priority:   max member priority (composeFeed sorts on it as usual)
//   created_at: newest member's created_at (recency ordering as usual)
//   copy:       rendered NOW from the digest template (see §4)
//   payload:    PitDigestPayload
//   film:       null
// Never mutates input.
export function bundlePitDigests(
  events: SystemFeedEvent[],
  watchlistFilmIds: string[],
  now: Date,
): SystemFeedEvent[];
```

Grouping algorithm: (1) any event whose `film_id` is on the watchlist, or whose type is in `DIGEST_EXEMPT_TYPES`, passes through untouched; (2) the rest group by `event_type`; (3) groups of ≥ `DIGEST_MIN_SIZE` become one synthetic digest event (members ordered newest-first; members beyond `DIGEST_MAX_MEMBERS` are dropped from the digest entirely — no impression, still eligible on a later render); (4) groups of 1 pass through as ordinary individual events.

The synthetic id is stable within a UTC day (React key stability across re-renders) and never collides with a real row. A stray impression call carrying the synthetic id would still be harmless, but not via the RPC's `JOIN` — `"digest:now_free:2026-07-09"` isn't a valid UUID, so it fails at the `::uuid[]` cast before the JOIN ever runs, throwing an error the fire-and-forget wrapper swallows. Same harmless outcome, but the mechanism matters for anyone debugging: the failure mode is a swallowed cast error (visible as a `console.warn`), not a silent skip. Either way, the digest render path never sends it (it sends `memberIds`, §5).

## 3. Pipeline placement

Inside `getEligiblePitEventsForUser`, bundling runs after the age filter and before ranking — this ordering is load-bearing:

```
… seen-filter → cap-check → fetch candidates → fetch watchlist
   → filterPitByAge(candidates, watchlist, now)          (#2, unchanged)
   → bundlePitDigests(fresh, watchlist, now)             ← NEW
   → rankPitCandidatesByWatchlist(units, watchlist)      (#1, unchanged)
   → slice(0, PIT_DAILY_CAP - todayCount)                (#1, unchanged — a digest is one unit, one slot)
```

Bundling must precede the budget slice (else a 5-member group could never form — the slice would have already cut to ≤3 events) and follow the seen/age filters (a digest must contain only events this user could legitimately see individually). Ranking works untouched because synthetic events carry a real `priority`; digests have `film_id: null` so they correctly receive no watchlist boost (any watchlist-matched member was exempted out before grouping). Downstream, `composeFeed`, `enforcePitPositionRules`, and `resolvePitTiers` treat a digest as one ordinary system item — one feed slot, one position-rule unit, standard tier (its `event_type` maps to standard for every digestible type; the only full-tier type is exempt). No changes to any of those modules.

## 4. Digest copy — read-time templates in `pitDigest.ts`

Ordinary event copy is frozen at emission (`copy.ts` contract). Digests cannot be: membership isn't known until read time — a film going free an hour after the first one must join tonight's digest. So digest copy lives in `pitDigest.ts` as `(n: number) => string` templates, rendered inside `bundlePitDigests`, obeying the action-first voice rule (goblin ACTION, never goblin FEELING):

| Type | Template (n ≥ 2) |
|---|---|
| `now_free` | `The goblin heaped the free pile higher. **${n} films** are free right now.` |
| `left_free` | `The goblin watched ${n} films slip back behind the tollgate.` |
| `price_drop` | `The goblin pried the price tags off **${n} films** tonight.` |
| `price_rise` | `${n} prices crept back up while the goblin glared.` |
| `new_film` | `The goblin dragged **${n} new films** into the pit.` |
| `now_on_apple` | `${n} films crossed over — now on Apple TV.` |
| *fallback (any other type)* | `The goblin surfaced **${n} omens** from the pit.` |

Kicker stays type-derived via the existing `getPitKicker` (a `now_free` digest reads `FROM THE PIT · NO TITHE` automatically). Existing per-event templates in `copy.ts` are untouched.

## 5. Rendering & impressions

`SystemEventRow` gains a digest branch (standard-tier visual language — seal, plum wash, kicker):

- Copy line from the synthetic event's `copy`.
- Up to 3 member-film poster chips (from `payload.memberFilms`), each linking to its `/film/[id]`; a `+N more` text chip when `memberCount > 3`.
- **No "See all →" link in this sub-project** — it targets the Pit tab (#5), which doesn't exist yet. When #5 ships, add the link to `/home?tab=pit` (one line). Locked: omitted, not stubbed.
- The mount-time impression effect branches: digest → `recordPitImpressions(payload.memberIds, /* digestKey */ event.id)`; ordinary event → `recordPitImpressions([event.id])` as today. `_recordPitImpressions` gains an optional `digestKey` second argument threaded to the RPC.

The anonymous landing page (`LandingFeedCard`) is untouched — no digests there; it continues rendering whatever `getLandingFeed` returns per-event.

## 6. Edge cases

- **Exactly 1 non-exempt event of a type** → individual card, exactly as today. No 1-member digests, ever.
- **Digest + exemption coexisting**: 4 `now_free` events where 1 film is watchlisted → 1 boosted individual card + 1 digest of 3. Both are units competing for the same daily budget; `composeFeed`'s same-type anti-stacking keeps them from rendering adjacent.
- **Digest selected but budget has 1 slot left** → fine; a digest is one unit and fits one slot.
- **Digest not selected** (outranked or budget exhausted) → no impressions recorded for any member; all members remain individually eligible on a later render, and the digest re-forms fresh next time.
- **Members > `DIGEST_MAX_MEMBERS`** → digest carries the 10 newest; overflow events silently remain eligible (they'll likely form the next day's digest or age out).
- **Re-render of an already-impressed digest**: members are in `seenEventIds`, so the group never re-forms — permanent exclusion works per-member with zero digest-specific logic.
- **Membership drift across a midnight boundary**: the synthetic id embeds the UTC date, so tomorrow's digest of leftover members is a different unit (different `digest_key`) and correctly consumes a new budget slot.

## 7. Testing

- `app/tests/feed-events/pitDigest.test.ts` — pure `bundlePitDigests`: threshold (1 stays individual, 2 digests), per-type grouping, watchlist-member exemption, `DIGEST_EXEMPT_TYPES` exemption, member cap + overflow left out, synthetic event shape (id format, priority = max, created_at = newest, film_id null, `payload.digest` true), copy template per type + fallback, no input mutation.
- Extend `app/tests/feed-events/getEligiblePitEventsForUser.test.ts` (env-gated): a rendered digest's member impressions with a shared `digest_key` count as **one** toward the daily cap (insert N member impressions with the same `digest_key`, assert `todayCount` contribution is 1 and further candidates are still returned); permanent exclusion still per-member.
- `db/tests/rls/pit-impressions.test.ts` — extend for the two-arg RPC: digest_key persisted, one-arg legacy call still works (NULL key), batch cap still enforced.

## Out of scope (deferred)

- Digests on the anonymous landing page.
- Cross-day digests ("this week's free pile") — the daily synthetic id boundary is deliberate.
- Digest push notifications.
- "Back on a service the user uses" and "unusually strong recommendation match" as individual-card exemptions — no per-user streaming-service preference data and no recommendation-strength signal on `feed_events` exist yet; both need their own data-model work first.
- The "See all →" destination (Pit tab, sub-project #5) — link added there when it ships.
