# FROM THE PIT: Aging / TTL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give system feed events a time-to-live on the signed-in `/home` feed — 0–24h always eligible, 24–48h eligible only if watchlist-relevant, 48h+ never selected — so stale events age out instead of resurfacing when the feed is quiet.

**Architecture:** One new pure module (`app/lib/feed-events/pitAge.ts`) classifies an event's age and filters a candidate list. It's spliced into the existing `getEligiblePitEventsForUser` (signed-in selection path only) between the watchlist fetch and the existing watchlist-ranking step — everything else from sub-project #1 (impression exclusion, daily cap, watchlist boost, position rules) is untouched. No migration, no new table, no UI change.

**Tech Stack:** TypeScript, vitest, Supabase (integration test only).

**Spec:** `docs/superpowers/specs/2026-07-09-pit-aging-ttl-design.md`

## Global Constraints

- **Node 20 required.** Prefix every `npm`/`npx` command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. All commands run from `app/`.
- **Constants (exact):** `PIT_FRESH_HOURS = 24`, `PIT_AGING_HOURS = 48`, both named/exported from `pitAge.ts`.
- **Age is rolling hours from `created_at`**, upper-bound-exclusive: an event exactly 24.000h old is `aging`; exactly 48.000h old is `stale`. NOT UTC-calendar-day (that's #1's daily-cap boundary; age is a duration).
- **"Relevant" for the aging tier = watchlist only** — `event.film_id ∈ watchlist`. Events with `film_id = null` or a non-watchlisted film are dropped once aging. Do NOT fold in library/coven.
- **The age filter lives in `app/lib/feed-events/pitSelection.ts` only.** Do NOT add an age floor to `getRecentSystemEvents` (`app/lib/feed-events/query.ts`) — that query also feeds the anonymous landing page (`getLandingFeed`), which must stay un-aged. Do NOT touch `query.ts` at all.
- **Do NOT modify #1's shipped logic** — the impression fetch, `seenEventIds`, `todayCount`, the daily-cap early-exit, and the candidate fetch + seen-filter in `getEligiblePitEventsForUser` stay exactly as they are. This plan only inserts the age filter and adds its import.
- **No migration, no new table, no new action, no UI change, no changes to `SystemFeedEvent`'s type** (it already carries `created_at: string` and `film_id: string | null`).
- Branch: `feature/pit-aging-ttl` (already exists; spec committed as `0f20118`).
- Commit-message gotcha: heredoc commit messages get mangled in this repo — use a single-line `-m`.

---

### Task 1: `pitAge.ts` pure module

**Files:**
- Create: `app/lib/feed-events/pitAge.ts`
- Test: `app/tests/feed-events/pitAge.test.ts`

**Interfaces:**
- Consumes: `SystemFeedEvent` from `@/lib/feed-events/types` (fields used: `created_at: string`, `film_id: string | null`).
- Produces (Task 2 imports from `@/lib/feed-events/pitAge`):
  - `export const PIT_FRESH_HOURS = 24;`
  - `export const PIT_AGING_HOURS = 48;`
  - `export type PitAgeTier = "fresh" | "aging" | "stale";`
  - `export function classifyPitEventAge(createdAt: string, now: Date): PitAgeTier`
  - `export function filterPitByAge(events: SystemFeedEvent[], watchlistFilmIds: string[], now: Date): SystemFeedEvent[]`

- [ ] **Step 1: Write the failing test**

Create `app/tests/feed-events/pitAge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyPitEventAge, filterPitByAge, PIT_FRESH_HOURS, PIT_AGING_HOURS } from "../../lib/feed-events/pitAge";
import type { SystemFeedEvent } from "../../lib/feed-events/types";

const NOW = new Date("2026-07-09T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function ev(id: string, filmId: string | null, createdAt: string): SystemFeedEvent {
  return { id, event_type: "price_drop", film_id: filmId, payload: {}, copy: "x", priority: 90, created_at: createdAt, film: null };
}

describe("classifyPitEventAge", () => {
  it("classifies a brand-new event as fresh", () => {
    expect(classifyPitEventAge(hoursAgo(0), NOW)).toBe("fresh");
  });

  it("classifies just under 24h as fresh", () => {
    expect(classifyPitEventAge(hoursAgo(23.9), NOW)).toBe("fresh");
  });

  it("classifies exactly PIT_FRESH_HOURS as aging (upper bound exclusive)", () => {
    expect(classifyPitEventAge(hoursAgo(PIT_FRESH_HOURS), NOW)).toBe("aging");
  });

  it("classifies just under 48h as aging", () => {
    expect(classifyPitEventAge(hoursAgo(47.9), NOW)).toBe("aging");
  });

  it("classifies exactly PIT_AGING_HOURS as stale (upper bound exclusive)", () => {
    expect(classifyPitEventAge(hoursAgo(PIT_AGING_HOURS), NOW)).toBe("stale");
  });

  it("classifies well past 48h as stale", () => {
    expect(classifyPitEventAge(hoursAgo(72), NOW)).toBe("stale");
  });
});

describe("filterPitByAge", () => {
  const watchlist = ["wl-film"];

  it("keeps a fresh event even when its film is not on the watchlist", () => {
    const events = [ev("a", "other-film", hoursAgo(1))];
    expect(filterPitByAge(events, watchlist, NOW).map(e => e.id)).toEqual(["a"]);
  });

  it("keeps an aging event whose film is on the watchlist", () => {
    const events = [ev("a", "wl-film", hoursAgo(36))];
    expect(filterPitByAge(events, watchlist, NOW).map(e => e.id)).toEqual(["a"]);
  });

  it("drops an aging event whose film is NOT on the watchlist", () => {
    const events = [ev("a", "other-film", hoursAgo(36))];
    expect(filterPitByAge(events, watchlist, NOW)).toEqual([]);
  });

  it("drops an aging event with a null film_id", () => {
    const events = [ev("a", null, hoursAgo(36))];
    expect(filterPitByAge(events, watchlist, NOW)).toEqual([]);
  });

  it("drops a stale event even when its film is on the watchlist (stale beats relevance)", () => {
    const events = [ev("a", "wl-film", hoursAgo(72))];
    expect(filterPitByAge(events, watchlist, NOW)).toEqual([]);
  });

  it("handles an empty input", () => {
    expect(filterPitByAge([], watchlist, NOW)).toEqual([]);
  });

  it("does not mutate the input array or its events", () => {
    const original = ev("a", "wl-film", hoursAgo(1));
    const events = [original];
    filterPitByAge(events, watchlist, NOW);
    expect(events).toHaveLength(1);
    expect(original.film_id).toBe("wl-film");
  });

  it("filters a mixed batch, keeping only the eligible events in order", () => {
    const events = [
      ev("fresh-any", "other", hoursAgo(2)),      // fresh -> keep
      ev("aging-wl", "wl-film", hoursAgo(30)),     // aging + watchlist -> keep
      ev("aging-other", "other", hoursAgo(30)),    // aging + not watchlist -> drop
      ev("stale-wl", "wl-film", hoursAgo(60)),     // stale -> drop
    ];
    expect(filterPitByAge(events, watchlist, NOW).map(e => e.id)).toEqual(["fresh-any", "aging-wl"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitAge.test.ts`
Expected: FAIL — cannot resolve `../../lib/feed-events/pitAge`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/feed-events/pitAge.ts`:

```ts
// Age-based eligibility for FROM THE PIT (spec 2026-07-09-pit-aging-ttl).
// A pure selection-side filter used only by getEligiblePitEventsForUser
// (the signed-in path) -- deliberately NOT applied in getRecentSystemEvents,
// which also feeds the un-aged anonymous landing page.
import type { SystemFeedEvent } from "./types";

export const PIT_FRESH_HOURS = 24;
export const PIT_AGING_HOURS = 48;

export type PitAgeTier = "fresh" | "aging" | "stale";

// Rolling hours from created_at, upper-bound-exclusive: exactly
// PIT_FRESH_HOURS old is "aging", exactly PIT_AGING_HOURS old is "stale".
// `now` is injected for testability.
export function classifyPitEventAge(createdAt: string, now: Date): PitAgeTier {
  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000;
  if (ageHours < PIT_FRESH_HOURS) return "fresh";
  if (ageHours < PIT_AGING_HOURS) return "aging";
  return "stale";
}

// fresh -> always kept; stale -> always dropped; aging -> kept only when the
// event's film is on the watchlist. Builds its own Set (signature mirrors
// rankPitCandidatesByWatchlist), so the call site passes the same
// watchlistFilmIds array to both. Never mutates input.
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

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/pitAge.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/pitAge.ts app/tests/feed-events/pitAge.test.ts
git commit -m "feat(pit-aging): classifyPitEventAge + filterPitByAge pure module"
```

---

### Task 2: Splice the age filter into `getEligiblePitEventsForUser`

**Files:**
- Modify: `app/lib/feed-events/pitSelection.ts`
- Test: `app/tests/feed-events/getEligiblePitEventsForUser.test.ts`

**Interfaces:**
- Consumes: `filterPitByAge` from `@/lib/feed-events/pitAge` (Task 1).
- Produces: no signature change to `getEligiblePitEventsForUser` — same `(client, userId, limit) => Promise<SystemFeedEvent[]>`. Behavior now also drops age-ineligible candidates.

- [ ] **Step 1: Add the import**

In `app/lib/feed-events/pitSelection.ts`, alongside the existing imports:

```ts
import { filterPitByAge } from "./pitAge";
```

- [ ] **Step 2: Insert the age filter**

Find the tail of `getEligiblePitEventsForUser` (the last four lines of the function):

```ts
  const watchlistFilmIds = await getWatchlistedFilmIds(client, userId);
  const ranked = rankPitCandidatesByWatchlist(candidates, watchlistFilmIds);

  return ranked.slice(0, PIT_DAILY_CAP - todayCount);
```

Replace with (adds the age filter between the watchlist fetch and the ranking; everything above this block in the function is unchanged):

```ts
  const watchlistFilmIds = await getWatchlistedFilmIds(client, userId);
  const fresh = filterPitByAge(candidates, watchlistFilmIds, new Date());
  if (fresh.length === 0) return [];
  const ranked = rankPitCandidatesByWatchlist(fresh, watchlistFilmIds);

  return ranked.slice(0, PIT_DAILY_CAP - todayCount);
```

- [ ] **Step 3: Extend the integration test**

Append these three `it` blocks inside the existing `describe.skipIf(!hasEnv)("getEligiblePitEventsForUser", ...)` block in `app/tests/feed-events/getEligiblePitEventsForUser.test.ts` (do not modify existing tests; the file already has `userA`, `filmId`, `watchlistedFilmId` fixtures and a `beforeEach` that clears `pit_impressions`/`watchlists`/`feed_events` for these films). `feed_events.created_at` has a `DEFAULT now()` but is a plain column, so a direct service-role insert can backdate it — the same override pattern the existing cross-day test uses for `pit_impressions.shown_at`:

```ts
  it("does not return a stale (>48h) unseen event even if its film is watchlisted", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: watchlistedFilmId, max_price_usd: 9.99 });
    const staleAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: watchlistedFilmId, copy: "stale", priority: 90, created_at: staleAt }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 12);
    expect(out.find(e => e.id === ins.data!.id)).toBeUndefined();
  });

  it("returns a 24-48h event whose film is watchlisted", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: watchlistedFilmId, max_price_usd: 9.99 });
    const agingAt = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: watchlistedFilmId, copy: "aging watchlisted", priority: 90, created_at: agingAt }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 12);
    expect(out.find(e => e.id === ins.data!.id)).toBeDefined();
  });

  it("does not return a 24-48h event whose film is NOT watchlisted", async () => {
    const admin = adminClient();
    const agingAt = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "aging not watchlisted", priority: 90, created_at: agingAt }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 12);
    expect(out.find(e => e.id === ins.data!.id)).toBeUndefined();
  });
```

- [ ] **Step 4: Typecheck + run tests**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` — Expected: exit 0.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/feed-events/getEligiblePitEventsForUser.test.ts` — Expected: PASS with env (7 tests: 4 original + 3 new), or all skipped without `TEST_SUPABASE_*` env. If skipped, note it and rely on typecheck as the correctness signal for this file.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — Expected: full suite green, no new failures.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feed-events/pitSelection.ts app/tests/feed-events/getEligiblePitEventsForUser.test.ts
git commit -m "feat(pit-aging): apply age filter in getEligiblePitEventsForUser"
```

---

### Task 3: Docs + verification + ship

**Files:**
- Modify: `CLAUDE.md` (root — "Current state" + "Open threads")
- Modify: `docs/sub-project-history.md` (append the next row)

**Interfaces:**
- Consumes: shipped state from Tasks 1–2.
- Produces: session documentation + live feature.

- [ ] **Step 1: Update root `CLAUDE.md`**

Add a new "Last shipped" paragraph at the top of the Current state entries (demote the previous entry's label to "Previously shipped" following the file's convention; bump `**Last updated:**` to `2026-07-09`). Content: FROM THE PIT aging/TTL (sub-project #2 of 5) — new pure module `app/lib/feed-events/pitAge.ts` (`classifyPitEventAge`, `filterPitByAge`, `PIT_FRESH_HOURS = 24` / `PIT_AGING_HOURS = 48`) spliced into `getEligiblePitEventsForUser`; 0–24h always eligible, 24–48h only if the event's film is on the viewer's watchlist, 48h+ never selected into the main feed. Note: pure selection-side filter (signed-in `/home` only, NOT in the shared `getRecentSystemEvents` — the anon landing page stays un-aged), rolling-hours boundaries (upper-bound-exclusive), events are never deleted (they persist in `feed_events` for the deferred Ledger #4 / Pit tab #5 to query un-aged), no migration. Cite spec + plan paths. Note the remaining backlog: digest events (#3), Ledger page (#4), Pit archive tab (#5).

- [ ] **Step 2: Append the sub-project-history row**

Check the current last row number first (`grep -n "^| [0-9]" docs/sub-project-history.md | tail -1` — and verify the rows are in ascending order before appending, since a prior session had an out-of-order insertion here). Append the next sequential row in the established dense style, citing `2026-07-09-pit-aging-ttl-design.md`.

- [ ] **Step 3: Final verification**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: both exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs: record FROM THE PIT aging/TTL ship"
```

**Ship sequence:** app-only change, **no migration**. Merge to master, then `npx vercel deploy --prod --yes` from the repo root. Nothing to sequence — no schema touched.
