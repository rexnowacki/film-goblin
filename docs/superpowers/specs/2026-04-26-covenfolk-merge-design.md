# Covenfolk merge — design

**Status:** Approved 2026-04-26
**Owner:** Multi-machine, this session
**Replaces:** none (incremental change)
**Related:** Social features sub-project (`2026-04-23-social-features-design.md`)

## Problem

Today, `/people` and `/coven` are two separate routes serving overlapping social workflows:

- `/people` is a directory: search/browse all profiles, click through to `/p/<handle>`, then click "Invite to Coven" on the profile page.
- `/coven` is your personal social graph: pending invitations strip + accepted coven members grid, with a "leave" button per member.

Inviting someone to your coven currently requires three actions: open `/people`, click their card, click invite on their profile page. The two pages also share a chapter (Chapter IV — and the `/people` eyebrow already says "The Covenfolk"), suggesting they were always conceptually one surface that got split for layout reasons.

## Goal

Merge `/people` and `/coven` into a single page at `/coven` (TopNav label: **Covenfolk**) that lets users (a) see their existing coven, (b) act on pending invites, and (c) discover and invite new people inline — without leaving the page.

## Non-goals

- Re-thinking the underlying social model (`coven_requests` and `coven_members` tables stay as-is).
- Coven-overlap signals on profile pages (deferred from B2 spec — separate sub-project).
- Algorithmic discovery / friend-of-friend suggestions (deferred — separate sub-project).
- Search-within-your-own-coven affordance (skip until coven sizes warrant it).
- Touching `/p/<handle>` profile pages — they remain the canonical detail view.

## Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Search-result interaction model | Inline `+ Invite` button on each row; name/avatar still routes to `/p/<handle>` |
| 2 | Pending invites placement | Top strip, full-width, collapses when empty |
| 3 | Mobile stack order | Pending invites → Your Coven → Find People |
| 4 | Route + naming | Stay at `/coven`; TopNav label flips to "Covenfolk"; `/people` redirects to `/coven` |
| 5 | Inline invite button states | Four states: `+ Invite` / `Pending` / `In Coven` / `Accept` |
| 6 | Default search state (no query) | Show all profiles (preserves current `/people` behavior) |
| 7 | Filtering search results | Filter out yourself AND existing coven members from search; left pane is the canonical place to see your coven |

## Page structure

### Desktop (>720px)

```
┌─────────────────────────────────────────────────────────┐
│ Hero: "The Covenfolk."  (Chapter IV eyebrow)            │
├─────────────────────────────────────────────────────────┤
│ Pending Invitations strip — full width.                 │
│ Hidden entirely when invites.length === 0.              │
├──────────────────────────┬──────────────────────────────┤
│ Your Coven               │ Find People                  │
│ - members grid           │ - search input + ✦ stamp     │
│ - leave button per row   │ - results grid               │
│ - empty state copy       │ - inline invite button       │
└──────────────────────────┴──────────────────────────────┘
```

Layout uses `.stackable` with `--stack-template: 1fr 1fr` and `--stack-gap: 32px` (or whatever lands cleanly with the existing pattern).

### Mobile (≤720px)

`.stackable` collapses to single-column. Stack order: hero → pending invites strip → Your Coven → Find People.

Rationale (Q3): users visit `/coven` primarily to see their existing coven; search is the secondary "expand it" action. Putting search second on mobile matches user intent.

## Components

### New: `SearchPersonRow` (client)

One client component renders each search result. Props:

```ts
type SearchPersonRowProps = {
  profile: ProfileLite; // id, handle, display_name, avatar_url, bio
  relationship: "none" | "outgoing-pending" | "incoming-pending";
  // "in-coven" is filtered out per Q7, but render fallback as disabled
  // for safety if it ever leaks through.
  outgoingRequestId?: string; // for cancel-invite, future use
  incomingRequestId?: string; // required when relationship === "incoming-pending"
};
```

Renders:
- Avatar + name + `@handle` (whole row except the button is a `<Link>` to `/p/<handle>`)
- Optional bio line (italic, muted) — same as current `/people` cards
- State-driven button on the right:
  - `none` → `+ Invite` (active, fires `inviteToCoven(profile.id)`)
  - `outgoing-pending` → `Pending` (disabled, muted)
  - `incoming-pending` → `Accept` (active accent, fires `acceptCovenInvite(incomingRequestId)`)
  - `in-coven` (defensive) → `In Coven` (disabled, accent-tinted)

Button uses existing `.btn` family with state-appropriate variants. Click handlers are `useTransition`-wrapped so the button can show a pending indicator without blocking the rest of the page.

### Reused as-is

- `PeopleSearch` (the input box) — drops into the right pane.
- `CovenInviteActions` — pending-invites strip's accept/decline buttons.
- `LeaveCovenButton` — per-member leave button on the left pane.
- `Avatar`, `FilmPoster`-adjacent layout primitives.

### Removed

- `app/components/PeopleSearch.tsx` references on the standalone `/people` page (the file itself stays; only the page that hosts it changes).
- `app/app/people/page.tsx` body collapses to a single `redirect("/coven")` call.

## Data layer

### `app/lib/queries/profiles.ts`

Extend `getProfilesBySearch`:

```ts
export async function getProfilesBySearch(
  client: SupabaseClient,
  opts: { q?: string; excludeUserIds?: string[] }
): Promise<ProfileLite[]>
```

When `excludeUserIds` is non-empty, the underlying query adds `.not("id", "in", `(${ids.join(",")})`)` (PostgREST array filter syntax). Caller passes `[currentUserId, ...covenMemberIds]` so the search pane never shows yourself or your coven.

### New: `app/lib/queries/coven.ts` — `getRelationshipMap`

```ts
export async function getRelationshipMap(
  client: SupabaseClient,
  currentUserId: string,
  profileIds: string[]
): Promise<Map<string, {
  state: "outgoing-pending" | "incoming-pending";
  requestId: string;
}>>
```

One SELECT against `coven_requests` filtered by:
- `status = 'pending'`
- `(from_user_id = currentUserId AND to_user_id IN (profileIds)) OR (to_user_id = currentUserId AND from_user_id IN (profileIds))`

Returns a map keyed by the *other* user's id. Profiles not in the map are `"none"` (default state). Coven membership doesn't appear in this map because coven members are filtered out of search results upstream — but if a profile slips through, the rendering code falls back to `"none"` (cosmetic only; clicking invite would error or no-op based on existing action validation).

Co-located with the existing coven query helpers (`getPendingInvites`, `getMyCovenMembers`).

## Server actions

No new actions. The page reuses:

- `inviteToCoven(toUserId)` — `app/lib/actions/coven.ts`
- `acceptCovenInvite(requestId)` — `app/lib/actions/coven.ts`
- `declineCovenInvite(requestId)` — `app/lib/actions/coven.ts`
- `leaveCoven(otherUserId)` — `app/lib/actions/coven.ts` (already used by `LeaveCovenButton`)

All four actions already call `revalidatePath("/coven")` (or layout-level revalidate). After any action fires, the page re-renders with updated relationship state — no client-side cache to manage.

## Page composition (server component)

`app/app/coven/page.tsx` becomes:

```ts
export default async function CovenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?redirect=/coven");

  // Phase 1 — invites + members can run in parallel (no dependency)
  const [invites, members] = await Promise.all([
    getPendingInvites(supabase, user.id),
    getMyCovenMembers(supabase, user.id),
  ]);

  // Phase 2 — search exclusion depends on member ids; relationship map
  // depends on the search result. These can be chained (search first,
  // then relationship lookup) or parallelized if we accept that the
  // relationship map may include ids that didn't make it into the
  // search result. Keep it sequential for v1 — simpler, both queries
  // are fast against the pooler.
  const memberIds = members.map(m => m.id);
  const profiles = await getProfilesBySearch(supabase, {
    q,
    excludeUserIds: [user.id, ...memberIds],
  });
  const relationshipMap = await getRelationshipMap(
    supabase,
    user.id,
    profiles.map(p => p.id)
  );

  // Render: hero → pending strip → two-pane (members | search)
}
```

Two round-trips because the search exclusion list depends on the members result. Acceptable — both queries are fast against the prod pooler and there's no pagination yet.

## Routing transition

- `app/app/people/page.tsx` body becomes: `import { redirect } from "next/navigation"; export default function PeoplePage() { redirect("/coven"); }`. No props needed.
- `app/components/TopNav.tsx`: remove the `{ id: "people", label: "Find Your People", href: "/people" }` entry. Rename `{ id: "coven", label: "Coven", href: "/coven" }` → `{ id: "coven", label: "Covenfolk", href: "/coven" }`. The `current` prop semantics for `current="coven"` keep working.
- Any other internal links pointing at `/people` need updating. Grep for them at implementation time; the only known ones are CovenPage's empty-state copy ("Visit /people to find souls to bind with") which becomes redundant after the merge.

## Empty states

| Section | Empty state copy (preserved or new) |
|---|---|
| Pending Invitations | Section hidden entirely |
| Your Coven | "Your coven is empty. Search to your right to find souls to bind with." (new copy — old version pointed at `/people`) |
| Find People (no query, no profiles in DB) | "No souls in the realm yet." (rare in practice) |
| Find People (with query, no matches) | "No souls match your search." (preserved from current `/people`) |

## Testing

### Existing tests that need updates

- `app/tests/...` — any test that hits `/people` directly should hit `/coven` (search params unchanged).
- TopNav rendering test (if one exists) — assert "Covenfolk" label appears, "Find Your People" does not.

### New test surface

- **`getProfilesBySearch` with `excludeUserIds`** — unit test the query helper. Assert excluded ids are filtered out of results regardless of `q`.
- **`getRelationshipMap`** — integration test (env-blocked, `describe.skipIf`). Seed two profiles with one outgoing pending request and one incoming. Assert map keys match other-user-id and states are correct.
- **`/coven` page render** — integration test (env-blocked). Auth as user A with one coven member, one pending incoming invite, one outgoing invite, plus a stranger profile. Assert: pending strip shows incoming, your-coven section shows the member, search pane shows the stranger with `+ Invite` and the user with outgoing pending shown as `Pending` (filter only excludes coven members + self, not pending-pair users). The stranger and the outgoing-pending user are distinct; coven members are filtered out.

### RLS

No schema change. Existing RLS on `profiles`, `coven_requests`, `coven_members` covers all reads. No new policies needed.

### Manual smoke (dev server)

1. Two browser sessions, two users.
2. User A invites User B from `/coven` search → button flips to `Pending` immediately, `/coven` page re-renders.
3. User B sees the invite in the pending strip on `/coven`. Accepts. Both users now see each other in the "Your Coven" pane on their respective `/coven` pages.
4. User A searches for User B in the right pane → User B is filtered out (already in coven).
5. User A leaves coven via the per-row leave button. Re-search for User B → reappears with `+ Invite` state.
6. Reverse-pending: User C invites User A. User A searches for User C → row shows `Accept`. Click → both bonded.

### Mobile smoke

1. Resize to ≤720px or use device simulator.
2. Verify stack order: hero → pending strip → Your Coven → Find People.
3. Verify all buttons are tap-target sized (≥44px).
4. Verify `.stackable` collapses cleanly with no horizontal overflow.

## Risks / open questions

- **Two-round-trip read pattern** — the page does `getMyCovenMembers` first, then uses its result to filter `getProfilesBySearch`. Acceptable now (both fast, no pagination). If `/coven` becomes slow, the fix is a single SQL function or a view that combines both — not parallelization, since there's a real dependency.
- **Pending invite state racing with search** — if the user accepts an incoming invite from the right pane via the inline `Accept` button, the page revalidates and the user moves out of the search results (now a coven member). Verify this transition feels smooth; if it flickers, add an optimistic local state for the duration of the action.
- **Search input state** — `PeopleSearch` currently submits `?q=foo` to the page. After the merge, that pattern continues; the URL becomes `/coven?q=foo`. No state lost on navigation.

## Out of scope (deferred)

- Coven-overlap signals on profile pages (separate sub-project)
- Friend-of-friend / algorithmic suggestions (separate sub-project)
- Search within your own coven (skip until coven sizes warrant)
- Cancel-outgoing-invite from search row (`outgoingRequestId` prop reserved but unused in v1)
- Bulk invite / bulk accept (no current need)

## Files affected (anticipated)

- `app/app/coven/page.tsx` — full rewrite of body; preserves auth gate and overall layout shell
- `app/app/people/page.tsx` — collapses to one-line redirect
- `app/components/TopNav.tsx` — drop one nav item, rename another
- `app/components/SearchPersonRow.tsx` — new file
- `app/lib/queries/profiles.ts` — add `excludeUserIds` arg to `getProfilesBySearch`
- `app/lib/queries/coven.ts` — add `getRelationshipMap` helper

No migrations, no RLS changes, no new server actions, no new env vars.
