# FROM THE PIT: Digest Events — Implementation Plan

**Goal:** Replace bursts of equivalent, non-exempt Pit events on signed-in `/home` with one standard-tier digest card while preserving per-event archival records, permanent exclusion, and a one-slot daily budget cost per rendered member batch.

**Architecture:** A new pure digest pass runs in `getEligiblePitEventsForUser` after seen/age filtering and before ranking/slicing. Its synthetic `SystemFeedEvent` carries real member UUIDs and a deterministic member-set digest key. A migration adds that key to `pit_impressions` and widens the authenticated RPC, so impressioning every member still counts as one daily budget unit. Rendering recognizes digest payloads, displays film chips, and records the member UUIDs—not the synthetic id.

**Tech stack:** Next.js App Router, TypeScript, Supabase/Postgres RLS/RPC, Vitest/testcontainers, existing Pit zine-CSS.

**Spec:** `docs/superpowers/specs/2026-07-09-pit-digest-events-design.md`

## Global constraints

- Schema-touching: choose the migration number immediately before implementation. `0214` is only a reservation in the draft; if another machine has claimed it, renumber the migration and every plan/spec reference together.
- Rollout order is **migration first, then app deploy**: the new app selects `pit_impressions.digest_key` and passes the new RPC argument; old app code tolerates the additive column/new function.
- Preserve RLS: no direct client INSERT on `pit_impressions`; only the `SECURITY DEFINER` RPC writes it, and its grants must be restored after replacing the function signature.
- Do not change `composeFeed`, `enforcePitPositionRules`, or `resolvePitTiers`. The narrow tier/kicker digest recognition belongs in `tier.ts`.
- The landing page remains per-event. Digests exist only in the signed-in main-feed selection path.
- Build after the Pit archive tab, so the digest card can include its real `/home?tab=pit` destination.

---

### Task 1: Migrate digest budget accounting and preserve the RPC contract

**Files:**
- Create: `db/migrations/0214_pit_impressions_digest_key.sql` (or the conflict-free number chosen immediately before work)
- Modify: `db/tests/rls/pit-impressions.test.ts`
- Modify: `app/lib/supabase/types.ts`

**Interfaces:**

```sql
ALTER TABLE pit_impressions ADD COLUMN digest_key text NULL;
record_pit_impressions(p_event_ids uuid[], p_digest_key text DEFAULT NULL)
```

- [ ] Inspect `origin/master` immediately before choosing the migration number; do not collide with the other machine's migration sequence.
- [ ] Add nullable `digest_key`; leave ordinary individual impressions as `NULL`.
- [ ] Drop the old one-argument RPC before creating the defaulted two-argument overload. Re-apply `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC`, and authenticated execute grant exactly as in migration 0212.
- [ ] Keep the UUID-array validation and 10-event batch cap. Insert the supplied digest key for every accepted member event.
- [ ] Extend real-Postgres RLS tests: authenticated caller can persist a shared key, the one-argument call persists null, the repeat/unknown/over-cap behavior remains unchanged, and direct writes stay denied.
- [ ] Hand-edit the existing `types.ts` warning block, `pit_impressions` Row/Insert/Update shapes, and `Functions.record_pit_impressions.Args` to include the optional `p_digest_key`; do not run a blind type regeneration.

### Task 2: Build and prove the pure digest representation

**Files:**
- Create: `app/lib/feed-events/pitDigest.ts`
- Create: `app/tests/feed-events/pitDigest.test.ts`
- Modify: `app/lib/feed-events/tier.ts`
- Modify: `app/tests/feed-events/tier.test.ts`

**Interfaces:**

```ts
export const DIGEST_MIN_SIZE = 2;
export const DIGEST_MAX_MEMBERS = 10;
export interface PitDigestPayload { /* member ids, first 3 films, count, key */ }
export function isPitDigest(event: SystemFeedEvent): boolean;
export function bundlePitDigests(events, watchlistFilmIds, now): SystemFeedEvent[];
```

- [ ] Implement the per-type grouping and the watchlist/`all_time_low`/`last_showing` exemptions without mutating inputs.
- [ ] Select at most ten newest members. Derive the synthetic id and `digestKey` from event type, UTC day, and the exact ordered selected member UUIDs; use the full signature rather than a collision-prone short hash.
- [ ] Carry maximum member priority, newest creation time, null film id, first three film chips, and the read-time copy template.
- [ ] Make `getPitTier` return standard for a digest, including source types that are naturally whispers. Add a digest kicker branch that never produces the normal `LEDGER ECHO` demotion wording. Ordinary events and full-card cadence remain unchanged.
- [ ] Unit-test threshold, type separation, all exemptions, max-member overflow, distinct overflow member-set keys, shape/copy/non-mutation, plus naturally-whisper digest tier/kicker behavior.

### Task 3: Integrate selection and daily-cap semantics

**Files:**
- Modify: `app/lib/feed-events/pitSelection.ts`
- Modify: `app/tests/feed-events/getEligiblePitEventsForUser.test.ts`

- [ ] Select `digest_key` alongside `event_id` and `shown_at`; keep the permanent seen set keyed by every real `event_id`.
- [ ] Compute the UTC-day budget from distinct `COALESCE(digest_key, event_id::text)`, not raw event IDs.
- [ ] Run `bundlePitDigests` after `filterPitByAge` and before watchlist ranking/budget slice. Digests retain null film ids; watchlist members have already passed through individually and still receive their boost.
- [ ] Add env-gated integration coverage proving N impressions sharing one digest key consume one slot, a distinct overflow key consumes another slot, and every individual member remains permanently excluded after the digest impression.

### Task 4: Render digests and write the right impressions

**Files:**
- Modify: `app/lib/actions/feed-events.ts`
- Modify: `app/tests/actions/feed-events.test.ts`
- Modify: `app/components/activity/SystemEventRow.tsx`
- Modify: nearest existing Pit CSS sheet(s) under `app/app/styles/`

- [ ] Add optional `digestKey` through `_recordPitImpressions` and `recordPitImpressions`, passing it to the typed RPC. Preserve the one-argument individual call path and 10-member cap.
- [ ] Branch `SystemEventRow` through `isPitDigest`. Render the synthetic copy, first three linked poster chips, a `+N more` chip where appropriate, and the normal standard-tier shell.
- [ ] On digest mount, send `payload.memberIds` and `payload.digestKey`; never send the synthetic string id. On an ordinary row, retain the existing single-event impression behavior.
- [ ] Since the archive ships first, add the real `See all →` link to `/home?tab=pit` on digest cards. Do not alter the anonymous landing renderer.
- [ ] Add pure/action tests for RPC argument threading where possible; capture the visual branch and poster-link behavior in the manual smoke because this repo has no component-test harness.

### Task 5: Run full schema/app proof and ship migration-first

**Files:**
- Modify: root `AGENTS.md` Current state/Open threads as appropriate
- Modify: `docs/sub-project-history.md` after ship

- [ ] Run `cd db && npm test`, `npm run test:rls`, and `npm run typecheck`.
- [ ] Run `cd app && npm run test -- --cache=false`, `npm run typecheck`, and `npm run build`.
- [ ] Apply the new migration to production before the app deploy; confirm the new RPC accepts both legacy and digest calls.
- [ ] Manual signed-in smoke with at least two same-type non-exempt events: digest displays one card, its chips open the correct films, a watchlist match remains individual, and the archive shows the original individual rows.
- [ ] Verify the daily budget with real data: one digest of multiple members permits two further budget units, while a second distinct overflow batch consumes another one. Confirm a reload does not resurface any digested member individually.
- [ ] Update root state and append the history row after the migration and app deployment succeed.
