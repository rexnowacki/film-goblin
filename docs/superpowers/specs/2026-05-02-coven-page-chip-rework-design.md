# Coven Page Chip Rework — Sub-project #34

**Status:** Spec draft.
**Goal:** Compress the "Your Coven" pane on `/coven` from per-member cards to a chip-row + search UX so the page scales gracefully past ~5 covenfolk. The "Find People" pane stays untouched.

## What changes

`/coven` left pane currently renders one card per coven member with avatar + username + Leave button. Above 5 covenfolk this becomes a long scroll of oversized cards.

New shape:

```
┌─ Your Coven (12) ──────── [ See all ] ┐
│  [chip] [chip] [chip] [chip]          │  ← top 4 by interaction score
│                                        │
│  🔍 [ Search your coven… ]            │  ← reuses RecommendModal pattern
│                                        │
│  ┌────────────────────────────────┐    │  ← results filter inline as user types
│  │ avatar  username   [Leave]     │    │     (only renders when search has chars)
│  │ avatar  username   [Leave]     │    │
│  └────────────────────────────────┘    │
└────────────────────────────────────────┘
```

- **Top 4 chips** — score-ordered. Tap navigates to `/p/<username>`.
- **Search input** — fuzzy substring filter against your coven only. Reuses `filterCovenMembers` helper from sub-project #29.
- **Results below search** — only renders when query is non-empty. Each row: avatar + username + Leave button (compact form, not the current 16-px-padded card).
- **"See all (N)" link** at the top-right of the section header — opens a `BottomSheet` with the full coven list (chip+username rows, scrollable). Same component family as RecommendModal / CommentSheet / AvatarEditor (#28).

## Interaction score

Three signals from the last 90 days, equally weighted, summed per counterpart user:

1. **Recommendations sent to them** — `activity` rows where `actor_user_id = me`, `kind = 'recommendation_sent'`, `payload.to_user_id = counterpart`
2. **Reactions on their activity** — `activity_reactions` rows where `user_id = me` AND the parent `activity.actor_user_id = counterpart`
3. **Comments on their activity** — `activity_comments` rows where `user_id = me` AND the parent `activity.actor_user_id = counterpart`

Score = count(1) + count(2) + count(3). 90-day window so the chip row reflects current relationships, not lifetime aggregate. Tie-break alphabetically by username.

Counterparts who aren't actually in your coven are filtered out — score is computed across all activity, then intersected with `getMyCovenMembers`. Coven members with score 0 sort last, alphabetically. The chip row picks the top 4; the "see all" modal lists everyone in the same order.

## What stays out of scope

- Pending invites strip — unchanged.
- "Find People" right pane — unchanged.
- Pagination of coven (the soft assumption is N < a few hundred; if a user ever has thousands of covenfolk we'll revisit).
- Per-chip badge for "new activity" / "they recommended you something" — appealing but a separate feature.

## Data + queries

### New: `app/lib/queries/coven-interactions.ts`

```ts
export interface CovenfolkRanked {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
}

export async function getRankedCovenfolk(
  client: Client,
  userId: string,
): Promise<CovenfolkRanked[]>;
```

Implementation pattern follows `getTopRecommendedCovenMemberIds` in `app/lib/queries/recommendations.ts` — three separate fetches (one per signal), aggregate counts in JS, intersect with `getMyCovenMembers`. Aggregation in app code rather than SQL because PostgREST doesn't support `GROUP BY`. At expected scale (≤a few hundred coven rows × ≤a few hundred interactions each in a 90-day window), this is cheap; promote to an RPC if it stops being.

Query shapes:
1. `activity.select('payload').eq('actor_user_id', userId).eq('kind', 'recommendation_sent').gte('created_at', ninetyDaysAgo)` → count by `payload.to_user_id`
2. `activity_reactions.select('activity:activity!inner(actor_user_id)').eq('user_id', userId).gte('created_at', ninetyDaysAgo)` → count by `activity.actor_user_id`
3. `activity_comments.select('activity:activity!inner(actor_user_id)').eq('user_id', userId).gte('created_at', ninetyDaysAgo)` → count by `activity.actor_user_id`

Sum the three count maps per user id. Intersect with the user's coven member list (members with score 0 still appear, sorted alphabetically last). Return all covenfolk in score-DESC, then alphabetical-ASC order.

### Reused: `filterCovenMembers` from `app/lib/recommend-filter.ts`

Already a pure helper with 7 unit specs from #29. Drops in cleanly for the search input.

## Components

### New: `app/components/coven/CovenChipRow.tsx`

Client component. Props: `members: CovenfolkRanked[]` (full ranked list). Renders:
- 4 horizontal avatar chips (tap → `/p/<username>`)
- Search input (controlled state)
- Inline filtered list when search has chars (compact rows: avatar + username + Leave button)
- "See all (N)" link in the section header → opens `<CovenSeeAllSheet>`

Search uses `filterCovenMembers(members, query)` matching the RecommendModal pattern.

### New: `app/components/coven/CovenSeeAllSheet.tsx`

`BottomSheet`-based modal. Title: "Your Coven · N". Body is a scrollable column of compact rows (avatar + username, tap navigates to `/p/<username>`, with a small Leave button on the right). Same score order as the home chip row (top scorers first, then alphabetical for unscored / ties).

### Modified: `app/app/coven/page.tsx`

Replace the entire "Your Coven" left pane (lines 112–151 in current state) with `<CovenChipRow members={ranked} />`. The pane keeps its half of the two-pane layout so "Find People" continues on the right at desktop widths.

### Mobile responsive

The page already uses `.stackable` w/ 720px breakpoint. Below 720, "Your Coven" stacks above "Find People". The chip row + search are mobile-friendly by construction (chips wrap, search is full-width).

## Empty / edge cases

- **Zero covenfolk:** chip row hidden; show the existing "Your coven is empty" italic copy. Search input also hidden. "See all" link hidden.
- **1–4 covenfolk:** chip row shows N chips. "See all" link hidden (everyone fits in the chips). Search input hidden too.
- **5+ covenfolk:** chip row shows top 4 + "See all (N)" link.
- **All zero-score:** chip row shows the alphabetically-first 4. Score doesn't have to be positive to surface.
- **Search no matches:** "No covenfolk match." italic copy below the input.

## Test surface

- **`getRankedCovenfolk` integration spec** (env-skipIf-gated, lives at `app/tests/queries/coven-interactions.test.ts`): seed a film + coven of 3 users, exercise each signal independently, verify ranking is `(rec×2) + (reaction×1) + (comment×1) = 4 > (rec×1) = 1 > (no signal) = 0`, verify alphabetical tie-break.
- **`<CovenChipRow>` shape**: visual smoke on Vercel preview. No unit-level component tests.

## Files

| File | Status |
|---|---|
| `app/lib/queries/coven-interactions.ts` | new |
| `app/components/coven/CovenChipRow.tsx` | new |
| `app/components/coven/CovenSeeAllSheet.tsx` | new |
| `app/app/coven/page.tsx` | modified (replace left pane) |
| `app/tests/queries/coven-interactions.test.ts` | new |

No schema, no migration, no types regen, no new deps. CSS additions: a small `.coven-chip` block + `.coven-row` compact-row block in `app/app/globals.css`.

## Open questions answered during brainstorm

| Q | Answer |
|---|---|
| Interaction signal | Broader: rec_sent + reactions + comments, equal weight, last 90 days |
| Page shape | Chips + search + see-all modal; results filter inline (no full coven list on the page itself outside search) |
| Chip tap | Navigate to `/p/<username>` |
| See-all modal type | `BottomSheet` (matches existing pattern post-#28) |
| See-all sort | Score DESC then alphabetical ASC for ties / zero-score tail |

## Risks

1. **Aggregation in JS over potentially many activity rows.** At a covenfolk count of 50 with 100 reactions/comments each in 90 days, we're scanning ~5k rows. Fine. If a user with thousands of covenfolk ever signs up, promote to a stored procedure. Documented inline.
2. **`CovenfolkRanked` shape close to existing `CovenMember` from `getMyCovenMembers`.** Could reuse the existing type + add `score?: number`. Spec says "new type" for clarity; implementer can fold them if it reads cleaner.
