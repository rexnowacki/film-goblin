# Recommender v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Ship recommender v2 — calibrated percentage on `<MatchPill>`, TF-IDF tag weighting, affinity caps, visible-tag boost, time decay, similarity-weighted coven borrowing.

**Architecture:** No schema changes. All algorithm changes live in existing files (`affinity.ts`, `score.ts`, `forYou.ts`) plus one new file (`calibration.ts`) and one new component (`<MatchPill>`).

**Spec:** `docs/superpowers/specs/2026-05-02-recommender-v2-design.md`. Read first.

---

## Task 1: TF-IDF + visible-tag weighting in `scoreFilms`

**Files:** `app/lib/queries/fyp/score.ts`, `app/tests/queries/fyp/score.test.ts`

- [ ] Add `idfByTag: Map<string, number>` to `ScoreContext`.
- [ ] In the per-tag loop, multiply contribution by `idfByTag.get(tag.name) ?? 1.0` and by `tag.position <= 4 ? 1.3 : 1.0`.
- [ ] Topreason calculation uses the same boosted contribution so the strongest tag attribution stays accurate.
- [ ] Tests: TF-IDF (rare > common, all else equal); visible-tag boost (position 1 contributes 1.3×).
- [ ] Commit: `feat(fyp): TF-IDF + visible-tag boost in scoreFilms`

## Task 2: Affinity cap + time decay in `getUserOwnAffinity`

**Files:** `app/lib/queries/fyp/affinity.ts`, `app/tests/queries/fyp/affinity.test.ts`

- [ ] Add `AFFINITY_CAP = 30` and `DECAY_HALF_LIFE_YEARS = 1` constants.
- [ ] Each query (`watched`, `library`, `watchlists`, `activity`, `activity_reactions`) selects `created_at`. Apply `decay = 0.5 ^ (yearsSince(created_at) / DECAY_HALF_LIFE_YEARS)` to each signal's contribution.
- [ ] After summing all contributions, cap each tag's affinity at `min(byTag[t], AFFINITY_CAP)` (in addition to the existing floor at 0).
- [ ] Tests: signal `created_at = now()` → no decay; `created_at = 1 year ago` → 0.5× contribution; `created_at = 2 years ago` → 0.25×. Cap test: synthetic input that would sum > 30 clips to 30.
- [ ] Commit: `feat(fyp): affinity cap + time decay in getUserOwnAffinity`

## Task 3: Similarity-weighted coven borrowing

**Files:** `app/lib/queries/fyp/affinity.ts`, `app/tests/queries/fyp/affinity.test.ts`

- [ ] In `getCovenBorrowedAffinity`, after fetching each mate's vector, compute `cosine(userOwn, mateOwn)` for each. Weight by `max(0, similarity)`. Normalize by sum of similarities.
- [ ] Cold-start: if user's own vector is empty, fall back to existing equal-weight or interaction-score weighting.
- [ ] Add `cosineSimilarity(a: AffinityVector, b: AffinityVector): number` helper, exported.
- [ ] Tests: identical mate vector → similarity 1.0 → full contribution; orthogonal vector → similarity 0 → zero contribution; opposite vector → negative cosine → zero contribution (clamped). Cold-start fallback path.
- [ ] Commit: `feat(fyp): cosine-weighted coven borrowing`

## Task 4: Calibration helper (verdict-anchored %)

**Files:** `app/lib/queries/fyp/calibration.ts` (new), `app/tests/queries/fyp/calibration.test.ts` (new)

- [ ] New file. Define `CalibrationStats` interface + `getCalibrationStats(client, userId)` and `scoreToPercentage(score, stats)` per spec.
- [ ] `getCalibrationStats` queries `watched` for the user, joins to `films` to get film ids, then ALL film_tags + tags. Reuses `getUserAffinity` to score each rated film. Returns `{ likedMean, dislikedMean, likedCount, dislikedCount, totalRatings }`. Catalog quartile thresholds (for verbal mode) computed from the candidate film set.
- [ ] `scoreToPercentage` is pure. Tests cover: cold-start (< 3 ratings → verbal); calibrated mode (0%, 50%, 100% boundaries + clipping); zero-disliked floor at 0; verbal kind selection from quartiles.
- [ ] Commit: `feat(fyp): calibration helper — verdict-anchored percentage`

## Task 5: `getForYou` orchestrator wires it all together

**Files:** `app/lib/queries/fyp/forYou.ts`, `app/lib/queries/fyp/score.ts` (extend `ScoredFilm` shape)

- [ ] Extend `ScoredFilm`: add `matchPercent: number | null` and `matchVerbal: "strong" | "good" | "neutral" | "weak" | null`.
- [ ] In `getForYou`, before scoring:
   - Compute `idfByTag` from the candidate film set: `idf(t) = log(N / df(t))` where `N` = available film count, `df(t)` = count of films tagged with `t`. Build a `Map`.
   - Fetch calibration stats via `getCalibrationStats(client, userId)`.
- [ ] Pass `idfByTag` into `ScoreContext`. After `scoreFilms`, map each `ScoredFilm` through `scoreToPercentage(scored.score, stats)` and attach `matchPercent` + `matchVerbal`.
- [ ] No new tests for this task — composition of already-tested pieces.
- [ ] Commit: `feat(fyp): wire IDF + calibration into getForYou`

## Task 6: `<MatchPill>` component + `<ForYouRow>` integration

**Files:** `app/components/MatchPill.tsx` (new), `app/components/ForYouRow.tsx`, `app/components/ForYouFeed.tsx`, `app/lib/actions/fyp/load-more.ts`, `app/app/globals.css`

- [ ] New component `MatchPill` per spec: takes `pct` + optional `verbalKind`, renders nothing, "94%", or "strong match" depending. Suppress when `pct == null && verbalKind == null`.
- [ ] CSS:
   ```css
   .match-pill {
     position: absolute; top: 6px; right: 6px;
     background: var(--accent); color: var(--void);
     font-family: var(--font-ui); font-size: 11px; font-weight: 700;
     padding: 4px 10px; border-radius: 999px; z-index: 2;
     border: 1px solid var(--void);
   }
   .match-pill.match-verbal {
     background: var(--bone); color: var(--void);
     text-transform: lowercase; letter-spacing: 0.04em;
   }
   ```
- [ ] `<ForYouRow>`: poster wrapper gets `position: relative`. Render `<MatchPill pct={reason.matchPercent} verbalKind={reason.matchVerbal} />` over the poster.
- [ ] `ForYouFeed`'s cumulative state already preserves the full `ScoredFilm` shape — no changes needed beyond ensuring the wire-shape `loadMoreForYou` returns includes `matchPercent` + `matchVerbal`. Verify the action passes them through.
- [ ] Commit: `feat(for-you): MatchPill on each poster (calibrated % or verbal fallback)`

## Task 7: Docs + PR + deploy

- [ ] Append row 36 to `docs/sub-project-history.md`.
- [ ] Update CLAUDE.md "Last updated" / "Last shipped".
- [ ] Bump roadmap count (35 → 36).
- [ ] `git push -u origin feature/recommender-v2`. PR title: `feat(fyp): recommender v2 — TF-IDF + caps + decay + cosine coven + match pill`. Body summarizes the 6 algo changes.
- [ ] Merge --squash --delete-branch. Sync master. `npx vercel deploy --prod --yes` from repo root.
- [ ] Manual smoke: load `/for-you` while signed in. Pills should render on every row. Bottom of feed should show cthulhu.lemon's percentages roughly bottom-15 ≈ 5-30%, top-15 ≈ 70-95%.

---

## Notes

- **No migration.** Pure code changes.
- **Most changes are parameter additions, not redesigns.** Existing tests should continue passing; new tests cover the new parameters.
- **Tag IDF is computed per-request, not cached.** Catalog is small (~150 films); this is microseconds. Cache later if catalog grows past 5k.
- **Decay half-life = 1 year is aggressive.** If user feedback suggests recent-bias is too strong, dial to `DECAY_HALF_LIFE_YEARS = 2` (single-line change).
- **Affinity cap = 30** picked because the highest current value (cthulhu.lemon's `atmospheric` at 81.96) needs ~3× compression to feel reasonable. Tune after measuring.
- **The cold-start verbal copy is editorial.** Easy to swap.
