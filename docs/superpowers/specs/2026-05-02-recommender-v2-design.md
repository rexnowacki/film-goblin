# Recommender v2 — Sub-project #36

**Status:** Spec.
**Builds on:** Sub-project #35. Same `/for-you` route + `<ForYouRow>` shell; the math underneath gets sharper, plus a calibrated percentage surfaces on the UI.
**No schema changes.** Pure algorithm + display.

## Goal

Two outcomes:
1. **A stable percentage** ("you are 91% likely to enjoy this") that doesn't drift as the user accumulates signal — anchored to the user's own verdicts (`watched.recommended` true/false).
2. **More accurate ranking** via TF-IDF tag weighting, affinity caps, visible-tag boost, time decay, and similarity-weighted coven borrowing.

## What changes

- `<ForYouRow>` gets a **match pill** (top-right of poster, pink bg, bone text, e.g. "94%") for users with ≥3 verdicts. Below that threshold, fall back to a **verbal pill** ("strong match" / "your kind") so the UI never shows a misleading number.
- The recommender's score-to-percentage mapping is the user's own liked/disliked distribution.
- Tag-frequency weighting (TF-IDF) makes distinctive tags (`breakup horror`, `kaiju`) outweigh near-universal ones (`atmospheric`, `bleak`).
- Affinity per tag is capped at 30, preventing single-tag dominance.
- Visible-tag weighting (positions 1-4 in `film_tags`) gets a 1.3× boost — honors the staff guide's "editorial capsule."
- Old liked watches decay at `0.5^years` so current taste dominates ancient history.
- Coven mates' contributions are weighted by **how similar their vector is to yours** (cosine), so close-taste mates matter more than distant ones.

## What stays the same

- The base 6-signal weight table (+3.0 watch+liked, etc.) — still the primary driver.
- The 4-layer cold-start composition — still additive (own + lanes + coven).
- The 7-facet multipliers (Primary subgenre 3.0 → Content 0.5).
- Already-watched / disliked films still excluded from `/for-you`.

## Algorithm changes

### 1. TF-IDF tag weighting

Computed at scoring time, not affinity-build time. Once per request:

```
N = total_films_in_catalog
df(t) = number_of_films_tagged_with_t
idf(t) = log(N / df(t))
```

In `scoreFilms`, multiply each tag's contribution:

```
contribution = affinity[tag] × facet_multiplier(tag) × idf(tag.name)
```

A tag on 60% of films contributes ~`log(1/0.6) = 0.51` IDF; a tag on 5% of films contributes ~`log(1/0.05) = 3.0`. Distinctive tags now ~6× more influential than near-constants — without retroactively rewriting historical affinity.

### 2. Affinity cap

In `getUserOwnAffinity`, after summing all signal contributions per tag:

```
byTag[t] = max(0, min(byTag[t], 30))
```

Floor at 0 (existing). Ceiling at 30 (new). Prevents one runaway tag from drowning the rest of the vector.

### 3. Visible-tag weighting

In `scoreFilms`, when computing per-tag contribution:

```
position_boost = tag.position <= 4 ? 1.3 : 1.0
contribution = affinity × facet_multiplier × idf × position_boost
```

Position 1-4 in `film_tags` = the editorial capsule (Primary + 3 distinguishing). Boosted 1.3×. Hidden tail unchanged.

### 4. Time decay

In `getUserOwnAffinity`, when computing each signal's contribution:

```
years_old = (now - signal.created_at) / 365.25 days
decay = 0.5 ** years_old
weighted_signal = base_weight × decay
```

A 2-year-old like contributes 0.75 instead of 3.0. Recent signals dominate. Each row needs its `created_at` — already there on `watched`, `library`, `watchlists`, `activity`, `activity_reactions`.

### 5. Similarity-weighted coven borrowing

In `getCovenBorrowedAffinity`, replace equal-weight (or interaction-score-weight) averaging with cosine similarity to the user's own vector:

```
sim(mate) = cosine(user_own_vector, mate_own_vector)
weighted = mate_vector × max(0, sim(mate))
total = sum(weighted) / sum(sim(mate))   // normalize
final_borrow = total × 0.3              // existing prior scale
```

Negative similarity (very different taste) zeroes out — they don't pull the vector toward themselves. Falls back to interaction-score weighting when the user's own vector is empty (cold-start).

### 6. Verdict-anchored calibration

New file `app/lib/queries/fyp/calibration.ts`:

```typescript
export interface CalibrationStats {
  likedMean: number;
  dislikedMean: number;
  likedCount: number;
  dislikedCount: number;
  totalRatings: number;
}

export async function getCalibrationStats(client, userId): Promise<CalibrationStats>;
//   Score every film the user has rated (recommended = true OR false), bucket
//   the scores by verdict, return means + counts.

export function scoreToPercentage(score: number, stats: CalibrationStats): {
  pct: number | null;        // 0..100, or null if cold-start mode
  mode: "calibrated" | "verbal";
  verbalKind?: "strong" | "good" | "neutral" | "weak";
};
//   Cold-start (totalRatings < 3): mode="verbal", pct=null, kind chosen
//   from quartiles of the catalog score distribution.
//   Calibrated mode: pct = clip((score - dislikedMean) / (likedMean - dislikedMean), 0, 1) * 100.
//   When dislikedCount = 0: floor = 0 instead of dislikedMean.
//   When likedCount = 0: cold-start (verbal).
```

Cold-start verbal kinds:
- "strong match" — top quartile of the user's catalog scores
- "your kind" — second quartile
- "interesting pick" — third quartile  
- (fourth quartile: pill suppressed entirely — film barely matches, no pill needed)

### 7. UI: match pill

New component `app/components/MatchPill.tsx`:

```tsx
interface Props {
  pct: number | null;
  verbalKind?: "strong" | "good" | "neutral" | "weak";
}
// renders:
//   pct mode: <span className="match-pill">94%</span>
//   verbal mode: <span className="match-pill match-verbal">strong match</span>
//   suppressed (pct null + no verbal): renders nothing
```

CSS positioning: top-right corner of poster, pink bg, bone text, `border-radius: 999px`. Mirrors `.poster-drop-badge` location (which moved to bottom-left in #132).

`<ForYouRow>` integration: render `<MatchPill>` over the poster (poster wrapper gets `position: relative`).

## Test surface

Pure-function tests, no env required:

- **TF-IDF in scoreFilms:** a film with one rare tag scores higher than a film with one common tag, all else equal.
- **Affinity cap:** raw cumulative > 30 clips to 30.
- **Visible-tag boost:** identical tag affinity × matching tag, but at position 1 vs position 6, position 1 contributes 1.3× more.
- **Time decay:** signal `created_at = now() − 2 years` contributes 0.25× of its base weight.
- **Cosine-weighted coven:** mate with identical vector contributes more than mate with orthogonal vector; orthogonal mates contribute zero.
- **scoreToPercentage:** hits 0% when score == dislikedMean, 100% when score == likedMean, 50% halfway, clipped above/below.
- **Cold-start:** totalRatings < 3 returns verbal mode.

## Files

| File | Status |
|---|---|
| `app/lib/queries/fyp/affinity.ts` | extend (cap + time decay + cosine coven weighting) |
| `app/lib/queries/fyp/score.ts` | extend (TF-IDF + visible-weight + signature change for `idf` param) |
| `app/lib/queries/fyp/calibration.ts` | new |
| `app/lib/queries/fyp/forYou.ts` | extend (compute IDF per-request, fetch calibration, attach pct to ScoredFilm) |
| `app/components/MatchPill.tsx` | new |
| `app/app/globals.css` | extend (`.match-pill`, `.match-verbal` styles) |
| `app/components/ForYouRow.tsx` | extend (render `<MatchPill>`, accept new pct/verbal props) |
| `app/lib/actions/fyp/load-more.ts` | extend (pct/verbal flow through wire shape) |
| `app/components/ForYouFeed.tsx` | extend (cumulative state retains pct/verbal) |
| `app/tests/queries/fyp/score.test.ts` | extend (TF-IDF + visible-weight specs) |
| `app/tests/queries/fyp/affinity.test.ts` | extend (cap + decay + cosine coven specs) |
| `app/tests/queries/fyp/calibration.test.ts` | new |

## Risks

1. **TF-IDF is principled but unverified at small catalog sizes.** With 150 films, IDFs are noisy; rare tags with 1-2 occurrences might over-influence. Mitigated by the affinity cap (30) preventing pathological cases.
2. **Time decay assumes fresh-is-better.** Some users have stable lifelong taste; halving 2-year-old likes might be wrong for them. Half-life of 1 year is aggressive; if anyone complains, dial to `0.7^years` (= 2-year half-life).
3. **Cosine-weighted coven cold start.** A user with empty own-vector has no anchor for cosine. Falls back to interaction-score weighting in that case.
4. **The verbal pill is editorial.** "strong match" / "your kind" / "interesting pick" copy is a design call. If it reads weird, easy to swap.

## Changelog

- v1 (this doc, 2026-05-02) — initial spec.
