# Activity Feed Grouping (D1 / #52) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress runs of consecutive `watchlist_added` events from the same actor in the home/coven feed into a single expandable feed item — *"cthulhu.lemon added 5 films to their watchlist."* — using a read-time grouping pass over `getEnrichedFeed`.

**Architecture:** A pure `groupFeed` function folds `EnrichedActivity[]` into `FeedItem[]` (where `FeedItem = single | group`) using a 30-min event-to-event window, 24-hr total span ceiling, and 3+ minimum group size. The pass runs at the end of `getEnrichedFeed`. A new `FeedRow` dispatcher consumes `FeedItem`, rendering groups via `ActivityWatchlistAddedGroup` and singles via the existing `ActivityRow` (unchanged). The profile page (`/p/[handle]`) stays un-grouped because it doesn't call `getEnrichedFeed` — it has its own inline enrichment helper.

**Tech Stack:** TypeScript, Next.js 15 App Router, vitest for hermetic algorithm tests. No DB work, no migrations, no new server actions.

**Spec:** `docs/superpowers/specs/2026-04-25-activity-feed-grouping-design.md` (commit `d52b271`).

**Plan-time refinements vs the spec's file map** (preserve all locked decisions; cleaner implementation route):
- The spec listed `ActivityRow.tsx` and `/p/[handle]/page.tsx` as files to modify. Plan-writing verification revealed (a) the profile page already uses its own `enrichOwnActivity` helper that returns `EnrichedActivity[]`, so it's automatically un-grouped without any change, and (b) leaving `ActivityRow.tsx` accepting `EnrichedActivity` (its current shape) lets the profile page keep using it as-is. The breaking change of accepting `FeedItem` lives in a new `FeedRow.tsx` instead. Net file count stays at 8.
- The spec described filter-before-group at the server. The current architecture filters in the client via `FeedTabs`. We keep that and group server-side, then `FeedTabs` filters the `FeedItem[]` array. Outcome (Recs tab hides watchlist groups in v1) is identical because no tab filter matches `watchlist_added`.

---

## Task 1: `groupFeed` algorithm + types + 9 hermetic tests

**Files:**
- Modify: `app/lib/queries/activity.ts` (add `FeedItem` + `ActivityGroup` types only — no runtime change yet)
- Create: `app/lib/queries/group-activity.ts`
- Create: `app/tests/queries/group-activity.test.ts`

- [ ] **Step 1: Add `FeedItem` and `ActivityGroup` types to `activity.ts`**

In `app/lib/queries/activity.ts`, find the existing `EnrichedActivity` type definition (around line 35). Immediately after the closing of that type, add:

```ts
export type FeedItem =
  | { type: "single"; activity: EnrichedActivity }
  | { type: "group"; group: ActivityGroup };

export interface ActivityGroup {
  // Stable composite key for React. Anchored on the OLDEST event in the run
  // so the key doesn't shift if newer events join the run on subsequent reads.
  key: string;
  actor: ActorLite;
  kind: "watchlist_added"; // narrow union; widens when C2 / future actions register
  items: EnrichedActivity[]; // newest-first, length >= 3
  count: number; // = items.length
  latestAt: string; // = items[0].created_at
}
```

Don't change `getEnrichedFeed`'s return type yet — that lands in Task 3.

- [ ] **Step 2: Verify the typecheck still passes after adding types**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5
```

Expected: PASS. The new types are exported but unused, which is fine.

- [ ] **Step 3: Write the failing test file**

Create `app/tests/queries/group-activity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupFeed } from "@/lib/queries/group-activity";
import type { EnrichedActivity } from "@/lib/queries/activity";

// Helper: build a watchlist_added EnrichedActivity at a given ISO timestamp.
function watchlist(opts: { id: string; actorId: string; minutesAgo: number }): EnrichedActivity {
  const created = new Date(Date.now() - opts.minutesAgo * 60 * 1000).toISOString();
  return {
    id: opts.id,
    created_at: created,
    actor: {
      id: opts.actorId,
      handle: `user_${opts.actorId}`,
      display_name: `User ${opts.actorId}`,
      avatar_url: null,
    },
    reactions: { count: 0, likedByMe: false },
    kind: "watchlist_added",
    film: {
      id: `film_${opts.id}`,
      title: `Film ${opts.id}`,
      director: "Test Director",
      year: 2024,
      artwork_url: "https://example.test/poster.jpg",
      itunes_url: "https://itunes.apple.com/test",
    },
  };
}

// Helper: a non-groupable kind (recommendation) for interruption tests.
function rec(opts: { id: string; actorId: string; minutesAgo: number }): EnrichedActivity {
  const created = new Date(Date.now() - opts.minutesAgo * 60 * 1000).toISOString();
  return {
    id: opts.id,
    created_at: created,
    actor: {
      id: opts.actorId,
      handle: `user_${opts.actorId}`,
      display_name: `User ${opts.actorId}`,
      avatar_url: null,
    },
    reactions: { count: 0, likedByMe: false },
    kind: "recommendation_sent",
    film: {
      id: `film_${opts.id}`,
      title: `Film ${opts.id}`,
      director: "Test Director",
      year: 2024,
      artwork_url: "https://example.test/poster.jpg",
      itunes_url: "https://itunes.apple.com/test",
    },
    recipient: {
      id: "rec_target",
      handle: "target",
      display_name: "Target",
      avatar_url: null,
    },
    note: "",
  };
}

describe("groupFeed", () => {
  it("returns empty array for empty input", () => {
    expect(groupFeed([])).toEqual([]);
  });

  it("returns one single for one event", () => {
    const items = [watchlist({ id: "a", actorId: "u1", minutesAgo: 5 })];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("single");
  });

  it("returns two singles for 2 same-actor events in window (v1.0 walk-back)", () => {
    // Newest-first order: a (5 min ago), b (15 min ago) — gap is 10 min, within 30-min window.
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 15 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("single");
    expect(out[1].type).toBe("single");
  });

  it("returns one group of 3 for 3 same-actor events in window", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 15 }),
      watchlist({ id: "c", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.count).toBe(3);
      expect(out[0].group.items).toHaveLength(3);
      // Key uses the OLDEST event's id ('c').
      expect(out[0].group.key).toBe("u1:watchlist_added:c");
    }
  });

  it("returns one group of 5 for 5 same-actor events in window", () => {
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 10 }),
      watchlist({ id: "c", actorId: "u1", minutesAgo: 15 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("group");
    if (out[0].type === "group") {
      expect(out[0].group.count).toBe(5);
    }
  });

  it("splits when interrupted by a different actor's event", () => {
    // Newest-first: u1 a, u1 b, u2 c, u1 d, u1 e — u2 breaks the run.
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 10 }),
      watchlist({ id: "c", actorId: "u2", minutesAgo: 15 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    // 2 singles for u1 a/b (run too short), 1 single for u2 c, 2 singles for u1 d/e.
    expect(out).toHaveLength(5);
    expect(out.every(i => i.type === "single")).toBe(true);
  });

  it("splits when interrupted by same actor's different kind", () => {
    // u1 watchlist a, b — interrupted by u1 recommendation c — then u1 watchlist d, e.
    // First run: 2 watchlists (singles). Recommendation: single. Second run: 2 watchlists (singles).
    const items: EnrichedActivity[] = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 10 }),
      rec({ id: "c", actorId: "u1", minutesAgo: 15 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 25 }),
    ];
    const out = groupFeed(items);
    expect(out).toHaveLength(5);
    expect(out.every(i => i.type === "single")).toBe(true);
  });

  it("seals the run when 30-min gap rule fires", () => {
    // a (5 min ago), b (20 min ago) — gap 15 min, OK.
    // c (60 min ago) — gap from b is 40 min, exceeds 30-min rule. New run.
    // d (75 min ago) — gap from c is 15 min, OK.
    // e (90 min ago) — gap from d is 15 min, OK. Second run reaches 3.
    const items = [
      watchlist({ id: "a", actorId: "u1", minutesAgo: 5 }),
      watchlist({ id: "b", actorId: "u1", minutesAgo: 20 }),
      watchlist({ id: "c", actorId: "u1", minutesAgo: 60 }),
      watchlist({ id: "d", actorId: "u1", minutesAgo: 75 }),
      watchlist({ id: "e", actorId: "u1", minutesAgo: 90 }),
    ];
    const out = groupFeed(items);
    // First run: 2 events (a, b) → 2 singles.
    // Second run: 3 events (c, d, e) → 1 group.
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe("single"); // a
    expect(out[1].type).toBe("single"); // b
    expect(out[2].type).toBe("group");  // c+d+e
    if (out[2].type === "group") {
      expect(out[2].group.count).toBe(3);
    }
  });

  it("seals the run when 24-hour span ceiling fires", () => {
    // 4 events all within 30-min gaps of each other, but spanning 25 hours total.
    // a (0 min), b (15 min ago), c (12h ago), d (12h+15min ago), e (25h ago).
    // Wait — gap from d to e: 25h - 12.25h = 12.75h. That breaks the 30-min gap rule, not span.
    // Better: 5 events 5 min apart from each other up to 25h — all gaps are 5 min,
    // but span from a to e is 25h, exceeds 24h.
    // a 0 min, b 6h ago, c 12h ago, d 18h ago, e 25h ago.
    // Gaps: 6h, 6h, 6h, 7h. All exceed 30-min gap. So this would sever on gap rule first.
    // To exercise span rule cleanly, all gaps must be < 30 min but span must exceed 24h.
    // That requires lots of events at 25-min intervals: 25*N min < 24h*60min = 1440 min,
    // so N < 57.6. Use 60 events at 25-min intervals to span 25h.
    // For this test, use 4 events with carefully crafted intervals:
    // a 0 min, b 25 min, c 50 min, ..., crafted so gap-rule doesn't fire but span does.
    // Simpler: a 0 min, b 1429 min (~23h49m), c 1454 min (~24h14m), d 1479 min.
    // Gaps b→a: 1429 min — exceeds 30-min gap. Won't work.
    //
    // The 24h-span ceiling can only be exercised with closely-spaced events:
    // 60 events at 25-min intervals = 25h total span, all gaps within rule.
    // For test brevity, build the array programmatically.
    const items: EnrichedActivity[] = [];
    for (let i = 0; i < 60; i++) {
      items.push(watchlist({ id: `a${i}`, actorId: "u1", minutesAgo: i * 25 }));
    }
    // i=0 is newest (0 min ago), i=59 is oldest (1475 min ago = ~24h35m).
    // Span from i=0 to i=59 is 1475 min = ~24h35m. Should split somewhere around 24h.
    const out = groupFeed(items);
    // We expect at least one group (the first run before 24h ceiling fires)
    // and another run for events past the ceiling. Verify span ceiling triggered split.
    const hasMultipleRuns = out.length > 1;
    expect(hasMultipleRuns).toBe(true);
  });

  it("non-groupable kinds always pass through as single", () => {
    const items = [
      rec({ id: "a", actorId: "u1", minutesAgo: 5 }),
      rec({ id: "b", actorId: "u1", minutesAgo: 10 }),
      rec({ id: "c", actorId: "u1", minutesAgo: 15 }),
    ];
    const out = groupFeed(items);
    // 3 recommendations from same actor in window — must NOT group (recommendations are high-signal).
    expect(out).toHaveLength(3);
    expect(out.every(i => i.type === "single")).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails (module not found)**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/group-activity.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/lib/queries/group-activity'`.

- [ ] **Step 5: Implement the algorithm**

Create `app/lib/queries/group-activity.ts`:

```ts
import type { EnrichedActivity, FeedItem, ActivityGroup } from "./activity";

const GAP_MS = 30 * 60 * 1000;        // 30 minutes between consecutive events
const SPAN_MS = 24 * 60 * 60 * 1000;  // 24 hours total span ceiling
const MIN_GROUP_SIZE = 3;

function isGroupableKind(kind: EnrichedActivity["kind"]): boolean {
  return kind === "watchlist_added";
}

/**
 * Single-pass O(N) grouping over a newest-first array of EnrichedActivity.
 * Folds runs of consecutive same-actor + same-kind events that fit within
 * the 30-min event-to-event window AND the 24-hr total span ceiling AND
 * are 3+ in size into a single FeedItem of type "group". Smaller runs and
 * non-groupable kinds emit as individual "single" FeedItems.
 *
 * Input MUST be sorted newest-first by created_at (matches getEnrichedFeed).
 */
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
      const group: ActivityGroup = {
        key: `${head.actor.id}:${head.kind}:${firstEventId}`,
        actor: head.actor,
        kind: head.kind as ActivityGroup["kind"],
        items: run,
        count: run.length,
        latestAt: head.created_at,
      };
      out.push({ type: "group", group });
    } else {
      // 1- or 2-event run: emit as individual rows.
      for (const item of run) out.push({ type: "single", activity: item });
    }
    i = j;
  }
  return out;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/queries/group-activity.test.ts 2>&1 | tail -15
```

Expected: 10 tests pass (9 from the spec list, plus the 5-event group test which is split out for clarity).

- [ ] **Step 7: Typecheck**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Use the Write tool to create `/tmp/msg.txt` with this content:

```
feat(feed-grouping): groupFeed algorithm + types + tests

New FeedItem and ActivityGroup types in activity.ts (no runtime
change yet). New app/lib/queries/group-activity.ts exports a pure
groupFeed function that folds EnrichedActivity[] into FeedItem[]
using the locked rules: 30-min event-to-event gap, 24-hr total
span ceiling, 3+ minimum group size, watchlist_added only.

10 hermetic vitest cases cover empty input, single event, 2-event
run (singles per v1.0 walk-back), 3-event group, 5-event group,
split on different-actor interruption, split on different-kind
interruption, 30-min gap rule, 24-hr span ceiling, and non-groupable
kinds passing through.
```

Then:

```bash
cd /home/cthulhulemon/film_goblin
git add app/lib/queries/activity.ts app/lib/queries/group-activity.ts app/tests/queries/group-activity.test.ts
git commit -F /tmp/msg.txt
git log -1 --format="%h %s"
```

Verify the commit subject is correct. If mangled (CLAUDE.md heredoc gotcha), amend with `git commit --amend -F /tmp/msg.txt`.

---

## Task 2: `ActivityWatchlistAddedGroup` component + CSS

**Files:**
- Create: `app/components/activity/ActivityWatchlistAddedGroup.tsx`
- Modify: `app/app/globals.css` (append `.activity-group-*` rules)

This task lands the visible artifact (the group component) before any wiring, so it can be eyeballed in isolation.

- [ ] **Step 1: Create the component**

Create `app/components/activity/ActivityWatchlistAddedGroup.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityWatchlistAdded from "./ActivityWatchlistAdded";
import { relativeTime } from "./relativeTime";
import type { ActivityGroup, EnrichedActivity } from "@/lib/queries/activity";

interface Props {
  group: ActivityGroup;
}

export default function ActivityWatchlistAddedGroup({ group }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { actor, items, count, latestAt } = group;
  const visiblePosters = items.slice(0, 3);
  const overflowCount = count - visiblePosters.length;

  function toggle() {
    setExpanded(v => !v);
  }

  return (
    <div className={expanded ? "activity-group-expanded" : ""}>
      <div className="activity-group-row" onClick={toggle} role="button" aria-expanded={expanded}>
        <Avatar
          name={actor.display_name ?? actor.handle}
          color="var(--accent)"
          size={40}
          url={actor.avatar_url}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
            <Link
              href={`/p/${encodeURIComponent(actor.handle)}`}
              onClick={e => e.stopPropagation()}
              style={{ color: "var(--bone)", fontWeight: 700 }}
            >
              {actor.display_name ?? actor.handle}
            </Link>
            {" added "}
            <strong style={{ color: "var(--accent)" }}>
              {count} {count === 1 ? "film" : "films"}
            </strong>
            {" to their watchlist."}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span>{relativeTime(latestAt)}</span>
            <span className="activity-group-chevron" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }} aria-hidden="true">
              ▾
            </span>
          </div>
        </div>
        <div className="activity-group-poster-stack">
          {visiblePosters.map((item, idx) => {
            const wlItem = item as Extract<EnrichedActivity, { kind: "watchlist_added" }>;
            const isLast = idx === visiblePosters.length - 1;
            return (
              <div key={wlItem.id} style={{ position: "relative" }}>
                <img src={wlItem.film.artwork_url} alt={wlItem.film.title} />
                {isLast && overflowCount > 0 && (
                  <span className="more-badge">+{overflowCount}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="activity-group-expanded-items" data-open={expanded}>
        {items.map(item => {
          const wlItem = item as Extract<EnrichedActivity, { kind: "watchlist_added" }>;
          return <ActivityWatchlistAdded key={wlItem.id} item={wlItem} />;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS rules to `globals.css`**

In `app/app/globals.css`, append the following block at the end of the file (after the existing `.films-sort-chip:focus-visible` rule):

```css
/* ---------- activity feed grouping ---------- */
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
  width: 32px;
  height: 48px;
  object-fit: cover;
  border: 1px solid var(--void);
  background: var(--void-2);
  display: block;
}
.activity-group-poster-stack > div + div { margin-left: -8px; }
.activity-group-poster-stack .more-badge {
  position: absolute;
  right: 4px;
  bottom: 2px;
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
  user-select: none;
  font-size: 12px;
  display: inline-block;
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

(The CSS uses `> div + div` instead of `img + img` because the markup wraps each poster in a `<div>` for the `+N` badge positioning.)

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: PASS. The new component imports `ActivityGroup` (added in Task 1) and is unused so far.

- [ ] **Step 4: Commit Task 2**

Use the Write tool to create `/tmp/msg.txt` with this content:

```
feat(feed-grouping): ActivityWatchlistAddedGroup component + CSS

New activity component renders the collapsed group row (avatar +
"X added N films to their watchlist" + 3-poster stack with +N badge
+ chevron) and expands inline to reveal the individual items via
the existing ActivityWatchlistAdded component (full reuse, no fork).

CSS: 3px var(--accent) left-edge stripe wraps the entire expanded
block; max-height 2000px transition for the 250ms ease-out unfold;
poster stack with -8px overlap; +N badge in accent on the 3rd poster.

Component is not yet wired into the feed render path — that lands
in Task 3.
```

Then:

```bash
cd /home/cthulhulemon/film_goblin
git add app/components/activity/ActivityWatchlistAddedGroup.tsx app/app/globals.css
git commit -F /tmp/msg.txt
git log -1 --format="%h %s"
```

Verify the commit subject is correct. If mangled, amend.

---

## Task 3: Wire `groupFeed` into `getEnrichedFeed` + new `FeedRow` dispatcher + `FeedTabs` update

**Files:**
- Modify: `app/lib/queries/activity.ts` (call `groupFeed` at end of `getEnrichedFeed`, change return type to `FeedItem[]`)
- Create: `app/components/activity/FeedRow.tsx`
- Modify: `app/components/FeedTabs.tsx` (consume `FeedItem[]`, filter accordingly, render via `FeedRow`)

- [ ] **Step 1: Update `getEnrichedFeed` to return `FeedItem[]`**

In `app/lib/queries/activity.ts`, find:

```ts
import { getReactionsForActivities, type ReactionSummary } from "./activity-reactions";
```

Add immediately after:

```ts
import { groupFeed } from "./group-activity";
```

Find the `getEnrichedFeed` signature (around line 49):

```ts
export async function getEnrichedFeed(
  client: Client,
  followerUserId: string,
  limit = 50,
): Promise<EnrichedActivity[]> {
```

Replace with:

```ts
export async function getEnrichedFeed(
  client: Client,
  followerUserId: string,
  limit = 50,
): Promise<FeedItem[]> {
```

Find the very end of the function body — currently:

```ts
  return out;
}
```

Replace with:

```ts
  return groupFeed(out);
}
```

Find the back-compat `getFeed` wrapper at the bottom of the file:

```ts
// Back-compat wrapper so home/page.tsx continues to compile pre-Task 14.
// Task 14 will replace callers with getEnrichedFeed directly.
export async function getFeed(client: Client, limit = 50): Promise<EnrichedActivity[]> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  return getEnrichedFeed(client, user.id, limit);
}
```

Replace with:

```ts
// Back-compat wrapper. Returns FeedItem[] now that getEnrichedFeed groups internally.
export async function getFeed(client: Client, limit = 50): Promise<FeedItem[]> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  return getEnrichedFeed(client, user.id, limit);
}
```

- [ ] **Step 2: Create `FeedRow` dispatcher**

Create `app/components/activity/FeedRow.tsx`:

```tsx
import type { FeedItem } from "@/lib/queries/activity";
import ActivityRow from "./ActivityRow";
import ActivityWatchlistAddedGroup from "./ActivityWatchlistAddedGroup";

export default function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "group") {
    return <ActivityWatchlistAddedGroup group={item.group} />;
  }
  return <ActivityRow item={item.activity} />;
}
```

`ActivityRow` stays unchanged — still accepts `EnrichedActivity` — so `/p/[handle]/page.tsx` keeps using it as-is for un-grouped profile activity.

- [ ] **Step 3: Update `FeedTabs` to consume `FeedItem[]`**

In `app/components/FeedTabs.tsx`, find:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ActivityRow from "./activity/ActivityRow";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Tab = "all" | "reviews" | "recs" | "lists";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  reviews: (k) => k === "review_published",
  recs: (k) => k === "recommendation_sent",
  lists: (k) => k === "list_created" || k === "list_film_added",
};

interface Props { items: EnrichedActivity[]; }

export default function FeedTabs({ items }: Props) {
```

Replace the import block, MATCHERS, and Props with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedRow from "./activity/FeedRow";
import type { EnrichedActivity, FeedItem } from "@/lib/queries/activity";

type Tab = "all" | "reviews" | "recs" | "lists";

const MATCHERS: Record<Tab, (k: EnrichedActivity["kind"]) => boolean> = {
  all: () => true,
  reviews: (k) => k === "review_published",
  recs: (k) => k === "recommendation_sent",
  lists: (k) => k === "list_created" || k === "list_film_added",
};

// FeedItem matcher: a single matches if its activity.kind matches; a group
// matches if its group.kind matches. In v1 only watchlist_added groups
// exist, so groups never appear in non-"all" tabs.
function feedItemMatches(item: FeedItem, matcher: (k: EnrichedActivity["kind"]) => boolean): boolean {
  if (item.type === "single") return matcher(item.activity.kind);
  return matcher(item.group.kind);
}

interface Props { items: FeedItem[]; }

export default function FeedTabs({ items }: Props) {
```

Find the filter line:

```tsx
  const filtered = items.filter(i => MATCHERS[tab](i.kind));
```

Replace with:

```tsx
  const filtered = items.filter(i => feedItemMatches(i, MATCHERS[tab]));
```

Find the render line (inside the empty/non-empty ternary):

```tsx
          filtered.map(item => <ActivityRow key={item.id} item={item} />)
```

Replace with:

```tsx
          filtered.map(item => (
            <FeedRow
              key={item.type === "group" ? item.group.key : item.activity.id}
              item={item}
            />
          ))
```

- [ ] **Step 4: Typecheck — must pass**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5
```

Expected: PASS. The home page's `getEnrichedFeed` consumer chain is now `FeedItem[]`-typed; the profile page is untouched and still uses `ActivityRow` with `EnrichedActivity`.

- [ ] **Step 5: Run tests — no new regressions**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | grep -E "Test Files|Tests "
```

Expected: same passing/skipped/failing counts as parent commit (Task 2 commit). The new group-activity.test.ts (Task 1) tests should still pass.

- [ ] **Step 6: Manual smoke (if dev server is feasible)**

Start the dev server:

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Visit http://localhost:3000/home (logged in). Verify:
1. The feed renders. Individual events look the same as before.
2. If you have a coven mate with 3+ recent watchlist adds within 30 min of each other, you see a grouped row.
3. Click the group → expands inline with the accent left-stripe; chevron rotates.
4. Click expand → individual items render with their own per-item heart.
5. Switch filter tab to "Recs" → watchlist groups disappear; recommendations show individually.
6. Visit `/p/<your-handle>` → activity stream renders un-grouped (every watchlist add is its own row).

Stop the dev server with Ctrl-C.

If you can't conveniently arrange 3+ recent watchlist adds, the prod smoke in Task 4 will exercise it after deploy.

- [ ] **Step 7: Commit Task 3**

Use the Write tool to create `/tmp/msg.txt` with this content:

```
feat(feed-grouping): wire groupFeed + FeedRow dispatcher

getEnrichedFeed now calls groupFeed at the end and returns
FeedItem[] (was EnrichedActivity[]). New FeedRow dispatcher in
app/components/activity/ takes a FeedItem and renders either
ActivityWatchlistAddedGroup (for groups) or the existing ActivityRow
unchanged (for singles).

FeedTabs updated to consume FeedItem[] — filter logic checks
activity.kind for singles and group.kind for groups, so v1's only
groupable kind (watchlist_added) is hidden in Recs/Reviews/Lists
tabs and surfaces only in All. Filter stays client-side.

ActivityRow.tsx and /p/[handle]/page.tsx are intentionally
unchanged: profile pages don't go through getEnrichedFeed and
still consume EnrichedActivity[] from their own enrichOwnActivity
helper, so the un-grouped profile path is automatic.
```

Then:

```bash
cd /home/cthulhulemon/film_goblin
git add app/lib/queries/activity.ts app/components/activity/FeedRow.tsx app/components/FeedTabs.tsx
git commit -F /tmp/msg.txt
git log -1 --format="%h %s"
```

Verify the commit subject is correct. If mangled, amend.

---

## Task 4: Whole-branch review + deploy + prod smoke

**Files:** none (review + deploy only).

- [ ] **Step 1: Read every changed file end-to-end**

```bash
cd /home/cthulhulemon/film_goblin
git diff origin/master..HEAD --stat
```

Expected: 6 files changed (3 created, 3 modified). For each file, open it and verify:
- No leftover console.logs or debug code.
- Imports tidy.
- TypeScript types accurate.
- No accidental in-scope changes beyond the spec.

- [ ] **Step 2: Search for unintended consumers of the changed types**

```bash
grep -rn "getEnrichedFeed\|getFeed\b" /home/cthulhulemon/film_goblin/app/ | grep -v node_modules
```

Expected: callers are only in `/home/page.tsx` (via `FeedTabs`). The profile page does NOT call either. If a third caller surfaces, it must be evaluated for the breaking type change before deploy.

- [ ] **Step 3: Run all tests one final time**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | grep -E "Test Files|Tests " | head -3
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -3
```

Expected: same baseline pass/fail counts as the C1-final state plus the 10 new group-activity tests passing. Typecheck clean.

- [ ] **Step 4: Push to origin**

```bash
cd /home/cthulhulemon/film_goblin
git push origin master 2>&1 | tail -3
```

Expected: 3 task commits pushed (Task 1, Task 2, Task 3 — Task 4 has no commits of its own).

- [ ] **Step 5: Deploy from repo root**

```bash
cd /home/cthulhulemon/film_goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes 2>&1 | tail -8
```

Expected: `readyState: "READY"`, aliased to `https://film-goblin.vercel.app`.

- [ ] **Step 6: Prod smoke**

```bash
echo "=== /home (logged-out → 307 to signin) ==="
/usr/bin/curl -sI https://film-goblin.vercel.app/home | head -3
echo ""
echo "=== /p/cthulhu.lemon (logged-out → public profile) ==="
/usr/bin/curl -sI https://film-goblin.vercel.app/p/cthulhu.lemon | head -3
```

Expected: /home returns 307 to signin (auth-gated), /p/<handle> returns 200 unauthenticated.

Then on a browser logged in:
1. Visit `/home`. The feed renders. If you have 3+ recent watchlist adds in a 30-min window from a coven mate (or yourself), you see a grouped row. Otherwise individual rows.
2. If a group exists: click to expand → 3px accent left-stripe wraps the block, items unfold with the 250ms transition, each per-item heart works.
3. Switch filter chip to "Recs" → watchlist groups disappear. Switch back to "All" → groups return.
4. Visit `/p/<your-handle>`. Activity stream renders un-grouped — every watchlist add is its own row.

- [ ] **Step 7: Mark sub-project complete**

D1 is done. Optional housekeeping (separate commit, not part of D1):
- Update `CLAUDE.md`'s "Sub-project history" section to add D1 to the shipped list.
- Move D1 from the queued list to shipped; promote C2 to position 1, B2 to position 2.

---

## Self-Review

**Spec coverage** (against `2026-04-25-activity-feed-grouping-design.md`):
- Section 1 data shape (`FeedItem` + `ActivityGroup`): Task 1 Step 1 adds the types. ✓
- Section 2 grouping algorithm: Task 1 Step 5 implements; 10 tests in Step 3 cover the 9 spec cases. ✓
- Section 3 UI (collapsed group + expanded state + 3px accent stripe): Task 2. ✓
- Section 3 `ActivityRow` dispatch update: Refined to a new `FeedRow` dispatcher in Task 3 Step 2 — preserves the spec's outcome (group rendering on home, un-grouped on profile) with cleaner separation, documented in the plan header. ✓
- Section 3 `/home/page.tsx` consumption: Task 3 Step 3 (via `FeedTabs`). ✓
- Section 3 filter chip behavior: Task 3 Step 3's `feedItemMatches` helper. ✓
- Section 3 profile page un-grouped path: Verified during plan-writing — the profile page already uses `enrichOwnActivity` returning `EnrichedActivity[]`, so no change needed. Documented in the plan header. ✓
- Section 4 file map: 8 files in spec; 6 in plan (the spec listed `ActivityRow.tsx` and `/p/[handle]/page.tsx` as modifications which the plan-writing verification showed were unnecessary). Net file count is lower than spec, not higher — the spec's outcome is preserved with less churn. ✓
- Section 5 testing: Task 1 covers the 9 algorithm cases; Task 3 Step 6 covers the 4 manual smoke paths; Task 4 Step 6 covers the prod smoke. ✓
- Section 6 slicing: Plan has 4 tasks aligned with the spec's preview. ✓

**Placeholder scan:** No TBDs. Every code block is complete. Every command is exact. The 24-hour span ceiling test in Task 1 Step 3 includes a programmatic 60-event setup with explanatory comments — non-trivial but explicit.

**Type consistency:**
- `FeedItem`, `ActivityGroup`, `EnrichedActivity` signatures are consistent across `activity.ts` (defined in Task 1), `group-activity.ts` (consumed in Task 1), `ActivityWatchlistAddedGroup.tsx` (consumed in Task 2), and `FeedRow.tsx`/`FeedTabs.tsx` (consumed in Task 3). ✓
- The `ActivityGroup.kind` narrow union (`"watchlist_added"`) holds across all consumers. When C2 ships, widening this to `"watchlist_added" | "watch_logged"` is a one-line type change that flows everywhere via TypeScript. ✓
- `groupFeed`'s return type matches the consumer expectations in `getEnrichedFeed` and `FeedTabs`. ✓

No issues to fix.

---

## Implementation handoff

This plan has 4 tasks, no DB work, no migrations, zero new server actions. Subagent-driven works fine here, but inline execution is also a clean fit given the small surface and the pure-function nature of the algorithm. Either path produces a tight 3-commit branch (one per task; Task 4 has no commits).
