# FROM THE PIT: Archive Tab — Implementation Plan

**Goal:** Add a signed-in `pit` tab to `/home` that lets a user browse the full, un-capped, un-aged system-event archive without affecting the main feed's Pit budget or seen state.

**Architecture:** The home server component fetches a first page of `feed_events` only for `?tab=pit`; a new RLS-bound query and read-only server action paginate the archive by `created_at`. `FeedTabs` gives the archive its own client branch, bucket filtering, and pagination state rather than routing it through the user-feed composer. It renders normal `SystemEventRow` cards with `recordImpression={false}` and archive-local tier resolution.

**Tech stack:** Next.js App Router, TypeScript, Supabase/PostgREST, Vitest, existing zine-CSS.

**Spec:** `docs/superpowers/specs/2026-07-09-pit-archive-tab-design.md`

## Global constraints

- App-only, no migration and no new environment variable.
- The archive is a reference surface: do not call `getEligiblePitEventsForUser`, `composeFeed`, `enforcePitPositionRules`, or `recordPitImpressions` from its path.
- `SystemEventRow` defaults to recording impressions for every current caller; only the archive passes `false`.
- Query helpers receive an injected RLS-bound client. The load-more action authenticates with `requireAuthUser`; it never uses service role.
- Keep the existing 720px zine-CSS breakpoint and `prefetch={false}` on film links.
- Branch when executing: `codex/pit-archive-tab`. Run `app` tests, typecheck, and production build before PR.

---

### Task 1: Define archive bucketing and read-side query

**Files:**
- Create: `app/lib/feed-events/pitArchive.ts`
- Modify: `app/lib/feed-events/query.ts`
- Create: `app/tests/feed-events/pitArchive.test.ts`
- Modify: `app/tests/feed-events/query.test.ts` or add an env-gated archive-query test alongside the existing feed-event query tests

**Interfaces:**

```ts
export const PIT_ARCHIVE_PAGE_SIZE = 30;
export type PitBucket = "deals" | "free" | "catalog" | "hauntings";
export const PIT_BUCKETS: Record<FeedEventType, PitBucket>;
export function filterArchiveByBucket(
  events: SystemFeedEvent[],
  bucket: PitBucket | null,
): SystemFeedEvent[];

export async function getPitArchiveEvents(
  client: Client,
  opts?: { before?: string; limit?: number },
): Promise<SystemFeedEvent[]>;
```

- [ ] Implement the total 15-type `PIT_BUCKETS` record exactly as the spec assigns: Deals, Free, Catalog, Hauntings.
- [ ] Implement `filterArchiveByBucket` as a pure, non-mutating filter; `null` represents the Everything chip.
- [ ] Add `getPitArchiveEvents` next to `getRecentSystemEvents`, using the same minimal `feed_events` cast and film embed normalization. Query newest-first, apply `.lt("created_at", before)` only when a cursor is provided, and default to 30 rows.
- [ ] Test every event-type bucket assignment, the filter's null/empty behavior, and that a query page is newest-first, bounded, and excludes the cursor boundary. Guard the database integration test with the repository's established env-gated pattern.

### Task 2: Add authenticated archive pagination

**Files:**
- Create: `app/lib/actions/pit-archive.ts`
- Create or modify: `app/tests/actions/pit-archive.test.ts`

**Interfaces:**

```ts
export interface LoadMorePitArchiveResult {
  events: SystemFeedEvent[];
  nextCursor: string | null;
  done: boolean;
}

export async function loadMorePitArchive(args: {
  before: string;
  limit?: number;
}): Promise<LoadMorePitArchiveResult>;
```

- [ ] Follow the public-action pattern: create the server client, require the authenticated user, validate a non-empty cursor, and call `getPitArchiveEvents` with the requested/default page size.
- [ ] Compute `nextCursor` from the final returned event and `done` from a short page. This is a read action: do not add `revalidatePath`.
- [ ] Add unit coverage for the response shape/invalid cursor handling if the action can be tested with mocks; otherwise cover the query behavior in Task 1 and capture the action in the manual smoke.

### Task 3: Select the archive server-side only for the pit tab

**Files:**
- Modify: `app/app/home/page.tsx`

- [ ] Widen `FeedTab`, `VALID_TABS`, `TAB_KINDS`, and `TAB_SCOPE` with `pit` only as required for URL validation and prop typing.
- [ ] For `tab=pit`, skip the user activity query and capped `getEligiblePitEventsForUser` call; fetch `getPitArchiveEvents` instead. Preserve all/coven/recs behavior byte-for-byte.
- [ ] Pass empty/done user-feed props plus the archive's initial rows to `FeedTabs`; do not fetch capped system rows that the archive will never render.
- [ ] Keep signed-out handling and the anonymous landing page unchanged.

### Task 4: Render the isolated archive branch and suppress impressions

**Files:**
- Modify: `app/components/activity/SystemEventRow.tsx`
- Modify: `app/components/FeedTabs.tsx`
- Create: `app/components/PitArchiveTab.tsx` (preferred to keep `FeedTabs` from owning a second pagination state machine)
- Modify: `app/app/styles/170-pills-search-match.css` or the nearest existing feed style sheet for archive-chip spacing, if styling cannot reuse existing utilities

- [ ] Add `recordImpression?: boolean` to `SystemEventRow`, defaulting to `true`. Make the effect conditional and keep all current callers on the default path.
- [ ] Build `PitArchiveTab` around its own `events`, cursor, done, loading, and IntersectionObserver state. It calls only `loadMorePitArchive`, merges by real event UUID, and applies the active bucket client-side over the fetched window.
- [ ] Render Everything / Deals / Free / Catalog / Hauntings using existing chip language. Load more remains unfiltered so an active chip simply re-filters the expanded window.
- [ ] Resolve archive tiers over system-only `ComposedItem`s with `resolvePitTiers`; never call `enforcePitPositionRules`. Render every `SystemEventRow` with `recordImpression={false}`.
- [ ] Widen the FeedTabs tab row to include `pit`; route that tab directly to `PitArchiveTab`, with no user rows, feed insert, or normal feed paginator. Preserve the all tab's existing composed path and all non-pit behavior.
- [ ] Keep mobile layout within the established 720px breakpoint; ensure the chips wrap and Load more remains tappable.

### Task 5: Verify the invariant and ship the app-only change

**Files:**
- Modify: root `AGENTS.md` Current state/Open threads as appropriate
- Modify: `docs/sub-project-history.md` after ship

- [ ] Run `cd app && npm run test -- --cache=false`, `npm run typecheck`, and `npm run build`.
- [ ] Manual signed-in smoke: open `/home?tab=pit`, change each bucket, load another page, and open a film link. Verify all/coven/recs still render normally after tab switching.
- [ ] Prove impression suppression against a test account: record its `pit_impressions` count, browse/load the Pit archive, then confirm the count is unchanged. Then return to all and verify a visible main-feed Pit card still records normally.
- [ ] Open a PR with the manual-proof result. No migration or special rollout ordering is needed; deploy the app normally after merge.
- [ ] Update root state and append the shipped ledger row only after the PR is merged/deployed.
