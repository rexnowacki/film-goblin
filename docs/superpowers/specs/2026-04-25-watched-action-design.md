# Watched Action — C2 Design

**Status:** spec
**Date:** 2026-04-25
**Sub-project:** C2 of the Library/Watched/Social-signal trio. Builds on C1 (Library, shipped). B2 (Social signal on posters) is next and will consume the `(film_id)` index this spec lands.

## Goal

Track every time a user watches a film as a discrete dated event (Letterboxd-style diary). New `watched` event-stream table, `/watched` route with stats hero + month-grouped diary, one-tap "+ Watched" button on `/film/[id]` with a re-tap modal for rewatches and notes, and a `watch_logged` activity event that fans out to coven feeds (and groups via D1's existing `groupFeed` once registered).

## What ships

1. **Schema** — new `watched` table (event-shaped, surrogate `id` PK, `watched_at DATE`, optional `note TEXT`); three indexes covering diary read, per-film count, and B2's future film-aggregate read; new `profiles.broadcast_watched` boolean (default TRUE).
2. **Activity kind** — `watch_logged` added to `activity_kind` ENUM. Trigger on `watched` INSERT fires the activity row when the actor's `broadcast_watched` flag is TRUE. D1's `groupFeed` registers the new kind as groupable (one-line change).
3. **Auto-cleanup** — logging a watch silently deletes any matching `(user, film)` row from `watchlists`. Lives in the server action, not a DB trigger. Mirrors C1's library/watchlist supersession.
4. **Server actions** — `_logWatch` / `_editWatch` / `_deleteWatch` (private, testable) plus public wrappers that revalidate touched routes.
5. **`WatchedButton`** — peer of `OwnedButton` on `/film/[id]`. First tap: one-shot log (today, no note). Subsequent taps: opens `WatchModal` for date + note. Display: `+ Watched` when `count === 0`, `✓ Watched · N` otherwise.
6. **`WatchModal`** — bottom-sheet on mobile, centered modal on desktop. Reused for both new entries and editing existing diary rows. Fields: date input + 500-char-soft-cap note textarea. Buttons: Save + (when editing) Delete.
7. **`/watched` route** — auth-gated. Bone-on-void hero (`Your <em>Diary</em>.`). Stats band: total / this-year / most-watched, plus a 5-poster strip of most-rewatched films. Month-grouped diary list below; each row is a tap target opening `WatchModal` for edit/delete.
8. **Activity feed integration** — new `ActivityWatchLogged` + `ActivityWatchLoggedGroup` components (mirrors `ActivityWatchlistAdded` shape). `FeedRow` dispatcher gains both cases. `getEnrichedFeed` adds `'watch_logged'` to its film-id-extraction switch.
9. **Settings toggle** — third broadcast switch alongside `broadcast_watchlist_adds` and `broadcast_library`: "Broadcast watches to your coven." Wires through `_updateProfile`'s `{ ...fields }` spread.
10. **TopNav** — add `/watched` as a current-able nav target.

## Out of scope

- **`films_with_stats.watcher_count`** → B2 (next sub-project). The `(film_id)` index lands now to keep B2's read fast.
- **Public profile diary at `/p/[handle]/watched`** → defer to a future polish pass. v1 surfaces watches to coven via the activity feed only.
- **Rewatch differentiation in feed copy** ("rewatched X" vs "watched X") → trigger payload stays minimal `{ film_id }`; uniform "watched X" copy in v1. v1.1 polish.
- **Year-in-review / per-year breakdown chart** → its own feature. Hero stats are total + this-year + most-watched only.
- **Stars / ratings on diary entries** → reviews already exist as a separate concept; conflating ratings with watches needs its own brainstorm.
- **Bulk-import watch history** (e.g., Letterboxd CSV) → separate sub-project if the demand materializes.
- **In-place film swap on a diary row** ("I logged the wrong title") → mistake recovery is delete + re-log.
- **D1's "first 1-2 names then 'and 3 more'" grouped-row copy nuance** → grouped `watch_logged` rows inherit whatever D1 ships for `watchlist_added`.
- **UI component tests** for `WatchedButton` / `WatchModal` / `/watched` page → no component test infra in `app/` yet; visual verification via dev server is the established pattern.

## Locked design decisions (clarifying-question outcomes)

| Q | Decision |
|---|---|
| Watch concept | Diary entries (event-shaped, multiple rows per (user, film)). No separate "watched" flag — derived from `EXISTS`. |
| Button UX | One-tap "+ Watched" → today, no modal. Re-tap on "✓ Watched" → modal for date + note. |
| Library / Watchlist relationship | Independent of Library (owning ≠ watching). Logging a watch silently removes matching watchlist row. |
| `/watched` shape | Stats hero band + month-grouped diary list. |
| Coven feed broadcast | Every watch fan-outs to a `watch_logged` activity row, gated by `broadcast_watched`. D1's grouping handles the "watching a series tonight" spam case. |
| Stats hero content | 3 numbers (total / this year / most-watched name+count) + horizontal strip of 5 most-rewatched film mini-posters. |
| Diary grouping | Month headers ("April 2026"). |
| Edit/delete affordance | Tap a diary row → opens the same `WatchModal` pre-filled with the row's values. Modal includes a Delete button. |
| Schema identity | Surrogate `id UUID` PK. Multiple watches of same (user, film, date) all valid. |
| Date column | `watched_at DATE` (no timezone, no time component). `created_at TIMESTAMPTZ` separately for audit + same-day ordering. |
| Note column | `TEXT` (unbounded), with 500-char UI soft cap. |
| Broadcast flag default | `TRUE` (opt-out), matches `broadcast_watchlist_adds` and `broadcast_library`. |
| Button placement on film page | Three peer buttons (Watchlist, Library, Watched). No demotion of the others. |
| Profile-page integration | None in v1. `/watched` is owner-only. |

## Section 1 — Data model

**Two new migrations.** Split required because `ALTER TYPE … ADD VALUE` cannot be referenced by a function in the same transaction — the new enum value must commit before any function references it. The migrate runner applies each `.sql` file as its own transaction, which gives us the boundary for free.

### `db/migrations/0123_watched.sql`

```sql
-- C2: Watched — event-stream diary of films a user has watched. Event-shaped
-- (multiple rows per (user, film) for rewatches), distinct from C1's flag-shaped
-- library. Coven-visible by default (gated by profiles.broadcast_watched).

-- 1. The watched event-stream table
CREATE TABLE watched (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  watched_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX watched_user_watched_idx ON watched (user_id, watched_at DESC, created_at DESC);
CREATE INDEX watched_user_film_idx    ON watched (user_id, film_id);
CREATE INDEX watched_film_idx         ON watched (film_id);

-- 2. Profile broadcast flag (mirrors broadcast_watchlist_adds, broadcast_library)
ALTER TABLE profiles
  ADD COLUMN broadcast_watched BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Activity kind extension
ALTER TYPE activity_kind ADD VALUE 'watch_logged';

-- 4. RLS — owner-or-coven-with-flag for SELECT; owner-only for I/U/D
ALTER TABLE watched ENABLE ROW LEVEL SECURITY;

CREATE POLICY watched_select ON watched
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM coven_members cm
        WHERE (cm.user_a_id = auth.uid() AND cm.user_b_id = watched.user_id)
           OR (cm.user_a_id = watched.user_id AND cm.user_b_id = auth.uid())
      )
      AND (SELECT broadcast_watched FROM profiles WHERE id = watched.user_id) IS TRUE
    )
  );

CREATE POLICY watched_insert ON watched
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watched_update ON watched
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watched_delete ON watched
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON watched TO authenticated;
```

### `db/migrations/0124_watch_logged_trigger.sql`

```sql
-- Fan-out trigger: watched insert → activity (kind='watch_logged'),
-- gated by profiles.broadcast_watched. Mirrors activity_on_watchlist_insert.
-- Separate file from 0123 because ALTER TYPE … ADD VALUE must commit before
-- a function can reference the new value.

CREATE OR REPLACE FUNCTION public.activity_on_watch_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watched INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'watch_logged', jsonb_build_object('film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_watch_insert
AFTER INSERT ON watched
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_watch_insert();
```

`films_with_stats` is **not** extended in this sub-project — `watcher_count` belongs to B2.

## Section 2 — Server actions

`app/lib/actions/watched.ts`. Follows the established private-action + public-wrapper convention.

```ts
// Private — testable, takes injected client
export async function _logWatch(
  client: Client,
  filmId: string,
  opts?: { watched_at?: Date; note?: string },
): Promise<{ id: string }>

export async function _editWatch(
  client: Client,
  watchId: string,
  patch: { watched_at?: Date; note?: string },
): Promise<void>

export async function _deleteWatch(client: Client, watchId: string): Promise<void>

// Public — creates server client, calls private, revalidates touched routes
export async function logWatch(filmId: string, opts?: ...) // → /watched, /watchlist, /home, /films, /film/[id]
export async function editWatch(watchId: string, patch: ...) // → /watched
export async function deleteWatch(watchId: string)           // → /watched, /home, /films, /film/[id]
```

`_logWatch` does two things in sequence (matching `_addToLibrary`'s shape):
1. INSERT into `watched` with `user_id = auth.uid()`, `film_id`, `watched_at = opts?.watched_at ?? CURRENT_DATE`, `note = opts?.note ?? NULL`.
2. DELETE from `watchlists` where `user_id = auth.uid() AND film_id = filmId` (silent — no error if missing).

RLS enforces ownership on both writes — no manual ownership check needed in app code. All three private actions throw `"unauthenticated"` when `auth.getUser()` returns no user.

## Section 3 — Read queries

`app/lib/queries/watched.ts`.

```ts
getWatchedDiary(client, userId): Promise<DiaryRow[]>
  // SELECT id, watched_at, note, film:films!inner(id, title, year, artwork_url, director)
  // ORDER BY watched_at DESC, created_at DESC
  // (full diary; month-grouping happens at render time)

getWatchedStats(client, userId): Promise<{
  total: number;
  thisYear: number;
  topFilms: Array<{ film: FilmCardData; count: number }>; // up to 5
}>
  // 3 cheap queries (or 1 RPC if perf later demands):
  //   COUNT(*) total
  //   COUNT(*) WHERE EXTRACT(year FROM watched_at) = EXTRACT(year FROM CURRENT_DATE)
  //   GROUP BY film_id ORDER BY count DESC LIMIT 5, joined to films

getWatchCountForFilm(client, userId, filmId): Promise<number>
  // Powers "✓ Watched · N" badge on FilmActions on /film/[id].
```

PostgREST nested-embed cast (`as never` on the consumer boundary) per the established gotcha.

## Section 4 — Components

### `app/components/WatchedButton.tsx`

```ts
interface Props { filmId: string; initialCount: number; onLogged?: () => void; }
```

State: `count: number`, `pending: boolean`. Render: `+ Watched` when `count === 0`, `✓ Watched · {count}` otherwise. Click handler:

- If `count === 0`: optimistic `count++`, call `logWatch(filmId)`, on error revert and log to console.
- If `count > 0`: open `WatchModal` (mode = "new"). On modal Save: `logWatch(filmId, { watched_at, note })`, optimistic `count++`.

`onLogged` callback fires on successful first watch — used by `FilmActions` to clear the watchlist UI state.

### `app/components/WatchModal.tsx`

Bottom-sheet on mobile (reuses `BottomSheet`), centered modal on desktop (same component handles both — see existing `RecommendModal`). Fields:

- `<input type="date">` defaulting to today's `YYYY-MM-DD`.
- `<textarea>` with placeholder "What did you think?" and a 500-char `maxLength`. A soft counter appears when the user crosses 400 chars, hardening visually as 500 approaches. The 500-char cap is UI-only — the DB column is unbounded `TEXT`, so a future relaxation is a one-line component change with no schema work.

```ts
interface Props {
  mode: "new" | "edit";
  initial: { watched_at: string; note: string; id?: string };
  onSave(values: { watched_at: string; note: string }): Promise<void>;
  onDelete?(): Promise<void>; // only in "edit" mode
  onClose(): void;
}
```

Buttons: "Save" (primary), "Delete" (only when `mode === "edit"`, secondary destructive — blood-outline per the `globals.css` rule), "Cancel" (text-only).

### `app/components/FilmActions.tsx` (modified)

Adds `WatchedButton` as a third peer. New prop `initialWatchCount: number`. Wires `onLogged` so the first watch clears the watchlist UI state (same pattern as `OwnedButton`'s `onAdded`).

```ts
<WatchedButton
  filmId={filmId}
  initialCount={initialWatchCount}
  onLogged={() => setOnWatchlist(false)}
/>
```

### `app/app/watched/page.tsx`

Server component. Auth-gated (`redirect("/auth/signin?next=/watched")` if no user). Bone-on-void hero (`h-display`: `Your <em>Diary</em>.`). Below: stats band, then month-grouped diary list. Diary rows are passed to a client component (`DiaryRow.tsx`) that opens `WatchModal` on tap.

### `app/app/watched/DiaryRow.tsx`

Client component. Renders one diary entry: small poster (~50×75) + title + year + truncated note. Whole row is tap target → opens `WatchModal` in `mode="edit"` pre-filled with the row's values. On Save: calls `editWatch`. On Delete: calls `deleteWatch`. After either, the page re-renders via `revalidatePath`.

### `app/components/activity/ActivityWatchLogged.tsx` + `ActivityWatchLoggedGroup.tsx`

Mirrors the existing `ActivityWatchlistAdded` and `ActivityWatchlistAddedGroup` components in shape and CSS. Single-event copy: "watched". Group copy: "watched N films" (matching D1's grouped-watchlist phrasing for symmetry).

### `app/components/activity/FeedRow.tsx` (modified)

Add cases for `kind === "watch_logged"` (single dispatch) and group with `kind === "watch_logged"`. Three additional lines.

## Section 5 — Activity feed wiring

```ts
// app/lib/queries/group-activity.ts
function isGroupableKind(kind: EnrichedActivity["kind"]): boolean {
  return kind === "watchlist_added" || kind === "watch_logged";
}
```

```ts
// app/lib/queries/activity.ts — film-id extraction in getEnrichedFeed
case "watch_logged":
  return (a.payload as { film_id?: string })?.film_id ?? null;
```

D1's grouping window (3+ events, 30-min event-to-event gap, 24-hr total span) applies unchanged.

## Section 6 — Settings + profile

`app/app/settings/SettingsForm.tsx` adds a third broadcast checkbox: "Broadcast watches to your coven." Auto-flows through `_updateProfile`'s `{ ...fields }` spread once `broadcast_watched?: boolean` is added to `ProfileFields` in `app/lib/actions/profile.ts`. No new server action required (per the `_updateProfile` auto-spread gotcha in CLAUDE.md).

## Section 7 — Tests

### DB / RLS — `db/tests/rls/watched.test.ts`

Real Postgres via testcontainers. Uses the established `seedFixtures` + `bond()` helpers from `db/tests/rls/library.test.ts` as the template.

Coverage:
- Owner can `SELECT` / `INSERT` / `UPDATE` / `DELETE` own rows.
- Coven member can `SELECT` another's rows when `broadcast_watched = TRUE`.
- Coven member CANNOT `SELECT` when `broadcast_watched = FALSE`.
- Stranger (no coven bond) cannot `SELECT` regardless of flag.
- `INSERT` with `user_id` ≠ `auth.uid()` is rejected.
- `UPDATE` and `DELETE` of another user's row are silently filtered (RLS).
- Trigger fires `watch_logged` activity when `broadcast_watched = TRUE`; does NOT fire when `FALSE`.
- Multiple watches of same `(user, film)` all insert successfully (no unique constraint blocks rewatches).

### App actions — `app/tests/actions/watched.test.ts`

Integration via real Supabase. Env-blocked from the start with `describe.skipIf(!hasEnv)` + per-hook `if (!hasEnv) return;` guards (rides the hygiene-sweep pattern, matches `library.test.ts` / `reactions.test.ts` shape).

Coverage:
- `_logWatch` inserts a row with `watched_at = CURRENT_DATE` when no opts.
- `_logWatch` honors explicit `watched_at` and `note` when provided.
- `_logWatch` silently deletes any matching watchlist row.
- `_logWatch` allows multiple inserts for same (user, film).
- `_editWatch` updates `watched_at` + `note`.
- `_deleteWatch` deletes own row; deleting another user's row is a no-op (RLS-filtered).
- All three throw `unauthenticated` when called with anon client.

### Group-activity unit — extend `app/lib/queries/group-activity.test.ts`

Add cases verifying `watch_logged` events group with the same 3+/30-min/24-hr semantics as `watchlist_added`. Pure-function tests, no DB.

### Smoke — `db/tests/migrations.smoke.test.ts`

Add `"watched"` to the `expect.arrayContaining([…])` list. The migration smoke helper auto-skips `0124_watch_logged_trigger.sql` (filename contains `_trigger`).

## Section 8 — File plan

### New
- `db/migrations/0123_watched.sql`
- `db/migrations/0124_watch_logged_trigger.sql`
- `db/tests/rls/watched.test.ts`
- `app/lib/actions/watched.ts`
- `app/lib/queries/watched.ts`
- `app/components/WatchedButton.tsx`
- `app/components/WatchModal.tsx`
- `app/components/activity/ActivityWatchLogged.tsx`
- `app/components/activity/ActivityWatchLoggedGroup.tsx`
- `app/app/watched/page.tsx`
- `app/app/watched/DiaryRow.tsx`
- `app/tests/actions/watched.test.ts`

### Modified
- `app/lib/queries/group-activity.ts` — add `"watch_logged"` to `isGroupableKind`
- `app/lib/queries/activity.ts` — add `'watch_logged'` to film-id-extraction switch in `getEnrichedFeed`
- `app/components/activity/FeedRow.tsx` — add single + group cases for `watch_logged`
- `app/components/FilmActions.tsx` — add `WatchedButton`, wire watchlist-clearing on first watch
- `app/app/film/[id]/page.tsx` — pass `initialWatchCount` to `FilmActions`, fetch via `getWatchCountForFilm`
- `app/app/settings/SettingsForm.tsx` — add "Broadcast watches" toggle
- `app/lib/actions/profile.ts` — add `broadcast_watched?: boolean` to `ProfileFields`
- `app/components/TopNav.tsx` + `app/components/TopNavChrome.tsx` — add `/watched` nav target
- `db/tests/migrations.smoke.test.ts` — add `"watched"` to expected-tables array
- `app/lib/supabase/types.ts` — regenerated via `npm run gen:types` after migrations apply

## Section 9 — Implementation order (high-level)

1. Land `0123_watched.sql` + `0124_watch_logged_trigger.sql` against local Supabase, regen types.
2. Write `_logWatch` / `_editWatch` / `_deleteWatch` and the three queries; cover with action tests.
3. Land RLS suite.
4. Build `WatchModal` (used everywhere else); then `WatchedButton`; then wire into `FilmActions`.
5. Build `/watched` page (hero + stats + month-grouped diary + `DiaryRow`).
6. Wire activity feed: `isGroupableKind`, `getEnrichedFeed` extraction, `ActivityWatchLogged{,Group}`, `FeedRow` dispatcher.
7. Settings toggle + profile field.
8. TopNav entry.
9. Smoke + group-activity tests pass; manual dev-server walkthrough; deploy.
10. Apply 0123 + 0124 to prod Supabase via the pooler (per the password-scratchpad gotcha).
