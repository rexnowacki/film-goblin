# Recommend modal — top-covenfolk chips + fuzzy search picker

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #29

## Background

Sub-project #28 converted `RecommendModal` to a `BottomSheet`. The form body still uses a native `<select>` for picking a coven member. On iOS, native `<select>` opens a system wheel picker that ignores all our styling — looks generic, breaks the dark-panel aesthetic. On desktop the styled `<select>` works but the dropdown's options list still looks like an OS dropdown, not part of the app.

The user wants a picker UI that lives entirely inside the sheet, doesn't fight the OS for control, scales as covens grow, and prioritizes the people they actually recommend to.

## Goal

Replace the `<select>` with:
1. A search input at the top of the body (placeholder: "Search covenfolk…").
2. A horizontal-scroll row of 6–8 avatar chips for "top covenfolk" — defined as the people you've sent the most recommendations to recently.
3. A filtered list of remaining covenfolk as the user types in the search. Empty search shows nothing here (just the chips).
4. Selected member is highlighted with `var(--accent)`.

## Non-goals

- Schema changes. The "top covenfolk" signal is computed from existing `activity` rows.
- Caching the top-covenfolk list. Compute on demand at modal-open time. (If perf becomes a concern later, easy to memo.)
- A general-purpose "user picker" primitive. This is local to RecommendModal for now.
- Changing the trigger button (`✦ Recommend To A Coven Member`).
- Changing the post-send state, toast, or sheet header from sub-project #28.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| "Top" signal | Count of `activity` rows where `kind = 'recommendation_sent'` and `actor_user_id = me` and `payload.to_user_id = covenmate.id`, ordered DESC | Semantically right for a recommend modal — show the people you actually recommend to |
| Fallback when user has zero recommendations sent | Alphabetical by `username` | Stable, predictable, no secondary signal needed |
| How many chips | Up to 8, less if coven is smaller | Fits a single horizontal row on iPhone |
| Search algorithm | Case-insensitive substring match against `username` AND `display_name` | YAGNI; fuzzy lib if it ever feels needed |
| Selection state | New piece of `useState<string \| null>(null)` for `selectedUserId` | Controlled selection; replaces the form's `name="to_user_id"` value |
| Submit behavior | Disabled until `selectedUserId !== null` | Prevents the existing "Pick a coven member." error path entirely |
| Chip layout | Horizontal flex row, `overflow-x: auto`, native scroll. Avatar (44px) + username (caps 11px) below | Same shape as `/coven` member chips |
| Search filter scope | All covenfolk, including those shown as chips | A user can pick a top-chip via search too — predictable |
| Empty-search state | Show only chips, not the rest of the list | Keeps the body clean; full list appears as you type |
| Selection highlight | 2px `var(--accent)` ring around the chip / row + accent text color | Matches the existing accent-pink visual language |

## Architecture

### Data: new query

Add to `app/lib/queries/recommendations.ts` (or wherever recommendation queries live; check first):

```ts
/**
 * Returns the IDs of coven members the current user has sent
 * recommendations to most often, ranked desc by count. Used to seed
 * the "top covenfolk" chips in RecommendModal.
 *
 * Returns empty array for users who've never recommended.
 */
export async function getTopRecommendedCovenMemberIds(
  client: Client,
  userId: string,
  limit = 8,
): Promise<string[]> {
  const { data, error } = await client
    .from("activity")
    .select("payload")
    .eq("actor_user_id", userId)
    .eq("kind", "recommendation_sent");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const toId = (row.payload as { to_user_id?: string })?.to_user_id;
    if (toId) counts.set(toId, (counts.get(toId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
```

Alternative server-side (a single SQL via raw RPC or `.from("activity").select(...).group(...)`): PostgREST doesn't support `GROUP BY` natively; doing the count in app code is fine and clear at this scale (≤ a few hundred recommendations per user). If a user ever has 10k+ recommendations sent the in-app aggregation will degrade — at that point promote to an RPC or materialized view.

### Component: existing `RecommendModal.tsx`

The component already receives `covenMembers: CovenMember[]`. Add a new prop `topCovenMemberIds: string[]` populated by the parent's call to `getTopRecommendedCovenMemberIds`. The component reorders covenfolk into:
- `topMembers`: covenfolk whose `id` is in `topCovenMemberIds`, in the order they appear there.
- `restMembers`: covenfolk not in `topCovenMemberIds`, sorted alphabetically by `username`.

If `topCovenMemberIds` is empty (user has never recommended), `topMembers` falls back to the first 8 of the alphabetical-username list — so the chip row is still useful for new users.

### UI inside the sheet body (replaces the form's `<select>`)

```
┌─────────────────────────────────────────────────────────┐
│  Search covenfolk…                                      │
└─────────────────────────────────────────────────────────┘

[avatar] [avatar] [avatar] [avatar] [avatar] [avatar]  →
 username username username  …                  (scrolls)

(filtered list appears here as user types)

A Whisper
┌─────────────────────────────────────────────────────────┐
│  watch this one alone, with the lights off…            │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘

      [ ✦ Seal & Send ]   ← disabled until a chip is picked
```

Chip styling:
- 44px round avatar.
- Username caps below, 11px, ellipsized at ~10 chars.
- Default: transparent background, 1px transparent border.
- Selected: 2px `var(--accent)` border on the avatar; username color → `var(--accent)`.
- Tappable area = the whole chip box.

Filtered list row styling (rendered when search is non-empty):
- Same shape as the chip but laid out horizontally — avatar + username + display_name on one line. ~Mirror the `/coven` member row.
- Selected highlight identical to chip selection.
- Anonymous viewer: not applicable; this is a logged-in flow.

Search input styling:
- Inherit the `composer-pill` look from CommentComposer for visual continuity.
- `border: 1px solid var(--muted)`, `border-radius: 999px`, `background: transparent`, `color: var(--bone)`, `padding: 8px 14px`.

### Selection lifecycle

```ts
const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
const [search, setSearch] = useState("");
```

- Submit disabled until `selectedUserId !== null`.
- `close()` (from sub-project #28) also resets `selectedUserId` and `search`.
- On send, send `selectedUserId` directly — drop the FormData round-trip; submit handler reads from state.
- Picking a chip OR a filtered-list row sets `selectedUserId`. Tapping a selected one again clears it (toggles).

### Search filter

```ts
const norm = search.trim().toLowerCase();
const filtered = norm.length === 0
  ? []
  : covenMembers.filter(m =>
      m.username.toLowerCase().includes(norm) ||
      (m.display_name?.toLowerCase().includes(norm) ?? false)
    );
```

When `norm.length === 0`, only the chip row + the existing empty state render. As the user types, the filtered list appears below the chips.

### Caller wiring

`app/app/film/[id]/page.tsx` (and any other caller of `<RecommendModal />`) needs the new prop. The page is a server component that already fetches `covenMembers`; it adds one parallel call to `getTopRecommendedCovenMemberIds(supabase, user.id)` in the existing `Promise.all` block.

## Files affected

**Modified:**
- `app/lib/queries/recommendations.ts` (new export `getTopRecommendedCovenMemberIds`; if the file doesn't exist, create it).
- `app/components/RecommendModal.tsx` (replace `<select>` with chips + search + filtered list; add `topCovenMemberIds: string[]` prop; lift selection to component state).
- `app/app/film/[id]/page.tsx` (add the new query to the Promise.all + thread the prop through).
- `CLAUDE.md` and `docs/sub-project-history.md` (sub-project #29 row).

**Untouched:**
- `BottomSheet`, `Avatar`, all toast/notification machinery.
- The `recommendFilm` server action — its API stays the same.
- All other modals.

## Tests

No automated tests today exercise RecommendModal's rendering. Two new tiny units are worth adding:

- **`app/tests/queries/top-recommended-coven-member-ids.test.ts`** — env-skipIf integration. Insert two recommendation_sent activity rows for userA → userB, one for userA → userC, assert ranked array `[userB, userC]`. Insert nothing for userD → assert empty array.
- **`app/tests/components/recommend-modal-search.test.ts`** — pure-function test of the search filter logic (extract the filter helper for testability, rather than testing the component). Verifies substring match on username + display_name, case insensitivity, no-match returns empty.

Manual smoke on Vercel preview after merge:
- Open `/film/[id]` → Recommend → confirm sheet body shows search bar + chip row + (no filtered list) when empty.
- Type a partial username → confirm filtered list appears, selection highlights work.
- Pick a chip → confirm Submit becomes enabled, send completes, toast fires.
- Close + reopen → confirm fresh state.
- Test on a fresh account (no prior recommendations) → confirm chip row falls back to alphabetical.

## Risk register

- **Top-covenfolk computation cost.** App-side aggregation over all `activity` rows for the user. At ≤500 recommendations sent, fine. At ≥10k, slow. Promote to RPC/view if it ever matters.
- **Avatar shape on chip.** The existing `<Avatar>` component renders fallback initials when `url` is null. With the spec's accent-ring on selection, the ring should sit on the OUTSIDE of the avatar (not overlap initials). One CSS tweak; verify on impl.
- **Empty coven state.** Already handled by the existing `covenMembers.length === 0` early return.
- **Long usernames clipping in chip captions.** Use `text-overflow: ellipsis; white-space: nowrap; max-width: 60px` on the caption. Tap-target stays full width.

## Open questions

None. All scope decisions locked.
