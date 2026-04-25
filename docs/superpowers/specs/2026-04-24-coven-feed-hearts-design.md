# Coven feed — universal heart reactions (Hearts) — design

**Status:** approved 2026-04-24. First of two coordinated sub-projects to make the Coven feed less claustrophobic. Paired with (but shippable independently of) the **Grouped bulk actions** sub-project, spec pending post-Hearts ship.

## Problem

The Coven feed is gorgeous but read-only. Users have no lightweight way to acknowledge a follower's activity — no "I saw this, I approve" signal short of writing a recommendation or leaving a review. The result: activity accumulates, no feedback, the feed feels like a broadcast channel rather than a social surface.

## Approach

Add a universal **heart reaction** to every activity row in the feed. One-tap toggle (classic heart icon — sharp geometry, not bubbly), inline next to the timestamp, with an optional count that — when ≥ 1 — opens a bottom-sheet listing the likers (coven members first, then everyone else). New `activity_reactions` table keyed by `(activity_id, user_id)`; RLS lets anyone authenticated read counts but only the acting user writes their own row. Self-likes blocked at both the server action and the UI. Optimistic on tap; refresh-only for other users' likes (no websockets).

## Decisions

- **Scope of likable:** every `activity` row is likable (all 6 current kinds: `recommendation_sent`, `review_published`, `watchlist_added`, `list_created`, `list_film_added`, `coven_joined`). Uniform rule, simplest schema (single table, one FK to `activity.id`).
- **Self-likes:** blocked at the server action via `SELECT activity.actor_user_id` check, AND the UI hides the button on the viewer's own rows. Count + sheet remain visible on own rows so the viewer can see who liked their activity.
- **Count display:** shown only when `≥ 1` (a 0 count renders no text, keeping the icon alone). Heart icon always toggles; count (when visible) is a separate tap target that opens the bottom sheet.
- **Bottom sheet composition:** coven members first (above a 1px accent divider) + "Others" below. Empty sheet case (count ≥ 1 but no visible likers) renders the italic line *"No one you can see."*. Sheet reuses a new generic `BottomSheet` primitive.
- **Realtime:** optimistic on tap (local state flips + `useTransition`); `revalidatePath("/home")` for other viewers. No Supabase Realtime / websockets — out of scope.
- **BottomSheet as primitive:** new reusable `app/components/BottomSheet.tsx`. Hearts feature is its first consumer; future surfaces (site-wide search, "who watched this" on film detail, etc.) can adopt it.
- **Testing depth:** 5 server-action tests (integration via `signedInClient`/`adminClient`) + 3 query tests (`vi.mock` Supabase) + 5 RLS tests (testcontainers). No React component tests (project precedent — manual browser smoke).

## Out of scope

- Emoji / multi-reaction types (hearts only; schema allows future extension).
- Liking films / reviews / lists directly (likes are on ACTIVITY rows, not underlying objects).
- "Recent likes received" profile stat / notification. Data model supports it trivially but UI not built.
- Supabase Realtime subscriptions — other viewers see updates on next page refresh.
- Unliking with a long-press (no hidden gestures; tap toggles, count opens sheet).
- React rendering tests (no React testing library in `app/` — precedent).

## Architecture

### Files touched

```
db/migrations/
  0121_activity_reactions.sql       (NEW — table + 2 indexes + RLS + GRANTs)

app/lib/queries/
  activity-reactions.ts             (NEW — getReactionsForActivities batch helper)
  activity.ts                       (EDIT — enrichment extended with reactions
                                            summary per row + isOwnRow flag)

app/lib/actions/
  reactions.ts                      (NEW — _toggleReaction + toggleReaction +
                                           fetchLikersForActivity)

app/components/
  BottomSheet.tsx                   (NEW — generic half-sheet primitive)
  HeartButton.tsx                   (NEW — client; icon + count + optimistic
                                           toggle; opens LikersBottomSheet)
  LikersBottomSheet.tsx             (NEW — consumes BottomSheet; lazy-loads
                                           likers on first open; coven/Others
                                           split)
  activity/ActivityFooter.tsx       (NEW — shared "timestamp · heart" row
                                           rendered at the bottom of every
                                           Activity* variant)
  activity/Activity*.tsx            (EDIT × 6 — inline timestamp replaced with
                                                <ActivityFooter item={item} />)

app/app/globals.css                 (EDIT — .bottom-sheet-*, .heart-btn,
                                            .heart-liked, .likers-* class set)

app/tests/actions/
  reactions.test.ts                 (NEW — 5 integration tests, signedInClient)

app/tests/queries/
  activity-reactions.test.ts        (NEW — 3 vi.mock tests for batch aggregation)

db/tests/rls/
  activity_reactions.test.ts        (NEW — 5 testcontainers RLS tests)
```

### Module boundaries

- **`activity-reactions.ts` (query)** — one function: `getReactionsForActivities(client, activityIds, viewerUserId) → Map<activityId, { count, likedByMe }>`. Pure read. One SELECT, JS aggregation.
- **`reactions.ts` (action)** — three functions: `_toggleReaction(client, activityId)` (private), `toggleReaction(activityId)` (public + revalidatePath), `fetchLikersForActivity(activityId)` (on-demand sheet data). Follows the established private+public pair convention.
- **`BottomSheet.tsx`** — accepts `{ open, onClose, title, children }`. Zero knowledge of hearts, reactions, activities. Handles overlay + scroll-lock + Escape + focus management.
- **`HeartButton.tsx`** — accepts `{ activityId, initialCount, initialLikedByMe, isOwnRow }`. Optimistic toggle + opens the sheet.
- **`LikersBottomSheet.tsx`** — accepts `{ activityId, open, onClose }`. Lazy-fetches on first open. Renders coven / Others sections inside the `BottomSheet` primitive.
- **`ActivityFooter.tsx`** — accepts `{ item: EnrichedActivity }`. Renders relative time + `HeartButton` with the right props extracted from `item.reactions` and `item.isOwnRow`.

### Type contract

Extends the existing `EnrichedActivity` discriminated union in `app/lib/queries/activity.ts`. Every variant gains:

```ts
interface ReactionSummary {
  count: number;
  likedByMe: boolean;
}

// Every variant of EnrichedActivity now also carries:
//   reactions: ReactionSummary;
//   isOwnRow: boolean;   // actor.id === followerUserId
```

## Schema

### `db/migrations/0121_activity_reactions.sql`

```sql
CREATE TABLE activity_reactions (
  activity_id   UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

CREATE INDEX activity_reactions_activity_id_idx
  ON activity_reactions (activity_id);

CREATE INDEX activity_reactions_user_id_idx
  ON activity_reactions (user_id);

ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_reactions_select
  ON activity_reactions FOR SELECT TO authenticated USING (true);

CREATE POLICY activity_reactions_insert
  ON activity_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY activity_reactions_delete
  ON activity_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON activity_reactions TO authenticated;
```

**Schema decisions:**

- **Composite PK `(activity_id, user_id)`** — enforces one reaction per user per activity; natural lookup key for both "who liked" and "did I like".
- **No reaction_type enum** — classic heart only. Future emoji support = one ALTER TABLE.
- **Hard deletes on unlike** — no soft-delete, no `deleted_at` column. Unlikes remove the row.
- **Both FKs cascade** — activity deletion or user deletion cleans up reactions.
- **Self-like check in the action layer**, not a DB trigger. Rationale: RLS already bounds writes to `auth.uid() = user_id`; the product rule is better expressed in code where the message and UI stay coherent.
- **Public read via `TO authenticated USING (true)`** — we need readers to see counts, so any signed-in user can SELECT any row. Does not leak identity beyond what `profiles` already exposes publicly.
- **GRANT emitted** — follows the project convention flagged in `project_supabase_grants_gap.md`: migrations must emit their own grants here, PostgREST won't otherwise surface them.

### `db/migrations/0121` vs. existing numbering

Current tip of `db/migrations/` is `0120_backfill_watchlist_thresholds.sql` (shipped this morning). `0121` is the next free number.

## Components

### `BottomSheet.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function BottomSheet({ open, onClose, title, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="bottom-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      <div
        ref={sheetRef}
        className="bottom-sheet-panel"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="bottom-sheet-header">
          <h2 id="bottom-sheet-title" className="head" style={{ fontSize: 22, margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} className="bottom-sheet-close" aria-label="Close">×</button>
        </div>
        <div className="bottom-sheet-body">{children}</div>
      </div>
    </div>
  );
}
```

### `HeartButton.tsx`

Client component. Props `{ activityId, initialCount, initialLikedByMe, isOwnRow }`. Owns three pieces of state: `count`, `liked`, `sheetOpen` (plus `useTransition` for the toggle). Hides the toggle button when `isOwnRow`; still renders the count + sheet trigger when `count > 0` on own rows so users can see who liked their activity. Classic heart SVG with `strokeLinejoin="miter"` for sharp points; fill = `var(--accent)` on liked (accent-switcher friendly).

### `LikersBottomSheet.tsx`

Client component. Props `{ activityId, open, onClose }`. Lazy-fetches via `fetchLikersForActivity(activityId)` on first open (tracked via `data != null` state — won't refetch on reopen during same session). Renders inside the generic `BottomSheet` primitive. Coven section on top, 1px accent divider, Others section below. Empty case: italic *"No one you can see."*.

### `ActivityFooter.tsx`

Server component (no interactivity at this level; interactive piece is `HeartButton`). Props `{ item: EnrichedActivity }`. Renders relative time + `HeartButton` passing `activityId={item.id}`, `initialCount={item.reactions.count}`, `initialLikedByMe={item.reactions.likedByMe}`, `isOwnRow={item.isOwnRow}`. Replaces the inline time-rendering at the bottom of each of the 6 `Activity*.tsx` variants.

## Data flow

### Read path: feed enrichment

`getEnrichedFeed` already does two activity SELECTs + four batch hydration queries (`actors`, `films`, `recipients`, `lists`). The patch adds a fifth:

```ts
const reactions = await getReactionsForActivities(
  client,
  raw.map(r => r.id),
  followerUserId,
);
```

Per-row mapper attaches `reactions: reactions.get(r.id) ?? { count: 0, likedByMe: false }` and `isOwnRow: r.actor_user_id === followerUserId`. One new query per feed load. For a 50-row feed, ≤ ~50 × (small N) rows returned — well under 1kB total in practice.

### Read path: bottom-sheet likers (on-demand)

`LikersBottomSheet`'s `useEffect` on first open calls `fetchLikersForActivity(activityId)`:

1. `SELECT user_id, profile:profiles!inner(id, handle, display_name, avatar_url) FROM activity_reactions WHERE activity_id = $1`
2. `SELECT user_a_id, user_b_id FROM coven_members WHERE user_a_id = $me OR user_b_id = $me`
3. Partition in JS: drop the viewer themselves, split the rest into coven vs. others by presence in the coven-id set.

Two round trips per sheet open, called on-demand only. No cost for rows whose sheets are never opened.

### Write path: toggle

`toggleReaction(activityId)` → `_toggleReaction(supabase, activityId)`:

1. Auth check → throw `unauthenticated` if not signed in.
2. `SELECT actor_user_id FROM activity WHERE id = $1` → if `actor_user_id === user.id`, throw `cannot like own activity`.
3. `SELECT activity_id FROM activity_reactions WHERE activity_id = $1 AND user_id = $me maybeSingle()` → branch.
4a. If present: `DELETE ... → return { liked: false }`.
4b. If absent: `INSERT ... → return { liked: true }`. Swallow `23505` (unique violation from a race) — end state matches intent.
5. `revalidatePath("/home")` so non-optimistic viewers see the count on their next render.

Three reads + one write per toggle. Sub-100ms in practice.

### Optimistic UX on tap

`HeartButton`'s `onHeartTap`:

1. Capture `prevLiked` + `prevCount`.
2. Synchronously flip `liked` + bump `count` by ±1.
3. `startTransition(() => toggleReaction(activityId))`. Pending disables the button.
4. On throw: roll back both state values; `console.error`.

Matches the existing `WatchlistButton` pattern (useTransition + try/catch + console.error on failure; no toast).

### Failure matrix

| Trigger | Behavior |
|---|---|
| Unauth user taps heart | Middleware gates `/home`; action throws `unauthenticated` defensively. |
| Double-tap during pending | `pending = true` disables the button; re-taps no-op. |
| Server throw mid-toggle | Optimistic state rolls back; `console.error`; no toast (matches existing pattern). |
| Self-like (shouldn't reach action) | Action throws `cannot like own activity`; optimistic state rolls back. |
| Concurrent dual-tap race (two tabs) | One insert wins, other swallows `23505`; final state "liked". |
| Count-tap opens sheet on row with zero visible likers | `"No one you can see."` empty state. |
| `fetchLikersForActivity` network/RPC failure | Inline `Couldn't load likers.` in sheet; close works normally. |
| Feed re-renders with sheet open | Sheet state is component-local; unaffected. |

## Testing

### `app/tests/actions/reactions.test.ts` — 5 integration tests

Follows `watchlists.test.ts` pattern. Real Supabase via `signedInClient` + `adminClient` + `createTestUser`. Blocked today by `TEST_SUPABASE_SERVICE_ROLE_KEY` env gap (same pre-existing issue as other admin-test files); tests authored to pass when env is provisioned.

1. **Toggle-on happy path** — userA creates activity; userB toggles; returns `{ liked: true }`; DB row present.
2. **Toggle-off happy path** — userB toggles twice; second call returns `{ liked: false }`; row gone.
3. **Self-like blocked** — userA creates activity; userA toggles own activity → throws `/cannot like own activity/`; DB unchanged.
4. **Unauthenticated rejection** — anon client call → throws `/unauthenticated/`; DB unchanged.
5. **Concurrent insert race** — `Promise.all` two toggles; end state = one row; no `23505` reaches caller.

### `app/tests/queries/activity-reactions.test.ts` — 3 tests

`vi.mock` Supabase client pattern.

1. **Batch aggregation correctness** — mocked rows across 3 activities × 5 users; map has correct counts + correct `likedByMe` flags for the viewer.
2. **Viewer not a liker** — no rows match `viewerUserId`; every entry has `likedByMe: false`.
3. **Empty input** — zero `activityIds` returns empty `Map` without hitting the DB (verified via fetch spy).

### `db/tests/rls/activity_reactions.test.ts` — 5 testcontainers tests

1. **Anon SELECT denied** — anon role returns 0 rows.
2. **Authenticated SELECT allowed** — any signed-in user can read all rows.
3. **INSERT with matching user_id** — userA inserts `(activity_id, user_id = A.id)` succeeds.
4. **INSERT with mismatched user_id** — userA tries to insert userB's row → policy violation.
5. **DELETE own / other** — userA can delete own row; userA cannot delete userB's row (0 rows affected, no throw).

### Not tested

- React component rendering (project precedent — no RTL in `app/`).
- Heart SVG pixel geometry (designer's-eye judgment; tunable in follow-up).
- End-to-end feed enrichment with reactions (action tests + query tests cover the data boundary separately).

### Total

**13 tests** (5 action + 3 query + 5 RLS). Sub-second runtime. Zero new test infrastructure.

## Operational

- **No env vars.**
- **One migration** (`0121_activity_reactions.sql`) to apply. Can run via `db/ npm run migrate` (safe: `_migrations` table tracks 0100-0120 per yesterday's reconciliation, so this would be the first unrecorded new migration and will apply cleanly).
- **No deploy-time config changes.**
- **No dependencies added.**

## Implementation estimate

- Migration + grants — 15 min.
- `getReactionsForActivities` query + 3 vi.mock tests — 30 min.
- `_toggleReaction` + `toggleReaction` + `fetchLikersForActivity` action + 5 integration tests — 1.5 hrs.
- `BottomSheet` primitive + CSS — 1 hr.
- `HeartButton` + SVG tuning — 1 hr.
- `LikersBottomSheet` + lazy-fetch wiring — 45 min.
- `ActivityFooter` + 6 Activity* edits — 45 min.
- `activity.ts` enrichment patch — 30 min.
- RLS tests (testcontainers) — 30 min.
- Manual smoke + visual tuning — 1 hr.

**Total: ~7.5 hours.** Matches "~6-7 hour sub-project" rough estimate from the scoping message.
