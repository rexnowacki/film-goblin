# Activity Feed Grouping (D1 / #52) — Design

**Status:** spec
**Date:** 2026-04-25
**Sub-project:** D1 (sub-project #52 from the original hearts decomposition). Pulled forward of C2 in the queue order so the grouping infrastructure exists before C2's high-volume bulk-watch event type arrives. See `CLAUDE.md` "Queued sub-projects" for the locked order.

## Goal

The home/coven feed (`getEnrichedFeed`) gains a read-time grouping pass that compresses runs of consecutive `watchlist_added` events from the same actor into a single expandable feed item — *"cthulhu.lemon added 5 films to their watchlist."* — to reduce noise without hiding any individual events. The pass runs after enrichment, before the result returns to the page.

## What ships

1. **Grouping algorithm** (`groupFeed`): pure function over `EnrichedActivity[]` returning `FeedItem[]`. Walks newest-first, seals runs when a non-matching event appears or the time-window rules fire.
2. **New outer type** `FeedItem = { type: "single", activity } | { type: "group", group }`. `EnrichedActivity` itself is unchanged.
3. **Grouping pass wired into `getEnrichedFeed`** at the very end. New `getProfileActivity` (or extended existing helper) returns `EnrichedActivity[]` un-grouped for the profile route.
4. **`ActivityWatchlistAddedGroup` component**: collapsed row + expanded inline items, 3px `var(--accent)` left stripe wrapping the entire expanded block.
5. **`ActivityRow` dispatch update**: switches on `FeedItem.type` first.
6. **CSS additions** to `globals.css` for `.activity-group-*` rules.
7. **Filter chip behavior**: `FeedTabs` filters apply to underlying activity kinds *before* `groupFeed` runs.

## Out of scope

- Watch-log eligibility (waits on C2; one-line addition to `isGroupableKind` after C2 ships).
- Recommendation/review/coven-event grouping (always individual; high-signal).
- 2-event "X added *A* and *B*" natural-language rendering (deferred to v1.1; 2-event runs render as 2 individual rows in v1.0).
- Group-level likes (per-event hearts only when expanded).
- Personal-profile (`/p/<handle>`) grouping (un-grouped on profile views).
- Analytics / instrumentation (none in v1; standalone sub-project later).
- Pagination beyond existing 50-event hard cap.
- Expand-state persistence beyond page-state (resets on navigation).
- Real-time feed updates as new events occur.
- Cross-action grouping ("added 3 + watched 2").
- Mobile-specific layout variations (existing 720px breakpoint applies; group reuses individual-row chrome).
- A/B testing / parameter tuning infra for the 30-min / 24-hr / min-3 thresholds.
- User-configurable grouping preferences.
- localStorage / URL-hash expand-state persistence.

## Locked design decisions (clarifying-question outcomes)

| Q | Decision |
|---|---|
| Group-level likes posture | Defer. Per-event hearts only when expanded. No heart on the collapsed group row. |
| Personal-profile grouping | Apply on home/coven feeds only. `/p/<handle>` stays individual chronological. Render-layer fork via `getProfileActivity`. |
| Analytics scope | None in v1. The 30-min / 24-hr / min-3 defaults are sane; ship without instrumentation; add as its own sub-project if/when needed. |
| Visual nesting of expanded items | 3px `var(--accent)` left-edge stripe down the entire group block (collapsed header + all expanded items inside one wrapper). |
| Expand state persistence | Page-state only via `useState`. Resets on navigation away and back. |
| Pagination scope | Don't introduce. Current 50-event hard cap stays. `FeedItem[]` shape pre-supports later pagination without restructuring. |
| 2-event run treatment | Render as 2 individual rows in v1.0. Natural-language "X added A and B" is deferred to v1.1 (would require new `EnrichedActivity` variant or 7th render component; YAGNI for now). |

## Section 1 — Data shape

### `FeedItem` and `ActivityGroup`

In `app/lib/queries/activity.ts`:

```ts
export type FeedItem =
  | { type: "single"; activity: EnrichedActivity }
  | { type: "group"; group: ActivityGroup };

export interface ActivityGroup {
  // Stable composite key for React keying.
  // Format: `${actor.id}:${kind}:${firstEventId}` where firstEventId is
  // the OLDEST event in the run (so the key doesn't shift if newer events
  // join an open group on subsequent reads).
  key: string;
  actor: ActorLite;
  kind: "watchlist_added"; // narrow union; widens to a string-union when C2 / future actions register
  items: EnrichedActivity[]; // newest-first, length >= 3
  count: number; // = items.length
  latestAt: string; // = items[0].created_at
}
```

`EnrichedActivity` itself is unchanged — every grouped item carries its own `reactions`, `actor`, `created_at`, etc. The expanded render path reuses the existing `Activity*.tsx` variants verbatim.

### Why the key uses the OLDEST event ID

The group's "identity" is anchored on its first (oldest) event because that one is fixed. The newest event can change between reads (the open group might absorb a new event in the next 30-min window), but the oldest is stable until the user removes that specific event. This makes React keying correct: the same group across two consecutive feed reads gets the same key, so React reconciles in place rather than tearing down + remounting.

## Section 2 — Grouping algorithm

New file: `app/lib/queries/group-activity.ts`. Single-pass O(N) over the newest-first `EnrichedActivity[]`:

```ts
import type { EnrichedActivity } from "./activity";
import type { FeedItem, ActivityGroup } from "./activity";

const GAP_MS = 30 * 60 * 1000;        // 30 minutes between consecutive events
const SPAN_MS = 24 * 60 * 60 * 1000;  // 24 hours total span ceiling
const MIN_GROUP_SIZE = 3;

function isGroupableKind(kind: EnrichedActivity["kind"]): boolean {
  return kind === "watchlist_added";
}

export function groupFeed(items: EnrichedActivity[]): FeedItem[] {
  const out: FeedItem[] = [];
  let i = 0;
  while (i < items.length) {
    const head = items[i];
    if (!isGroupableKind(head.kind)) {
      out.push({ type: "single", activity: head });
      i++;
      continue;
    }
    // Walk forward as long as: same actor, same kind, gap-rule holds,
    // 24h span ceiling holds. Newest-first order means `head` is later
    // in time than each subsequent candidate.
    const run: EnrichedActivity[] = [head];
    let j = i + 1;
    while (j < items.length) {
      const candidate = items[j];
      if (candidate.actor.id !== head.actor.id) break;
      if (candidate.kind !== head.kind) break;
      const prior = run[run.length - 1];
      const gapMs = new Date(prior.created_at).getTime() - new Date(candidate.created_at).getTime();
      if (gapMs > GAP_MS) break;
      const spanMs = new Date(head.created_at).getTime() - new Date(candidate.created_at).getTime();
      if (spanMs > SPAN_MS) break;
      run.push(candidate);
      j++;
    }
    if (run.length >= MIN_GROUP_SIZE) {
      const firstEventId = run[run.length - 1].id; // oldest in run
      out.push({
        type: "group",
        group: {
          key: `${head.actor.id}:${head.kind}:${firstEventId}`,
          actor: head.actor,
          kind: head.kind as ActivityGroup["kind"],
          items: run,
          count: run.length,
          latestAt: head.created_at,
        },
      });
    } else {
      // 1- or 2-event run: emit as individual rows.
      for (const item of run) out.push({ type: "single", activity: item });
    }
    i = j;
  }
  return out;
}
```

### Why a single linear pass is correct

The `getEnrichedFeed` result is already sorted newest-first by `created_at`. Within the linear pass, when we encounter a non-matching event (different actor, different kind, gap exceeded, or span exceeded), we seal the current run and continue from that event as the next potential head. Because the input is monotonically ordered, we don't need a second pass or a re-sort.

### Why grouping is read-time-only (no DB records)

Per the brief and Q1 lock:
- Allows grouping rules to change without data migration.
- Keeps the underlying `activity` log clean for analytics, exports, and other queries.
- Removing a single event simply changes how the group displays; no group cleanup needed.
- Consistent with mature social products (computed views over raw event logs).

The cost is one extra in-memory pass per `/home` render. Negligible at the 50-event cap.

## Section 3 — UI

### `ActivityWatchlistAddedGroup` component

**File:** `app/components/activity/ActivityWatchlistAddedGroup.tsx`. Sibling of existing `Activity*` variants.

**Collapsed (default) row contains:**
- 40px Avatar on the left.
- Action text in the middle column: `<a>cthulhu.lemon</a> added <strong>5 films</strong> to their watchlist.` Count is dynamic, "films"/"film" pluralizes correctly. Actor handle links to their profile.
- Poster stack on the right edge: first 3 posters from the group as 32×48px thumbnails, slightly overlapping (`marginLeft: -8px` after the first). On the 3rd poster only, an accent-colored "+N" badge overlays the bottom-right corner when `count > 3` (e.g., "+2" when count = 5).
- Timestamp (`relativeTime` of `latestAt`) below the action text; replaces the per-row `ActivityFooter` (no group-level heart in v1).
- Expand chevron (▾) right of the timestamp; rotates to ▴ when expanded. The whole row is click-to-expand for a generous tap target.

**Expanded markup:**
- The collapsed row stays at the top.
- Below it, the group's individual `EnrichedActivity` items render in newest-first order via the existing `ActivityWatchlistAdded.tsx` component (full reuse, no fork).
- The entire expanded block is wrapped in a `<div className="activity-group-expanded">` that paints a 3px `var(--accent)` left border running the full vertical span.
- Each individual item retains its `ActivityFooter` with its own heart (per-event likes available when expanded).

**State:** `useState<boolean>(false)` for `expanded`. No persistence.

**Animation:** the inner expanded-items container uses `max-height` transition (`0 → 2000px`, `transition: max-height 250ms ease-out`).

### CSS additions to `globals.css`

```css
/* Activity feed grouping */
.activity-group-expanded {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
}
.activity-group-row {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid #2a2a2a;
  cursor: pointer;
}
.activity-group-row:hover {
  background-color: rgba(255, 45, 136, 0.04);
}
.activity-group-poster-stack {
  display: flex;
  position: relative;
}
.activity-group-poster-stack img {
  width: 32px; height: 48px; object-fit: cover;
  border: 1px solid var(--void);
  background: var(--void-2);
}
.activity-group-poster-stack img + img { margin-left: -8px; }
.activity-group-poster-stack .more-badge {
  position: absolute;
  right: 4px; bottom: 2px;
  background: var(--accent);
  color: var(--void);
  padding: 1px 5px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.06em;
}
.activity-group-chevron {
  font-family: var(--font-ui);
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  transition: transform 200ms ease-out;
}
.activity-group-expanded-items {
  max-height: 0;
  overflow: hidden;
  transition: max-height 250ms ease-out;
}
.activity-group-expanded-items[data-open="true"] {
  max-height: 2000px;
}
```

### `ActivityRow.tsx` dispatch update

```tsx
import type { FeedItem } from "@/lib/queries/activity";
import ActivityWatchlistAddedGroup from "./ActivityWatchlistAddedGroup";
// ... existing imports

export default function ActivityRow({ item }: { item: FeedItem }) {
  if (item.type === "group") {
    return <ActivityWatchlistAddedGroup group={item.group} />;
  }
  switch (item.activity.kind) {
    // existing kind-switch unchanged, but operating on item.activity now
    case "recommendation_sent": return <ActivityRecommendationSent item={item.activity} />;
    case "review_published":    return <ActivityReviewPublished item={item.activity} />;
    case "watchlist_added":     return <ActivityWatchlistAdded item={item.activity} />;
    case "list_created":        return <ActivityListCreated item={item.activity} />;
    case "list_film_added":     return <ActivityListFilmAdded item={item.activity} />;
    case "coven_joined":        return <ActivityCovenJoined item={item.activity} />;
  }
}
```

### `/home/page.tsx` consumption

Mostly unchanged — feeds the result of `getEnrichedFeed` (now `FeedItem[]`) into `ActivityRow`. The map's key resolves either to `item.group.key` (for groups) or `item.activity.id` (for singles). Implementation:

```tsx
{feed.map(item => (
  <ActivityRow
    key={item.type === "group" ? item.group.key : item.activity.id}
    item={item}
  />
))}
```

### Filter chip behavior

`FeedTabs` (`All` / `Reviews` / `Recs`) filters apply to underlying activity kinds **before** `groupFeed` runs in `getEnrichedFeed`. When the user picks "Recs", `watchlist_added` events never reach the grouping pass and the feed shows only individual recommendation rows. When the user picks "All", grouping applies normally. Filter switching is reactive to underlying events; groups don't stick around with their items hidden.

### Profile page (`/p/<handle>`) un-grouped path

Need to add (or extend an existing helper to give us) `getProfileActivity(client, profileUserId)` which returns `EnrichedActivity[]` directly without calling `groupFeed`. The exact integration point is identified during plan-writing — likely a small refactor of `getEnrichedFeed` to expose its pre-grouping enriched array, with `getProfileActivity` filtering it to a single actor and skipping the grouping pass.

`/p/[handle]/page.tsx` consumes `EnrichedActivity[]` directly and maps through `ActivityRow` adapted for that shape — OR, simpler, calls a thin alternate component that doesn't dispatch on `FeedItem.type`. Plan-writing picks the cleaner option.

## Section 4 — File map

| Action | Path |
|--------|------|
| Create | `app/lib/queries/group-activity.ts` |
| Create | `app/tests/queries/group-activity.test.ts` |
| Modify | `app/lib/queries/activity.ts` |
| Create | `app/components/activity/ActivityWatchlistAddedGroup.tsx` |
| Modify | `app/components/activity/ActivityRow.tsx` |
| Modify | `app/app/home/page.tsx` |
| Modify | `app/app/p/[handle]/page.tsx` |
| Modify | `app/app/globals.css` |

**8 file changes.** Zero migrations. Zero new server actions. Zero new server-side state. Net additive on the type system; `EnrichedActivity` unchanged.

## Section 5 — Testing

| Layer | Suite | Path |
|---|---|---|
| `groupFeed` algorithm (hermetic) | 9 cases | `app/tests/queries/group-activity.test.ts` |
| Render layer (component) | none — same posture as existing `Activity*` variants | n/a |
| Integration | typecheck-enforced + manual smoke | n/a |
| Manual prod smoke | 4 paths | n/a |

**Algorithm test cases (9):**
1. Empty input → empty output.
2. Single event → 1 `single`.
3. Two events same actor in window → 2 `single` entries (v1.0 walk-back).
4. Three events same actor in window → 1 `group` of 3.
5. Five events same actor in window → 1 `group` of 5.
6. Run interrupted by another actor's event → splits into two runs (each evaluated for size).
7. Run interrupted by same actor's *different* kind → splits into two runs.
8. 30-min gap rule: 2 events 25 min apart, then a 3rd 35 min after the 2nd → first 2 group together, 3rd is a single (or runs the test against a 4th that brings the count back; spec to choose).
9. 24-hr span ceiling: 4 events spanning 25 hours → splits at the 24h boundary.

**Manual prod smoke (4 paths):**
1. `/home` with a real coven mate's burst — group renders compressed with the correct count + poster stack.
2. Click expand → chevron rotates, items unfold with 3px accent left stripe, each per-item heart works.
3. Filter chips: switch to "Recs" → watchlist groups disappear; switch to "All" → groups return.
4. `/p/<my-handle>` → activity stream renders un-grouped (every watchlist add is its own row).

**Test gates before shipping:**
- 9 algorithm cases pass.
- `cd app && npm run typecheck` clean.
- Existing test suite shows no NEW regressions vs the C1-final baseline (`077a7ac`).
- Prod smoke checklist completed.

## Section 6 — Implementation slicing (preview for plan)

Four tasks. Subagent-driven works fine here; inline execution also workable given the small surface.

1. **`groupFeed` algorithm + 9 hermetic tests.** Pure function, easy to TDD.
2. **Wire `groupFeed` into `getEnrichedFeed` + add the un-grouped profile path.** Type-driven; compiler catches everything.
3. **`ActivityWatchlistAddedGroup` component + `ActivityRow` dispatch + CSS.** Manual smoke after.
4. **Whole-branch review + deploy + prod smoke.**

## Risks

- **`max-height: 2000px` ceiling on the expanded animation.** Theoretical group could exceed if a real burst is huge (~30 films at ~80px each ≈ 2400px). Realistic worst case is rare; bumping to `4000px` or using `max-height: none` post-transition is the polish path. Ship at 2000px, revisit if it ever clips.
- **`getEnrichedFeed` signature change** (return type goes from `EnrichedActivity[]` to `FeedItem[]`) is a breaking change for callers. Verified during exploration: only consumer is `/home/page.tsx`. Plan-writing will do a final grep to confirm.
- **24-hour span ceiling makes "open group" tracking a non-issue at read time.** Every event in any open group is at most 24h old, and the read pass walks one snapshot. No state-tracking needed; the algorithm seals each run when gap or span fires.
