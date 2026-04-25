# Library (Owned) — C1 Design

**Status:** spec
**Date:** 2026-04-25
**Sub-project:** C1 of the Library/Watched/Social-signal trio (C2 = Watched action, B2 = Social signal on posters; both deferred).

## Goal

Track films a user owns. Owned films are excluded from `/films` discovery. Library is coven-visible by default (gated by a profile broadcast flag). New `/library` route lists the user's owned films. Foundation for C2 (Watched) and B2 (Social signal) — `films_with_stats` gains an `owned_count` aggregate now so B2 can consume it later.

## What ships

1. **Schema** — new `library` table with composite PK `(user_id, film_id)`, RLS owner-or-coven-with-flag, `created_at` only. New `profiles.broadcast_library` boolean (default TRUE). `films_with_stats` view extended with `owned_count`.
2. **Auto-cleanup** — adding to library silently deletes the watchlist row for the same `(user, film)`. Lives in the server action, not a DB trigger.
3. **Discovery filter** — `/films` excludes films the authed viewer owns. Anon viewers see everything.
4. **OwnedButton** — sibling of `WatchlistButton` on `/film/[id]`. Optimistic toggle.
5. **FilmActions wrapper** — small client wrapper coupling watchlist+library state on the film detail page so the auto-cleanup is reflected in the UI without a round-trip.
6. **`/library` route** — new top-nav entry between `Watchlist` and `Lists`. Grid of owned films, sort = recently added, no sort UI for v1.
7. **Settings toggle** — "Show your library to coven members" wired to `profiles.broadcast_library`.

## Out of scope

- The Watched action / `/watched` route → C2.
- Activity feed broadcast on library adds (no `library_added` event, no fan-out trigger) → indefinite defer.
- Quick-toggle on `/films` cards → film detail page only for v1.
- Bulk "import from watchlist" or other onboarding workflows → only if empty-library proves a real problem.
- Coven library views ("show me Sarah's library") → RLS allows it but no UI surface in v1.
- Per-ownership metadata (HD/4K, purchase date as distinct from `created_at`, format) → YAGNI for v1.
- Apple TV API integration to auto-detect ownership → no such integration exists.
- B2 itself (poster badges consuming `owned_count`) → next sub-project after C1.
- Discovery filter user-override toggle ("show me my owned films in the Archive anyway") → no override; if owned, hidden.

## Locked design decisions (clarifying-question outcomes)

| Q | Decision |
|---|---|
| Library route shape | Dedicated `/library` route, sibling of `/watchlist`. |
| Watchlist + Library overlap | Auto-remove from watchlist on library-add. Silent (no toast). |
| Coven visibility | Coven-visible by default; `profiles.broadcast_library` flag (default TRUE). RLS allows owner OR coven-mate-with-flag. |
| Owned toggle UI placement | `/film/[id]` only (next to `WatchlistButton`). |
| Activity feed broadcast | No broadcast in v1. |

## Section 1 — Data model

**New migration:** `db/migrations/0122_library.sql`.

```sql
-- C1: Library — track films a user owns. Coven-visible by default
-- (gated by profiles.broadcast_library); discovery filter excludes
-- viewer's owned films from /films.

-- 1. The library table
CREATE TABLE library (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);

CREATE INDEX library_film_id_idx ON library (film_id);
CREATE INDEX library_user_created_idx ON library (user_id, created_at DESC);

-- 2. Profile broadcast flag
ALTER TABLE profiles
  ADD COLUMN broadcast_library BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. RLS
ALTER TABLE library ENABLE ROW LEVEL SECURITY;

-- Owner always sees their own. Coven members see fellow members' rows
-- when the target has broadcast_library = TRUE.
-- coven_members is a graph-edge table: each row stores one undirected
-- coven relationship as (user_a_id, user_b_id) with user_a_id < user_b_id.
-- "I am in the same coven as X" = "there's an edge between auth.uid() and X".
CREATE POLICY library_select ON library
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM coven_members cm
        WHERE (cm.user_a_id = auth.uid() AND cm.user_b_id = library.user_id)
           OR (cm.user_a_id = library.user_id AND cm.user_b_id = auth.uid())
      )
      AND (SELECT broadcast_library FROM profiles WHERE id = library.user_id) IS TRUE
    )
  );

CREATE POLICY library_insert ON library
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY library_delete ON library
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON library TO authenticated;

-- 4. Extend films_with_stats with owned_count (for B2's poster badges).
DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
```

**Decisions:**
- **No surrogate `id` column.** Composite PK `(user_id, film_id)` is the natural unique key. Same shape `activity_reactions` shipped with.
- **No UPDATE policy.** Rows are immutable; toggle = INSERT/DELETE.
- **No fan-out trigger** (Q5 lock).
- **Auto-remove from watchlist** lives in the server action, not a DB trigger — debuggable, reversible, doesn't couple library and watchlists at the DB layer.
- **`coven_members` table:** existing table from migration `0104_coven.sql`. Verified: graph-edge model with columns `(user_a_id, user_b_id, created_at)` and a `user_a_id < user_b_id` CHECK constraint. RLS clause uses an OR'd EXISTS over both directions of the edge.

## Section 2 — Server actions + queries

**New file:** `app/lib/actions/library.ts` — private-action + public-wrapper pattern, mirrors `app/lib/actions/watchlists.ts`.

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _addToLibrary(client: Client, filmId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");

  const { error: insertErr } = await client
    .from("library")
    .insert({ user_id: user.id, film_id: filmId });
  // Swallow "already in library" duplicates (PK violation, code 23505).
  if (insertErr && insertErr.code !== "23505") throw insertErr;

  // Auto-remove from watchlist (silent — no error if it wasn't there).
  await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
}

export async function _removeFromLibrary(client: Client, filmId: string): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("library")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToLibrary(filmId: string) {
  const supabase = await createClient();
  await _addToLibrary(supabase, filmId);
  revalidatePath("/library");
  revalidatePath("/watchlist");
  revalidatePath("/films");
  revalidatePath(`/film/${filmId}`);
}

export async function removeFromLibrary(filmId: string) {
  const supabase = await createClient();
  await _removeFromLibrary(supabase, filmId);
  revalidatePath("/library");
  revalidatePath("/films");
  revalidatePath(`/film/${filmId}`);
}
```

**New file:** `app/lib/queries/library.ts` — read-side helpers.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function getOwnedFilmIds(client: Client, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.film_id);
}

export async function getLibrary(client: Client, userId: string) {
  const { data, error } = await client
    .from("library")
    .select(`
      created_at,
      film:films!inner(
        id, itunes_id, title, director, year, runtime_min,
        genre_primary, artwork_url
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function isInLibrary(client: Client, userId: string, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("library")
    .select("film_id")
    .eq("user_id", userId)
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}
```

**Modify `app/lib/queries/films.ts`:** `getFilms` accepts a new `viewerUserId?: string | null` opt and excludes the viewer's owned films from the result via `.not("id", "in", "(…)")`.

```ts
if (opts.viewerUserId) {
  const ownedIds = await getOwnedFilmIds(client, opts.viewerUserId);
  if (ownedIds.length > 0) {
    query = query.not("id", "in", `(${ownedIds.map(id => `"${id}"`).join(",")})`);
  }
}
```

`/films/page.tsx` reads `viewerUserId` (or null) at the top and passes it through.

## Section 3 — UI

### `OwnedButton` component

`app/components/OwnedButton.tsx` — copy-modify of `WatchlistButton.tsx`, accepts `onAdded?: () => void` callback so the parent can mirror the silent watchlist auto-cleanup in client state.

### `FilmActions` wrapper

`app/components/FilmActions.tsx` (new) — small client wrapper that owns `onWatchlist` state and renders both `WatchlistButton` and `OwnedButton`. When `OwnedButton` fires `onAdded`, the wrapper flips its `onWatchlist` state to false so the watchlist button re-renders as "+ Watchlist" without a round-trip.

Requires a one-line modification to `WatchlistButton`: accept an optional `onChange?: (next: boolean) => void` prop that mirrors its internal state to the parent. Existing callers pass nothing and ignore the callback.

### `/film/[id]` integration

`app/app/film/[id]/page.tsx` swaps its standalone `<WatchlistButton …/>` for `<FilmActions filmId={…} initialOnWatchlist={…} initialOwned={…} />`. Reads `isInLibrary` at the top to populate `initialOwned`.

### `/library` route

`app/app/library/page.tsx` — server component, mirrors `/watchlist`'s shape. Hero section has `<h1 className="h-display">Your <em>Library</em>.</h1>` (matches `/films` post-B1 hero scale). Empty state copy: *"Empty stacks. Mark films as owned from any film's page."* Sort UI deferred — implicit "recently added" matches the empty-state copy and `getLibrary`'s default order.

### Top nav entry

`app/components/TopNav.tsx` — add `{ id: "library", label: "Library", href: "/library" }` to the authed `items` array between `Watchlist` and `Lists`. Mobile menu inherits automatically.

### Settings toggle

`app/app/settings/page.tsx` — new row "Show your library to coven members" wired to `profiles.broadcast_library`. Slots next to the existing `broadcast_watchlist_adds` row. Server action wiring follows the existing settings-form pattern.

## Section 4 — File map

| Action | Path |
|--------|------|
| Create | `db/migrations/0122_library.sql` |
| Create | `db/tests/rls/library.test.ts` |
| Create | `app/lib/queries/library.ts` |
| Create | `app/tests/queries/library.test.ts` |
| Create | `app/lib/actions/library.ts` |
| Create | `app/tests/actions/library.test.ts` |
| Modify | `app/lib/queries/films.ts` |
| Modify | `app/app/films/page.tsx` |
| Create | `app/components/OwnedButton.tsx` |
| Modify | `app/components/WatchlistButton.tsx` |
| Create | `app/components/FilmActions.tsx` |
| Modify | `app/app/film/[id]/page.tsx` |
| Create | `app/app/library/page.tsx` |
| Modify | `app/components/TopNav.tsx` |
| Modify | `app/app/settings/page.tsx` |
| Modify | `app/lib/actions/profile.ts` (or settings save action — exact location to be confirmed in plan) |
| Run | `cd app && npm run gen:types` after migration to regenerate `app/lib/supabase/types.ts` |

~15 file changes + types regeneration. Touches schema (1 migration), three app layers (queries / actions / components), and three routes (`/films` filter, `/film/[id]` integration, `/library` new). Bigger than B1, smaller than the hearts sub-project.

## Section 5 — Testing

| Layer | Suite | Path |
|---|---|---|
| RLS (testcontainers, real Postgres) | 9 cases | `db/tests/rls/library.test.ts` |
| Queries (pg-mem) | 5 cases | `app/tests/queries/library.test.ts` |
| Actions (testcontainers) | 5 cases | `app/tests/actions/library.test.ts` |
| Manual prod smoke | 6 paths | n/a |

**RLS test cases (9):**
1. Anon SELECT denied.
2. Owner SELECT own row allowed.
3. Coven member SELECT row when target has `broadcast_library = TRUE` — allowed.
4. Coven member SELECT row when target has `broadcast_library = FALSE` — denied.
5. Non-coven user SELECT row — denied even if broadcast is on.
6. Owner INSERT own row — allowed.
7. INSERT with spoofed user_id — denied.
8. Owner DELETE own row — allowed.
9. Non-owner DELETE — denied.

**Query test cases (5):**
- `getOwnedFilmIds`: returns IDs for an owner; returns `[]` for null userId; returns `[]` for empty library.
- `getLibrary`: returns rows joined with film, sorted by created_at desc.
- `isInLibrary`: returns true / false / handles unauthed gracefully.

**Action test cases (5):**
- `_addToLibrary` inserts the row + deletes the watchlist row.
- `_addToLibrary` is idempotent on re-add (swallows 23505).
- `_addToLibrary` throws when unauthed.
- `_removeFromLibrary` deletes own row; no-op on missing row.
- `_removeFromLibrary` throws when unauthed.

Action tests are env-blocked on `TEST_SUPABASE_SERVICE_ROLE_KEY` (same as `app/tests/actions/reactions.test.ts`); written to pass when env is provisioned.

**Manual prod smoke (6 paths):**
1. `/films` logged-out — unfiltered grid.
2. `/films` logged-in with at least one owned film — that film is absent.
3. `/film/[id]` toggle round-trip — `+ Library` → `✓ In Library`, watchlist button flips back to `+ Watchlist` if the film was on watchlist.
4. `/library` populated — grid renders owned films, sorted recent first.
5. `/library` empty — empty-state copy renders.
6. Settings toggle — toggle persists across page reload; toggling OFF hides library from coven SELECTs (verified via a coven mate's `/p/[handle]` once that surface exists, or via direct DB read for v1).

## Section 6 — Implementation slicing (preview for plan)

Nine tasks, suitable for subagent-driven execution given the schema + multi-layer surface area. Inline execution also workable but loses the per-task review checkpoint.

1. **Migration + RLS tests.** Write `0122_library.sql` + 9 RLS tests; run `npm run test:rls`. Must pass before continuing.
2. **Apply migration to prod + regenerate types.** Apply via `db/`'s migrate script, regenerate `app/lib/supabase/types.ts`, commit.
3. **Queries module + tests.** `app/lib/queries/library.ts` + pg-mem tests.
4. **Actions module + tests.** `app/lib/actions/library.ts` + tests (env-blocked).
5. **Discovery filter wiring.** `getFilms` viewerUserId + films/page.tsx pass-through. Manual smoke after direct-DB ownership insert.
6. **OwnedButton + FilmActions wrapper + film detail page integration.**
7. **`/library` route + top-nav entry.**
8. **Settings toggle.**
9. **Whole-branch review + deploy.**

## Risks

- **`films_with_stats` view drops + recreates.** Production migration is single-transaction so atomic, but it's the first view modification since `0119` — keep deploy window quiet.
- **`films_with_stats` consumers** (`getFilms`, `_addToWatchlist` fallback) use explicit column lists, not `SELECT *`. Adding `owned_count` is additive; verified during exploration.
- **Discovery filter cost.** `getFilms` adds one extra `library` SELECT per `/films` request, indexed `(user_id, created_at DESC)`. Practical worst case: a few hundred owned films, expanding to a few KB of `.not("id", "in", "(…)")` clause. Acceptable.
- **`coven_members` exact column names**: verified during plan-writing — graph-edge model `(user_a_id, user_b_id)` with `user_a < user_b` invariant. RLS clause adapted accordingly.
