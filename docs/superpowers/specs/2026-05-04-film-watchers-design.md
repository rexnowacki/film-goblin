# Film Watchers — "Who's Watching" Strip

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface coven members and other discoverable users who have a film on their watchlist or in their library, directly on the film detail page — enabling organic user discovery through shared taste.

**Architecture:** Two new parallel queries feed a new `FilmWatchersStrip` client component inserted in the film hero block. A new `discoverable` column on `profiles` controls visibility in the "others" list. One new migration, one new query file, one new component, small additions to the film page and settings.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres, TypeScript, existing BottomSheet + pill-row patterns.

---

## UI

### Hero strip

A `FilmWatchersStrip` row sits inside the `film-hero-text` div, immediately after the `hero-actions` div (below the Watch / Scroll / Recommend / Buy buttons). Only rendered for authenticated users.

**States:**

| Coven watchers | Other watchers | Display |
|---|---|---|
| ≥1 | ≥1 | Avatar chips (up to 4) + `· +N others →` |
| ≥1 | 0 | Avatar chips only |
| 0 | ≥1 | `N goblins tracking this →` (no chips) |
| 0 | 0 | Hidden — renders nothing |

**Avatar chips:** 24px circles, stacked with -6px overlap, up to 4 shown. Same Avatar component used elsewhere. Label "Watching" in muted 10px caps to the left.

**"+ N others →" / "N goblins tracking this →":** tappable text link in accent color. Opens the Others BottomSheet.

### Others BottomSheet

- Title: "Also Watching"
- Scrollable list using the existing `pill-row` pattern: `Avatar (32px) + username`
- Each row links to `/p/[username]` (profile link only — no inline invite button)
- If `totalCount > users.length` (i.e. > 50): show a muted footer "and N more"
- Uses existing `BottomSheet` component

---

## Data Model

### Migration `0160_discoverable.sql`

```sql
ALTER TABLE profiles
  ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT true;
```

Default `true`: all existing users are immediately visible in "others" lists without requiring an opt-in action.

**Rationale for separate flag:** `broadcast_watchlist_adds` controls the activity feed (who sees your watchlist additions in their feed). `discoverable` controls film-page social presence (whether you appear in "who's watching" lists). These are orthogonal concerns — a user may want to broadcast to their feed but not appear to strangers on film pages, or vice versa.

---

## Query Layer

New file: `app/lib/queries/film-watchers.ts`

### `getCovenWatchersForFilm(client, userId, filmId)`

Returns coven members of `userId` who have `filmId` on their watchlist **or** in their library.

- Joins `coven_members` (bidirectional edge — check both `user_a_id` and `user_b_id`) with `watchlists` UNION `library`, filtered to `film_id = filmId`
- `discoverable` flag is **not** checked — coven members always appear regardless of their privacy setting
- Returns `{ id, username, avatar_url }[]`
- Hard cap: `LIMIT 4` (only 4 chips are ever rendered)

### `getOtherWatchersForFilm(client, userId, filmId, limit = 50)`

Returns non-coven, discoverable users who have `filmId` on their watchlist or in their library.

- Queries `watchlists` UNION `library` for `film_id = filmId`
- Joins `profiles` on `user_id`, filters `discoverable = true`
- Excludes `userId` (current user) and all coven members of `userId`
- Returns `{ users: { id, username, avatar_url }[], totalCount: number }`
- `users` ordered alphabetically by `username`; capped at `limit` (default 50)
- `totalCount` is the uncapped count for the "and N more" footer

---

## Component

### `app/components/FilmWatchersStrip.tsx`

Client component (`"use client"`).

**Props:**
```ts
interface Props {
  covenWatchers: { id: string; username: string; avatar_url: string | null }[];
  otherWatchers: { id: string; username: string; avatar_url: string | null }[];
  otherCount: number;
}
```

**Behaviour:**
- Returns `null` if `covenWatchers.length === 0 && otherCount === 0`
- Manages `open: boolean` state for the BottomSheet
- Renders the avatar chip row and/or "N others" link
- BottomSheet lists `otherWatchers` as `pill-row` items, each as a `<Link prefetch={false} href={/p/[username]}>`, then a muted footer if `otherCount > otherWatchers.length`

Uses existing components: `Avatar`, `BottomSheet`, `Link`.

---

## Film Page Integration

`app/app/film/[id]/page.tsx`:

1. Add two queries to the auth-gated `Promise.all`:
   ```ts
   getCovenWatchersForFilm(supabase, user.id, id),
   getOtherWatchersForFilm(supabase, user.id, id),
   ```

2. Render inside `film-hero-text`, after the `hero-actions` div:
   ```tsx
   {user && (
     <FilmWatchersStrip
       covenWatchers={covenWatchers}
       otherWatchers={otherResult.users}
       otherCount={otherResult.totalCount}
     />
   )}
   ```

No changes to the anon (logged-out) view.

---

## Settings Integration

`app/app/settings/SettingsForm.tsx`:

1. Add `discoverable` to `ProfileFields` type (boolean)
2. Add a checkbox toggle near the existing broadcast toggles:
   - Label: "Show me in 'who's watching' on film pages"
   - Sublabel (muted): "Other members can see you're tracking a film when they visit its page."
3. The existing `_updateProfile` spread pattern handles the DB write — no new action needed.

`app/lib/supabase/types.ts`: add `discoverable: boolean` to `profiles` Row / Insert / Update.

---

## Privacy Rules Summary

| Flag | Controls |
|---|---|
| `broadcast_watchlist_adds` | Whether your watchlist additions appear in other users' activity feeds |
| `discoverable` | Whether you appear in "who's watching" lists on film pages (to non-coven users) |

Coven members always appear in each other's strip regardless of `discoverable` — the flag only governs visibility to non-coven users.

---

## What's Not In Scope

- Watched films (only watchlist + library; "watched" is a separate signal)
- Discovery on surfaces other than `/film/[id]`
- Pagination in the BottomSheet (50-user cap + "and N more" footer is sufficient at current scale)
- Inline coven invite from the BottomSheet (profile link only; invite from `/p/[username]`)
- Showing the strip to logged-out users
