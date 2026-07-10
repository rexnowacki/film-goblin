# FROM THE PIT: Archive Tab — Design

**Date:** 2026-07-09
**Status:** Draft — awaiting owner review
**Sub-project:** A fourth tab on `/home` ("pit", alongside all/coven/recs) showing everything the goblin found — all deals, all free items, all catalog changes, all theatrical/ambient movement — un-capped and un-aged. Sub-project #5 of the five sketched from the owner's cadence feedback; #1 (cadence caps) and #2 (aging/TTL) have shipped, #3 (digest events) and #4 (film-page price ledger) are specced separately.

## Problem

Sub-projects #1 and #2 deliberately made the main feed *forget*: a user sees at most 3 new Pit events per day, never re-sees an event, and events older than 48h are never selected at all. That is correct for an interruption surface — but it leaves the goblin's full catalog of findings with no home. The owner's original brief called for "a From the Pit tab/filter: everything the goblin found — all deals, all free items, all catalog changes, all weird streaming movement," and #2's spec explicitly promised that 48h+ events "remain in `feed_events` forever, so the future Ledger (#4) and Pit tab (#5) query them un-aged." This spec builds that home.

Owner decision (2026-07-09): the archive lives as a **fourth tab on `/home`'s existing FeedTabs row**, not a standalone route — matching the original "tab/filter" framing and reusing the whole feed scaffold.

## Decision summary

| Decision | Choice |
|---|---|
| Surface | Fourth tab `pit` in `FeedTabs` (all/coven/recs/**pit**), selected via the existing `?tab=` URL param |
| Selection semantics | Pure archive: bypasses the ENTIRE #1/#2 pipeline — no daily cap, no permanent-seen exclusion, no age filter, no position rules, no watchlist boost. Reverse-chronological, all `feed_events` |
| Impressions | **Browsing the archive must NOT record impressions.** `SystemEventRow` gains `recordImpression?: boolean` (default `true`); the pit tab passes `false` |
| Data fetching | New `getPitArchiveEvents(client, { before?, limit })` query, initial 30 server-rendered, "Load more" via a new server action mirroring the existing `loadMoreFeed` pattern (cursor = `created_at`) |
| Filter chips | Client-side over the fetched window: **Everything** (default) · **Deals** · **Free** · **Catalog** · **Hauntings** — a total mapping of all 15 `FeedEventType`s |
| Tier rendering | `resolvePitTiers` runs over the archive list (so `all_time_low` still renders as a full card, with the existing full-card window keeping visual density sane); `enforcePitPositionRules` does NOT run (no user items to space against — it's an archive, not a feed) |
| Audience | Signed-in only — settled for free by middleware: `/home` is in `AUTH_REQUIRED`, so no tab on it is ever anonymous |
| Digests (#3) | The archive shows individual events only, never digest cards — it is the un-bundled source of truth. Digest cards elsewhere deep-link here via `/home?tab=pit` |

Rejected alternatives:
- **Standalone `/pit` route** — more filter room, but a new route to build and navigate to; the owner picked the tab, which reuses the entire existing scaffold (tab row, URL param handling, page chrome) for near-zero surface cost.
- **Applying the seen-filter or age-filter "lightly"** (e.g. dimming seen events) — the cadence machinery exists to protect the *social feed* from interruption fatigue. An archive is a reference surface the user deliberately navigates to; filtering it would defeat its one purpose (finding the thing you half-remember seeing). Complexity with negative value.
- **Per-chip server queries** — one query per filter chip means N round-trips over a small dataset. The archive window (30–90 rows) filters instantly client-side; rejected.
- **Reusing `composeFeed` pagination for the archive** — `composeFeed` exists to interleave system events with user activity deterministically. The pit tab has no user items to interleave; running the composer over a pure-system list is machinery without function. A plain reverse-chronological query with a `created_at` cursor is the honest shape.

## 1. The impression hazard (hard requirement)

`SystemEventRow` currently records an impression unconditionally on mount:

```tsx
useEffect(() => {
  recordPitImpressions([event.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [event.id]);
```

If the pit tab reused this as-is, **browsing the archive would destroy the main feed's Pit selection**, two ways:

1. **Permanent starvation** — every event scrolled past in the archive gains a `pit_impressions` row, and #1's permanent-seen exclusion (`seenEventIds`) then bars it from the main feed forever. One long scroll through the archive marks the entire recent candidate pool as seen.
2. **Budget burn** — #1's daily cap counts distinct events impressed today (`todayCount`), with no distinction of *where* they were impressed. Reading 3+ archive rows zeroes the user's main-feed Pit allowance for the day.

Fix: widen the prop contract —

```tsx
export default function SystemEventRow({ event, tier, recordImpression = true }:
  { event: SystemFeedEvent; tier: PitTier; recordImpression?: boolean }) {
  useEffect(() => {
    if (recordImpression) recordPitImpressions([event.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, recordImpression]);
  ...
```

Default `true` preserves every existing call site unchanged (`FeedTabs`'s all-tab render, `FeedRow`'s dead branch). The pit tab passes `recordImpression={false}`. **This is a correctness requirement, not a polish item** — the feature must not ship without it.

## 2. Data fetching & pagination

New query in `app/lib/feed-events/query.ts` (sibling to `getRecentSystemEvents`, same minimal-cast pattern since `feed_events` isn't in the generated types):

```ts
export async function getPitArchiveEvents(
  client: Client,
  opts: { before?: string; limit?: number } = {},
): Promise<SystemFeedEvent[]> {
  // .order("created_at", { ascending: false })
  // .lt("created_at", opts.before) when present
  // .limit(opts.limit ?? 30)
}
```

- Initial page: `home/page.tsx` fetches `getPitArchiveEvents(supabase, { limit: 30 })` **only when `tabParam === "pit"`** (no cost to the other tabs) and passes it to `FeedTabs` as a new optional `pitArchive?: SystemFeedEvent[]` prop.
- Load more: new server action `loadMorePitArchive({ before })` in a new `app/lib/actions/pit-archive.ts` (or co-located with `feed-load-more.ts` — implementation's choice), returning `{ events, done }`. Cursor is the last rendered event's `created_at`; `done` when fewer than `limit` rows return. Mirrors the shape of the existing `loadMoreFeed` flow that FeedTabs already implements for user activity.
- No dedup concern: `feed_events.id` is the React key; `created_at` cursor with `lt` cannot re-fetch the same row (ties on identical timestamps are theoretically possible from a single cron burst — accept the vanishing edge case of a skipped same-instant row rather than building keyset pagination for a browse surface).

## 3. Filter chips — the bucket mapping

Four content buckets plus the default, as a total `Record` so the compiler enforces coverage when event types are added:

```ts
export type PitBucket = "deals" | "free" | "catalog" | "hauntings";

export const PIT_BUCKETS: Record<FeedEventType, PitBucket> = {
  price_drop: "deals",
  all_time_low: "deals",
  price_rise: "deals",
  now_free: "free",
  left_free: "free",
  new_film: "catalog",
  now_on_apple: "catalog",
  anniversary: "catalog",
  milestone: "catalog",
  verdict_anointed: "catalog",
  goblin_pick: "catalog",
  last_showing: "hauntings",
  now_at_theater: "hauntings",
  full_moon: "hauntings",
  monthly_communion: "hauntings",
};
```

Mapping rationale, including the two judgment calls:
- The owner's fourth bucket was "weird streaming movement," but the actual streaming-movement types (`now_free`/`left_free`) belong in **Free** — that is where a user hunting free films looks. What's actually left over is the theatrical + ambient family (`last_showing`, `now_at_theater`, `full_moon`, `monthly_communion`), which gets its own bucket named **Hauntings** (goblin register; theater showings and moon-phase rituals are "the pit haunting the physical world").
- `now_on_apple` is a store-catalog arrival, not a deal (no price signal in the event) → **Catalog**. `price_rise` carries a price signal → **Deals** (the ledger of price movement, both directions).

Chips render above the archive list in the existing `.chip` visual language; selection is client state, filtering is a pure function over the fetched window:

```ts
export function filterArchiveByBucket(events: SystemFeedEvent[], bucket: PitBucket | null): SystemFeedEvent[] {
  if (bucket === null) return events; // "Everything"
  return events.filter(e => PIT_BUCKETS[e.event_type] === bucket);
}
```

"Load more" always fetches unfiltered (the window grows; the active chip re-filters the larger window) — per-chip cursors are rejected complexity.

## 4. Tier rendering

The archive reuses the tier system for visual hierarchy: `resolvePitTiers` runs over the archive list (wrapped as system-only `ComposedItem`s, the same wrapping `LandingFeedCard` already does), so `all_time_low` renders as a full plum card, standard events get the seal treatment, ambient events whisper. The existing full-card sliding window inside `resolvePitTiers` (`PIT_FULL_CARD_WINDOW = 8`) applies naturally and is *desirable* here — an archive of a dozen ATLs shouldn't be twelve consecutive full cards.

`enforcePitPositionRules` does **not** run: its two rules (first-screen cap, min-gap between Pit items) are defined relative to user items in a mixed feed. The archive has no user items — every gap is zero — so the rules would degenerate to "drop everything after the first item." Structurally inapplicable, not just unwanted.

Rendering: `SystemEventRow` with `recordImpression={false}` and the resolved tier. Film titles/posters keep their existing links.

## 5. Tab plumbing

`app/components/FeedTabs.tsx`:
- `type Tab = "all" | "coven" | "recs" | "pit"`.
- `MATCHERS.pit = () => false` (no user activity ever matches), `TAB_KINDS.pit = []`, `TAB_SCOPES.pit = "site"` (value required by the Record type; unused since the pit branch never queries user activity).
- `feedItemMatches` unchanged in logic — system rows still render on `"all"` only through the composed path. The pit tab does **not** flow through `composed`/`filtered` at all: when `tab === "pit"`, the component renders a separate archive branch (chips + archive list + its own Load more) instead of the `filtered.map(...)` block. This keeps the #1/#2 pipeline (composeFeed → enforcePitPositionRules → resolvePitTiers) untouched for the other tabs and gives the archive its own, simpler render path.
- New optional props: `pitArchive?: SystemFeedEvent[]` (initial page), used only by the pit branch.
- `pickTab` already generalizes (`p.set("tab", next)`); the tab button row maps over the widened Tab array.
- `showFeedInsert` stays `tab === "all" && ...` — the GoblinRecommends insert does not appear on the pit tab.
- Empty-state copy (goblin voice, matching the existing per-tab `emptyCopy` map): "The pit is silent. Nothing has stirred yet."

`app/app/home/page.tsx`:
- `VALID_TABS` gains `"pit"`; `TAB_KINDS`/`TAB_SCOPE` maps gain pit entries mirroring FeedTabs.
- When `tabParam === "pit"`: skip the `getEnrichedActivity` user-feed fetch (`initialItems: []`, done) and fetch `getPitArchiveEvents` instead; pass as `pitArchive`. The existing `systemEvents` fetch (`getEligiblePitEventsForUser`) is skipped for this tab too — the archive replaces it, and fetching capped candidates for a tab that doesn't use them is waste.
- All other tabs: byte-for-byte unchanged.

Explicitly unchanged: the anonymous landing page (`LandingFeedCard`/`getLandingFeed`), signed-out `/home` (middleware redirect — which also settles "signed-in only" with zero new auth code), the all/coven/recs behavior, and all of #1/#2's selection machinery.

## 6. Edge cases

- **Empty archive** (brand-new deployment, or all events deleted): chips render, list shows the empty-state copy. `done = true` immediately; no Load more button.
- **Brand-new user**: sees the same global archive as everyone — it is deliberately not personalized (no watchlist boost, no seen-filter). This is correct: it's a reference surface, and a new user browsing history is a feature.
- **`?activity=<id>` deep-link** (bell/push notifications): those URLs never set `tab`, so they land on the "all" tab and auto-expand the target activity row exactly as today. A hand-built URL with both `?tab=pit&activity=…` resolves the tab to pit and the activity param finds no matching row — harmless no-op, same as an activity id that has scrolled off any other tab.
- **Chip + Load more interaction**: with a chip active, Load more grows the underlying window; the chip re-filters. A filtered view may appear to add fewer than `limit` rows per click — accepted, honest behavior.
- **Same-instant `created_at` ties at a page boundary**: `lt` cursor may skip a same-timestamp row. Accepted (see §2).

## 7. Relationship to digest events (#3)

Digest cards (specced separately) bundle same-kind events on the *main feed* and end with "See all →" — that link targets `/home?tab=pit` (optionally with a chip preselected via a `&pit=free`-style param if #3 wants it; that param is #3's to add, not this spec's). The archive never renders digest cards: it is the un-bundled source of truth the digests summarize. Dependency direction: #3 depends on this tab existing as a link target; this spec has no dependency on #3.

## 8. Testing

- **Bucket mapping** (`app/tests/feed-events/pitBuckets.test.ts`): a table-driven test asserting the bucket for each of the 15 `FeedEventType`s (the `Record` type already forces compile-time totality; the test pins the *assignments* against accidental edits). Plus `filterArchiveByBucket`: null returns all; each bucket returns only its members; empty input.
- **Impression suppression**: unit-level test that `SystemEventRow`'s effect respects `recordImpression={false}` — if component testing stays out of scope (house convention has none), assert it structurally in review and cover the default-true path by the absence of changes to existing call sites; the prop gate is a one-line conditional. Flag: this is the weakest-tested requirement — the implementation plan should include an explicit manual-verification step (browse pit tab, then `SELECT count(*) FROM pit_impressions WHERE user_id = …` unchanged).
- **`getPitArchiveEvents` pagination** (env-gated integration, house `describe.skipIf` pattern): returns newest-first; `before` cursor excludes the boundary row and returns the older page; `limit` respected.
- **Tab plumbing**: `feedItemMatches` still routes system rows to "all" only; pit tab renders zero user items (covered implicitly by `MATCHERS.pit = () => false` plus the separate render branch — an integration-style component test is not house convention, so this lands on the manual smoke checklist).

## Out of scope (deferred)

- Digest rendering inside the archive (never — see §7) and digest events themselves (#3, separate spec).
- The film-page price ledger (#4, separate spec).
- Search within the archive, per-film filtering, or a film-page "history of Pit events for this film" view.
- Any change to the anonymous landing page.
- Archive retention policy (events currently live forever; if `feed_events` ever needs pruning, that's an ops decision for a future session — the archive is the surface that would be affected, so decide there).
- Preselecting a chip via URL param (reserved for #3's "See all →" if it wants it).
