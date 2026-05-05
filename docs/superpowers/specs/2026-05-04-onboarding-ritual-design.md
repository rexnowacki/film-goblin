# Onboarding Ritual Redesign — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

---

## Goal

Replace the current single-page onboarding form (username + film grid + threshold slider) with a three-step ritual that builds taste signal, populates the watchlist, and wires up a starter social graph — so a new user lands on `/home` with a meaningful feed instead of an empty void.

---

## Architecture

The onboarding page becomes a multi-step client component. Three sequential steps collect: (1) username + horror flavor preferences, (2) films to add to the watchlist, (3) starter accounts to follow. On submit, a single extended `completeOnboarding` server action writes all state atomically.

A new `is_starter` flag on profiles powers both step 3's picker UI and a "From the Goblins" activity section on `/home` that shows up once the user follows any starter account.

---

## Data Model

### Migration: `db/migrations/0163_starter_profiles.sql`

```sql
ALTER TABLE profiles
  ADD COLUMN is_starter    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN starter_order INT;
```

- `is_starter`: marks staff/seed accounts shown in the CovenStep picker
- `starter_order`: controls display order in the picker grid; NULLs sort last

No new tables. No RLS changes (profiles already readable by authenticated users).

---

## File Map

| Action | Path |
|--------|------|
| Modify | `db/migrations/0163_starter_profiles.sql` (new) |
| Modify | `app/lib/supabase/types.ts` — add `is_starter`, `starter_order` to profiles Row/Insert/Update |
| Modify | `app/lib/actions/onboarding.ts` — extend `OnboardingPayload` + `_completeOnboarding` |
| Replace | `app/app/onboarding/OnboardingForm.tsx` → `OnboardingWizard.tsx` |
| Create | `app/app/onboarding/TasteStep.tsx` |
| Create | `app/app/onboarding/FilmsStep.tsx` |
| Create | `app/app/onboarding/CovenStep.tsx` |
| Modify | `app/app/onboarding/page.tsx` — fetch starters + lane-filtered films, wire wizard |
| Create | `app/lib/queries/followed-activity.ts` |
| Modify | `app/app/home/page.tsx` — add "From the Goblins" panel |
| Create | `app/components/FollowedActivityFeed.tsx` |

---

## Onboarding Wizard

### `OnboardingWizard.tsx`

Thin orchestrator. Owns `step` state (1 / 2 / 3) and the three collected values:

```ts
const [step, setStep] = useState<1 | 2 | 3>(1);
const [selectedLaneTagIds, setSelectedLaneTagIds] = useState<string[]>([]);
const [watchlistFilmIds, setWatchlistFilmIds] = useState<string[]>([]);
const [starterFollowIds, setStarterFollowIds] = useState<string[]>([]);
```

On final submit calls `completeOnboarding` with all four values. Passes `onNext` / `onBack` callbacks to each step. No TopNav/BottomNav on the wizard — full-screen focused flow.

Progress indicator: three dots (filled = current/complete, outlined = pending) at the top of the card.

---

### Step 1 — TasteStep

**Purpose:** collect username + horror flavor preferences.

**Layout:** centered card on dark void background. Username input at top. Below it, eight flavor cards in a 2×4 grid (or 4×2 on desktop).

**Flavor cards → tag name mapping:**

| Card label | Tag name |
|------------|----------|
| Folk Rot | folk horror |
| Velvet Murder | giallo |
| Witchcraft | witchcraft |
| Flesh Trouble | body horror |
| Star Madness | cosmic horror |
| Holy Terror | religious horror |
| Slow Doom | arthouse horror |
| Trash Magic | midnight movie |

Each card shows the flavor label in display font + a one-line descriptor in serif italic. Cards are toggleable; selected state gets accent border + background tint. No minimum selection required — a user who picks nothing gets the editorial-starter fallback on step 2.

**Receiving `laneTagIds`:** The wizard looks up tag UUIDs from tag names at page-server-load time (queried in `onboarding/page.tsx`) and passes them down as a `laneTagMap: Record<string, string>` prop so TasteStep can return UUIDs without doing any DB calls.

**Validation:** username must match `/^[a-z0-9._]+$/` and be non-empty. "Next" button disabled until valid.

**Props:**
```ts
interface TasteStepProps {
  initialUsername: string;
  laneTagMap: Record<string, string>; // tagName → tagId
  onNext: (username: string, laneTagIds: string[]) => void;
}
```

---

### Step 2 — FilmsStep

**Purpose:** pick films to add to watchlist.

**Film source:** `onboarding/page.tsx` pre-fetches a single wide set at server-render time:

```ts
// All films that are either editorial_starter OR carry any flavor tag
const flavorTagIds = Object.values(laneTagMap); // 8 UUIDs from flavor table lookup
const { data: films } = await supabase
  .from("films")
  .select("id, itunes_id, title, director, year, genre_primary, artwork_url, editorial_starter, film_tags(tag_id)")
  .or(`editorial_starter.eq.true,film_tags.tag_id.in.(${flavorTagIds.join(",")})`)
  .eq("available", true)
  .limit(96);
```

`FilmsStep` receives this full pre-loaded set plus the `laneTagIds` the user picked in step 1. It filters client-side:
- If `laneTagIds` non-empty: show films that have any of the selected tag IDs; if result < 6, fall back to the full set
- If `laneTagIds` empty: show all films in the set (editorial_starter covers all)

No additional network request. The wizard passes `laneTagIds` as a prop when mounting FilmsStep.

**Layout:** same poster grid as current OnboardingForm. Tappable posters toggle selection. Selected posters get accent outline. Minimum 3 required to unlock "Next."

**No threshold slider.** Price threshold is dropped entirely — too much friction for a first-run user. The action will insert watchlist rows with `max_price_usd = null` (no alert threshold).

**Props:**
```ts
interface FilmsStepProps {
  films: DbFilm[];          // pre-loaded wide set from server
  laneTagIds: string[];     // user's selections from TasteStep
  onNext: (filmIds: string[]) => void;
  onBack: () => void;
}
```

**`DbFilm`** — same shape as current `OnboardingForm.tsx` plus a `tagIds: string[]` field (from the `film_tags` join), exported from the new component.

---

### Step 3 — CovenStep

**Purpose:** follow starter accounts to seed the social graph.

**Layout:** a grid of avatar + username chips. All starters pre-selected on mount (`starterFollowIds` initialised to all starter IDs). User can deselect. Minimum: 0 (skip is valid).

**Starter profiles** fetched in `onboarding/page.tsx`:
```ts
const { data: starters } = await supabase
  .from("profiles")
  .select("id, username, display_name, avatar_url")
  .eq("is_starter", true)
  .order("starter_order", { ascending: true, nullsLast: true })
  .limit(20);
```

Each chip: Avatar (40px) + username below. Selected = accent border ring. Tap toggles.

**"Begin" button** triggers the final submit. Shows spinner while submitting.

**Props:**
```ts
interface CovenStepProps {
  starters: StarterProfile[];
  onSubmit: (followIds: string[]) => void;
  onBack: () => void;
  submitting: boolean;
}
```

---

## `completeOnboarding` Action Changes

### Extended payload

```ts
export interface OnboardingPayload {
  username: string;
  watchlistFilmIds: string[];
  laneTagIds: string[];      // new — written to profiles.lane_tag_ids
  starterFollowIds: string[]; // new — inserts into follows table
  // thresholdPct removed
}
```

### Changes to `_completeOnboarding`

1. **Profile update** gains `lane_tag_ids: p.laneTagIds`
2. **Watchlist inserts** use `max_price_usd: null` (threshold removed)
3. **Follows inserts** — after the watchlist loop:
   ```ts
   for (const targetId of p.starterFollowIds) {
     const { error } = await client
       .from("follows")
       .insert({ follower_id: user.id, followed_id: targetId });
     if (error && error.code !== "23505") throw error;
   }
   ```
4. Invite-cookie logic unchanged.

---

## Home Feed — "From the Goblins" Panel

### `app/lib/queries/followed-activity.ts`

New query: fetches the 10 most recent `activity` rows from users the viewer follows (via the `follows` table — NOT coven-scoped).

```ts
export async function getFollowedActivity(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<EnrichedActivity[]>
```

Implementation:
1. Fetch `follows WHERE follower_id = userId` → array of `followed_id`
2. If empty, return `[]` immediately
3. Fetch `activity WHERE user_id IN (followedIds)` ordered `created_at DESC` LIMIT 10, with the same actor + film + list + recipient joins as the existing `getActivity` helper
4. Enrich with reactions + comments using existing helpers
5. Return flat (no grouping) — these are individual rows in a compact feed

### `app/components/FollowedActivityFeed.tsx`

Client component that renders the followed-activity rows as a compact list. Each row: Avatar (28px) + `username` + activity summary line + film poster thumbnail (if applicable) + timestamp. No heart/comment controls — read-only strip, not a full feed.

### `app/app/home/page.tsx` changes

In the server component's data-fetch, after the existing coven queries:

```ts
const followedActivity = user ? await getFollowedActivity(supabase, user.id) : [];
```

Render a new section below the coven feed section, visible only when `followedActivity.length > 0`:

```tsx
{followedActivity.length > 0 && (
  <section style={{ padding: "36px 0" }}>
    <div className="container-wide">
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>
        From the Goblins
      </div>
      <FollowedActivityFeed items={followedActivity} />
    </div>
  </section>
)}
```

---

## What's Out of Scope

- **Unfollow UI** — not part of this feature; follows are one-directional writes for now
- **Editing starter accounts** — `is_starter` / `starter_order` set directly in DB by admin; no UI widget
- **Price threshold** — removed from onboarding entirely; power users can set it via watchlist item edit later
- **Step back from TasteStep to login** — no back button on step 1; no need
- **Email confirmation flow** — unchanged; `email_confirm: true` bypass still applies
- **Display name** — not collected during onboarding (username only, consistent with #26's username-first direction)

---

## Testing

- Unit: `TasteStep` renders 8 flavor cards; selecting one calls `onNext` with the matching tag UUID
- Unit: `FilmsStep` locks "Next" below 3 selections; unlocks at 3
- Unit: `CovenStep` pre-selects all starters; deselecting one removes it from the submit payload
- Integration (`describe.skipIf(!hasEnv)`): `_completeOnboarding` with `laneTagIds` + `starterFollowIds` → verify `profiles.lane_tag_ids` updated, follows rows inserted, watchlist rows have `max_price_usd = null`
- Integration: `getFollowedActivity` returns rows from followed users only, empty for user with no follows
