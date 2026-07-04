# FYP Poster Quick-Add — Design

**Date:** 2026-07-03
**Status:** Approved
**Branch:** `feature/fyp-poster-quick-add`

## Goal

Mirror the Browse tab's `PosterQuickAdd` affordance (desktop hover **+** menu; mobile **⋯**
bottom sheet with log-a-watch / watchlist / grimoire / recommend / share rows) onto the
For You tab of `/films` — both the shelf carousel posters and the Daily Omen hero.

`PosterQuickAdd` is reused as-is. No changes to the component, no new server actions,
no migrations.

## Decisions made

1. **Corner clash — dismiss ✕ moves to the top-left.** Shelf posters and the omen hero
   currently place the "Not interested" ✕ at the top-right, where `PosterQuickAdd` puts
   its desktop **+** and mobile **⋯** buttons. Quick-add keeps the top-right corner
   (matching Browse muscle memory); the ✕ slides to the top-left. Both stay one-tap.
   - Checked against failure archaeology §3.1: the reverted "corner pills" were 👁/✓
     *stat badges* (illegibility / zine-vibe rationale). `PosterQuickAdd` is a settled,
     shipped affordance on Browse — no mine re-tripped.
2. **Daily Omen hero gets quick-add too.** The most prominent recommendation on the page
   should not be the one poster you can't save from.
3. **Honest initial ✓ state (approach A).** The FYP candidate pool does *not* exclude
   watchlisted or grimoire films (watchlist adds are a positive scoring signal), so
   already-saved films appear on shelves. `ForYouSection` (server component in
   `app/app/films/page.tsx`) fetches, in parallel:
   - `watchlists.select("film_id").eq("user_id", …)`
   - `library.select("film_id").eq("user_id", …)`
   - the viewer's `profiles.username` (for the share action's `sharerUsername`)

   and passes them down as serializable props. Rejected: passing `false` always (lies for
   saved films); folding flags into `getForYouShelves`/`FilmLite` (pollutes the pure
   recommender query layer with per-viewer UI state).
4. **`currentlyShowing` omitted** (defaults `false`). `FilmLite` doesn't carry it and it
   only tweaks a WatchModal hint — not worth a `films_with_stats` join.

## Component changes

- **`app/components/ShelfCarousel.tsx`** — wrap the poster (inside the existing
  `<Link>`) in `PosterQuickAdd` with `filmId`, `initialOnWatchlist`, `initialInLibrary`,
  `filmTitle`, `filmYear`, `sharerUsername`. Move the dismiss ✕ from `right: 4` to
  `left: 4`.
- **`app/components/DailyOmenHero.tsx`** — same wrap on its poster; the ✕ moves to the
  card's top-left. New props for the flags + `sharerUsername`.
- **`app/components/ForYouShelves.tsx`** — accept `watchlistIds: string[]`,
  `libraryIds: string[]`, `sharerUsername: string | null`; build `Set`s and thread
  per-film flags to `ShelfCarousel` and `DailyOmenHero`.
- **`app/app/films/page.tsx`** (`ForYouSection`) — the two id-set queries + username
  fetch, run in parallel with `getForYouShelves` where possible, passed to
  `ForYouShelves`.

## Edge behavior

- Logging a watch from the sheet doesn't refetch the shelf mid-session; the film drops
  out of FYP naturally on the next visit (watched films are excluded by the scorer).
  Same behavior as Browse.
- `PosterQuickAdd` already stops propagation / prevents default on its buttons, so
  living inside the shelf `<Link>` and the hero's card-wide `<Link>` is safe (proven on
  Browse).

## Testing

- `npm run typecheck` from `app/`.
- Existing vitest suite (`npm test` from `app/`).
- Manual: desktop hover **+** menu on a shelf poster; mobile **⋯** sheet; ✓-disabled
  state on a film already on the watchlist / in the grimoire; dismiss ✕ works from the
  top-left on both shelf posters and the omen hero; hero quick-add doesn't trigger the
  card navigation.

## Rollout

App-only change. No migrations, no deploy-order concern. Normal PR → merge → deploy
from repo root.

## Amendment (2026-07-03, post-ship)

Owner reviewed the shipped UI: the corner dismiss ✕ "looks bad." Decision 1 is
superseded — the corner ✕ is removed entirely from both surfaces, and "Not
interested" folds into the quick-add menus instead:

- `PosterQuickAdd` gains an optional `onNotInterested?: (() => void) | null`
  prop (Browse passes nothing — unaffected). When set, a "✕ Not Interested"
  pill renders in the desktop hover menu and a "✕ Not interested" row in the
  mobile bottom sheet, both closing their surface before invoking the callback.
- `ShelfCarousel` and `DailyOmenHero` drop their corner ✕ buttons and pass
  `onNotInterested={() => onDismiss(filmId)}`.
- The dismissed-state "Hidden — undo" tiles are unchanged.
- The `.poster-quick-add .match-pill { right: 44px }` rule stays (the ⋯ button
  still owns the top-right corner).

Dismissal is now two taps instead of one — accepted trade for a cleaner poster.

## Amendment 2 (2026-07-03, PR #172)

Decision 3's premise is superseded: the FYP pool now DOES exclude watchlisted and
grimoire films (`ScoreContext.userSavedFilmIds`, applied in both the scored feed
and the cold-start starter pack) — the owner ruled that already-claimed films
shouldn't be recommended. The honest-✓ plumbing from decision 3 stays: it is
still correct for mid-session adds (a film quick-added from a shelf keeps its ✓
until the next render), just rarely exercised now. Saves continue to feed the
affinity vector (`watchlist_added` +0.75, `library_added` +1.5).
