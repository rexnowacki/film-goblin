# FYP Re-Exposure: Discover Shelves, Daily Omen, Feedback Loops — Design

**Date:** 2026-07-01
**Status:** Approved
**Sub-project:** FYP v3.5 — re-expose the For You recommender inside Discover with shelf presentation, a daily habit anchor, and feedback loops.

## Problem

The FYP recommender (v3, sub-project #35) shipped complete but was unlinked
from navigation on 2026-05-02 (commit `4e454ba`) and has been dark since. The
route `/for-you` still works; nothing links to it.

Beyond re-exposure, the current experience has three gaps relative to
best-in-class For You surfaces (Spotify home, Instagram FYP):

1. **Static presentation.** One flat ranked list. The order is fully
   deterministic and only changes when the user logs new signals — visiting
   twice in a week shows the identical page.
2. **No feedback loop.** There is no way to say "not interested," and the
   system re-shows the same top films indefinitely regardless of how many
   times the user has scrolled past them.
3. **No habit anchor.** Nothing about the page rewards a daily visit.

Goals chosen for this iteration: **shelf presentation**, **feedback loops**
("not interested" + impression fatigue), and a **habit engine** in the form of
a single Daily Omen. Explicitly deferred: full feed freshness/rotation,
streaks, notification nudges, tap-through signals, and any v4 ranking rework
(MMR/exploration/materialized recs) — revisit once feedback data exists.

## Decision summary

| Decision | Choice |
|---|---|
| Nav placement | Fold into Discover: `/films` becomes a two-tab shell — **For You** (default, signed-in) + **Browse All** (existing catalog UI). No bottom-nav change; `/for-you` redirects to `/films`. |
| Architecture | Presentation-layer shelves on top of the untouched v3 scorer. New pure module `fyp/shelves.ts`. |
| Habit engine | Daily Omen: one seeded personalized pick per day. No cron, no schedule. |
| Feedback | `fyp_not_interested` (explicit dismiss → exclusion + aversion signal) and `fyp_impressions` (fatigue damping). |
| Ranking math | v3 untouched except two additive context inputs (dismissal exclusion, fatigue multiplier). |

## 1. Data model

### Migration 0206 — `fyp_impressions`

```sql
CREATE TABLE fyp_impressions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  impressions int NOT NULL DEFAULT 1,
  first_shown_at timestamptz NOT NULL DEFAULT now(),
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);
```

- RLS: users SELECT their own rows. Writes go only through the RPC below
  (no direct INSERT/UPDATE grants to the client role beyond what the RPC
  needs as SECURITY DEFINER).
- RPC `record_fyp_impressions(p_film_ids uuid[])` — SECURITY DEFINER
  PL/pgSQL, race-safe batch upsert:
  `INSERT ... ON CONFLICT (user_id, film_id) DO UPDATE SET impressions =
  fyp_impressions.impressions + 1, last_shown_at = now()`. Uses `auth.uid()`
  for user identity; caps `p_film_ids` at 50 per call. Follows the
  `burn_invite_code` precedent for search_path pinning (`public, extensions`
  — remember mig 0176's lesson).

### Migration 0207 — `fyp_not_interested`

```sql
CREATE TABLE fyp_not_interested (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, film_id)
);
```

- RLS: users SELECT/INSERT/DELETE their own rows (DELETE = undo).

No schema needed for "New to the Pit" — `films.added_at` already exists.

After both migrations: regenerate `app/lib/supabase/types.ts`
(`npm run gen:types`), committed in its own PR per the collision-hot-spot
rule if the other machine is active.

## 2. Scoring changes (v3 → v3.5, additive only)

All v3 math is preserved. Two new inputs on `ScoreContext` in `score.ts`:

### 2a. Dismissal exclusion + aversion contribution

- `notInterestedFilmIds: Set<string>` — filtered in the `scoreFilms` loop
  exactly like `userWatchedFilmIds` / `userDislikedFilmIds`.
- Dismissed films' tags feed the aversion vector: new entry in
  `SIGNAL_WEIGHTS` (`affinity.ts`): `not_interested: -1.5`. Weaker than
  `watch_disliked: -4.0` — "not for me" is milder than "watched and hated."
  `getUserAversion` gains a query against `fyp_not_interested` joined to the
  dismissed films' tags, weighted like any other negative signal (time decay
  applies as usual).

### 2b. Impression fatigue

- `impressionsByFilm: Map<string, number>` — raw impression counts.
- Applied in `scoreOneFilm` **after** all existing math, as a multiplier:

```
FATIGUE_FREE_IMPRESSIONS = 3   // first 3 impressions cost nothing
FATIGUE_K = 0.15               // damping rate per impression beyond free
FATIGUE_FLOOR = 0.35           // a great match sinks but never vanishes

excess = max(0, impressions - FATIGUE_FREE_IMPRESSIONS)
multiplier = max(FATIGUE_FLOOR, 1 / (1 + FATIGUE_K * excess))
score *= multiplier
```

- Three single-line tunables, documented in `fyp/CLAUDE.md` beside the
  existing levers with the same "if X feels wrong, turn Y" guidance
  (feed feels sticky → raise `FATIGUE_K`; good films vanish → raise
  `FATIGUE_FLOOR`).

## 3. Shelf assembly — `app/lib/queries/fyp/shelves.ts`

Pure function, no DB calls (testable like `score.ts`):

```ts
buildShelves(input: {
  scored: ScoredFilm[];          // already sorted by getForYou's score path
  filmsById: Map<string, FilmLite & { added_at: string }>;
  affinity: AffinityVector;      // for "Because you loved [tag]" selection
  seed: number;                  // hash(userId + YYYY-MM-DD UTC), mulberry32
  now: Date;
}): { omen: ScoredFilm | null; shelves: Shelf[] }

interface Shelf {
  id: string;                    // stable per kind+tag, e.g. "loved:folk-horror"
  kind: "hexed" | "loved_tag" | "coven" | "new" | "strange" | "starter";
  title: string;                 // display title, e.g. "Because you loved folk horror"
  filmIds: string[];
}
```

### Placement rules

Each film appears in **at most one shelf** (first claim wins, priority
order below). The Omen film is excluded from all shelves.

1. **Daily Omen** — seeded pick from the top 12 eligible scored films.
   Deterministic within a UTC day; changes at midnight. No cron, no state.
   If the pick becomes ineligible mid-day (watched/dismissed), the seeded
   index naturally re-lands on the next candidate at next render.
2. **Hexed for You** — remaining `hexed`-band films, up to 12.
3. **Because you loved [tag]** (×2) — the user's two strongest tags from
   `affinity.byTag` (highest weight). A film qualifies if its
   `topReason.tagName` matches. Up to 10 each.
4. **Coven Favorites** — `covenFavorite === true`, ordered by coven rating
   descending. Up to 10.
5. **New to the Pit** — `added_at` within 30 days of `now`, any band except
   `cursed_artifact`. Ordered by `added_at` descending. Up to 10.
6. **Strange Pulls** — seeded sample of 8 from the `strange_pull` band.
   The deliberate-wildcard shelf.

### Diversity guard (within every shelf)

- No two consecutive films by the same director (swap-down repair pass).
- Max 3 films per primary subgenre per shelf (overflow skipped, later
  films promoted).

### Degenerate cases

- Shelves with < 3 films are dropped entirely (no thin shelves).
- Cold-start (empty affinity): Omen = seeded pick from the editorial starter
  pack; one shelf `kind: "starter"`, title "Starter Séance", alphabetical.
- Empty catalog path (everything watched/dismissed): omen `null`, shelves
  `[]`; UI shows the existing "that's everything" empty state.

## 4. Orchestrator — `getForYouShelves` in `forYou.ts`

Wraps the existing fetch phase:

- Reuses `getForYou`'s parallel fetch block, extended with two queries:
  `fyp_impressions` (own rows) and `fyp_not_interested` (own rows).
  `films` select adds `added_at`.
- Builds the extended `ScoreContext`, calls `scoreFilms` (now
  fatigue/dismissal-aware), then `buildShelves`.
- Returns `{ omen, shelves, filmsById }`. Shelves are fully materialized
  (≤ ~60 films total) — **no pagination**; the rank-offset cursor and
  `loadMoreForYou` action retire with the flat list.
- The old `getForYou` stays temporarily as the internal score-path helper;
  its public flat-list shape is no longer consumed by any page.

## 5. UI — the Discover shell

### Routes

- `/films/page.tsx` becomes the shell: tab switcher **For You** (default
  for signed-in users) / **Browse All**. Anon visitors see Browse All only,
  no tabs. Tab state via `?tab=browse` search param so both states are
  linkable and back-button friendly.
- **Browse All** = the existing films grid, sort chips, and search, moved
  intact under the tab. Zero behavior change.
- `/for-you` route replaced with a permanent redirect to `/films`.
- Bottom nav: unchanged (Discover already points at `/films`). TopNav:
  unchanged.

### New components (`app/components/`)

- **`DiscoverTabs`** — the two-tab header, matching `FeedTabs` idiom.
- **`DailyOmenHero`** — full-width hero: poster, "DAILY OMEN" caps label,
  film title, band pill, reason line, tap → `/film/[id]`. Uses existing
  design tokens; distinct but consistent with `GoblinRecommends`.
- **`ShelfCarousel`** — title row + horizontal scroll of poster cards
  (`FilmPoster` + `MatchPill`), `-webkit-overflow-scrolling: touch`,
  scroll-snap. Cards reuse the existing poster idiom from `/films`.
- **`NotInterestedButton`** — small ✕ overflow control on each shelf card
  (and the Omen). Optimistic removal from the shelf + undo toast via
  `ToastProvider`. Calls `setNotInterested`; undo calls `undoNotInterested`.
- **`useImpressionLogger`** (hook) — one `IntersectionObserver` per shelf
  container; a card counts as an impression when ≥ 50% visible for ≥ 1s.
  Batches film ids in a `Set`, flushes every 5s and on `visibilitychange`/
  unmount via `recordFypImpressions`. Each film id flushed at most once per
  page view.

### iOS PWA rules

Shell page keeps `100dvh` sizing and existing `TopNavChrome` safe-area
behavior. Carousels must not introduce horizontal page overflow (see the
iOS auto-zoom memory) — carousel overflow is contained per-shelf with
`overflow-x: auto` on the carousel element only.

## 6. Server actions — `app/lib/actions/fyp.ts`

All follow the `_private`/public split and `requireAuthUser`:

- `recordFypImpressions(filmIds: string[])` — fire-and-forget from client;
  calls the RPC. Caps at 50 ids; silently no-ops on empty input.
- `setNotInterested(filmId: string)` — insert; `revalidatePath("/films")`.
- `undoNotInterested(filmId: string)` — delete; `revalidatePath("/films")`.

## 7. Error handling

- **Impression flush fails** → dropped silently (losing impressions costs
  nothing; next visit re-records). No user-visible error, no retry queue.
- **Dismiss fails** → optimistic removal rolled back, toast "Couldn't hide
  that — try again."
- **RPC unavailable** (deploy skew) → impressions no-op; page renders fine
  (fatigue defaults to zero impressions).
- Rollout order: **apply migrations before deploying the app** (the app
  reads the new tables; old app code ignores them — reverse of the 0203
  situation, and non-breaking in both directions since all reads are
  new-code-only).

## 8. Testing

- **`shelves.test.ts`** (pure): placement priority + single-shelf dedup;
  diversity guard (director adjacency, subgenre cap); thin-shelf drop;
  omen stability within a day / change across days (fixed seeds); omen
  exclusion from shelves; cold-start starter shelf; empty-pool case.
- **`score.test.ts` extensions**: fatigue multiplier math (free threshold,
  floor), dismissal exclusion, `not_interested` aversion weight flowing
  through `getUserAversion` (unit level with stub client).
- **RLS tests** (`db/tests/rls/`): both tables (own-rows only, cross-user
  denied), RPC increments + caps, `bond()` unaffected.
- **Existing FYP tests** must pass untouched — v3 math is unchanged when
  both new context inputs are empty.
- Manual smoke: signed-in Discover shows Omen + shelves; anon shows Browse
  All; dismiss hides + undo restores; impressions accumulate in the table.

## Out of scope (deferred)

- Feed-order freshness/rotation beyond the Omen and Strange Pulls seeding.
- Streaks, push/email nudges (pairs with a future Web Push sub-project).
- Tap-through positive signal.
- v4 ranking work (MMR across the whole page, exploration slots,
  materialized per-user recs).
- Reusing the Omen in `GoblinRecommends` / `/home` sidebar.
