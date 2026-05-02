# FYP Recommender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the FYP recommender — `/for-you` route + `/tags/[name]` listing pages + lane picker on `/settings`. Affinity scoring built from 6 weighted user signals × per-facet tag multipliers, with 4-layer cold-start (editorial → coven-borrowed → lanes → own behavior).

**Architecture:** Pure-function scoring composed from layered affinity sources. Schema is minimal — two columns (`profiles.lane_tag_ids UUID[]` + `films.editorial_starter BOOLEAN`). Compute on-demand v1; designed with cache seams at `getUserAffinity` / `getCovenBorrowedAffinity` for future caching at mid-scale.

**Tech Stack:** Next.js 15 App Router (RSC + client islands), Supabase Postgres reads, no new deps. Reuses #33's `getFilmTags` / `FilmTagRow` shape, #34's `getRankedCovenfolk` for interaction-weighting, #36's `IntersectionObserver` infinite-scroll pattern.

**Spec:** `docs/superpowers/specs/2026-05-02-fyp-recommender-design.md`. Read it first — code outlines, math, captions, layouts all there.

---

## Task 1: Mig 0154 — schema additions

**Files:**
- Create: `db/migrations/0154_fyp_recommender.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0154_fyp_recommender.sql
--
-- Two columns added in support of sub-project #35 (FYP recommender).
-- Spec: docs/superpowers/specs/2026-05-02-fyp-recommender-design.md

BEGIN;

-- Lanes opt-in: per-user array of tag ids selected as personality lanes.
-- Empty array = no lanes set, no signal contribution to /for-you.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lane_tag_ids UUID[] NOT NULL DEFAULT '{}';

-- Editorial starter pack flag: ~20 hand-curated films. Used only when a
-- new user has no coven bonds, no lanes set, and no behavior signals.
-- The picks themselves are set via a separate one-shot UPDATE in Task 2.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS editorial_starter BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS films_editorial_starter_idx;
CREATE INDEX films_editorial_starter_idx ON films(editorial_starter)
  WHERE editorial_starter = TRUE;

COMMIT;
```

- [ ] **Step 2: Smoke-test it**

```bash
cd db && npm test
```
Expected: pg-mem smoke green. The migration is purely additive `ADD COLUMN IF NOT EXISTS`; no creative DDL. If smoke trips, extend the strip filters in `db/tests/helpers/pg-mem.ts` minimally rather than rewriting the migration.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0154_fyp_recommender.sql
git commit -m "feat(db): mig 0154 — fyp recommender schema (lane_tag_ids + editorial_starter)"
```

---

## Task 2: Editorial starter pack picks

**Files:**
- Create: `db/migrations/scripts/0154_editorial_starter_picks.sql` (one-shot UPDATE, applied separately from the schema migration)

- [ ] **Step 1: Curate the 20-film editorial starter pack**

The list should be highly-tagged, broadly-acclaimed films that span the major sub-genres so a brand-new user gets a representative sample. Criteria: (a) film exists in current catalog, (b) has at least 5 visible tags from sub-project #33's editorial pass, (c) covers a mix of sub-genre families.

Use the curated set:

```sql
-- 0154_editorial_starter_picks.sql
-- Run AFTER mig 0154 lands. Sets the editorial_starter flag on ~20
-- representative films for the FYP cold-start fallback. List is editorial
-- and will be revisited as the catalog grows.

UPDATE films SET editorial_starter = TRUE WHERE title IN (
  'Hereditary',
  'The Witch',
  'Suspiria',                  -- 2018 Guadagnino
  'Possession',
  'The Thing',                 -- 1982 Carpenter
  'Midsommar',
  'The Babadook',
  'A Dark Song',
  'Mandy',
  'The Lighthouse (2019)',
  'Color Out of Space',
  'In Fabric',
  'When Evil Lurks',
  'Inferno',                   -- Argento
  'Deep Red',
  'Onibaba',
  'Picnic at Hanging Rock',
  'The Wicker Man - Final Cut (1973)',
  'Late Night with the Devil',
  'Barbarian'
);
```

Note: titles are matched by exact string. Some catalog entries have parenthetical year suffixes (e.g. "Suspiria" vs "Suspiria (1977)") — verify against `goblin_tagged.md` for the canonical title strings before running.

- [ ] **Step 2: Verify exact-match titles before applying**

```bash
cd db && set -a && source ../app/.env.local && set +a && npx tsx -e "
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const titles = ['Hereditary', 'The Witch', 'Suspiria', 'Possession', 'The Thing', 'Midsommar', 'The Babadook', 'A Dark Song', 'Mandy', 'The Lighthouse (2019)', 'Color Out of Space', 'In Fabric', 'When Evil Lurks', 'Inferno', 'Deep Red', 'Onibaba', 'Picnic at Hanging Rock', 'The Wicker Man - Final Cut (1973)', 'Late Night with the Devil', 'Barbarian'];
  for (const t of titles) {
    const r = await c.query('SELECT id, title FROM films WHERE title = \$1', [t]);
    console.log(r.rowCount === 1 ? 'OK ' : 'MISS', t);
  }
  await c.end();
})();
"
```
Expected: 20 OKs. Any MISS means that title doesn't exist in the catalog and the picks list needs adjustment (substitute another representative film of the same form).

- [ ] **Step 3: Commit script**

```bash
git add db/migrations/scripts/0154_editorial_starter_picks.sql
git commit -m "feat(db): editorial starter pack picks for FYP cold start"
```

(Application happens in Task 13, after the migration applies to prod.)

---

## Task 3: Hand-edit `app/lib/supabase/types.ts`

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Locate `profiles` and `films` blocks**

```bash
grep -n "profiles: {\|films: {" app/lib/supabase/types.ts | head -4
```

- [ ] **Step 2: Add `lane_tag_ids` to `profiles`**

In the `profiles` Row, Insert, Update blocks, add (alphabetically — between `id` and `notify_*` fields):

```typescript
lane_tag_ids: string[]   // Row (NOT NULL DEFAULT '{}', so always an array)
lane_tag_ids?: string[]  // Insert (DB default empty array)
lane_tag_ids?: string[]  // Update
```

Alphabetical placement: between `is_admin` and `notify_*` if those are adjacent, OR insert in the right alphabetical slot for this codebase. Match the existing convention.

- [ ] **Step 3: Add `editorial_starter` to `films`**

Mirror Task 3 of #33 — alphabetical placement between `director` and `first_seen_at`:

```typescript
editorial_starter: boolean   // Row (NOT NULL DEFAULT FALSE)
editorial_starter?: boolean  // Insert
editorial_starter?: boolean  // Update
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/lib/supabase/types.ts
git commit -m "chore(types): hand-edit for FYP recommender (lane_tag_ids, editorial_starter)"
```

---

## Task 4: RLS test extension for new columns

**Files:**
- Modify: `db/tests/rls/profiles.test.ts` (extend, not rewrite)

- [ ] **Step 1: Add specs covering `profiles.lane_tag_ids`**

Read existing test patterns from `db/tests/rls/profiles.test.ts`. The new columns inherit existing `profiles` RLS — just verify:

```typescript
it("allows the user to update their own lane_tag_ids", async () => {
  await beginAs(db.client, fx.userA.id, "authenticated");
  try {
    const tag = await db.client.query<{ id: string }>(
      `SELECT id FROM tags WHERE name = 'folk horror' AND type = 'subgenre' LIMIT 1`,
    );
    const upd = await db.client.query(
      `UPDATE profiles SET lane_tag_ids = ARRAY[$1::uuid] WHERE id = $2`,
      [tag.rows[0].id, fx.userA.id],
    );
    expect(upd.rowCount).toBe(1);
  } finally { await rollback(db.client); }
});

it("denies updating another user's lane_tag_ids", async () => {
  await beginAs(db.client, fx.userA.id, "authenticated");
  try {
    const r = await db.client.query(
      `UPDATE profiles SET lane_tag_ids = ARRAY[]::uuid[] WHERE id = $1`,
      [fx.userB.id],
    );
    expect(r.rowCount).toBe(0);  // RLS filters out the row
  } finally { await rollback(db.client); }
});
```

- [ ] **Step 2: Run + commit**

```bash
cd db && npm run test:rls  # if Docker available; otherwise CI runs it
git add db/tests/rls/profiles.test.ts
git commit -m "test(db): RLS coverage for profiles.lane_tag_ids"
```

---

## Task 5: `getUserOwnAffinity` query helper + tests

**Files:**
- Create: `app/lib/queries/fyp/affinity.ts`
- Test: `app/tests/queries/fyp/affinity.test.ts`

- [ ] **Step 1: Implement `getUserOwnAffinity`**

Create `app/lib/queries/fyp/affinity.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface AffinityVector {
  byTag: Record<string, number>;
}

const SIGNAL_WEIGHTS = {
  watch_liked: 3.0,
  recommendation_sent: 2.5,
  library_added: 1.5,
  watchlist_added: 0.75,
  reaction: 0.20,
  watch_disliked: -4.0,
} as const;

const FACET_MULTIPLIERS = {
  subgenre_primary: 3.0,
  subgenre_secondary: 1.5,
  tone: 1.5,
  theme: 1.5,
  subject: 1.0,
  setting: 0.75,
  content: 0.5,
} as const;

interface FilmTagRowRaw {
  film_id: string;
  position: number;
  is_primary: boolean;
  tag_name: string;
  tag_type: 'subgenre' | 'subject' | 'tone' | 'theme' | 'setting' | 'content';
}

function facetMultiplier(row: FilmTagRowRaw): number {
  switch (row.tag_type) {
    case 'subgenre': return row.is_primary ? FACET_MULTIPLIERS.subgenre_primary : FACET_MULTIPLIERS.subgenre_secondary;
    case 'tone': return FACET_MULTIPLIERS.tone;
    case 'theme': return FACET_MULTIPLIERS.theme;
    case 'subject': return FACET_MULTIPLIERS.subject;
    case 'setting': return FACET_MULTIPLIERS.setting;
    case 'content': return FACET_MULTIPLIERS.content;
  }
}

/**
 * Pull every film_id the user has interacted with, paired with the signal
 * weight to apply. Then fetch tags once for that film set, multiply through
 * facet multipliers, accumulate per tag. Floor each tag's running score at 0.
 */
export async function getUserOwnAffinity(client: Client, userId: string): Promise<AffinityVector> {
  // 1. Collect (filmId, signalWeight) pairs from each source.
  const filmWeights = new Map<string, number>();  // film_id → cumulative signal weight
  function addSignal(filmId: string, weight: number) {
    filmWeights.set(filmId, (filmWeights.get(filmId) ?? 0) + weight);
  }

  const [watched, library, watchlist, recsSent, reactions] = await Promise.all([
    client.from("watched").select("film_id, recommended").eq("user_id", userId),
    client.from("library").select("film_id").eq("user_id", userId),
    client.from("watchlists").select("film_id").eq("user_id", userId),
    client.from("activity").select("payload").eq("actor_user_id", userId).eq("kind", "recommendation_sent"),
    client.from("activity_reactions").select("activity:activity!inner(payload)").eq("user_id", userId),
  ]);

  for (const w of watched.data ?? []) {
    if (w.recommended === true) addSignal(w.film_id, SIGNAL_WEIGHTS.watch_liked);
    else if (w.recommended === false) addSignal(w.film_id, SIGNAL_WEIGHTS.watch_disliked);
    // recommended === null → no signal contribution (unrated watch)
  }
  for (const l of library.data ?? []) addSignal(l.film_id, SIGNAL_WEIGHTS.library_added);
  for (const wl of watchlist.data ?? []) addSignal(wl.film_id, SIGNAL_WEIGHTS.watchlist_added);
  for (const r of recsSent.data ?? []) {
    const filmId = (r.payload as { film_id?: string })?.film_id;
    if (filmId) addSignal(filmId, SIGNAL_WEIGHTS.recommendation_sent);
  }
  for (const rxn of reactions.data ?? []) {
    const filmId = (rxn as unknown as { activity: { payload: { film_id?: string } } })
      .activity?.payload?.film_id;
    if (filmId) addSignal(filmId, SIGNAL_WEIGHTS.reaction);
  }

  if (filmWeights.size === 0) return { byTag: {} };

  // 2. Fetch tags for every involved film in one round trip.
  const { data: filmTags, error } = await client
    .from("film_tags")
    .select("film_id, position, is_primary, tag:tags!inner(name, type)")
    .in("film_id", Array.from(filmWeights.keys()));
  if (error) throw error;

  // 3. Aggregate per-tag affinity, floor at 0.
  const byTag: Record<string, number> = {};
  for (const row of filmTags ?? []) {
    const filmId = (row as unknown as { film_id: string }).film_id;
    const signalWeight = filmWeights.get(filmId);
    if (!signalWeight) continue;
    const tag = (row as unknown as { tag: { name: string; type: FilmTagRowRaw['tag_type'] } }).tag;
    const mult = facetMultiplier({
      film_id: filmId,
      position: (row as unknown as { position: number }).position,
      is_primary: (row as unknown as { is_primary: boolean }).is_primary,
      tag_name: tag.name,
      tag_type: tag.type,
    });
    byTag[tag.name] = (byTag[tag.name] ?? 0) + signalWeight * mult;
  }
  for (const k of Object.keys(byTag)) if (byTag[k] < 0) byTag[k] = 0;

  return { byTag };
}
```

- [ ] **Step 2: Write the unit + integration tests**

Create `app/tests/queries/fyp/affinity.test.ts`. Two-tier:

**Pure-function unit tests** (no env needed) using mock chained Supabase clients, covering signal weights and floor-at-zero behavior. Mirror the pattern in `app/tests/queries/coven-interactions.test.ts` from sub-project #34.

**Integration tests** (env-skipIf-gated) that seed real activity rows and assert the resulting affinity vector. Skeleton:

```typescript
describe.skipIf(!hasEnv)("getUserOwnAffinity integration", () => {
  if (!hasEnv) return;
  // Seed: user with 1 watch+liked of folk-horror film, 1 watchlist add of
  // gothic film. Assert byTag['folk horror'] is 9.0 (3.0 signal × 3.0
  // primary multiplier) and byTag['gothic'] is 2.25 (0.75 × 3.0).
});
```

- [ ] **Step 3: Run + commit**

```bash
cd app && npm run typecheck
npx vitest run tests/queries/fyp/affinity.test.ts
git add app/lib/queries/fyp/affinity.ts app/tests/queries/fyp/affinity.test.ts
git commit -m "feat(fyp): getUserOwnAffinity — signal-weighted per-tag vector"
```

---

## Task 6: Coven-borrowed + lane affinity + composition

**Files:**
- Modify: `app/lib/queries/fyp/affinity.ts` (extend, don't rewrite)

- [ ] **Step 1: Add `getLaneAffinity`**

Append to the file:

```typescript
const LANE_WEIGHT = 1.5;

/**
 * Returns +1.5 for each tag in the user's lanes set. Lanes are a deliberate
 * editorial signal — the user picked these — so they get a flat bump rather
 * than the facet-multiplier treatment. Empty lanes = empty vector.
 */
export async function getLaneAffinity(client: Client, userId: string): Promise<AffinityVector> {
  const profile = await client.from("profiles").select("lane_tag_ids").eq("id", userId).maybeSingle();
  const ids = (profile.data?.lane_tag_ids ?? []) as string[];
  if (ids.length === 0) return { byTag: {} };
  const tags = await client.from("tags").select("name").in("id", ids);
  const byTag: Record<string, number> = {};
  for (const t of tags.data ?? []) byTag[t.name] = LANE_WEIGHT;
  return { byTag };
}
```

- [ ] **Step 2: Add `getCovenBorrowedAffinity`**

```typescript
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";

const COVEN_PRIOR_SCALE = 0.3;

/**
 * Aggregates each coven mate's own-affinity vector, weighted by the user's
 * 90-day interaction score with that mate (from #34). Result is scaled by
 * COVEN_PRIOR_SCALE so behavior dominates lanes which dominates coven prior.
 */
export async function getCovenBorrowedAffinity(client: Client, userId: string): Promise<AffinityVector> {
  const ranked = await getRankedCovenfolk(client, userId);
  if (ranked.length === 0) return { byTag: {} };

  // Treat all-zero scores (a fresh user with covenfolk but no interactions)
  // as equal weights so the vector still surfaces something meaningful.
  const totalScore = ranked.reduce((s, r) => s + r.score, 0);
  const useEqualWeights = totalScore === 0;

  const accum: Record<string, number> = {};
  for (const mate of ranked) {
    const mateAffinity = await getUserOwnAffinity(client, mate.id);
    const weight = useEqualWeights ? 1 / ranked.length : (mate.score / totalScore);
    for (const [tag, val] of Object.entries(mateAffinity.byTag)) {
      accum[tag] = (accum[tag] ?? 0) + val * weight;
    }
  }
  for (const k of Object.keys(accum)) accum[k] *= COVEN_PRIOR_SCALE;
  return { byTag: accum };
}
```

- [ ] **Step 3: Add `getUserAffinity` composition**

```typescript
/**
 * Sums own + coven-borrowed + lanes. Floors per-tag at 0. This is the seam
 * where a future cache wrapper drops in: getUserAffinity becomes the single
 * call site that downstream code uses, and a cache lookup sits here.
 */
export async function getUserAffinity(client: Client, userId: string): Promise<AffinityVector> {
  const [own, coven, lanes] = await Promise.all([
    getUserOwnAffinity(client, userId),
    getCovenBorrowedAffinity(client, userId),
    getLaneAffinity(client, userId),
  ]);
  const byTag: Record<string, number> = {};
  for (const src of [own, coven, lanes]) {
    for (const [tag, val] of Object.entries(src.byTag)) {
      byTag[tag] = (byTag[tag] ?? 0) + val;
    }
  }
  for (const k of Object.keys(byTag)) if (byTag[k] < 0) byTag[k] = 0;
  return { byTag };
}
```

- [ ] **Step 4: Extend tests**

Add to `app/tests/queries/fyp/affinity.test.ts`:

- `getLaneAffinity`: empty lanes → `{}`; 2 lanes → 2 entries each at 1.5.
- `getCovenBorrowedAffinity`: 1 coven mate w/ vector `{ folk horror: 9.0 }` and interaction score 1 → result is `{ folk horror: 2.7 }` (9.0 × 1.0 × 0.3).
- `getUserAffinity`: layers sum correctly; floor-at-zero applies to the composed vector.

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/lib/queries/fyp/affinity.ts app/tests/queries/fyp/affinity.test.ts
git commit -m "feat(fyp): coven-borrowed + lane affinity + getUserAffinity composer"
```

---

## Task 7: `scoreFilms` pure-function scorer

**Files:**
- Create: `app/lib/queries/fyp/score.ts`
- Test: `app/tests/queries/fyp/score.test.ts`

- [ ] **Step 1: Write `scoreFilms`**

```typescript
import type { AffinityVector } from "./affinity";
import type { FilmTagRow } from "@/lib/queries/film-tags";

export type ReasonKind = 'tag' | 'coven_rating' | 'lane' | 'director' | 'starter';

export interface ScoredFilm {
  filmId: string;
  score: number;
  topReason: { kind: ReasonKind; tagName?: string; contribution: number };
}

interface FilmInput {
  id: string;
  director: string;
  tags: FilmTagRow[];  // all positions, including hidden tail
}

interface ScoreContext {
  userWatchedFilmIds: Set<string>;
  userDislikedFilmIds: Set<string>;
  covenRatingByFilm: Map<string, number>;  // film_id → coven_rating_pct
  ownDirectors: Set<string>;
  lanesByTag: Set<string>;  // tag names the user has set as lanes
}

const FACET_MULTIPLIERS = {
  subgenre_primary: 3.0, subgenre_secondary: 1.5,
  tone: 1.5, theme: 1.5, subject: 1.0, setting: 0.75, content: 0.5,
} as const;

function facetMultiplier(t: FilmTagRow): number {
  switch (t.type) {
    case 'subgenre': return t.is_primary ? FACET_MULTIPLIERS.subgenre_primary : FACET_MULTIPLIERS.subgenre_secondary;
    case 'tone': return FACET_MULTIPLIERS.tone;
    case 'theme': return FACET_MULTIPLIERS.theme;
    case 'subject': return FACET_MULTIPLIERS.subject;
    case 'setting': return FACET_MULTIPLIERS.setting;
    case 'content': return FACET_MULTIPLIERS.content;
  }
}

export function scoreFilms(films: FilmInput[], affinity: AffinityVector, ctx: ScoreContext): ScoredFilm[] {
  const out: ScoredFilm[] = [];
  for (const f of films) {
    if (ctx.userWatchedFilmIds.has(f.id)) continue;
    if (ctx.userDislikedFilmIds.has(f.id)) continue;

    let total = 0;
    let topTagContrib = 0;
    let topTagName: string | undefined;
    let laneContrib = 0;
    let laneTagName: string | undefined;

    for (const tag of f.tags) {
      const aff = affinity.byTag[tag.name] ?? 0;
      if (aff === 0) continue;
      const contrib = aff * facetMultiplier(tag);
      total += contrib;
      if (contrib > topTagContrib) {
        topTagContrib = contrib;
        topTagName = tag.name;
      }
      if (ctx.lanesByTag.has(tag.name) && contrib > laneContrib) {
        laneContrib = contrib;
        laneTagName = tag.name;
      }
    }

    // Coven-rating bonus: small additive boost for highly-rated films, used
    // to surface the "highly rated by your coven" reason. NOT a multiplier
    // on the affinity score — it's a tiebreaker.
    const covenRating = ctx.covenRatingByFilm.get(f.id);
    const covenContrib = covenRating != null && covenRating >= 70 ? covenRating / 100 : 0;
    total += covenContrib;

    if (total <= 0) continue;

    // Pick the strongest contributor for the "why" caption.
    let topReason: ScoredFilm['topReason'];
    const directorMatch = ctx.ownDirectors.has(f.director);
    if (directorMatch && topTagContrib < 1.5) {
      topReason = { kind: 'director', contribution: topTagContrib };
    } else if (laneTagName && laneContrib === topTagContrib) {
      topReason = { kind: 'lane', tagName: laneTagName, contribution: laneContrib };
    } else if (covenContrib > topTagContrib) {
      topReason = { kind: 'coven_rating', contribution: covenContrib };
    } else {
      topReason = { kind: 'tag', tagName: topTagName, contribution: topTagContrib };
    }

    out.push({ filmId: f.id, score: total, topReason });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

export function starterPackScored(filmIds: string[]): ScoredFilm[] {
  return filmIds.map(id => ({
    filmId: id,
    score: 0,
    topReason: { kind: 'starter', contribution: 0 },
  }));
}
```

- [ ] **Step 2: Pure-function tests**

Create `app/tests/queries/fyp/score.test.ts`. No env required — pure JS.

```typescript
import { describe, it, expect } from "vitest";
import { scoreFilms } from "@/lib/queries/fyp/score";

const TAG = (name: string, type: 'subgenre' | 'tone' | 'theme' | 'subject' | 'setting' | 'content', is_primary = false) =>
  ({ id: `t-${name}`, name, type, position: 1, is_primary } as const);

const EMPTY_CTX = {
  userWatchedFilmIds: new Set<string>(),
  userDislikedFilmIds: new Set<string>(),
  covenRatingByFilm: new Map<string, number>(),
  ownDirectors: new Set<string>(),
  lanesByTag: new Set<string>(),
};

describe("scoreFilms", () => {
  it("ranks higher-affinity films first", async () => {
    const films = [
      { id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] },
      { id: "f2", director: "x", tags: [TAG("gothic", "subgenre", true)] },
    ];
    const aff = { byTag: { "folk horror": 5.0, "gothic": 1.0 } };
    const r = scoreFilms(films, aff, EMPTY_CTX);
    expect(r[0].filmId).toBe("f1");
    expect(r[0].score).toBe(15.0);  // 5.0 × 3.0 primary subgenre
    expect(r[1].score).toBe(3.0);
  });

  it("excludes already-watched films", async () => {
    const films = [{ id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] }];
    const ctx = { ...EMPTY_CTX, userWatchedFilmIds: new Set(["f1"]) };
    const r = scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx);
    expect(r).toHaveLength(0);
  });

  it("excludes disliked films", async () => {
    const films = [{ id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] }];
    const ctx = { ...EMPTY_CTX, userDislikedFilmIds: new Set(["f1"]) };
    expect(scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx)).toHaveLength(0);
  });

  it("attributes top reason to the strongest tag", async () => {
    const films = [{
      id: "f1", director: "x",
      tags: [TAG("folk horror", "subgenre", true), TAG("gore", "content")],
    }];
    const r = scoreFilms(films, { byTag: { "folk horror": 5, "gore": 10 } }, EMPTY_CTX);
    expect(r[0].topReason.kind).toBe("tag");
    expect(r[0].topReason.tagName).toBe("folk horror");  // 5×3.0 = 15 > 10×0.5 = 5
  });

  it("attributes lane reason when lane tag has the strongest match", async () => {
    const films = [{ id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] }];
    const ctx = { ...EMPTY_CTX, lanesByTag: new Set(["folk horror"]) };
    const r = scoreFilms(films, { byTag: { "folk horror": 5 } }, ctx);
    expect(r[0].topReason.kind).toBe("lane");
  });

  it("attributes coven_rating reason when it exceeds the top tag contribution", async () => {
    const films = [{ id: "f1", director: "x", tags: [TAG("folk horror", "subgenre", true)] }];
    const ctx = { ...EMPTY_CTX, covenRatingByFilm: new Map([["f1", 90]]) };
    const r = scoreFilms(films, { byTag: { "folk horror": 0.1 } }, ctx);
    // 0.1 × 3.0 = 0.3 tag contrib vs 0.9 coven contrib → coven wins
    expect(r[0].topReason.kind).toBe("coven_rating");
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd app && npx vitest run tests/queries/fyp/score.test.ts
# Expected: all 5 specs pass
git add app/lib/queries/fyp/score.ts app/tests/queries/fyp/score.test.ts
git commit -m "feat(fyp): scoreFilms pure-function scorer + tests"
```

---

## Task 8: `getForYou` orchestrator

**Files:**
- Create: `app/lib/queries/fyp/forYou.ts`

- [ ] **Step 1: Write the orchestrator**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getUserAffinity } from "./affinity";
import { scoreFilms, starterPackScored, type ScoredFilm } from "./score";
import type { FilmTagRow } from "@/lib/queries/film-tags";

type Client = SupabaseClient<Database>;

export interface ForYouPage {
  items: ScoredFilm[];
  filmsById: Map<string, { id: string; title: string; year: number; director: string; artwork_url: string }>;
  nextCursor: string | null;
  done: boolean;
}

export async function getForYou(
  client: Client,
  userId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<ForYouPage> {
  const limit = opts.limit ?? 20;
  const offset = opts.cursor ? Number(opts.cursor) : 0;

  // 1. Cold-start state detection: any signals at all?
  const affinity = await getUserAffinity(client, userId);
  const hasAnySignal = Object.keys(affinity.byTag).length > 0;

  if (!hasAnySignal) {
    // Editorial starter pack path. Skip scoring entirely.
    const { data: starters } = await client
      .from("films")
      .select("id, title, year, director, artwork_url")
      .eq("editorial_starter", true)
      .eq("available", true)
      .order("title");
    const filmsById = new Map((starters ?? []).map(f => [f.id, f]));
    const items = starterPackScored((starters ?? []).map(s => s.id));
    const slice = items.slice(offset, offset + limit);
    return {
      items: slice,
      filmsById,
      nextCursor: offset + limit < items.length ? String(offset + limit) : null,
      done: offset + limit >= items.length,
    };
  }

  // 2. Score path. Fetch candidate films + their tags + supporting context.
  const [candidateFilms, watchedRows, dislikedRows, lanesProfile, covenRatings, ownWatchDirectors] = await Promise.all([
    client.from("films").select("id, title, year, director, artwork_url").eq("available", true),
    client.from("watched").select("film_id").eq("user_id", userId),
    client.from("watched").select("film_id").eq("user_id", userId).eq("recommended", false),
    client.from("profiles").select("lane_tag_ids").eq("id", userId).maybeSingle(),
    client.from("films_with_stats").select("id, coven_rating_pct").eq("available", true),
    // Reuse watched query above; "ownDirectors" comes from joining watched → films.
    // For brevity here, batched separately:
    client.from("watched").select("film:films!inner(director)").eq("user_id", userId),
  ]);

  const filmsList = candidateFilms.data ?? [];
  const filmsById = new Map(filmsList.map(f => [f.id, f]));

  // Fetch all tags for the candidate set (one query, indexed on film_id).
  const filmIds = filmsList.map(f => f.id);
  const { data: allTags } = await client
    .from("film_tags")
    .select("film_id, position, is_primary, tag:tags!inner(id, name, type)")
    .in("film_id", filmIds);

  const tagsByFilmId = new Map<string, FilmTagRow[]>();
  for (const r of allTags ?? []) {
    const row = r as unknown as { film_id: string; position: number; is_primary: boolean; tag: { id: string; name: string; type: FilmTagRow['type'] } };
    const existing = tagsByFilmId.get(row.film_id) ?? [];
    existing.push({ id: row.tag.id, name: row.tag.name, type: row.tag.type, position: row.position, is_primary: row.is_primary });
    tagsByFilmId.set(row.film_id, existing);
  }

  // Lanes resolution: ids → tag names.
  const laneIds = (lanesProfile.data?.lane_tag_ids ?? []) as string[];
  let lanesByTag = new Set<string>();
  if (laneIds.length > 0) {
    const lanesTags = await client.from("tags").select("name").in("id", laneIds);
    lanesByTag = new Set((lanesTags.data ?? []).map(t => t.name));
  }

  // Build context.
  const ctx = {
    userWatchedFilmIds: new Set((watchedRows.data ?? []).map(w => w.film_id)),
    userDislikedFilmIds: new Set((dislikedRows.data ?? []).map(w => w.film_id)),
    covenRatingByFilm: new Map(
      (covenRatings.data ?? [])
        .filter((r): r is { id: string; coven_rating_pct: number } => r.coven_rating_pct != null)
        .map(r => [r.id, r.coven_rating_pct]),
    ),
    ownDirectors: new Set(
      (ownWatchDirectors.data ?? []).map(r => (r as unknown as { film: { director: string } }).film.director).filter(Boolean),
    ),
    lanesByTag,
  };

  // Score.
  const scored = scoreFilms(
    filmsList.map(f => ({ id: f.id, director: f.director, tags: tagsByFilmId.get(f.id) ?? [] })),
    affinity,
    ctx,
  );
  const slice = scored.slice(offset, offset + limit);
  return {
    items: slice,
    filmsById,
    nextCursor: offset + limit < scored.length ? String(offset + limit) : null,
    done: offset + limit >= scored.length,
  };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/lib/queries/fyp/forYou.ts
git commit -m "feat(fyp): getForYou orchestrator (cold-start branch + score path)"
```

---

## Task 9: `setLanes` server action

**Files:**
- Create: `app/lib/actions/fyp/lanes.ts`

- [ ] **Step 1: Write the action**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setLanes(tagIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Validate: tags must exist, must be subgenre|tone|theme.
  if (tagIds.length > 0) {
    const { data: tagRows, error } = await supabase
      .from("tags")
      .select("id, type")
      .in("id", tagIds);
    if (error) return { ok: false, error: error.message };
    if ((tagRows ?? []).length !== tagIds.length) return { ok: false, error: "Unknown tag id." };
    const allowed = new Set(["subgenre", "tone", "theme"]);
    for (const t of tagRows ?? []) {
      if (!allowed.has(t.type)) return { ok: false, error: `Lane tags must be subgenre / tone / theme. Got '${t.type}'.` };
    }
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ lane_tag_ids: tagIds })
    .eq("id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/settings");
  revalidatePath("/for-you");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/lib/actions/fyp/lanes.ts
git commit -m "feat(fyp): setLanes action — validates type, updates profiles.lane_tag_ids"
```

---

## Task 10: `/for-you` route + components

**Files:**
- Create: `app/app/for-you/page.tsx`, `app/components/ForYouFeed.tsx`, `app/components/ForYouRow.tsx`
- Modify: `app/components/TopNav.tsx`, `app/components/BottomNav.tsx` (add nav entry)
- Modify: `app/lib/actions/fyp/load-more.ts` (new — load-more action mirrors `loadMoreFeed`)

- [ ] **Step 1: Page + initial fetch**

`app/app/for-you/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getForYou } from "@/lib/queries/fyp/forYou";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import ForYouFeed from "@/components/ForYouFeed";

const PAGE_SIZE = 20;

export default async function ForYouPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/for-you");
  const supabase = await createClient();
  const initial = await getForYou(supabase, user.id, { limit: PAGE_SIZE });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="for-you" />
      <BottomNav current="for-you" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            For <em style={{ color: "var(--accent)" }}>You</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <ForYouFeed
            initialItems={initial.items}
            initialFilmsById={Array.from(initial.filmsById.entries())}
            initialCursor={initial.nextCursor}
            initialDone={initial.done}
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Load-more action**

`app/lib/actions/fyp/load-more.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getForYou } from "@/lib/queries/fyp/forYou";

export async function loadMoreForYou(cursor: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], filmsByIdEntries: [], nextCursor: null, done: true };
  const page = await getForYou(supabase, user.id, { cursor, limit: 20 });
  return {
    items: page.items,
    filmsByIdEntries: Array.from(page.filmsById.entries()),
    nextCursor: page.nextCursor,
    done: page.done,
  };
}
```

- [ ] **Step 3: ForYouFeed client component**

`app/components/ForYouFeed.tsx` — mirror `FeedTabs` structure (from sub-project #36 + my recent fix #128). Stateful, refs for cursor/done/loading, IntersectionObserver-driven load-more, manual "Load more" button fallback. The shape is functionally identical to `FeedTabs` minus the tab pills — pure rank order.

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ForYouRow from "./ForYouRow";
import FeedCardSkeleton from "./skeletons/FeedCardSkeleton";
import { loadMoreForYou } from "@/lib/actions/fyp/load-more";
import type { ScoredFilm } from "@/lib/queries/fyp/score";

interface FilmLite { id: string; title: string; year: number; director: string; artwork_url: string }

interface Props {
  initialItems: ScoredFilm[];
  initialFilmsById: Array<[string, FilmLite]>;
  initialCursor: string | null;
  initialDone: boolean;
}

export default function ForYouFeed({ initialItems, initialFilmsById, initialCursor, initialDone }: Props) {
  const [items, setItems] = useState(initialItems);
  const [filmsById, setFilmsById] = useState(new Map(initialFilmsById));
  const [cursor, setCursor] = useState(initialCursor);
  const [done, setDone] = useState(initialDone);
  const [loading, setLoading] = useState(false);

  const loadingRef = useRef(false);
  const cursorRef = useRef(cursor);
  const doneRef = useRef(done);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { doneRef.current = done; }, [done]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current || !cursorRef.current) return;
    setLoading(true);
    try {
      const res = await loadMoreForYou(cursorRef.current);
      setItems(prev => {
        const seen = new Set(prev.map(i => i.filmId));
        const merged = [...prev];
        for (const it of res.items) if (!seen.has(it.filmId)) merged.push(it);
        return merged;
      });
      setFilmsById(prev => {
        const next = new Map(prev);
        for (const [id, f] of res.filmsByIdEntries) if (!next.has(id)) next.set(id, f);
        return next;
      });
      setCursor(res.nextCursor);
      setDone(res.done);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
      { rootMargin: "600px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (items.length === 0) {
    return (
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, padding: "40px 0" }}>
        No recommendations yet. Tag a few films you've watched to seed your affinity, or set lanes on /settings.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gap: 24 }}>
        {items.map(scored => {
          const film = filmsById.get(scored.filmId);
          if (!film) return null;
          return <ForYouRow key={scored.filmId} film={film} reason={scored.topReason} />;
        })}
      </div>
      {!done && cursor && (
        <div ref={sentinelRef} style={{ marginTop: 32 }}>
          {loading ? (
            <div style={{ display: "grid", gap: 0 }}>
              <FeedCardSkeleton />
              <FeedCardSkeleton />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="caps"
              style={{ padding: "10px 20px", background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 11, fontFamily: "var(--font-ui)", fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em", margin: "0 auto", display: "block" }}
            >
              Load more
            </button>
          )}
        </div>
      )}
      {done && items.length > 0 && (
        <div style={{ textAlign: "center", padding: "32px 0 8px", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
          — that's everything we have for you right now —
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: ForYouRow component**

`app/components/ForYouRow.tsx` — poster + title + caption row. The "why" caption uses the topReason field.

```typescript
import Link from "next/link";
import FilmPoster from "./FilmPoster";
import type { ScoredFilm } from "@/lib/queries/fyp/score";

interface FilmLite { id: string; title: string; year: number; director: string; artwork_url: string }

interface Props {
  film: FilmLite;
  reason: ScoredFilm['topReason'];
}

function reasonText(r: ScoredFilm['topReason']): string {
  switch (r.kind) {
    case 'tag': return `matches your ${r.tagName} affinity`;
    case 'lane': return `matches your ${r.tagName} lane`;
    case 'coven_rating': return "highly rated by your coven";
    case 'director': return "from a director you've watched";
    case 'starter': return "starter pick — tag a few films to personalize";
  }
}

export default function ForYouRow({ film, reason }: Props) {
  return (
    <Link href={`/film/${film.id}`} className="stackable" style={{ "--stack-template": "120px 1fr", "--stack-gap": "16px", display: "grid", textDecoration: "none", color: "inherit" } as React.CSSProperties}>
      <FilmPoster film={film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
      <div>
        <div className="head" style={{ fontSize: 22, lineHeight: 1.05 }}>{film.title}</div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          {film.director} · {film.year}
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          {reasonText(reason)}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 5: Add to nav**

In `TopNav.tsx` and `BottomNav.tsx`, add a `for-you` entry. Match existing nav-link patterns. Label: "FOR YOU" (caps).

- [ ] **Step 6: Typecheck + manual smoke**

```bash
cd app && npm run typecheck
npm run dev
```
Open `/for-you` while signed in. Three states to verify:
1. Brand-new account (no coven, no watches): shows the editorial starter pack of ~20 films.
2. Account with coven mate who has watch signals: shows recs derived from that mate.
3. Account with own watches: behavior dominates; lanes + coven act as smaller priors.

- [ ] **Step 7: Commit**

```bash
git add app/app/for-you/page.tsx app/components/ForYouFeed.tsx app/components/ForYouRow.tsx app/lib/actions/fyp/load-more.ts app/components/TopNav.tsx app/components/BottomNav.tsx
git commit -m "feat(fyp): /for-you route + ranked feed + reason captions"
```

---

## Task 11: `/tags/[name]` route + pill linkage

**Files:**
- Create: `app/app/tags/[name]/page.tsx`
- Modify: `app/components/FilmTagsRow.tsx`

- [ ] **Step 1: Tag page**

```typescript
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: encoded } = await params;
  const tagName = decodeURIComponent(encoded);
  const supabase = await createClient();

  const { data: tag } = await supabase.from("tags").select("id, name, type").eq("name", tagName).maybeSingle();
  if (!tag) notFound();

  const { data: filmTags } = await supabase
    .from("film_tags")
    .select("film:films!inner(id, title, year, director, artwork_url, available)")
    .eq("tag_id", tag.id);

  const { data: stats } = await supabase
    .from("films_with_stats")
    .select("id, coven_rating_pct, coven_rating_count");

  const ratingById = new Map((stats ?? []).map(s => [s.id, s]));
  const films = (filmTags ?? [])
    .map(r => (r as unknown as { film: { id: string; title: string; year: number; director: string; artwork_url: string; available: boolean } }).film)
    .filter(f => f.available)
    .map(f => ({ ...f, rating: ratingById.get(f.id) }))
    .sort((a, b) => {
      const ar = a.rating?.coven_rating_pct ?? -1;
      const br = b.rating?.coven_rating_pct ?? -1;
      if (ar !== br) return br - ar;
      return b.year - a.year;
    });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />
      <BottomNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", textTransform: "capitalize" }}>
            {tag.name}.
          </h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--void)", opacity: 0.7, margin: "8px 0 0" }}>
            {films.length} films tagged {tag.name}{films.some(f => f.rating?.coven_rating_pct != null) ? ", ranked by your coven's verdict" : ""}.
          </p>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {films.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              No films tagged {tag.name} yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
              {films.map(f => (
                <Link key={f.id} href={`/film/${f.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                  <FilmPoster film={f as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                  <div style={{ marginTop: 10 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{f.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                      {f.year}
                      {f.rating?.coven_rating_pct != null && f.rating.coven_rating_count >= 5 ? (
                        <span style={{ marginLeft: 6, color: "var(--accent)" }}>· {Math.round(f.rating.coven_rating_pct)}%</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Make `<FilmTagsRow>` pills link to tag pages**

Read `app/components/FilmTagsRow.tsx`. Wrap each non-director pill in a `<Link>` to `/tags/${encodeURIComponent(tag.name)}`. Director stays a plain `<span>` (no tag page for it).

- [ ] **Step 3: Typecheck + smoke**

```bash
cd app && npm run typecheck
```
Open `/tags/folk%20horror` — should list every film with that tag, sorted by `coven_rating_pct DESC` then year. Tap a pill on any `/film/[id]` — should navigate to the appropriate tag page.

- [ ] **Step 4: Commit**

```bash
git add app/app/tags/[name]/page.tsx app/components/FilmTagsRow.tsx
git commit -m "feat(fyp): /tags/[name] listing pages + link FilmTagsRow pills"
```

---

## Task 12: Lane picker on `/settings`

**Files:**
- Create: `app/components/settings/LanePicker.tsx`
- Modify: `app/app/settings/page.tsx`

- [ ] **Step 1: LanePicker component**

```typescript
"use client";

import { useState, useTransition } from "react";
import { setLanes } from "@/lib/actions/fyp/lanes";
import type { TagOption } from "@/lib/queries/film-tags";

interface Props {
  initialLaneIds: string[];
  vocab: { subgenre: TagOption[]; tone: TagOption[]; theme: TagOption[] };
}

export default function LanePicker({ initialLaneIds, vocab }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initialLaneIds));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await setLanes(Array.from(picked));
      setMsg(r.ok ? "Saved." : r.error);
    });
  }

  function ChipRow(opts: TagOption[]) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {opts.map(o => (
          <button
            type="button"
            key={o.id}
            className={`tag-edit-pill ${picked.has(o.id) ? "is-selected" : ""}`}
            onClick={() => toggle(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h3 className="head" style={{ fontSize: 22, marginBottom: 8 }}>Lanes</h3>
      <p style={{ fontFamily: "var(--font-serif)", fontSize: 14, fontStyle: "italic", color: "var(--muted)", margin: "0 0 16px" }}>
        Tap tags you're into. We'll surface more of these on your For You feed.
      </p>

      <div className="caps" style={{ fontSize: 10, marginTop: 12 }}>Sub-genre</div>
      {ChipRow(vocab.subgenre)}

      <div className="caps" style={{ fontSize: 10, marginTop: 16 }}>Tone</div>
      {ChipRow(vocab.tone)}

      <div className="caps" style={{ fontSize: 10, marginTop: 16 }}>Theme</div>
      {ChipRow(vocab.theme)}

      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" className="btn" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save lanes"}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg === "Saved." ? "var(--accent)" : "var(--blood)" }}>{msg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount on `/settings`**

In `app/app/settings/page.tsx`, fetch the user's current `lane_tag_ids` and the vocabulary (`getAllTagsGroupedByType`), pass to `<LanePicker>`. Render below the existing notification toggles.

```typescript
const [profile, vocab] = await Promise.all([
  supabase.from("profiles").select("lane_tag_ids").eq("id", user.id).maybeSingle(),
  getAllTagsGroupedByType(supabase),
]);
const initialLaneIds = (profile.data?.lane_tag_ids ?? []) as string[];

// ... in JSX ...
<LanePicker
  initialLaneIds={initialLaneIds}
  vocab={{ subgenre: vocab.subgenre, tone: vocab.tone, theme: vocab.theme }}
/>
```

- [ ] **Step 3: Typecheck + smoke**

```bash
cd app && npm run typecheck
```
Open `/settings`. Pick a few subgenre + tone + theme chips. Save. Reload — chips remembered. Visit `/for-you` — recs should shift toward picked lanes.

- [ ] **Step 4: Commit**

```bash
git add app/components/settings/LanePicker.tsx 'app/app/settings/page.tsx'
git commit -m "feat(fyp): LanePicker on /settings (subgenre + tone + theme chip groups)"
```

---

## Task 13: Apply migrations + editorial picks + close out

**Files:**
- Modify: `CLAUDE.md`, `docs/sub-project-history.md`, `docs/roadmap.md`

- [ ] **Step 1: Apply mig 0154 to prod**

```bash
cd /Users/christophernowacki/film-goblin && set -a && source app/.env.local && set +a && cd db && npm run migrate
```
Expected: `Applied: 0154_fyp_recommender.sql`.

- [ ] **Step 2: Apply editorial starter picks**

Run the SQL from Task 2 against prod (the verify-titles step from Task 2 should be done first). After applying, spot-check:

```bash
npx tsx -e "
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query('SELECT title FROM films WHERE editorial_starter = TRUE ORDER BY title');
  console.log('Starter pack count:', r.rowCount);
  console.table(r.rows);
  await c.end();
})();
"
```
Expected: 20 rows (or however many of the 20 picks matched).

- [ ] **Step 3: Update docs**

Append row 35 to `docs/sub-project-history.md`. Update CLAUDE.md "Last updated" + "Last shipped" + drop "FYP recommender" from the "Next up" / queue. Update `docs/roadmap.md` count line (34 → 35) and remove the "FYP recommender" entry.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feature/fyp-recommender
gh pr create --title "feat: FYP recommender (sub-project #35)" --body-file /tmp/pr-body-35.md
```

PR body template:

```markdown
## Summary

Sub-project #35 — FYP recommender. Spec: `docs/superpowers/specs/2026-05-02-fyp-recommender-design.md`.

- **Mig 0154** adds `profiles.lane_tag_ids UUID[]` + `films.editorial_starter BOOLEAN`. Editorial starter pack populated by a one-shot UPDATE.
- **Affinity model**: 6 weighted user signals (`+3` watch+liked, `+2.5` recommendation_sent, `+1.5` library_added, `+0.75` watchlist_added, `+0.20` reaction, `−4` watch+disliked) × per-facet tag multipliers (Primary subgenre 3.0 → Content 0.5). Per-tag floor at 0.
- **Cold start** is 4 additive layers — editorial starter (true cold) → coven-borrowed × 0.3 (any bond, weighted by #34's interaction score) → lanes × 1.5 per picked tag → own behavior. All sum.
- **`/for-you` route** — single ranked feed with italic "why" captions per row (5 reason kinds). Infinite scroll matches `/home`.
- **`/tags/[name]` listing pages** — every film with the tag, sorted by `coven_rating_pct DESC, year DESC`. `<FilmTagsRow>` pills now link to them.
- **Lanes on `/settings`** — chip-pill picker for sub-genre + tone + theme.
- **No cache table** in v1. Code structured with cache seams at `getUserAffinity` / `getCovenBorrowedAffinity` for surgical addition at mid-scale.

## Test plan

- [x] `cd db && npm test` — pg-mem smoke green
- [x] `cd app && npm run typecheck` clean
- [x] Pure-function tests on `scoreFilms` (5 specs covering rank order, exclusion, top-reason attribution)
- [ ] Integration tests on `getUserOwnAffinity` (env-skipIf-gated)
- [x] Migration applied to prod Supabase
- [x] Editorial starter pack applied (20 films flagged)
- [ ] Manual smoke on Vercel preview: brand-new test account → editorial starter pack visible. Existing account with watches → personalized recs visible. /tags/folk%20horror lists folk-horror films sorted by coven rating. /settings picks lanes → recs shift.
```

- [ ] **Step 5: Merge + sync + deploy**

```bash
gh pr merge <pr-number> --squash --delete-branch
git checkout master && git pull --rebase origin master
npx vercel deploy --prod --yes
```

From repo root.

---

## Notes for the implementer

- **13 tasks total.** Tasks 1–4 are infrastructure (migration + types + tests + editorial seed). Tasks 5–9 are the math + queries (the brain of the recommender). Tasks 10–12 are the UI surfaces. Task 13 closes out.
- **The math is intentionally simple.** Sums and multipliers, no cosine, no normalization, no ML. If results feel off after shipping, the math is easy to tune (the weights are constants in two files).
- **Coven-borrowed has the only really expensive query** — it calls `getUserOwnAffinity` for every coven mate. At current scale (≤ a dozen mates per user) it's fine. If `/for-you` p95 latency crosses 500ms, add the cache documented at the `getCovenBorrowedAffinity` seam.
- **Top-reason attribution can lie.** A film whose top reason is "matches your folk horror affinity" might actually rank there because of a weak folk-horror weight + several other small contributions. The caption picks the *largest single contributor*, which is honest in spirit but not in mechanic. Acceptable for v1; tune wording if it surprises real users.
- **Editorial starter pack is editorial.** The 20-film list will get stale as the catalog grows. Schedule a quarterly review reminder if it matters; not for v1.
- **Tag pages can be empty.** `breakup horror` is on Midsommar + Possession only. The page will look thin. Acceptable — the canonical vocabulary is fixed.
- **The `getForYou` orchestrator does ~6 parallel queries.** That's fine at current scale but a clear cache target if it gets slow. Same seam principle: `getForYou` is one function; cache wraps it.
