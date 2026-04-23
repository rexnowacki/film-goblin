# Social Features — Design Spec

**Sub-project:** 6 of 6 (production rebuild).
**Status:** design.
**Predecessors:** sub-project 2 (schema + RLS — `follows`, `coven_requests`, `coven_members`, `activity` tables + triggers), sub-project 3 (Next.js app + RecommendModal + FeedTabs stubs).
**Successors:** a small follow-up for the "Your Ledger" home widget; OAuth sub-project tomorrow; realtime feed upgrade as a backlog item.

## Goal

Make the existing social schema actually usable from the UI. Users
find each other on a `/people` browse page, land on public `/p/[handle]`
profile pages, follow each other, exchange coven invites, manage
coven membership on a `/coven` page, and receive a meaningful activity
feed on `/home`. The recommendation modal on film-detail pages
swaps its UUID paste box for a coven-member picker. Every activity
kind gets a first-class renderer instead of the current JSON dump.
Logout lands as a small pre-task so multi-account testing is possible
from day one of implementation.

## Scope

- **In:** Follow / unfollow actions + buttons; coven request /
  accept / decline / leave actions + buttons; public profile page;
  /people browse + search; /coven page with pending invites + members;
  TopNav badge for pending invites; per-kind activity renderers; coven-
  member picker in RecommendModal; logout button in TopNav + Settings.
- **Out:** Your Ledger widget; realtime feed; OAuth; password reset;
  header search; reviews on profile pages; list-detail route;
  recommendations inbox (recipient-side); invite emails / push;
  blocking / muting; private accounts; feed pagination; typeahead in
  picker; follower counts on profiles.

## Architecture

No DB migrations. The schema already supports everything: sub-project 2
provides `follows`, `coven_requests`, `coven_members`, `activity`
tables with RLS policies and fan-out triggers. This sub-project is UI
+ server actions + queries on top.

### New routes (Server Components)

- `app/app/p/[handle]/page.tsx` — public profile.
- `app/app/people/page.tsx` — search + grid of profiles.
- `app/app/coven/page.tsx` — pending invites + coven members.

### New server actions (`_impl + public wrapper + revalidatePath`)

- `app/lib/actions/follows.ts` — `_follow`, `_unfollow` + public
  wrappers.
- `app/lib/actions/coven.ts` — `_sendCovenRequest`,
  `_acceptCovenRequest`, `_declineCovenRequest`, `_leaveCoven` +
  public wrappers.

Existing `app/lib/actions/auth.ts` already exports `signOut`; we wire
it to UI, no new action code.

### New query modules

- `app/lib/queries/profiles.ts` grows:
  - `getProfileByHandle(client, handle)` — single profile lookup.
  - `getProfilesBySearch(client, { q, limit })` — handle + display_name
    ILIKE filter.
  - `getPublicProfileBundle(client, handle, viewerUserId?)` — one
    query returning profile, public lists, coven members, last-10
    activity, viewer's follow state, viewer's coven state with this
    user.
- `app/lib/queries/coven.ts` (new) — `getPendingInvites`,
  `getMyCovenMembers`, `getPendingInviteCount`,
  `getCovenStateBetween`.
- `app/lib/queries/activity.ts` — `getFeed` replaced by
  `getEnrichedFeed(client, userId, limit = 50)` that joins profiles +
  films + recipient profiles + list titles in a single SQL query,
  returns a discriminated-union `EnrichedActivity` array.

### New client islands

- `app/components/FollowButton.tsx` — toggles Follow / Unfollow.
- `app/components/CovenButton.tsx` — state-machine button (Invite /
  Pending Outbound / Pending Inbound / In Coven), dispatches the
  matching action.
- `app/components/CovenInviteActions.tsx` — Accept / Decline pair on
  the /coven pending list.
- `app/components/PeopleSearch.tsx` — same shape as `FilmsSearch`.
- `app/components/FeedTabs.tsx` — existing client island, rewritten:
  tab state in URL via `?tab=`; rendered list items become pure
  renderers invoked by a Server Component parent (no more client-side
  JSON dump).

### Per-kind activity renderers

Under `app/components/activity/`, one file per kind:

- `ActivityRecommendationSent.tsx`
- `ActivityReviewPublished.tsx`
- `ActivityWatchlistAdded.tsx`
- `ActivityListCreated.tsx`
- `ActivityListFilmAdded.tsx`
- `ActivityCovenJoined.tsx`

Each takes an `EnrichedActivity` of that specific kind (discriminated
via the `kind` field) and renders a row block: actor avatar + handle
(linked to `/p/[handle]`), the action verb + object, film poster
thumbnail where applicable, relative timestamp ("2h ago"). Inline
zine styling consistent with the rest of the app.

A tiny `activity/ActivityRow.tsx` dispatcher picks the renderer:

```tsx
switch (item.kind) {
  case "recommendation_sent": return <ActivityRecommendationSent item={item} />;
  case "review_published":    return <ActivityReviewPublished item={item} />;
  // ...
}
```

## Server actions in detail

### follows.ts

```ts
export async function _follow(client: Client, followedUserId: string): Promise<void>;
export async function _unfollow(client: Client, followedUserId: string): Promise<void>;
```

Insert path catches 23505 (unique-violation) silently — re-following
is a no-op. Delete path doesn't care about no-match. Both rely on
RLS policies from migration 0103 for identity enforcement.

### coven.ts

```ts
export async function _sendCovenRequest(client: Client, toUserId: string): Promise<{ id: string }>;
export async function _acceptCovenRequest(client: Client, requestId: string): Promise<void>;
export async function _declineCovenRequest(client: Client, requestId: string): Promise<void>;
export async function _leaveCoven(client: Client, otherUserId: string): Promise<void>;
```

- `_sendCovenRequest` — INSERT pending; catches 23505 (request
  already exists). Self-invite rejected by CHECK constraint from
  migration 0104.
- `_acceptCovenRequest` — UPDATE status='accepted', responded_at=now().
  Trigger from migration 0111 inserts the matching row in
  `coven_members` with canonical (least, greatest) ordering.
- `_declineCovenRequest` — same shape with status='declined'. No
  membership created.
- `_leaveCoven` — DELETE from `coven_members` using
  `(LEAST(auth.uid(), $1), GREATEST(auth.uid(), $1))` canonical pair.
  Requires a new RLS policy allowing either participant to delete —
  migration 0104 currently has no delete policy on coven_members.

**Migration gap — `0116_coven_leave.sql`:** this sub-project adds
a small migration granting `FOR DELETE` on `coven_members` to either
participant:

```sql
CREATE POLICY coven_members_delete ON coven_members
  FOR DELETE TO authenticated
  USING (auth.uid() IN (user_a_id, user_b_id));
```

Public wrappers of all five actions call `revalidatePath` against
`/coven`, `/home`, and the relevant `/p/[handle]` pages.

## Public profile page

`app/app/p/[handle]/page.tsx`. Async Server Component with
`params: Promise<{ handle: string }>`.

1. `createClient()` → `supabase.auth.getUser()` → viewer (nullable).
2. `getPublicProfileBundle(client, handle, viewerUserId)` returns:

```ts
interface ProfileBundle {
  profile: { id, handle, display_name, bio, avatar_url, created_at };
  lists: Array<ListCard>;                    // their public lists
  coven: Array<CovenMemberSummary>;          // their coven members
  activity: Array<EnrichedActivity>;         // last 10, of this user's acts
  viewer: {                                   // when signed in
    am_following: boolean;
    coven_state: "none" | "pending_outbound" | "pending_inbound" | "member";
    coven_request_id: string | null;         // only set when pending_inbound
  } | null;
}
```

3. If no profile → `notFound()`.
4. Render layout:
   - Hero: avatar (large), display_name, `@handle`, bio.
     Two buttons: `FollowButton` + `CovenButton` (pass `viewer` state).
   - "Their Grimoires": 4-column grid of public lists (reuses card
     markup from `/lists/page.tsx`).
   - "Their Coven": horizontal avatar strip, each linked.
   - "Recent Activity": `activity.map(item => <ActivityRow item={item} />)`.

## People browse page

`app/app/people/page.tsx`. Mirrors `/films` page structure.

`searchParams: Promise<{ q?: string }>` → `getProfilesBySearch(client,
{ q, limit: 60 })` → grid of profile cards linked to `/p/[handle]`.
`PeopleSearch` client island syncs the URL. Empty-state when 0 match.

## /coven page

Auth-gated. Layout:

1. Hero: "The Coven".
2. Pending Invitations (only if count > 0): list of rows, each with
   sender's avatar + handle + display_name + Accept / Decline buttons
   via `CovenInviteActions`.
3. Your Coven: grid of member cards. Each has a "Leave" button with
   a confirmation modal — mutual-agreement framing earns a
   "Are you sure?" prompt, unlike unfollow.
4. Empty state when both sections are empty.

## TopNav updates

- Authed users see two new links: **People** (→ `/people`) and
  **Coven** (→ `/coven`).
- Coven link carries a `(N)` pill badge when `getPendingInviteCount`
  returns > 0. The TopNav Server Component already loads the viewer
  and can cheaply add one COUNT query alongside its existing session
  fetch.
- Sign-out dropdown: the avatar in the right-side nav becomes a
  client component with a small menu revealing "Sign out" (plus a
  link to /settings). Click calls the existing `signOut` server
  action.
- Settings page gains an explicit "Sign out" button at the bottom as
  a redundant entry point.

## Activity feed rewrite

`getEnrichedFeed(client, userId, limit = 50)` — one SQL query:

```sql
SELECT
  a.id, a.kind, a.payload, a.created_at,
  actor.id AS actor_id, actor.handle AS actor_handle,
    actor.display_name AS actor_display_name, actor.avatar_url AS actor_avatar,
  -- film-scoped fields (nullable for kinds without a film)
  film.id AS film_id, film.title AS film_title, film.year AS film_year,
    film.director AS film_director, film.artwork_url AS film_artwork,
    film.itunes_url AS film_itunes_url,
  -- recipient-scoped (recommendations)
  recipient.handle AS recipient_handle, recipient.display_name AS recipient_display_name,
  -- list-scoped
  l.id AS list_id, l.title AS list_title
FROM activity a
JOIN profiles actor ON actor.id = a.actor_user_id
LEFT JOIN films film ON film.id = (a.payload->>'film_id')::uuid
LEFT JOIN profiles recipient ON recipient.id = (a.payload->>'to_user_id')::uuid
LEFT JOIN lists l ON l.id = (a.payload->>'list_id')::uuid
WHERE a.actor_user_id IN (
  SELECT followed_user_id FROM follows WHERE follower_user_id = $1
)
ORDER BY a.created_at DESC
LIMIT $2
```

Result shape (discriminated union):

```ts
type EnrichedActivity =
  | { kind: "recommendation_sent", created_at, actor, film, recipient, note }
  | { kind: "review_published", created_at, actor, film, title, pullquote }
  | { kind: "watchlist_added", created_at, actor, film }
  | { kind: "list_created", created_at, actor, list }
  | { kind: "list_film_added", created_at, actor, list, film }
  | { kind: "coven_joined", created_at, actor, recipient };
```

`home/page.tsx` calls `getEnrichedFeed`, passes the array to
`FeedTabs`, which filters by URL `?tab=` and emits one
`<ActivityRow>` per item.

**Refetch on focus:** a tiny client-side effect in `FeedTabs` calls
`router.refresh()` on the `focus` event. Combined with `revalidatePath`
from the action wrappers, users see fresh data on tab activation and
after their own writes.

**Refresh button** in the feed header does the same.

## RecommendModal picker

`app/app/film/[id]/page.tsx` (Server Component) additionally calls
`getMyCovenMembers(client, viewerUserId)` when the viewer is authed
and passes the array into `<RecommendModal />` as a prop.

Two render states inside the existing modal body:

- Empty coven → zine-styled empty state + disabled submit.
- Non-empty → a native `<select>` with one option per coven member,
  value = member user id, label = `@handle · display_name`.

The `recommendFilm` action signature stays identical.

## Logout

Wire existing `signOut` action (already in `app/lib/actions/auth.ts`)
into two places:

1. TopNav avatar: the existing avatar link becomes a small dropdown
   with "Settings" + "Sign out". Dropdown is a client component.
2. Settings page: a "Sign out" button at the bottom, distinct from
   any account-delete flow (which doesn't exist yet).

This lands as Task 1 (pre-task) so multi-account testing works for
every subsequent task.

## Testing strategy

### `app/tests/actions/follows.test.ts` (3 tests)

- Follow inserts a row.
- Unfollow deletes the row.
- Follow is idempotent (re-follow doesn't throw).

### `app/tests/actions/coven.test.ts` (5 tests)

- `sendCovenRequest` inserts pending.
- Self-invite rejects (CHECK constraint).
- `acceptCovenRequest` transitions + trigger creates `coven_members`
  row.
- `declineCovenRequest` transitions + no `coven_members` row.
- `leaveCoven` deletes the `coven_members` row (requires new RLS
  policy from 0116 migration).

### `app/tests/actions/recommendations.test.ts` (grows by 1 test)

- Existing "can recommend" test adjusted so sender + receiver are
  coven members (seed in `beforeAll`).
- New: "cannot recommend to a non-coven user" — seeds two users
  without binding them as coven, asserts insert fails. If current
  RLS on `recommendations` allows any sender/recipient pair, this
  sub-project tightens it (small migration addition — already rolled
  into `0116`).

### No tests for

- Activity renderers — six small pure JSX functions. Visual
  regression is better caught by opening the page than by snapshot.
- `/people`, `/p/[handle]`, `/coven` route handlers — Server
  Components delegating to query helpers. Testing requires mocking
  RSC primitives; low value, high churn.

### Manual smoke at deploy

1. Sign in as user A.
2. Visit `/people`, search for user B, click to their profile.
3. Click Follow. Click Invite to Coven.
4. Sign out.
5. Sign in as user B.
6. Visit `/coven`. See A's pending invite. Accept.
7. Verify `coven_members` has the pair.
8. Visit a film detail page, click Recommend, pick A from the
   dropdown, send.
9. Sign out, sign in as A.
10. Visit `/home`. Verify feed shows B's coven-joined event and the
    recommendation-sent event.

## Migration

`db/migrations/0116_coven_leave_and_recommendations_scope.sql`:

```sql
-- Lets either participant leave a coven by deleting the members row.
CREATE POLICY coven_members_delete ON coven_members
  FOR DELETE TO authenticated
  USING (auth.uid() IN (user_a_id, user_b_id));

-- Tightens recommendations: senders must be coven-bound with the recipient.
-- Replace the existing insert policy if one exists, otherwise add one.
DROP POLICY IF EXISTS recommendations_insert ON recommendations;
CREATE POLICY recommendations_insert ON recommendations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    AND EXISTS (
      SELECT 1 FROM coven_members cm
      WHERE (cm.user_a_id = LEAST(from_user_id, to_user_id)
         AND cm.user_b_id = GREATEST(from_user_id, to_user_id))
    )
  );
```

## Out of scope

- Your Ledger widget (separate mini-spec after merge).
- Realtime activity feed (backlog; polling MVP).
- OAuth providers (tomorrow's sub-project).
- Password reset (backlog).
- Header search / global autocomplete.
- Profile page review section (staff reviewing UI doesn't exist).
- List detail page.
- Recommendations inbox (recipient surface).
- Invite email / push.
- Blocking / muting.
- Private profiles.
- Feed pagination.
- Typeahead in coven picker.
- Follower / coven counts on profile pages.

## Dependencies

- No new npm packages.
- One new migration (`0116`).
- No new env vars.
