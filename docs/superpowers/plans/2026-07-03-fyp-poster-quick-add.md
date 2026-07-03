# FYP Poster Quick-Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror Browse's `PosterQuickAdd` (desktop hover **+** menu, mobile **⋯** bottom sheet) onto the For You tab's shelf posters and Daily Omen hero, with honest initial ✓ state.

**Architecture:** `PosterQuickAdd` is reused unchanged. The server component `ForYouSection` in `app/app/films/page.tsx` fetches the viewer's watchlist/library film-id sets and username in parallel and passes them through `ForYouShelves` (client) down to `ShelfCarousel` and `DailyOmenHero`, which wrap their posters in `PosterQuickAdd`. The "Not interested" ✕ moves from the top-right corner to the top-left on both surfaces to free the corner quick-add uses on Browse.

**Tech Stack:** Next.js 15 App Router, Supabase (client-injection query pattern), existing `PosterQuickAdd` component.

**Spec:** `docs/superpowers/specs/2026-07-03-fyp-poster-quick-add-design.md`

## Global Constraints

- Node 20 required — prefix all npm commands: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`
- All npm commands run from `app/`.
- Branch: `feature/fyp-poster-quick-add` (already created; spec committed).
- Commit messages via file (`git commit -F <file>`) — heredoc `-m` messages intermittently mangle in this repo.
- No component-test infrastructure exists in `app/` (vitest is pure-function/action only, no testing-library). Gates are `npm run typecheck` + `npm test` (regression) + the manual checklist in Task 3. Do not add a component test framework for this change.
- `PosterQuickAdd` component itself must NOT be modified.
- No migrations, no new server actions.
- User-facing copy says "grimoire"/"watchlist" — already baked into `PosterQuickAdd`; write no new copy.

---

### Task 1: Thread flags through ForYouShelves and wrap shelf posters

**Files:**
- Modify: `app/components/ForYouShelves.tsx`
- Modify: `app/components/ShelfCarousel.tsx`
- Modify: `app/app/films/page.tsx` (the `ForYouSection` async component at the bottom)

**Interfaces:**
- Consumes: `PosterQuickAdd` from `@/components/PosterQuickAdd` — props `{ filmId: string; initialOnWatchlist: boolean; initialInLibrary?: boolean; filmTitle?: string; filmYear?: number; sharerUsername?: string | null; children: ReactNode }`.
- Produces: `ForYouShelves` gains required props `watchlistIds: string[]`, `libraryIds: string[]`, `sharerUsername: string | null`. `ShelfCarousel` gains required props `watchlistIds: Set<string>`, `libraryIds: Set<string>`, `sharerUsername: string | null`. Task 2 relies on `ForYouShelves` holding `watchlistSet`/`librarySet` (`Set<string>`) and `sharerUsername` in scope where `DailyOmenHero` is rendered.

- [ ] **Step 1: Update `ForYouSection` in `app/app/films/page.tsx`**

Replace the existing `ForYouSection` function with:

```tsx
async function ForYouSection({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [shelvesResult, watchlistRes, libraryRes, profileRes] = await Promise.all([
    getForYouShelves(supabase, userId),
    supabase.from("watchlists").select("film_id").eq("user_id", userId),
    supabase.from("library").select("film_id").eq("user_id", userId),
    supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
  ]);
  const { omen, shelves, filmsById, scoredById } = shelvesResult;
  return (
    <ForYouShelves
      omen={omen}
      shelves={shelves}
      filmsEntries={Array.from(filmsById.entries())}
      scoredEntries={Array.from(scoredById.entries())}
      watchlistIds={(watchlistRes.data ?? []).map((r) => r.film_id)}
      libraryIds={(libraryRes.data ?? []).map((r) => r.film_id)}
      sharerUsername={profileRes.data?.username ?? null}
    />
  );
}
```

- [ ] **Step 2: Accept and thread the new props in `app/components/ForYouShelves.tsx`**

Extend the `Props` interface:

```tsx
interface Props {
  omen: ScoredFilm | null;
  shelves: Shelf[];
  filmsEntries: Array<[string, FilmLite]>;
  scoredEntries: Array<[string, ScoredFilm]>;
  watchlistIds: string[];
  libraryIds: string[];
  sharerUsername: string | null;
}
```

Update the component signature and add memoized sets right after `scoredById`:

```tsx
export default function ForYouShelves({
  omen, shelves, filmsEntries, scoredEntries, watchlistIds, libraryIds, sharerUsername,
}: Props) {
  const filmsById = useMemo(() => new Map(filmsEntries), [filmsEntries]);
  const scoredById = useMemo(() => new Map(scoredEntries), [scoredEntries]);
  const watchlistSet = useMemo(() => new Set(watchlistIds), [watchlistIds]);
  const librarySet = useMemo(() => new Set(libraryIds), [libraryIds]);
```

Pass them to each `ShelfCarousel` (leave the `DailyOmenHero` call site untouched in this task — Task 2 handles it):

```tsx
<ShelfCarousel
  key={shelf.id}
  shelf={shelf}
  filmsById={filmsById}
  scoredById={scoredById}
  dismissed={dismissed}
  onDismiss={onDismiss}
  onUndo={onUndo}
  registerCard={registerCard}
  watchlistIds={watchlistSet}
  libraryIds={librarySet}
  sharerUsername={sharerUsername}
/>
```

- [ ] **Step 3: Wrap shelf posters and move the ✕ in `app/components/ShelfCarousel.tsx`**

Add the import:

```tsx
import PosterQuickAdd from "./PosterQuickAdd";
```

Extend `Props` and the destructuring:

```tsx
interface Props {
  shelf: Shelf;
  filmsById: Map<string, FilmLite>;
  scoredById: Map<string, ScoredFilm>;
  dismissed: Set<string>;
  onDismiss: (filmId: string) => void;
  onUndo: (filmId: string) => void;
  registerCard: (el: HTMLElement | null, filmId: string) => void;
  watchlistIds: Set<string>;
  libraryIds: Set<string>;
  sharerUsername: string | null;
}

export default function ShelfCarousel({
  shelf, filmsById, scoredById, dismissed, onDismiss, onUndo, registerCard,
  watchlistIds, libraryIds, sharerUsername,
}: Props) {
```

In the card JSX, wrap the poster block (inside the existing `<Link>`) in `PosterQuickAdd`, and change the dismiss button's position from `right: 4` to `left: 4`. The full card block becomes:

```tsx
return (
  <div key={filmId} ref={el => registerCard(el, filmId)} data-film-id={filmId}
    style={{ flex: "0 0 140px", scrollSnapAlign: "start", position: "relative" }}>
    <Link prefetch={false} href={`/film/${filmId}`} style={{ textDecoration: "none", color: "inherit" }}>
      <PosterQuickAdd
        filmId={filmId}
        initialOnWatchlist={watchlistIds.has(filmId)}
        initialInLibrary={libraryIds.has(filmId)}
        filmTitle={film.title}
        filmYear={film.year}
        sharerUsername={sharerUsername}
      >
        <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
        {scored && <MatchPill band={scored.matchBand} covenFavorite={scored.covenFavorite} />}
      </PosterQuickAdd>
      <div className="head" style={{ fontSize: 14, lineHeight: 1.1, marginTop: 8 }}>{film.title}</div>
      <div className="caps" style={{ fontSize: 9, color: "var(--muted)", marginTop: 3 }}>{film.year}</div>
    </Link>
    <button
      type="button"
      aria-label={`Not interested in ${film.title}`}
      onClick={e => { e.preventDefault(); onDismiss(filmId); }}
      style={{
        position: "absolute", top: 4, left: 4, width: 22, height: 22,
        background: "rgba(10,10,10,0.75)", color: "var(--bone)",
        border: "1px solid var(--muted)", cursor: "pointer",
        fontSize: 11, lineHeight: 1, display: "grid", placeItems: "center",
        zIndex: 2,
      }}
    >
      ✕
    </button>
  </div>
);
```

Notes: the previous inner `<div style={{ position: "relative" }}>` around `FilmPoster`/`MatchPill` is replaced by `PosterQuickAdd`, whose `.poster-quick-add` class is already `position: relative` (see `app/app/styles/80-discovery-actions.css`) — `MatchPill` keeps its absolute anchor. `zIndex: 2` on the ✕ keeps it above the poster, matching the quick-add buttons' z-index.

- [ ] **Step 4: Typecheck and run the suite**

Run from `app/`:

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: typecheck clean; all existing vitest tests pass (no new tests — this is UI wiring with no component-test infra).

- [ ] **Step 5: Commit**

```bash
git add app/components/ForYouShelves.tsx app/components/ShelfCarousel.tsx app/app/films/page.tsx
printf 'feat(fyp): poster quick-add on For You shelves\n\nWrap shelf posters in PosterQuickAdd (watchlist/grimoire/share, mirroring\nBrowse); dismiss ✕ moves to the top-left corner. ForYouSection fetches\nwatchlist/library id sets + username for honest initial ✓ state.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_011ptcfKSpViXnrJ8jHjSpxC\n' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 2: Quick-add on the Daily Omen hero

**Files:**
- Modify: `app/components/DailyOmenHero.tsx`
- Modify: `app/components/ForYouShelves.tsx` (the `DailyOmenHero` call site only)

**Interfaces:**
- Consumes: from Task 1 — `watchlistSet: Set<string>`, `librarySet: Set<string>`, `sharerUsername: string | null` in `ForYouShelves` scope; `PosterQuickAdd` props as in Task 1.
- Produces: `DailyOmenHero` gains required props `onWatchlist: boolean`, `inLibrary: boolean`, `sharerUsername: string | null`.

- [ ] **Step 1: Extend `app/components/DailyOmenHero.tsx`**

Add the import:

```tsx
import PosterQuickAdd from "./PosterQuickAdd";
```

Extend `Props` and the signature:

```tsx
interface Props {
  film: FilmLite;
  scored: ScoredFilm;
  dismissed: boolean;
  onWatchlist: boolean;
  inLibrary: boolean;
  sharerUsername: string | null;
  onDismiss: (filmId: string) => void;
  onUndo: (filmId: string) => void;
}

export default function DailyOmenHero({
  film, scored, dismissed, onWatchlist, inLibrary, sharerUsername, onDismiss, onUndo,
}: Props) {
```

Wrap the poster block in `PosterQuickAdd` (replacing the `<div style={{ position: "relative" }}>` wrapper, same rationale as Task 1) and move the dismiss ✕ from `right: 8` to `left: 8`:

```tsx
<PosterQuickAdd
  filmId={film.id}
  initialOnWatchlist={onWatchlist}
  initialInLibrary={inLibrary}
  filmTitle={film.title}
  filmYear={film.year}
  sharerUsername={sharerUsername}
>
  <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
  <MatchPill band={scored.matchBand} covenFavorite={scored.covenFavorite} />
</PosterQuickAdd>
```

```tsx
<button
  type="button"
  aria-label={`Not interested in ${film.title}`}
  onClick={e => { e.preventDefault(); onDismiss(film.id); }}
  style={{
    position: "absolute", top: 8, left: 8, width: 26, height: 26,
    background: "rgba(10,10,10,0.75)", color: "var(--bone)",
    border: "1px solid var(--muted)", cursor: "pointer",
    fontSize: 13, lineHeight: 1, display: "grid", placeItems: "center",
    zIndex: 2,
  }}
>
  ✕
</button>
```

- [ ] **Step 2: Pass the new props at the call site in `app/components/ForYouShelves.tsx`**

```tsx
<DailyOmenHero
  film={omenFilm}
  scored={omen}
  dismissed={dismissed.has(omen.filmId)}
  onWatchlist={watchlistSet.has(omen.filmId)}
  inLibrary={librarySet.has(omen.filmId)}
  sharerUsername={sharerUsername}
  onDismiss={onDismiss}
  onUndo={onUndo}
/>
```

- [ ] **Step 3: Typecheck and run the suite**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add app/components/DailyOmenHero.tsx app/components/ForYouShelves.tsx
printf 'feat(fyp): poster quick-add on Daily Omen hero\n\nSame PosterQuickAdd wrap as shelf posters; hero dismiss ✕ moves to the\ncard top-left.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_011ptcfKSpViXnrJ8jHjSpxC\n' > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 3: Manual verification

**Files:** none (verification only).

**Interfaces:** consumes the shipped UI from Tasks 1–2.

- [ ] **Step 1: Start the dev server**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Sign in as a user with FYP signal (has logged/tagged films) and open `http://localhost:3000/films` (For You tab is the default for signed-in users).

- [ ] **Step 2: Desktop checklist (viewport > 720px)**

- Hovering a shelf poster reveals the **+** button top-right; clicking opens the Watchlist / Library pill menu; clicking a pill adds and toasts without navigating.
- A film already on the watchlist shows "✓ On Watchlist" disabled.
- The Daily Omen hero poster shows the same hover **+**; adding from it does not navigate the hero's card link.
- The ✕ sits top-left on shelf posters and the hero card; clicking it still dismisses (poster → "Hidden — undo") without navigating.

- [ ] **Step 3: Mobile checklist (viewport ≤ 720px or device emulation)**

- Each shelf poster and the hero show the **⋯** button top-right; tapping opens the bottom sheet (Log a watch / watchlist / grimoire / recommend / share).
- Adding to watchlist/grimoire from the sheet toasts and the sheet closes; already-saved films show ✓-disabled rows.
- The ✕ top-left still dismisses; undo works.
- Tapping the poster itself (not a button) still navigates to `/film/[id]`.

- [ ] **Step 4: Fix anything found, re-run gates, commit fixes**

If checklist items fail, fix, re-run typecheck + `npm test`, and commit with a `fix(fyp): …` message via `git commit -F`.
