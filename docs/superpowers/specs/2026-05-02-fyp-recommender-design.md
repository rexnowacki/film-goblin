# FYP Recommender — Sub-project #35

**Status:** Spec draft. Not yet planned.
**Builds on:** Sub-project #33 (tagging system v2). The seven-facet positional schema, hidden tag tail, and 115 curated films are the inputs this recommender consumes.
**Source of truth (editorial):** `filmgoblin-tagging-guide-v2.pdf` for what tags mean.
**Source of truth (system):** this document.

## Goal

Ship the FYP recommender that the tagging work has been building toward. Users get a `/for-you` route that ranks the catalog by personal affinity, computed from their behavior signals × `film_tags`. Tag listing pages at `/tags/[name]` ship in the same sub-project so anyone can drill into a specific facet. Lanes on `/settings` let users seed an affinity vector before they have watch history.

## What changes for users

- **New `/for-you` route.** Single vertical poster grid ranked by personal affinity. Each row: poster + title + tiny italic "why" caption ("matches your folk horror affinity," "highly rated by your coven," etc.). Infinite scroll matches `/home`.
- **New `/tags/[name]` route.** Any film with that tag, ranked alphabetically (or by `coven_rating_pct` desc — see open questions). Reachable from any tag pill rendered on `/film/[id]`.
- **Lanes on `/settings`.** A new section with chip-pill picker over the canonical sub-genre + tone vocabulary. Tap 3–8 you're into → seeded into your affinity. Optional, opt-in. Can be edited any time.
- **Editorial starter pack on `/for-you` for true-cold users.** A hand-curated 20-film list shows up when the user has no coven, no watches, no signals at all.

## What stays out of scope

- **`horror_adjacent` filtering** on `/for-you`. The flag exists (set on thriller-Primary films), but defaulting to "exclude" or adding a toggle is deferred to a follow-up. Thriller-Primary films currently rank like any other film.
- **Per-section "Because you liked X" rows.** Sectioned discovery (Netflix-style horizontal strips) is a much bigger UX surface; spec scoped intentionally to the single-feed shape.
- **Caching layer.** Affinity vector is computed on-demand for v1. Code structure documented below makes it surgical to add a cache when scaling demands it.
- **Negative-rated film blocking.** If a user logs `recommended=false` for a film, we lower affinity for that film's tags but keep the film itself in the candidate pool. Hard-blocking those specific films from `/for-you` is deferred.
- **Cross-coven affinity propagation.** Your coven mates' watches feed your coven-borrowed signal directly, but their *coven mates'* affinities don't propagate to you. One hop only.

## The signal model

Each behavior signal contributes to the user's per-tag affinity vector. For an event affecting film F, every tag T on F gains `weight × facet_multiplier` (see scoring math below). Per-tag affinity is **floored at 0** — heavy negatives can dampen but not invert.

| Signal | Weight | Source |
|---|---|---|
| `watch_logged` w/ `recommended = true` | **+3.0** | `watched.recommended` column |
| `recommendation_sent` (sender only) | **+2.5** | `activity` rows where `actor = me`, `kind = 'recommendation_sent'` |
| `library_added` | **+1.5** | `library` rows where `user_id = me` |
| `watchlist_added` | **+0.75** | `watchlists` rows where `user_id = me` |
| `activity_reactions` (you reacted to a film-mentioning activity) | **+0.20** | `activity_reactions.user_id = me`, joined to parent `activity` whose payload references a film |
| `watch_logged` w/ `recommended = false` | **−4.0** | `watched.recommended = FALSE` |

### Notes

- **Recommendation_sent is sender-only.** Receiving a rec isn't a positive signal — you didn't choose it. (Receiving a rec might cause you to watchlist or watch the film, which then flow through the normal weights.)
- **Activity reactions count for the reactor only**, not the actor of the parent activity. The actor already has their own watch/watchlist/library signal for the same film, so double-counting from received hearts adds nothing.
- **Negatives floor to zero per-tag.** A user who watches and dislikes 10 slashers won't accumulate enough negative weight on `slasher` to make the tag actively repulsive — but the tag's affinity will be 0, effectively dropping any film whose only signal-bearing tag is `slasher`.
- **No time decay in v1.** A 2-year-old "loved" watch weighs the same as a yesterday watch. Adding decay later is a single multiplier; not premature.

## The scoring math

For a candidate film F with tags `[t1..tn]` (all positions, including hidden tail) and a user vector `affinity[tag]`:

```
film_score(F) = Σ over tags t in F:
  affinity[t.name] × facet_multiplier(t.type, t.is_primary)
```

Where `facet_multiplier`:

| Facet | Multiplier |
|---|---|
| Sub-genre, Primary (`is_primary = true`) | **3.0** |
| Sub-genre, Secondary (`is_primary = false`) | **1.5** |
| Tone | **1.5** |
| Theme | **1.5** |
| Subject | **1.0** |
| Setting | **0.75** |
| Content | **0.5** |

Reasoning: matching on `folk horror` (form) is more predictive of taste than matching on `gore` (intensity descriptor). The doc's "Sub-genre is the truest form" framing is encoded directly in the multipliers.

**Excluded from scoring:**

- Films the user has already watched (`watched` rows). The recommender is for surfacing what to watch *next*, not re-litigating completed films. Open question: should already-on-watchlist films still appear (they're already on the user's radar)? V1: yes, include them. The user can re-discover their own watchlist via `/watchlist`.
- Films the user has marked `recommended = false`. Even though their tags would penalize their score via the negative-weight signal, an already-disliked film should never resurface as a recommendation.
- Films with `available = false` (`films` table). The catalog filters these out everywhere.

## Vector composition — cold-start layers

The user's per-tag affinity is the sum of up to four sources, each independently active based on data availability:

```
affinity[t] = own_signals[t]
            + lane_signal[t]              // if lanes set in /settings
            + coven_borrowed[t]           // if any coven bonds
            + 0                           // editorial starter never feeds the vector
```

### Layer 1: Own signals (Q1 weights × facet multipliers, floored at 0)

The dominant source once the user has any behavior. Computed in `getUserOwnAffinity(userId)`.

### Layer 2: Lane signal (opt-in via `/settings`)

If the user has selected lanes (a small set of tags they're into), each lane tag adds **+1.5** to their per-tag affinity. Lane weight is intentionally smaller than a single liked watch (+3.0 × facet multiplier) so behavior dominates lanes once it exists.

### Layer 3: Coven-borrowed (interaction-weighted average)

For users with at least one coven bond:

```
coven_borrowed[t] = (Σ over coven mates m: getUserOwnAffinity(m)[t] × interaction_score(m))
                  / total_interaction_score
                  × 0.3
```

`interaction_score(m)` is the same 90-day score from `getRankedCovenfolk` (#34) — closer covenfolk's affinities matter more. The trailing `× 0.3` keeps borrowed signals as a prior, not the dominant source — your closest covenfolk's `+3.0 watch+liked` becomes a `+0.9` contribution to your vector, which a single own-watch overrides.

### Layer 4: Editorial starter pack

Only when **all three** layers above are empty (no lanes, no coven bonds, no own signals). Bypass scoring entirely and return a hardcoded list of ~20 highly-tagged, broadly-acclaimed films (Hereditary, The VVitch, Suspiria 2018, Possession, The Thing, Midsommar, etc — exact list editorial). Stored as `films.editorial_starter BOOLEAN` (mig 0154; see Schema).

This list is for the strict cold start only. The moment a user gets one signal (forms a coven bond, sets lanes, watches a film), they leave State 1 and the real vector takes over.

## `/for-you` route

```
┌──────────────────────────────────────────────────────────────┐
│  HERO: For You.                                              │
│                                                              │
│  ┌─────────┐  THE WITCH                                      │
│  │ poster  │  matches your folk horror affinity              │
│  └─────────┘                                                 │
│                                                              │
│  ┌─────────┐  HEREDITARY                                     │
│  │ poster  │  highly rated by your coven                     │
│  └─────────┘                                                 │
│                                                              │
│  ┌─────────┐  POSSESSION                                     │
│  │ poster  │  matches your obsession + family trauma lanes   │
│  └─────────┘                                                 │
│  …                                                           │
└──────────────────────────────────────────────────────────────┘
```

Single column, infinite-scroll, 20-at-a-time. Same `IntersectionObserver` + Load-more pattern from `/home` (sub-project #36 / PR #126 + #128). Each row tap → `/film/[id]`.

### "Why" caption logic

The caption explains the strongest contribution to that film's score. Five canonical reason kinds, picked by the LARGEST contributing factor:

| Reason | Triggered when |
|---|---|
| "matches your `<top tag>` affinity" | Own-signals contributed >50% of the score, top tag is the highest-weighted match |
| "highly rated by your coven" | Coven-borrowed contributed >50%, AND the film has `coven_rating_pct ≥ 70` (uses #24's stat) |
| "matches your `<lane>` lane" | Lane signal contributed >50% |
| "from a director you've watched" | Special-case: the film's `films.director` matches a director from the user's watch history. Prepended to whatever caption above would otherwise apply. |
| "starter pick" | True cold start — appears on every row in the editorial list |

Captions render in italic muted text, fontSize 12, beneath the poster's title row. Identical visual treatment to existing italic captions on `/films` poster grid.

### Filters / sort

V1: no filter chips, no sort options. Pure ranked feed. Adding genre/year/decade chips is a follow-up.

### Excluded films

(Per the scoring section above): already-watched films, `recommended=false` films, and `available=false` films. No "I've already added this to my watchlist" filter — those still appear (the recommender is for discovery, not list-management).

## `/tags/[name]` listing pages

URL: `/tags/folk%20horror` (URL-encoded for spaces). Page shows every film with that tag. No login required (public read).

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  HERO: Folk Horror.                                          │
│                                                              │
│  Films tagged folk horror, ranked by your coven's verdict.   │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ poster   │ │ poster   │ │ poster   │ │ poster   │   …    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│  …                                                           │
└──────────────────────────────────────────────────────────────┘
```

Standard poster grid (matches `/films`). Sort default: `coven_rating_pct DESC NULLS LAST, year DESC`. Films with no coven rating yet sort below ones with ≥5 ratings. Caption row beneath poster: title + year + (if rated) `<pct>%`.

### Pill linkage

`<FilmTagsRow>` on `/film/[id]` (#33's render component) is the entry point — every visible pill becomes a link to its tag page. Director pill stays a non-link (director isn't a tag).

### URL handling

Tag names with hyphens (e.g. `coming-of-age`, `slow-burn`) URL-encode unchanged. Tag names with spaces (`folk horror`, `breakup horror`) become `%20`. The page reads the name from the route param, looks up the tag in the `tags` table, 404s if not found or if the name doesn't match an existing tag (case-sensitive).

## Lanes on `/settings`

New section, sits below the existing notification toggles.

### Shape

```
┌──────────────────────────────────────────────────────────────┐
│  Lanes                                                       │
│                                                              │
│  Tap tags you're into. We'll surface more of these on your   │
│  For You feed.                                               │
│                                                              │
│  Sub-genre                                                   │
│    [body horror] [folk horror] [giallo] [slasher] …          │
│                                                              │
│  Tone                                                        │
│    [arthouse] [bleak] [dreamlike] [psychedelic] …            │
│                                                              │
│  Theme                                                       │
│    [breakup horror] [family trauma] [obsession] …            │
│                                                              │
│  [ Save lanes ]                                              │
└──────────────────────────────────────────────────────────────┘
```

Three facets only — sub-genre, tone, theme — because they're the most personality-revealing. Adding subject/setting/content lanes would add noise (someone "into demons" but disliking folk horror has weak signal compared to "into folk horror").

No cap on lane count. Picking too many flattens the signal naturally.

Save uses an existing-shaped server action (mirror `_updateProfile`'s pattern from #20: a `setLanes` action that takes a `tagIds: string[]` and writes to `profiles.lane_tag_ids`).

## Schema

### Mig 0154 — minimal additions

```sql
-- 0154_fyp_recommender.sql
--
-- Two columns added in support of sub-project #35.

-- Lanes opt-in: per-user array of tag ids selected as personality lanes.
-- Empty array = no lanes set, no signal contribution.
ALTER TABLE profiles
  ADD COLUMN lane_tag_ids UUID[] NOT NULL DEFAULT '{}';

-- Editorial starter pack flag: ~20 hand-curated films. Used only when a
-- new user has no coven bonds, no lanes set, and no behavior signals.
-- Set via a one-shot UPDATE script after the migration applies.
ALTER TABLE films
  ADD COLUMN editorial_starter BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX films_editorial_starter_idx ON films(editorial_starter)
  WHERE editorial_starter = TRUE;

-- Defer the actual editorial picks to a separate UPDATE statement run by
-- staff after the schema lands. List management lives in editorial-controlled
-- SQL, not in source-controlled seed data — the picks will change as the
-- catalog grows.
```

### What's NOT in the schema

- **No affinity cache table.** v1 computes on-demand. When mid-scale demands it, add `user_affinity_cache (user_id PK, vector JSONB, computed_at TIMESTAMPTZ)` then.
- **No `user_film_score` materialization.** Score is computed at request time over the candidate pool.

## Code structure

Single file boundaries, one responsibility each. Designed so future cache layers drop in at clean seams.

### `app/lib/queries/fyp/affinity.ts` — vector building

```ts
export interface AffinityVector {
  // Map of tag name → cumulative affinity score (floored at 0).
  // Tags absent from the map have implicit affinity 0.
  byTag: Record<string, number>;
}

export async function getUserOwnAffinity(client, userId): Promise<AffinityVector>;
export async function getCovenBorrowedAffinity(client, userId): Promise<AffinityVector>;
export async function getLaneAffinity(client, userId): Promise<AffinityVector>;
export async function getUserAffinity(client, userId): Promise<AffinityVector>;
//   Sums own + coven_borrowed * 0.3 + lanes. Floors per-tag at 0.
//   This is the seam where a future cache wrapper drops in.
```

### `app/lib/queries/fyp/score.ts` — scoring

```ts
export interface ScoredFilm {
  film: FilmLite;
  score: number;
  // The tag/source that contributed the most to the score, used to drive
  // the "why" caption rendering.
  topReason: {
    kind: 'tag' | 'coven_rating' | 'lane' | 'director' | 'starter';
    tagName?: string;
    contribution: number;
  };
}

export function scoreFilms(
  films: Array<FilmLite & { tags: FilmTagRow[] }>,
  affinity: AffinityVector,
  ctx: { userWatchedFilmIds: Set<string>; userDislikedFilmIds: Set<string>; covenRatingByFilm: Map<string, number>; ownDirectors: Set<string>; lanesByTag: Set<string>; isStarter?: (filmId: string) => boolean },
): ScoredFilm[];
//   Pure function. No DB. Filters watched + disliked, returns sorted by score DESC.
```

### `app/lib/queries/fyp/forYou.ts` — orchestration

```ts
export interface ForYouPage {
  items: ScoredFilm[];
  nextCursor: string | null;  // a cursor over rank position, NOT created_at
  done: boolean;
}

export async function getForYou(client, userId, opts: { cursor?: string; limit?: number }): Promise<ForYouPage>;
//   1. Decide cold-start state: editorial / coven-only / lanes-only / behavior.
//   2. If editorial: return hand-curated list, skip everything below.
//   3. Build affinity via getUserAffinity.
//   4. Fetch candidate films (all `available = true` films, with tags joined).
//   5. Score via scoreFilms.
//   6. Slice by cursor + limit, return.
```

### Pagination

Cursor is the rank index (e.g., `?cursor=20` means "give me items ranked 20+"). Full list is computed on each request (small enough at current + mid scale); cursor just slices.

When cache lands later: cache stores the FULL ranked list per user, cursor still slices. Same API shape.

### `app/lib/actions/fyp/lanes.ts` — settings mutation

```ts
export async function setLanes(tagIds: string[]): Promise<{ ok: true } | { ok: false; error: string }>;
//   requireAuth (any signed-in user), validates ids exist + are subgenre|tone|theme,
//   writes to profiles.lane_tag_ids, revalidatePath('/settings') + '/for-you'.
```

## File map

| File | Status |
|---|---|
| `db/migrations/0154_fyp_recommender.sql` | new |
| `db/tests/rls/profiles.test.ts` | extend (verify lane_tag_ids RLS) |
| `app/lib/supabase/types.ts` | hand-edit (`profiles.lane_tag_ids`, `films.editorial_starter`) |
| `app/lib/queries/fyp/affinity.ts` | new |
| `app/lib/queries/fyp/score.ts` | new |
| `app/lib/queries/fyp/forYou.ts` | new |
| `app/lib/actions/fyp/lanes.ts` | new |
| `app/app/for-you/page.tsx` | new (the route) |
| `app/components/ForYouFeed.tsx` | new (client, infinite-scroll) |
| `app/components/ForYouRow.tsx` | new (poster + title + why caption) |
| `app/app/tags/[name]/page.tsx` | new (tag listing route) |
| `app/components/settings/LanePicker.tsx` | new (settings section) |
| `app/app/settings/page.tsx` | extend (mount LanePicker) |
| `app/components/FilmTagsRow.tsx` | extend (link pills to /tags/[name]) |
| `app/components/TopNav.tsx` / `BottomNav.tsx` | add /for-you to nav |
| `app/tests/queries/fyp/affinity.test.ts` | new (unit) |
| `app/tests/queries/fyp/score.test.ts` | new (pure-function unit) |

## Test surface

### Pure-function tests (no env required)

- `scoreFilms`: ordering by score DESC, watched-films excluded, disliked-films excluded, tie-break (alphabetical by film title), per-facet multiplier applied correctly, "topReason" picks the actual largest contributor.
- `getLaneAffinity`: empty lanes = empty vector, lanes set = +1.5 per tag.

### Integration tests (env-skipIf-gated, mirror existing pattern)

- `getUserOwnAffinity`: signal weights applied correctly across all six signal kinds, negatives floor at zero.
- `getCovenBorrowedAffinity`: aggregates from coven mates, weighted by interaction score, scaled by 0.3.
- `setLanes` action: validates tag types (subgenre/tone/theme only), rejects unknown tags, persists to `profiles.lane_tag_ids`.

### Manual smoke

- Create a fresh user → /for-you should show the editorial starter pack.
- Add one coven bond w/ an existing user → /for-you switches to coven-borrowed.
- Set lanes on /settings → /for-you's top hits shift toward those tags.
- Log a watch with `recommended=true` → that film's tags become own-affinity, /for-you reflects.
- Log a watch with `recommended=false` → that film's tags get penalized, similar films slide down.

## Open questions answered during brainstorm

| Q | Answer |
|---|---|
| Signal model | 6-signal weighted, negatives flooring at 0 per tag. Weights: +3 / +2.5 / +1.5 / +0.75 / +0.20 / −4. |
| Scoring math | Per-facet weighted sum. Primary 3 / Secondary 1.5 / Tone 1.5 / Theme 1.5 / Subject 1 / Setting 0.75 / Content 0.5. |
| Cold start | 4-layer additive: editorial (true cold) → coven-borrowed (any bond) → lanes (settings-set) → own behavior (any signal). |
| `/for-you` shape | Single ranked feed + tiny "why" caption per row. Infinite scroll. |
| Refresh cadence | On-demand, with code structured for surgical cache addition at `getUserAffinity` / `getCovenBorrowedAffinity` seams. |
| Scope | Core + tag pages. `horror_adjacent` filtering deferred. |

## Risks / open follow-ups

1. **Editorial starter pack management.** The 20-film list is set via a one-shot UPDATE in mig 0154 follow-up. It will get stale. Schedule a quarterly "review starter pack" reminder, or add a tiny admin UI later. Not for v1.
2. **Lane picker UX on a long vocabulary.** Sub-genre alone has 24 chips; tone has 16; theme has 21. Total 61 chips on /settings is a lot. Consider collapsing each facet into a `<details>` element by default, or showing only the top-N most-tagged ones. Implementer call.
3. **The "why" caption can lie.** A film whose top reason is "matches your folk horror affinity" might be ranked there because of a small folk-horror weight + several other small contributions. Caption-vs-actual-rank divergence will surface in QA. Acceptable for v1; tune wording if it causes surprise.
4. **Tag pages can be empty for sparsely-tagged tags.** `breakup horror` is on Midsommar + Possession only as of this writing. The page will show 2 films and look thin. Cap-acceptable; the doc-canonical vocab is fixed.
5. **Coven-borrowed affinity is one hop only.** Your friend's friend's affinity doesn't reach you. Defensible scope choice — multi-hop propagation is a research project.
6. **horror_adjacent stays in the candidate pool.** A user with no thriller affinity will see thriller-Primary films float to the bottom naturally, but they won't be hard-excluded. If real users complain about Holy Spider in their /for-you between horror films, the filter ships in a follow-up.

## Changelog

- v1 (this doc, 2026-05-02) — initial spec.
