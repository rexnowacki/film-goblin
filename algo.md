# FilmGoblin recommender algorithm

This document describes the math behind FilmGoblin's "For You" recommender. It is written to be read in isolation — no need to look at the codebase. The goal is to invite critique on the algorithm's structure, weighting choices, calibration scheme, and edge-case handling.

The recommender ranks a fixed catalog of horror films (~150 today, expected to grow) for each user, returning a personalized ordered list with a "match percentage" attached to each film.

---

## 1. The data model

### 1.1 Tag schema

Each film carries a set of tags drawn from a finite, hand-curated vocabulary of 88 tags partitioned across 6 facets:

| Facet | Tag count | Examples |
|---|---|---|
| `subgenre` | 24 | folk horror, slasher, gothic, cosmic horror, thriller |
| `subject` | 17 | vampires, witches, demons, ghosts, serial killer |
| `tone` | 16 | atmospheric, bleak, dreamlike, fever dream, psychedelic |
| `theme` | 21 | family trauma, grief, religion, breakup horror, motherhood |
| `setting` | 6 | rural horror, urban horror, period setting, wilderness |
| `content` | 4 | gore, splatter, sexual content, violent |

A film has **one Primary sub-genre** (mandatory) and **0–N other tags** drawn from any facet, with editorially-determined per-facet caps (1–3 tones, 0–3 themes, etc).

Each `(film, tag)` pair has a **position** (1, 2, 3, …, ~12) reflecting editorial importance. Positions 1–4 form the "visible capsule" displayed to users; positions 5+ are hidden but feed the recommender.

### 1.2 User signals

Six distinct user behaviors generate signals about taste. Each signal is observed at some timestamp `t_signal` and references some film `F`:

| Signal | Base weight `w_s` |
|---|---|
| Watched film and explicitly thumbs-upped (`recommended = true`) | **+3.0** |
| Recommended film to a coven mate | **+2.5** |
| Added film to library ("I own this") | **+1.5** |
| Added film to watchlist | **+0.75** |
| Reacted (hearted) a feed activity that mentions the film | **+0.20** |
| Watched film and explicitly thumbs-downed (`recommended = false`) | **−4.0** |

Notes:
- Negative signal weight is heavier than positive (4 vs 3) — explicit dislikes are rarer and more deliberate, so we treat them as more informative per observation.
- `recommended = null` (rated as "watched but no verdict") contributes nothing.

---

## 2. The user affinity vector

For each user `u`, we construct a per-tag affinity vector `A_u : Tag → ℝ_{≥0}` with three additive sources.

### 2.1 Own-behavior affinity

Let `S_u` be the set of all signals from user `u`. For each signal `s ∈ S_u` referencing film `F_s` with weight `w_s` observed at time `t_s`, define the time-decayed weight:

$$
\tilde{w}_s = w_s \cdot 0.5^{(t_{\text{now}} - t_s) / T_{1/2}}, \quad T_{1/2} = 1 \text{ year}
$$

A 1-year-old signal contributes 0.5×, a 2-year-old signal 0.25×, a fresh signal 1.0×.

For each film `F`, accumulate the user's signal weight at the film level:

$$
W_u(F) = \sum_{s \in S_u : F_s = F} \tilde{w}_s
$$

For each tag `t` on film `F` with type `τ(t,F) ∈ {\text{subgenre primary}, \text{subgenre secondary}, \text{tone}, \text{theme}, \text{subject}, \text{setting}, \text{content}}`, define the facet multiplier `μ(τ)`:

| Facet τ | μ(τ) |
|---|---|
| Primary sub-genre | 3.0 |
| Secondary sub-genre | 1.5 |
| Tone | 1.5 |
| Theme | 1.5 |
| Subject | 1.0 |
| Setting | 0.75 |
| Content | 0.5 |

The own-affinity for tag `t` is then:

$$
A_u^{\text{own}}(t) = \min\left(C, \, \max\left(0, \, \sum_{F : t \in \text{tags}(F)} W_u(F) \cdot \mu(\tau(t,F)) \right)\right)
$$

where `C = 30` is a per-tag affinity cap. The `max(0, …)` floors negative net affinity at zero — a tag the user has actively disliked still drops to indifference, not active repulsion.

### 2.2 Lane affinity (explicit user picks)

Users can explicitly pick "lanes" — a small set of tags they're into — from the sub-genre / tone / theme facets via a settings UI. For each picked tag `t`:

$$
A_u^{\text{lane}}(t) = 1.5
$$

Lanes do not get the facet multiplier (a lane-picked theme still contributes 1.5, not 1.5 × 1.5). They're a flat editorial bump independent of the user's behavioral history.

### 2.3 Coven-borrowed affinity

Each user has a coven (a small social graph of mutual bonds, typically ≤ 30 members). Define the **cosine similarity** between two users' own-vectors:

$$
\cos(A_u^{\text{own}}, A_v^{\text{own}}) = \frac{\sum_t A_u^{\text{own}}(t) \cdot A_v^{\text{own}}(t)}{\|A_u^{\text{own}}\| \cdot \|A_v^{\text{own}}\|}
$$

For each coven mate `v`, weight by `max(0, cos)` (negative or orthogonal mates contribute nothing):

$$
A_u^{\text{coven}}(t) = \alpha \cdot \frac{\sum_{v \in \text{coven}(u)} \max(0, \cos(A_u^{\text{own}}, A_v^{\text{own}})) \cdot A_v^{\text{own}}(t)}{\sum_{v \in \text{coven}(u)} \max(0, \cos(A_u^{\text{own}}, A_v^{\text{own}}))}
$$

with `α = 0.3` (coven prior scale).

**Cold-start fallback:** when `A_u^{\text{own}} = \emptyset` (the user has no behavioral history), cosine is undefined. We replace cosine weight with each mate's interaction-score weight (a separate quantity computed elsewhere from 90-day comment + reaction + recommendation history with the user). When all interaction scores are also zero, fall back to equal weighting `1/|\text{coven}(u)|`.

When the total cosine sum is zero (no coven mate has any taste overlap with the user), `A_u^{\text{coven}} = \emptyset` — we don't pull the vector toward orthogonal taste.

### 2.4 Composed affinity

$$
A_u(t) = \min\left(C, \, \max\left(0, \, A_u^{\text{own}}(t) + A_u^{\text{lane}}(t) + A_u^{\text{coven}}(t)\right)\right)
$$

The same cap `C = 30` and floor at 0 are reapplied to the composed vector.

---

## 3. The scoring function

For a candidate film `F` and user `u`, we compute a raw score:

$$
\text{score}(u, F) = \sum_{t \in \text{tags}(F)} A_u(t) \cdot \mu(\tau(t, F)) \cdot \text{idf}(t) \cdot \beta(t, F) + B_{\text{coven}}(F)
$$

where the four per-tag factors are:

1. **Affinity** `A_u(t)`: from §2.4.
2. **Facet multiplier** `μ(τ(t,F))`: from §2.1's table. Note this multiplier appears at *both* affinity-construction time (§2.1) and scoring time. We discuss this in §6.
3. **Inverse document frequency** `idf(t)`:

$$
\text{idf}(t) = \log\left(\frac{N}{\text{df}(t)}\right)
$$

where `N` is the total number of films in the candidate pool and `df(t)` is the number of films tagged with `t`. Tags absent from any film default to `idf = 1.0`. This is standard Robertson IDF.

4. **Position boost** `β(t,F)`:

$$
\beta(t, F) = \begin{cases} 1.3 & \text{if position}(t, F) \le 4 \\ 1.0 & \text{otherwise} \end{cases}
$$

The visible capsule (positions 1–4) gets a small boost reflecting editorial weight.

**Coven-rating bonus** `B_{\text{coven}}(F)`:

$$
B_{\text{coven}}(F) = \begin{cases} \text{covenRatingPct}(F) / 100 & \text{if covenRatingPct}(F) \ge 70 \\ 0 & \text{otherwise} \end{cases}
$$

where `covenRatingPct(F)` is the fraction of `recommended = true` ratings of `F` from users in `u`'s coven. This is a small additive tiebreaker (max contribution is 1.0) that mostly serves to attribute the "highly rated by your coven" reason caption.

### 3.1 Exclusions

A film `F` is excluded from the output (regardless of score) if:
- `F ∈ \text{watched}(u)`: the user has already watched it.
- `F ∈ \text{disliked}(u)`: the user has thumbs-downed it (already implied by exclusion above, but explicit).
- `\text{available}(F) = \text{false}`: the catalog has marked it unavailable.

After exclusion, films with `score(u, F) ≤ 0` are also dropped.

The remaining films are sorted by `score` descending, with ties broken alphabetically by film id.

---

## 4. Calibration: from score to percentage

The score has no inherent scale — it varies dramatically with how much behavioral history a user has accumulated. We map score to a calibrated percentage by anchoring against the user's own labeled history.

### 4.1 Anchoring

Let `R_u^+ = \{F : (u, F) \text{ has } recommended = true\}` and `R_u^- = \{F : (u, F) \text{ has } recommended = false\}`. Score every film in `R_u^+ \cup R_u^-` against `u`'s current affinity vector (using the same formula in §3, but with `F`'s own already-watched status temporarily ignored). Define:

$$
\bar{s}^+ = \frac{1}{|R_u^+|} \sum_{F \in R_u^+} \text{score}(u, F), \quad \bar{s}^- = \frac{1}{|R_u^-|} \sum_{F \in R_u^-} \text{score}(u, F)
$$

### 4.2 Mapping

For a candidate score `s = \text{score}(u, F)`:

$$
\text{pct}(s) = \begin{cases}
\text{verbal mode} & \text{if } |R_u^+| + |R_u^-| < 3 \text{ (cold start)} \\
\text{verbal mode} & \text{if } \bar{s}^+ \le \bar{s}^- \text{ (degenerate)} \\
\text{round}\left(\text{clip}\left(\frac{s - L}{\bar{s}^+ - L} \times 100, \, 0, \, 100\right)\right) & \text{otherwise}
\end{cases}
$$

where `L = \bar{s}^-` if `|R_u^-| > 0` else `L = 0` (no negative anchor → use absolute zero as floor).

A film at the user's average liked-score gets 100%; a film at their average disliked-score gets 0%; films between linearly interpolate; films below 0% or above 100% clip.

### 4.3 Verbal mode

When `|R_u^+| + |R_u^-| < 3` or the distribution is degenerate, we abandon the percentage and instead pick a "verbal kind" from the candidate-pool's score quartiles:

$$
\text{verbal}(s) = \begin{cases}
\text{strong} & s \ge q_3 \\
\text{good} & q_2 \le s < q_3 \\
\text{neutral} & q_1 \le s < q_2 \\
\text{(suppressed)} & s < q_1
\end{cases}
$$

with `q_k = \text{sorted}[\lfloor n \cdot k/4 \rfloor]` over the sorted candidate-pool scores.

---

## 5. Cold start: which path serves a brand-new user?

The recommender has four tiers based on what data is available:

| User state | Path |
|---|---|
| No own signals, no coven, no lanes | Editorial starter pack (~20 hand-curated films; ranking is alphabetical, no scoring) |
| At least one coven bond | Coven-borrowed signal feeds; cosine fallback to interaction scores when own-vector is empty |
| Lanes set in settings | Lane affinity adds to the vector |
| Any own behavior | Own-affinity dominates (typically ~10× the size of lane/coven priors once the user has a few watches) |

These layers are additive — the four sources are summed (§2.4). The "highest tier available" framing is just a way to think about which source dominates at each stage of user maturity.

---

## 6. Known structural concerns

These are the things we'd most like a math expert to evaluate.

### 6.1 The double facet multiplier

`μ(τ)` is applied at both **affinity construction** (§2.1) and **scoring** (§3). A primary-sub-genre tag on a single liked watch contributes:

$$
3.0 \text{ (signal weight)} \times 3.0 \text{ (facet mult at affinity time)} = 9.0 \text{ to } A_u^{\text{own}}(t)
$$

When that tag matches a candidate's primary-sub-genre tag:

$$
9.0 \text{ (affinity)} \times 3.0 \text{ (facet mult at scoring time)} = 27.0 \text{ score contribution}
$$

So matches between two films via a single shared signal scale as `w_s × μ²` — quadratic in the facet multiplier. This produces strong discrimination (Primary subgenre matches dominate Content matches by 36×), but it's structurally unusual. A natural alternative is to apply `μ` only at affinity time *or* only at scoring time, not both. The double application was a deliberate design choice but we are not certain it's optimal.

### 6.2 No length normalization

The score sums per-tag contributions without normalizing by the candidate film's tag count. A film with 12 tags can accumulate more raw score than a 7-tag film with similar match quality, even if the 7-tag film is a better per-tag match. The affinity cap (`C = 30`) and IDF help, but don't eliminate this.

A standard fix would be cosine-similarity-normalize:

$$
\text{score}_{\cos}(u, F) = \frac{\sum_t A_u(t) \cdot \mu \cdot \text{idf} \cdot \beta}{\|A_u\| \cdot \|\text{film vector of } F\|}
$$

We didn't do this because the resulting absolute numbers feel "low" (a 60% cosine looks like a weak match even when the ranking is right) and because the calibration step (§4) handles the scale problem at display time. But the lack of length normalization may bias the ranking itself in ways calibration cannot fix.

### 6.3 IDF on a tiny corpus

With `N ≈ 150` films, `idf` is noisy. A tag appearing on 1 film has `idf = log(150) ≈ 5.0`; a tag appearing on 90 films has `idf = log(150/90) ≈ 0.51`. This is correct in expectation but volatile at low df values. As films get added/removed/retagged, `idf` shifts non-trivially. We have no smoothing (e.g., add-one smoothing or BM25-style saturation).

### 6.4 Time decay

`0.5^(years/T_{1/2})` with `T_{1/2} = 1` is aggressive for a user with stable lifelong taste. Users with consistent taste over years would have their old liked-film signals halve every year, possibly dropping out of the vector entirely. The half-life is a free parameter; we picked 1 year heuristically, not from data.

### 6.5 The "double-purpose" affinity vector

`A_u` serves two roles: (a) it's the user's preference vector for scoring candidate films, and (b) it's the input to the cosine similarity used to weight coven mates' vectors. These are different conceptually — preference vs. taste-similarity — but we use the same vector for both. Whether this conflates two different signals is unclear.

### 6.6 The verbal-mode percentile method

Quartiles use `q_k = \text{sorted}[\lfloor n \cdot k/4 \rfloor]`, the simplest sorted-index approach. This is robust but has a known bias for small `n` — for `n = 4`, `q_1 = \text{sorted}[1]`, `q_2 = \text{sorted}[2]`, `q_3 = \text{sorted}[3]`, so the verbal mode classifies as "strong" any film above the second-from-top, which feels too generous. A linear-interpolation percentile would smooth this but adds complexity.

### 6.7 The negative-weight handling

The dislike signal weight (−4.0) is heavier than the like signal (+3.0) by design, but its effect is asymmetric: positive weights flow into the vector, while negative weights only "undo" positive contributions on the same tags (because of the floor at 0). A tag the user has only ever disliked stays at 0 (never goes negative), so we lose information about active aversion to that tag. A film entirely tagged with disliked tags scores 0, not negative — so it ranks alongside films the user has never seen tagged before, despite stronger evidence against it.

### 6.8 Calibration anchor sparsity

The calibration mapping (§4.2) relies on `\bar{s}^+` and `\bar{s}^-` being meaningful estimators of "what scores liked films get" and "what scores disliked films get." With < 3 ratings we punt to verbal mode. But even at 3–10 ratings, the means are highly variable; the percentage may swing by 10–20 points from one new rating. We have no smoothing or prior on this estimator (e.g., shrinkage toward a population mean).

### 6.9 Independence assumption

The score sums tag contributions independently. In reality, tags are correlated (`folk horror` and `period setting` co-occur strongly; `slasher` and `gore` co-occur strongly). A film's score may overcount — a folk horror film with both `folk horror` and `period setting` tags gets credit twice for what is essentially one signal of "this is a period folk horror film." We don't decorrelate.

---

## 7. What we'd most like to know

1. Is the **double facet multiplier** (§6.1) defensible, or should we switch to single-application?
2. Should we add **length normalization** (§6.2), and if so, what form (cosine vs. magnitude-normalize vs. mean-divide)?
3. Is the **time-decay half-life** of 1 year reasonable as a default? Any principle for choosing it?
4. Is **calibration via empirical liked/disliked means** sound, or is there a better small-sample approach (e.g., Bayesian shrinkage to a population prior)?
5. The **dislike-only-zeroes-out** asymmetry (§6.7) — is that a meaningful signal loss, and is there a clean fix that doesn't introduce instabilities?
6. **Tag correlation**: is independent-tag-summation a fatal weakness, or acceptable at this catalog size?

---

## 8. Empirical sanity check

For one real user with substantial behavioral history (~30 watches, mostly liked, lean toward folk-horror and atmospheric horror):

- Top film by score: The Witch — calibrated **94%**
- Median score → roughly the user's **50%** anchor
- Bottom-15 films: mostly slashers, kaiju, splatterpunk — calibrated 0–30% range
- Films with no overlapping tags: explicitly excluded from the output (score ≤ 0)

The qualitative ranking (atmospheric folk horror at top, camp/gore at bottom) matches the user's stated preference. We are less confident the **absolute calibrated percentages** are well-calibrated to actual probability of enjoying each film, since we have no held-out validation set.

---

## 9. Notation summary

| Symbol | Meaning |
|---|---|
| `u, v` | Users |
| `F` | A film |
| `t` | A tag |
| `τ(t, F)` | The facet of tag `t` on film `F` (depends on the tag-film pair because Primary/Secondary distinction is per-film) |
| `μ(τ)` | Facet multiplier (table in §2.1) |
| `w_s, \tilde{w}_s` | Raw signal weight, time-decayed |
| `T_{1/2}` | Time-decay half-life (1 year) |
| `W_u(F)` | User's cumulative decayed weight on film `F` |
| `C` | Per-tag affinity cap (30) |
| `α` | Coven prior scale (0.3) |
| `A_u(t), A_u^{\text{own}}, A_u^{\text{lane}}, A_u^{\text{coven}}` | User affinity vector and its three sources |
| `idf(t)` | Inverse document frequency over the candidate pool |
| `β(t, F)` | Position boost (1.3 for visible capsule, 1.0 otherwise) |
| `B_{\text{coven}}(F)` | Coven-rating bonus (≤ 1.0) |
| `\bar{s}^+, \bar{s}^-` | Mean scores on liked / disliked rated films |
| `q_1, q_2, q_3` | Candidate-pool score quartiles for verbal-mode mapping |

---

This is the entire algorithm. Comments, critique, and counter-proposals welcome.
