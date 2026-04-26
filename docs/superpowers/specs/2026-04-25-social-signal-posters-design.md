# Social Signal on Posters — B2 Design

**Status:** spec
**Date:** 2026-04-25
**Sub-project:** B2. Last item in the queue (the Library/Watched/Social-signal trio: C1 + C2 already shipped). Builds on C1's `films_with_stats.owned_count` view extension and C2's `watched` table.

## Goal

Surface global social signals on `/films` Archive cards so scanning the grid communicates which films are alive in the goblin community. Two badges per card: 👁 N (people who have it on their watchlist) and ✓ N (people who have watched it). Each badge hides when its own count is 0; a film with both at 0 shows clean poster art. The detail page (`/film/[id]`) renders the same data in full goblin-voice prose ("43 goblins are eyeing this · 12 have watched it") so the long-form copy lives where there's room for it.

## What ships

1. **View extension** — `films_with_stats` gains a `watcher_count` column (`count(DISTINCT user_id) FROM watched`). Additive at the end of the SELECT list, matching the C1 precedent.
2. **`FilmPoster` opt-in badges** — two new optional props (`watchlistCount?`, `watcherCount?`); when either > 0, render a bottom-left corner cluster with one or two 18-px pills. Cap at 99+. Hide each pill independently when its count is 0.
3. **`/films` archive grid** — passes the two new counts to every `<FilmPoster>`. No layout changes; badges sit inside the existing 2:3 poster frame.
4. **`/film/[id]` hero caption** — italic-serif single-line caption below the existing description: "{N} goblin{s are/is} eyeing this · {N} ha{ve/s} watched it". Singular/plural inline. Whole caption hidden when both counts are 0; each clause hidden independently when its own count is 0.
5. **Other poster surfaces unchanged** — `/library`, `/home` marquee, `/watched` top-5 strip, activity-row thumbnails all keep calling `<FilmPoster />` without the new props, so badges silently don't render. No badges, no behavior change.

## Out of scope

- **Coven-scoped signals** ("2 of your coven members own this") → future profile-page sub-project. The existing C1/C2 RLS already permits coven-mate reads of broadcast-flagged library/watched rows. v1 surfaces global counts only.
- **Owned and review badges** — only watchlist + watched ship in v1. Owned is a quieter signal than watched; reviews are staff-authored and rare. Both can be added later as additive props on `FilmPoster` consuming the existing `owned_count` and a future `review_count` view extension.
- **Most-watched sort on `/films`** — `watcher_count` lands in the view but no new sort chip in `FilmsSortChips`. B2 is a passive signal feature; a popularity sort is a separate discovery feature for a future PR.
- **Badges on other poster surfaces** — `/library`, `/home` marquee, `/watched` top-5 strip, activity rows. Surface-specific opt-in via the new props later if wanted; v1 stays /films-only.
- **`/film/[id]` stat block beyond the single caption** — no chart, no per-coven breakdown, no temporal trend.
- **Compact unit display** (`1.2K`, `12K`) — full count up to 99 then `99+`. We won't hit four digits at the goblin's scale for a long time.
- **Hover/tap-expand badge interactions** — static pills only.
- **Glyph alternatives beyond 👁/✓** — locked unless visual review prompts a change. The `title` attribute on each pill carries the long-form copy for screen readers and tooltips.
- **Empty-state cards with both counts at 0 showing placeholder badges** — both-zero collapses to clean poster art.
- **A1 fallback (third caps line below the existing meta block)** — documented as the v2 fallback if visual review of corner badges shows readability problems at the 140 px minimum poster size.

## Locked design decisions (clarifying-question outcomes)

| Q | Decision |
|---|---|
| Global vs coven-scoped | Global counts. Coven-overlap deferred to a future profile-page sub-project. |
| Copy voice | "N goblins are eyeing this" full-voice on `/film/[id]`; terse `👁 N` glyph + number on `/films` cards. |
| Which signals | Watchlist + watched only. Owned and reviews deferred. |
| Badge placement on cards | Corner pills overlaid on poster (bottom-left), not below the existing meta block. A (third caps line) documented as fallback. |
| Badge styling | 18-px-ish pills, icon + number, bone-on-void. Two pills stack vertically when both visible. |
| Empty state per badge | Hide each badge independently when its count is 0; both-zero collapses to clean poster. |
| Sort surface | No new sort chip. `watcher_count` is in the view but unranked. |
| Number cap | Full count up to 99, then `99+`. |
| Surface scope | `/films` archive grid only. Other poster surfaces unchanged. |
| Detail-page copy | One italic-serif caption line below the description in the `/film/[id]` hero. |

## Section 1 — Data model

**One new migration: `db/migrations/0128_films_with_stats_watcher_count.sql`.**

Additive view extension. Column appended at the end of the SELECT list so existing PostgREST consumers (which always pick explicit column lists, never `select("*")`) are unaffected. Same DROP+CREATE pattern from C1's 0122 (the smoke helper auto-strips CREATE/DROP VIEW per the post-hygiene-sweep extension).

```sql
-- B2: Extend films_with_stats with watcher_count for the social-signal badges
-- on /films Archive cards. Counts DISTINCT user_id from watched (one row per
-- watcher, not one per watch event — multiple rewatches of the same film by
-- the same user count as 1).
DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT count(DISTINCT user_id)::int FROM watched WHERE film_id = f.id) AS watcher_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
```

`count(DISTINCT user_id)` (not `count(*)`) is deliberate: one row per unique watcher, not one per watch event. Matches the badge semantic ("12 goblins watched this") rather than total viewings.

The `watched` table already has a `(film_id)` index from C2's 0123, so the correlated subquery is O(matching rows) per film read.

## Section 2 — Read queries

`app/lib/queries/films.ts`. Two existing functions extended additively.

### `getFilms`

Already selects from `films_with_stats`. Add `watcher_count` to the column list and the row type:

```ts
.select(
  "id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, latest_price, watchlist_count, watcher_count",
  { count: "exact" },
)
```

The return-type shape gains `watcher_count: number`. All existing call sites of `getFilms` (just `/films/page.tsx`) pick up the new field via the typed row.

### `getFilm`

Currently reads from `films` directly. Switch to `films_with_stats` and pick the same explicit column list as `getFilms` plus `description`, `content_advisory`, `runtime_min` (already-displayed hero fields):

```ts
const { data, error } = await client
  .from("films_with_stats")
  .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available, first_seen_at, last_checked_at, last_priced_at, watchlist_count, watcher_count")
  .eq("id", id)
  .single();
```

This unifies both `/films` and `/film/[id]` on the same view source — one place defines the per-film aggregate shape.

## Section 3 — Components

### `app/components/FilmPoster.tsx`

Two new optional props:

```ts
interface FilmPosterProps {
  // existing props…
  watchlistCount?: number;  // omit/0 → hide eyeing pill
  watcherCount?: number;    // omit/0 → hide watched pill
}
```

When either count > 0, render an absolutely-positioned cluster in the bottom-left corner of the poster artwork (inside the existing 2:3 frame). Each pill is independent — both, one, or neither rendered depending on which counts are non-zero. The poster's wrapping `<div>` already has `position: relative` (existing image + halftone + grain stack), so absolute positioning layers cleanly.

```tsx
{(watchlistCount > 0 || watcherCount > 0) && (
  <div className="film-poster-signals">
    {watchlistCount > 0 && (
      <span className="film-poster-signal" title={`${watchlistCount} on watchlists`}>
        👁 {watchlistCount > 99 ? "99+" : watchlistCount}
      </span>
    )}
    {watcherCount > 0 && (
      <span className="film-poster-signal" title={`${watcherCount} watched`}>
        ✓ {watcherCount > 99 ? "99+" : watcherCount}
      </span>
    )}
  </div>
)}
```

`title` attributes carry the long-form copy for screen readers and tooltips. `pointer-events: none` on the cluster prevents the pills from intercepting the poster's tap-to-navigate.

### `app/app/globals.css`

```css
.film-poster-signals {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  z-index: 2;
}
.film-poster-signal {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 3px 6px;
  background: var(--void);
  color: var(--bone);
  border: 1px solid var(--bone);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
```

### `app/app/films/page.tsx`

Existing `<FilmPoster film={f as never} size="md" … />` invocation gains two new prop pass-throughs:

```tsx
<FilmPoster
  film={f as never}
  size="md"
  watchlistCount={f.watchlist_count}
  watcherCount={f.watcher_count}
  style={{ width: "100%", height: "auto", aspectRatio: "2/3" }}
/>
```

### `app/app/film/[id]/page.tsx`

Read the same `films_with_stats` row (one less hop than two queries — `getFilm` now returns the aggregate shape directly). Add a single italic-serif caption line below the existing description paragraph in the hero. Conditional on at least one count > 0, with each clause independently hidden when its own count is 0:

```tsx
{(film.watchlist_count > 0 || film.watcher_count > 0) && (
  <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--muted)", margin: "0 0 18px" }}>
    {film.watchlist_count > 0 && (
      <span><strong style={{ color: "var(--accent)" }}>{film.watchlist_count}</strong> goblin{film.watchlist_count === 1 ? " is" : "s are"} eyeing this</span>
    )}
    {film.watchlist_count > 0 && film.watcher_count > 0 && " · "}
    {film.watcher_count > 0 && (
      <span><strong style={{ color: "var(--accent)" }}>{film.watcher_count}</strong> ha{film.watcher_count === 1 ? "s" : "ve"} watched it</span>
    )}
  </p>
)}
```

Singular/plural handled inline; no i18n machinery for v1.

## Section 4 — Tests

- **DB pg-mem smoke** (`db/tests/migrations.smoke.test.ts`) — already auto-strips CREATE/DROP VIEW per the hygiene-sweep helper extension, so 0125 silently no-ops there. No new assertion. The smoke just needs to keep passing.
- **DB RLS** — no new RLS policies. The view's GRANTs are unchanged. No new RLS test.
- **App typecheck** — sufficient verification that `watcher_count: number` flows through `films_with_stats` Database type → `getFilms`/`getFilm` query types → `FilmPoster` props → `/film/[id]` consumer. After `npm run gen:types`, the `watcher_count` column appears on the view's row type and any consumer that destructures it gets a compile error if absent.
- **No new vitest cases** — no `app/lib/queries/films.test.ts` exists today and no component test infra in `app/`. The badge rendering is a pure prop-driven view; visual verification via dev server is the established pattern.

## Section 5 — File plan

### New
- `db/migrations/0128_films_with_stats_watcher_count.sql`

### Modified
- `app/lib/queries/films.ts` — add `watcher_count` to `getFilms` select + return type; switch `getFilm` to `films_with_stats` and include `watchlist_count` + `watcher_count`
- `app/components/FilmPoster.tsx` — add `watchlistCount?` and `watcherCount?` props + corner-pill render
- `app/app/globals.css` — add `.film-poster-signals` and `.film-poster-signal` styles
- `app/app/films/page.tsx` — pass `watchlistCount` and `watcherCount` to `<FilmPoster>`
- `app/app/film/[id]/page.tsx` — render the goblin-voice caption line in the hero (the existing `getFilm` call now returns the new aggregate fields)
- `app/lib/supabase/types.ts` — regenerated via `npm run gen:types` after migration applies

## Section 6 — Implementation order (high-level)

1. Land `0128_films_with_stats_watcher_count.sql` — apply to prod Supabase via the pooler; regen types from the live DB (no local Supabase in this project, per the C2 precedent).
2. Extend `getFilms` (add column + return type) and switch `getFilm` to read from the view; typecheck.
3. Add `FilmPoster` props + render + CSS; typecheck.
4. Pass props from `/films/page.tsx`; render caption in `/film/[id]/page.tsx`.
5. Visual verification via dev server (resting state, single-pill, double-pill, both-zero, 99+ cap).
6. Deploy via `npx vercel deploy --prod --yes` from the repo root.
7. Update CLAUDE.md "Current state" + sub-project history table; mark queue empty.

## Section 7 — Notes for future surfaces

- **Adding the badges to `/library`, `/watched` strip, etc.** is a one-line change at each call site of `<FilmPoster />` — pass `watchlistCount={…} watcherCount={…}` from the row data. The component opts in/out per call.
- **Adding owned + review badges** is two additive view columns + two more optional props on `FilmPoster`. Schema hooks already exist for `owned_count` (shipped in 0122) and would be similar for `review_count`.
- **Coven-scoped signals on `/p/[handle]`** become a separate brainstorm. RLS already permits the read (broadcast-flagged library/watched rows are coven-visible); the work is the per-viewer enrichment query and a different visual treatment ("3 of your coven own this") that doesn't fit the global-count badge model.
