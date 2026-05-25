# app/lib/queries/fyp/ — For You Page Recommender (v3)

## Architecture

Four files with strict separation:

- `affinity.ts` — builds the user's taste vector from their own signals + coven-borrowed signals + lane preferences. Exports `AffinityVector`, `SIGNAL_WEIGHTS`, `FACET_MULTIPLIERS`, `AFFINITY_CAP`, `DECAY_HALF_LIFE_YEARS`.
- `score.ts` — pure scoring logic. Takes `ScoreContext` (affinity vector + candidate films + supporting context), returns `ScoredFilm[]` sorted by score. No DB calls.
- `forYou.ts` — orchestrator. Calls `getUserAffinity`, detects cold-start, fetches candidate pool + tags + context in parallel, calls `scoreFilms`, slices by cursor.
- `forYou.ts` is the only file consumers should import.

## v3 design decisions

**Rank-percentile bands, not calibrated percentages.** v2 displayed a "94% match" style number. The math review flagged this as misleading at small data volumes (rated films feed both the user vector and the calibration anchors, creating circularity). v3 uses five named bands instead:

| Band | Percentile | Display |
|------|-----------|---------|
| `hexed` | top 10% | Hexed for You |
| `strong_omen` | 10–35% | Strong Omen |
| `good_omen` | 35–65% | Good Omen |
| `strange_pull` | 65–85% | Strange Pull |
| `cursed_artifact` | bottom 15% | suppressed (no pill) |

`calibration.ts` was deleted. If you need to revive percentage display, rebuild from scratch with LOO validation — do not restore the deleted file.

## Cold-start branch

If `getUserAffinity` returns an empty `byTag` map (no own signals, no coven bonds, no lane preferences), skip scoring entirely and return the editorial starter pack ordered alphabetically. The cold-start check is in `forYou.ts` immediately after fetching affinity.

## Tuning constants — all single-line, all in `affinity.ts`

- `SIGNAL_WEIGHTS` — how much each user action contributes to the affinity vector (watch_liked: 3.0, recommendation_sent: 2.5, library_added: 1.5, watchlist_added: 0.75, reaction: 0.20, watch_disliked: -4.0)
- `FACET_MULTIPLIERS` — how much each tag facet is weighted in the vector (subgenre_primary: 3.0 → content: 0.5)
- `AFFINITY_CAP` — per-tag ceiling to prevent ubiquitous tags (e.g. `atmospheric`) from dominating (30)
- `DECAY_HALF_LIFE_YEARS` — time-decay half-life; a 1-year-old signal contributes 0.5× (1)

Tuning levers in `score.ts`:
- `LENGTH_PENALTY_GAMMA` — penalizes films with very few tag signals relative to the pool
- `AVERSION_LAMBDA` — how strongly dislikes suppress a film's score
- IDF clamp bounds — prevents log(IDF) from going infinite on very rare or very common tags

If the FYP feed feels stale or repetitive, tune `AFFINITY_CAP` up. If it feels too predictable, tune `DECAY_HALF_LIFE_YEARS` down. If rare/niche films dominate, check the IDF bounds.

## Cursor shape

Rank-offset cursor: a stringified integer (`"20"` = skip first 20 items). Different from the activity feed's `created_at` timestamp cursor — do not mix them.
