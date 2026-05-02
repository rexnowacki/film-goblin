# Tagging System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sub-project #32's two-facet tag system with the seven-facet positional system from the v2 staff style guide. Schema, server action, editor, and render all rewritten. FYP recommender stays deferred.

**Architecture:** `tags(name, type IN (six values))` + `film_tags(film_id, tag_id, position SMALLINT, is_primary BOOLEAN)` with composite PK and partial unique index on Primary. Action layer enforces per-facet caps and the "Secondary in tail" rule. Editor is a two-stage chip-picker → drag-to-reorder list with `@dnd-kit/sortable`. Director stays on `films.director` and renders virtually at staff-guide position 2. `films.horror_adjacent` set in same transaction as `setFilmTags` when Primary is `thriller`.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Supabase Postgres + service-role for admin writes, `@dnd-kit/core` + `@dnd-kit/sortable` for drag UI, Vitest + testcontainers Postgres for DB-side tests, pg-mem for fast smoke.

**Spec:** `docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md`. Read it first.

---

## Task 1: Mig 0152 — wipe, expand schema, reseed

**Files:**
- Create: `db/migrations/0152_tagging_system_v2.sql`

- [ ] **Step 1: Write the migration**

Create `db/migrations/0152_tagging_system_v2.sql`:

```sql
-- 0152_tagging_system_v2.sql
--
-- Replaces sub-project #32's two-facet tag system with the v2 seven-facet
-- positional system. Spec: docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md
--
-- Wipe is intentional and confirmed during brainstorm — sub-project #32's
-- film_tags rows were proto curation only, no users tagged at scale.

BEGIN;

-- 1. Wipe.
TRUNCATE TABLE film_tags;
TRUNCATE TABLE tags;

-- 2. Expand facet vocabulary.
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check;
ALTER TABLE tags ADD CONSTRAINT tags_type_check
  CHECK (type IN ('subgenre','subject','tone','theme','setting','content'));

-- 3. Position + Primary flag on film_tags.
ALTER TABLE film_tags
  ADD COLUMN IF NOT EXISTS position SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Hard guarantee: at most one Primary per film.
DROP INDEX IF EXISTS film_tags_one_primary_per_film;
CREATE UNIQUE INDEX film_tags_one_primary_per_film
  ON film_tags(film_id) WHERE is_primary = TRUE;

-- 5. Read by film + ordered by position cheaply.
DROP INDEX IF EXISTS film_tags_film_position_idx;
CREATE INDEX film_tags_film_position_idx ON film_tags(film_id, position);

-- 6. horror_adjacent on films, set by setFilmTags when Primary is 'thriller'.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS horror_adjacent BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS films_horror_adjacent_idx;
CREATE INDEX films_horror_adjacent_idx ON films(horror_adjacent)
  WHERE horror_adjacent = TRUE;

-- 7. Seed: 88 canonical tags.
INSERT INTO tags (name, type) VALUES
  -- 24 sub-genres
  ('body horror','subgenre'), ('cosmic horror','subgenre'),
  ('creature feature','subgenre'), ('cursed media','subgenre'),
  ('eco-horror','subgenre'), ('erotic horror','subgenre'),
  ('exploitation','subgenre'), ('extreme horror','subgenre'),
  ('folk horror','subgenre'), ('found footage','subgenre'),
  ('giallo','subgenre'), ('gothic','subgenre'),
  ('haunted house','subgenre'), ('home invasion','subgenre'),
  ('horror comedy','subgenre'), ('monster movie','subgenre'),
  ('psychological horror','subgenre'), ('religious horror','subgenre'),
  ('slasher','subgenre'), ('splatterpunk','subgenre'),
  ('supernatural horror','subgenre'), ('survival horror','subgenre'),
  ('techno-horror','subgenre'), ('thriller','subgenre'),
  -- 17 subjects
  ('vampires','subject'), ('zombies','subject'), ('witches','subject'),
  ('werewolves','subject'), ('ghosts','subject'), ('demons','subject'),
  ('aliens','subject'), ('kaiju','subject'), ('serial killer','subject'),
  ('cult','subject'), ('coven','subject'), ('creepy kids','subject'),
  ('cursed object','subject'), ('cursed place','subject'),
  ('possession','subject'), ('ritual','subject'), ('traps','subject'),
  -- 16 tones
  ('arthouse','tone'), ('atmospheric','tone'), ('bleak','tone'),
  ('campy','tone'), ('claustrophobic','tone'), ('dreamlike','tone'),
  ('fever dream','tone'), ('funny','tone'), ('hangout','tone'),
  ('mean-spirited','tone'), ('midnight movie','tone'), ('nihilistic','tone'),
  ('nostalgic','tone'), ('psychedelic','tone'), ('slow-burn','tone'),
  ('surreal','tone'),
  -- 21 themes (incl. breakup horror, the v2 add)
  ('addiction','theme'), ('body autonomy','theme'), ('breakup horror','theme'),
  ('class','theme'), ('colonialism','theme'), ('coming-of-age','theme'),
  ('conspiracy','theme'), ('family trauma','theme'), ('grief','theme'),
  ('isolation','theme'), ('masculinity','theme'), ('motherhood','theme'),
  ('obsession','theme'), ('paranoia','theme'), ('queer','theme'),
  ('race','theme'), ('relationship horror','theme'), ('religion','theme'),
  ('revenge','theme'), ('sexuality','theme'), ('technology','theme'),
  -- 6 settings
  ('period setting','setting'), ('rural horror','setting'),
  ('small town','setting'), ('suburban','setting'),
  ('urban horror','setting'), ('wilderness','setting'),
  -- 4 content
  ('gore','content'), ('splatter','content'),
  ('sexual content','content'), ('violent','content');

COMMIT;
```

- [ ] **Step 2: Verify migration applies cleanly to a fresh DB**

Run: `cd db && npm test`
Expected: pg-mem smoke includes `0152_tagging_system_v2.sql` and reports green. Note that pg-mem strips RLS/GRANT but the table-level shape changes (TRUNCATE / ALTER / INSERT) need to apply.

If pg-mem trips on `TRUNCATE` against an empty fresh table, it's fine — the assertion is just "tables exist after migration." If it trips on the new CHECK constraint, extend `db/tests/helpers/pg-mem.ts` strip filters minimally rather than rewriting the migration.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0152_tagging_system_v2.sql
git commit -m "feat(db): mig 0152 — tagging system v2 schema + reseed (88 tags)"
```

---

## Task 2: RLS + composite-PK + partial-unique tests

**Files:**
- Modify: `db/tests/rls/tags-and-film-tags.test.ts` (extend the existing #32 test file)

- [ ] **Step 1: Read the current test file to see #32's shape**

Look at `db/tests/rls/tags-and-film-tags.test.ts`. The bootstrap pattern (`seedFixtures` in `beforeAll`, `beforeEach` resets state) is reusable. Don't rewrite — extend.

- [ ] **Step 2: Update existing specs for new vocabulary count**

Change "anon SELECT on tags returns 18 subgenres" → "anon SELECT on tags returns 24 subgenres + 17 subjects + 16 tones + 21 themes + 6 settings + 4 content (88 total)". Update count assertions accordingly.

- [ ] **Step 3: Add new specs for v2-only schema features**

Append these tests to the existing file:

```typescript
describe("film_tags v2 schema", () => {
  it("rejects two is_primary=TRUE rows for the same film", async () => {
    const subgenreA = await getTagId(serviceClient, "folk horror");
    const subgenreB = await getTagId(serviceClient, "gothic");
    // First Primary insert succeeds.
    const ok = await serviceClient.from("film_tags").insert({
      film_id: filmId, tag_id: subgenreA, position: 1, is_primary: true,
    });
    expect(ok.error).toBeNull();
    // Second Primary insert MUST fail (partial unique index).
    const dup = await serviceClient.from("film_tags").insert({
      film_id: filmId, tag_id: subgenreB, position: 5, is_primary: true,
    });
    expect(dup.error).not.toBeNull();
    expect(dup.error?.message).toMatch(/film_tags_one_primary_per_film/);
  });

  it("allows multiple is_primary=FALSE rows per film", async () => {
    const subgenre = await getTagId(serviceClient, "folk horror");
    const tone1 = await getTagId(serviceClient, "fever dream");
    const tone2 = await getTagId(serviceClient, "bleak");
    const r = await serviceClient.from("film_tags").insert([
      { film_id: filmId, tag_id: subgenre, position: 1, is_primary: true },
      { film_id: filmId, tag_id: tone1, position: 2, is_primary: false },
      { film_id: filmId, tag_id: tone2, position: 3, is_primary: false },
    ]);
    expect(r.error).toBeNull();
  });

  it("composite PK rejects duplicate (film_id, tag_id) regardless of position", async () => {
    const tone = await getTagId(serviceClient, "fever dream");
    await serviceClient.from("film_tags").insert({
      film_id: filmId, tag_id: tone, position: 2, is_primary: false,
    });
    const dup = await serviceClient.from("film_tags").insert({
      film_id: filmId, tag_id: tone, position: 5, is_primary: false,
    });
    expect(dup.error).not.toBeNull();
  });

  it("CHECK constraint rejects unknown tag types", async () => {
    const r = await serviceClient.from("tags").insert({
      name: "test-bogus", type: "fake-facet",
    });
    expect(r.error).not.toBeNull();
    expect(r.error?.message).toMatch(/tags_type_check/);
  });

  it("films.horror_adjacent defaults FALSE and accepts updates via service-role", async () => {
    const before = await serviceClient.from("films").select("horror_adjacent").eq("id", filmId).single();
    expect(before.data?.horror_adjacent).toBe(false);
    const upd = await serviceClient.from("films").update({ horror_adjacent: true }).eq("id", filmId);
    expect(upd.error).toBeNull();
    const after = await serviceClient.from("films").select("horror_adjacent").eq("id", filmId).single();
    expect(after.data?.horror_adjacent).toBe(true);
  });
});
```

Where `getTagId` is a small helper:
```typescript
async function getTagId(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.from("tags").select("id").eq("name", name).single();
  if (error || !data) throw new Error(`tag not found: ${name}`);
  return data.id;
}
```

- [ ] **Step 4: Run the suite**

Run: `cd db && npm run test:rls`
Expected: All previous specs continue passing (count assertions updated). 5 new specs pass. Full suite reports green.

- [ ] **Step 5: Commit**

```bash
git add db/tests/rls/tags-and-film-tags.test.ts
git commit -m "test(db): extend tags+film_tags RLS specs for v2 schema"
```

---

## Task 3: Hand-edit `app/lib/supabase/types.ts`

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Locate the `film_tags` and `tags` types in types.ts**

Use grep:
```bash
grep -n "film_tags:\|tags: {" app/lib/supabase/types.ts | head -10
```

Note line numbers.

- [ ] **Step 2: Update `film_tags` Row/Insert/Update types**

Add `position: number` and `is_primary: boolean` to all three. Match the existing nullability pattern (Row is required, Insert/Update have optional with default).

```typescript
film_tags: {
  Row: {
    created_at: string
    film_id: string
    tag_id: string
    position: number          // NEW
    is_primary: boolean       // NEW
  }
  Insert: {
    created_at?: string
    film_id: string
    tag_id: string
    position?: number         // NEW (DEFAULT 1)
    is_primary?: boolean      // NEW (DEFAULT FALSE)
  }
  Update: {
    created_at?: string
    film_id?: string
    tag_id?: string
    position?: number         // NEW
    is_primary?: boolean      // NEW
  }
  // Relationships unchanged
}
```

- [ ] **Step 3: Update `tags.type` literal union**

Change the `type` field on `tags` from `string` (or whatever the v1 type was) to:

```typescript
type: "subgenre" | "subject" | "tone" | "theme" | "setting" | "content"
```

Match the position in the file's existing pattern (Row required, Insert default, Update optional).

- [ ] **Step 4: Add `films.horror_adjacent`**

Locate the `films` Row/Insert/Update block (line ~241 in current state). Add `horror_adjacent: boolean` to Row (NOT NULL DEFAULT FALSE — non-null), `horror_adjacent?: boolean` to Insert and Update. Keep alphabetical order.

- [ ] **Step 5: Verify types compile**

Run: `cd app && npm run typecheck`
Expected: clean (no consumer of these types yet — that comes in later tasks).

- [ ] **Step 6: Commit**

```bash
git add app/lib/supabase/types.ts
git commit -m "chore(types): hand-edit for v2 tagging schema (position, is_primary, horror_adjacent)"
```

---

## Task 4: Install drag library

**Files:**
- Modify: `app/package.json`, `app/package-lock.json`

- [ ] **Step 1: Install `@dnd-kit/core` and `@dnd-kit/sortable`**

```bash
cd app && npm install @dnd-kit/core @dnd-kit/sortable
```

Pin to current stable. Skip `@dnd-kit/utilities` unless directly needed — `core` re-exports the utilities the sortable integration requires.

- [ ] **Step 2: Verify it resolves**

```bash
cd app && npm run typecheck
```
Expected: clean. (The libs aren't imported anywhere yet.)

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "chore(deps): add @dnd-kit/core + @dnd-kit/sortable for v2 tag editor"
```

---

## Task 5: Rewrite `getFilmTags` + tag-fetch helpers

**Files:**
- Modify: `app/lib/queries/film-tags.ts`
- Test: `app/tests/queries/film-tags.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the existing `app/tests/queries/film-tags.test.ts` (skipIf-gated against env, mirror existing pattern):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getFilmTags, getAllTagsGroupedByType } from "@/lib/queries/film-tags";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(url && serviceKey);

describe.skipIf(!hasEnv)("getFilmTags + getAllTagsGroupedByType", () => {
  if (!hasEnv) return;
  const service = createClient<Database>(url!, serviceKey!);
  let filmId: string;
  let primaryTagId: string;
  let tagB: string;
  let tagC: string;
  let tagD: string;
  let tagE: string;
  let tagF: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    const film = await service.from("films").insert({
      itunes_id: 999000001, title: "Test Film for Tag Queries",
      year: 2024, director: "test director", runtime_min: 90, genre_primary: "Horror",
      artwork_url: "x", itunes_url: "x", tracking: false, available: true,
    }).select("id").single();
    if (film.error || !film.data) throw film.error;
    filmId = film.data.id;
    primaryTagId = (await service.from("tags").select("id").eq("name", "folk horror").single()).data!.id;
    tagB = (await service.from("tags").select("id").eq("name", "fever dream").single()).data!.id;
    tagC = (await service.from("tags").select("id").eq("name", "family trauma").single()).data!.id;
    tagD = (await service.from("tags").select("id").eq("name", "witches").single()).data!.id;
    tagE = (await service.from("tags").select("id").eq("name", "period setting").single()).data!.id;
    tagF = (await service.from("tags").select("id").eq("name", "religious horror").single()).data!.id; // Secondary subgenre
  });

  afterAll(async () => {
    if (!hasEnv) return;
    if (filmId) await service.from("films").delete().eq("id", filmId);
  });

  beforeEach(async () => {
    if (!hasEnv) return;
    await service.from("film_tags").delete().eq("film_id", filmId);
  });

  it("returns visible (positions 1-4) and hidden (positions 5+) split", async () => {
    await service.from("film_tags").insert([
      { film_id: filmId, tag_id: primaryTagId, position: 1, is_primary: true },
      { film_id: filmId, tag_id: tagB, position: 2, is_primary: false },
      { film_id: filmId, tag_id: tagC, position: 3, is_primary: false },
      { film_id: filmId, tag_id: tagD, position: 4, is_primary: false },
      { film_id: filmId, tag_id: tagE, position: 5, is_primary: false },
      { film_id: filmId, tag_id: tagF, position: 6, is_primary: false },
    ]);
    const tags = await getFilmTags(service, filmId);
    expect(tags.visible.map(t => t.position)).toEqual([1, 2, 3, 4]);
    expect(tags.hidden.map(t => t.position)).toEqual([5, 6]);
    expect(tags.visible[0].is_primary).toBe(true);
    expect(tags.visible[0].name).toBe("folk horror");
  });

  it("returns empty arrays for an untagged film", async () => {
    const tags = await getFilmTags(service, filmId);
    expect(tags.visible).toEqual([]);
    expect(tags.hidden).toEqual([]);
  });

  it("orders visible array by position even if rows came back unordered", async () => {
    await service.from("film_tags").insert([
      { film_id: filmId, tag_id: tagD, position: 4, is_primary: false },
      { film_id: filmId, tag_id: primaryTagId, position: 1, is_primary: true },
      { film_id: filmId, tag_id: tagC, position: 3, is_primary: false },
      { film_id: filmId, tag_id: tagB, position: 2, is_primary: false },
    ]);
    const tags = await getFilmTags(service, filmId);
    expect(tags.visible.map(t => t.position)).toEqual([1, 2, 3, 4]);
  });
});

describe.skipIf(!hasEnv)("getAllTagsGroupedByType", () => {
  if (!hasEnv) return;
  const service = createClient<Database>(url!, serviceKey!);

  it("groups tags by type and returns canonical counts", async () => {
    const grouped = await getAllTagsGroupedByType(service);
    expect(grouped.subgenre.length).toBe(24);
    expect(grouped.subject.length).toBe(17);
    expect(grouped.tone.length).toBe(16);
    expect(grouped.theme.length).toBe(21);
    expect(grouped.setting.length).toBe(6);
    expect(grouped.content.length).toBe(4);
    // breakup horror is in themes
    expect(grouped.theme.some(t => t.name === "breakup horror")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run tests/queries/film-tags.test.ts
```
Expected: All specs fail (the new functions don't exist or return v1 shape). If env is missing the file reports green-skipped, which is fine for CI but doesn't cover the work — implementer must run with env present.

- [ ] **Step 3: Rewrite `app/lib/queries/film-tags.ts`**

Replace the entire file:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type TagFacet = 'subgenre' | 'subject' | 'tone' | 'theme' | 'setting' | 'content';

export interface FilmTagRow {
  id: string;
  name: string;
  type: TagFacet;
  position: number;
  is_primary: boolean;
}

export interface FilmTags {
  visible: FilmTagRow[];   // film_tags rows where position <= 4 (max 4 entries; staff guide visible 1-5 includes virtual director slot)
  hidden: FilmTagRow[];    // film_tags rows where position >= 5 (the FYP tail)
}

/**
 * Returns ordered tags for a film, split into visible (positions 1-4 in
 * film_tags = staff guide positions 1, 3, 4, 5 — guide position 2 is the
 * virtual director slot from films.director, not in film_tags) and hidden
 * (positions 5+).
 *
 * Hidden tags don't render on the film detail page in v2 but are returned
 * so the FYP recommender (sub-project B) can read the full ranked list
 * from the same query.
 */
export async function getFilmTags(client: Client, filmId: string): Promise<FilmTags> {
  const { data, error } = await client
    .from("film_tags")
    .select("position, is_primary, tag:tags!inner(id, name, type)")
    .eq("film_id", filmId)
    .order("position", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    position: number;
    is_primary: boolean;
    tag: { id: string; name: string; type: TagFacet };
  }>;
  const ordered: FilmTagRow[] = rows.map(r => ({
    id: r.tag.id,
    name: r.tag.name,
    type: r.tag.type,
    position: r.position,
    is_primary: r.is_primary,
  }));
  return {
    visible: ordered.filter(r => r.position <= 4),
    hidden: ordered.filter(r => r.position >= 5),
  };
}

export interface TagOption {
  id: string;
  name: string;
}

export type TagsByFacet = Record<TagFacet, TagOption[]>;

/**
 * Returns the entire canonical tag vocabulary keyed by facet. Drives the
 * editor's chip-picker stage. Results are alphabetical within each facet.
 */
export async function getAllTagsGroupedByType(client: Client): Promise<TagsByFacet> {
  const { data, error } = await client
    .from("tags")
    .select("id, name, type")
    .order("name", { ascending: true });
  if (error) throw error;
  const grouped: TagsByFacet = {
    subgenre: [], subject: [], tone: [], theme: [], setting: [], content: [],
  };
  for (const row of data ?? []) {
    const type = row.type as TagFacet;
    if (grouped[type]) grouped[type].push({ id: row.id, name: row.name });
  }
  return grouped;
}
```

- [ ] **Step 4: Run the tests**

```bash
cd app && npx vitest run tests/queries/film-tags.test.ts
```
Expected: All specs pass (with env present).

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/film-tags.ts app/tests/queries/film-tags.test.ts
git commit -m "feat(queries): rewrite getFilmTags for v2 (visible/hidden split + grouped vocab)"
```

---

## Task 6: Rewrite `setFilmTags` server action

**Files:**
- Modify: `app/lib/actions/admin/film-tags.ts`
- Test: `app/tests/actions/film-tags.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `app/tests/actions/film-tags.test.ts` (env-skipIf gated):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// _setFilmTags is the testable private form (Supabase client injected).
import { _setFilmTags } from "@/lib/actions/admin/film-tags";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(url && serviceKey);

describe.skipIf(!hasEnv)("_setFilmTags v2 — validation paths", () => {
  if (!hasEnv) return;
  const service = createClient<Database>(url!, serviceKey!);
  let filmId: string;
  const tag: Record<string, string> = {};

  async function tagId(name: string): Promise<string> {
    if (tag[name]) return tag[name];
    const r = await service.from("tags").select("id").eq("name", name).single();
    if (r.error || !r.data) throw new Error(`tag not found: ${name}`);
    tag[name] = r.data.id;
    return r.data.id;
  }

  beforeAll(async () => {
    if (!hasEnv) return;
    const film = await service.from("films").insert({
      itunes_id: 999000002, title: "Test Film for Action",
      year: 2024, director: "test director", runtime_min: 90, genre_primary: "Horror",
      artwork_url: "x", itunes_url: "x", tracking: false, available: true,
    }).select("id").single();
    if (film.error || !film.data) throw film.error;
    filmId = film.data.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    if (filmId) await service.from("films").delete().eq("id", filmId);
  });

  beforeEach(async () => {
    if (!hasEnv) return;
    await service.from("film_tags").delete().eq("film_id", filmId);
    await service.from("films").update({ horror_adjacent: false }).eq("id", filmId);
  });

  it("rejects when no Primary subgenre is provided", async () => {
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: "",
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [await tagId("fever dream")],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [await tagId("fever dream")],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/primary/i);
  });

  it("rejects when Primary tag is not subgenre type", async () => {
    const wrongPrimary = await tagId("fever dream"); // tone, not subgenre
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: wrongPrimary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [await tagId("bleak")],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [wrongPrimary, await tagId("bleak")],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects more than 2 secondary subgenres", async () => {
    const primary = await tagId("folk horror");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [await tagId("gothic"), await tagId("horror comedy"), await tagId("slasher")],
      subjectIds: [],
      toneIds: [await tagId("bleak")],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary, await tagId("bleak"), await tagId("gothic"), await tagId("horror comedy"), await tagId("slasher")],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/secondary/i);
  });

  it("rejects when secondary subgenre appears at position < 5", async () => {
    const primary = await tagId("folk horror");
    const secondary = await tagId("religious horror");
    const tone = await tagId("fever dream");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [secondary],
      subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      // Secondary at index 1 (= position 2). Should be rejected.
      orderedTagIds: [primary, secondary, tone],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/secondary.*tail/i);
  });

  it("rejects 0 tones (need at least 1)", async () => {
    const primary = await tagId("folk horror");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tone/i);
  });

  it("rejects more than 3 tones", async () => {
    const primary = await tagId("folk horror");
    const tones = [
      await tagId("bleak"), await tagId("fever dream"),
      await tagId("dreamlike"), await tagId("psychedelic"),
    ];
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: tones,
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary, ...tones],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when orderedTagIds is missing a picked tag", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("bleak");
    const theme = await tagId("grief");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [theme],
      settingIds: [], contentIds: [],
      orderedTagIds: [primary, tone], // theme missing
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when orderedTagIds[0] is not the Primary subgenre", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("bleak");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [tone, primary], // wrong order
    });
    expect(r.ok).toBe(false);
  });

  it("commits a valid tag set and writes positions correctly", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("fever dream");
    const theme1 = await tagId("family trauma");
    const subject = await tagId("witches");
    const setting = await tagId("period setting");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [],
      subjectIds: [subject],
      toneIds: [tone],
      themeIds: [theme1],
      settingIds: [setting],
      contentIds: [],
      orderedTagIds: [primary, theme1, subject, tone, setting],
    });
    expect(r.ok).toBe(true);
    const written = await service.from("film_tags")
      .select("position, is_primary, tag_id")
      .eq("film_id", filmId).order("position");
    expect(written.data).toEqual([
      { position: 1, is_primary: true, tag_id: primary },
      { position: 2, is_primary: false, tag_id: theme1 },
      { position: 3, is_primary: false, tag_id: subject },
      { position: 4, is_primary: false, tag_id: tone },
      { position: 5, is_primary: false, tag_id: setting },
    ]);
  });

  it("sets horror_adjacent=true when Primary is thriller", async () => {
    const primary = await tagId("thriller");
    const tone = await tagId("bleak");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary, tone],
    });
    expect(r.ok).toBe(true);
    const film = await service.from("films").select("horror_adjacent").eq("id", filmId).single();
    expect(film.data?.horror_adjacent).toBe(true);
  });

  it("clears horror_adjacent back to false when Primary changes off thriller", async () => {
    // Tag once with thriller as Primary (sets flag true).
    const thriller = await tagId("thriller");
    const tone = await tagId("bleak");
    await _setFilmTags(service, {
      filmId,
      primarySubgenreId: thriller,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [thriller, tone],
    });
    // Re-tag with folk horror as Primary.
    const folk = await tagId("folk horror");
    await _setFilmTags(service, {
      filmId,
      primarySubgenreId: folk,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [folk, tone],
    });
    const film = await service.from("films").select("horror_adjacent").eq("id", filmId).single();
    expect(film.data?.horror_adjacent).toBe(false);
  });

  it("rejects > 3 themes, > 3 subjects, > 2 settings", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("bleak");
    const themes = [await tagId("grief"), await tagId("isolation"), await tagId("paranoia"), await tagId("obsession")];
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: themes,
      settingIds: [], contentIds: [],
      orderedTagIds: [primary, tone, ...themes],
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run tests/actions/film-tags.test.ts
```
Expected: 12 specs fail (with env present).

- [ ] **Step 3: Rewrite `app/lib/actions/admin/film-tags.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface SetFilmTagsInput {
  filmId: string;
  primarySubgenreId: string;
  secondarySubgenreIds: string[];
  subjectIds: string[];
  toneIds: string[];
  themeIds: string[];
  settingIds: string[];
  contentIds: string[];
  orderedTagIds: string[];
}

type Result = { ok: true } | { ok: false; error: string };

const CAPS = {
  primary: 1,
  secondary: 2,
  subject: 3,
  toneMin: 1,
  toneMax: 3,
  theme: 3,
  setting: 2,
  // content: unrestricted
} as const;

/**
 * Tagging system v2. Replaces sub-project #32's setFilmTags with the
 * seven-facet positional system. See spec at
 * docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md.
 *
 * Validates per-facet caps, the "Secondary in tail (position 5+)" rule,
 * the "exactly one Primary, must be subgenre" invariant, and the
 * orderedTagIds ↔ picker output set-equality. On commit, deletes all
 * existing film_tags rows for the film and re-inserts at positions 1..N
 * with is_primary set on the Primary subgenre row. In the same transaction
 * sets films.horror_adjacent based on whether Primary is 'thriller'.
 */
export async function _setFilmTags(client: Client, input: SetFilmTagsInput): Promise<Result> {
  // 1. Sanity: Primary required, exactly one.
  if (!input.primarySubgenreId) {
    return { ok: false, error: "Primary sub-genre is required." };
  }

  // 2. Cap checks.
  if (input.secondarySubgenreIds.length > CAPS.secondary) {
    return { ok: false, error: `At most ${CAPS.secondary} Secondary sub-genres.` };
  }
  if (input.subjectIds.length > CAPS.subject) {
    return { ok: false, error: `At most ${CAPS.subject} subject tags.` };
  }
  if (input.toneIds.length < CAPS.toneMin) {
    return { ok: false, error: `At least ${CAPS.toneMin} tone tag is required.` };
  }
  if (input.toneIds.length > CAPS.toneMax) {
    return { ok: false, error: `At most ${CAPS.toneMax} tone tags.` };
  }
  if (input.themeIds.length > CAPS.theme) {
    return { ok: false, error: `At most ${CAPS.theme} theme tags.` };
  }
  if (input.settingIds.length > CAPS.setting) {
    return { ok: false, error: `At most ${CAPS.setting} setting tags.` };
  }

  // 3. No duplicates within or across facets, no Primary in Secondaries.
  const allPickedIds = [
    input.primarySubgenreId,
    ...input.secondarySubgenreIds,
    ...input.subjectIds, ...input.toneIds, ...input.themeIds,
    ...input.settingIds, ...input.contentIds,
  ];
  if (new Set(allPickedIds).size !== allPickedIds.length) {
    return { ok: false, error: "Duplicate tags across facets." };
  }
  if (input.secondarySubgenreIds.includes(input.primarySubgenreId)) {
    return { ok: false, error: "Primary cannot also be a Secondary." };
  }

  // 4. orderedTagIds set-equals union of picked tags.
  if (input.orderedTagIds.length !== allPickedIds.length) {
    return { ok: false, error: "Ordered list does not match picked tags." };
  }
  const orderedSet = new Set(input.orderedTagIds);
  if (allPickedIds.some(id => !orderedSet.has(id))) {
    return { ok: false, error: "Ordered list is missing a picked tag." };
  }

  // 5. Slot 1 must be Primary.
  if (input.orderedTagIds[0] !== input.primarySubgenreId) {
    return { ok: false, error: "First slot must be the Primary sub-genre." };
  }

  // 6. Secondaries at position 5+ (= 0-indexed >= 4 in orderedTagIds = staff guide position 6+).
  for (const sec of input.secondarySubgenreIds) {
    const idx = input.orderedTagIds.indexOf(sec);
    if (idx < 4) {
      return { ok: false, error: "Secondary sub-genres must live in the tail (slot 5+)." };
    }
  }

  // 7. Server-side type defense — verify every picked tag has the expected facet type.
  const tagRows = await client
    .from("tags")
    .select("id, name, type")
    .in("id", allPickedIds);
  if (tagRows.error) return { ok: false, error: tagRows.error.message };
  const byId = new Map((tagRows.data ?? []).map(r => [r.id, r] as const));
  if (byId.size !== allPickedIds.length) {
    return { ok: false, error: "Unknown tag id." };
  }

  function expectType(id: string, want: string, label: string): string | null {
    const row = byId.get(id);
    if (!row) return `${label} tag not found.`;
    if (row.type !== want) return `${label} must be type '${want}', got '${row.type}'.`;
    return null;
  }
  const typeErrors: (string | null)[] = [
    expectType(input.primarySubgenreId, "subgenre", "Primary"),
    ...input.secondarySubgenreIds.map(id => expectType(id, "subgenre", "Secondary")),
    ...input.subjectIds.map(id => expectType(id, "subject", "Subject")),
    ...input.toneIds.map(id => expectType(id, "tone", "Tone")),
    ...input.themeIds.map(id => expectType(id, "theme", "Theme")),
    ...input.settingIds.map(id => expectType(id, "setting", "Setting")),
    ...input.contentIds.map(id => expectType(id, "content", "Content")),
  ];
  const firstTypeErr = typeErrors.find(e => e !== null);
  if (firstTypeErr) return { ok: false, error: firstTypeErr };

  // 8. Commit: delete then insert, then update horror_adjacent.
  const del = await client.from("film_tags").delete().eq("film_id", input.filmId);
  if (del.error) return { ok: false, error: del.error.message };

  const inserts = input.orderedTagIds.map((tagId, i) => ({
    film_id: input.filmId,
    tag_id: tagId,
    position: i + 1,
    is_primary: tagId === input.primarySubgenreId,
  }));
  const ins = await client.from("film_tags").insert(inserts);
  if (ins.error) return { ok: false, error: ins.error.message };

  const primaryRow = byId.get(input.primarySubgenreId)!;
  const upd = await client.from("films").update({
    horror_adjacent: primaryRow.name === "thriller",
  }).eq("id", input.filmId);
  if (upd.error) return { ok: false, error: upd.error.message };

  return { ok: true };
}

export async function setFilmTags(input: SetFilmTagsInput): Promise<Result> {
  await requireAdmin();
  const service = serviceRoleClient();
  const result = await _setFilmTags(service, input);
  if (result.ok) {
    revalidatePath("/film/" + input.filmId);
    revalidatePath("/admin/films");
    revalidatePath("/admin/films/" + input.filmId + "/edit");
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run tests/actions/film-tags.test.ts
```
Expected: 12 specs pass.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/admin/film-tags.ts app/tests/actions/film-tags.test.ts
git commit -m "feat(actions): rewrite setFilmTags for v2 (per-facet caps, ordering, horror_adjacent)"
```

---

## Task 7: Editor v2 — picker stage

**Files:**
- Modify: `app/components/admin/FilmTagEditor.tsx`
- Modify: `app/app/globals.css` (extend `.tag-edit-pill` styles)

This task ships the chip-picker top half of the editor. The drag-list bottom half lands in Task 8 — keeping them separate gives the implementer two clean review checkpoints.

- [ ] **Step 1: Replace the component shell**

Rewrite `app/components/admin/FilmTagEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { setFilmTags } from "@/lib/actions/admin/film-tags";
import type { TagsByFacet, TagOption, FilmTagRow } from "@/lib/queries/film-tags";

type FacetWithCap = {
  key: keyof TagsByFacet;
  label: string;
  capLabel: string;  // shown in header
  min: number;
  max: number | null; // null = unrestricted
};

const FACETS: FacetWithCap[] = [
  { key: "subject", label: "Subjects",   capLabel: "0–3",   min: 0, max: 3 },
  { key: "tone",    label: "Tones",      capLabel: "1–3",   min: 1, max: 3 },
  { key: "theme",   label: "Themes",     capLabel: "0–3",   min: 0, max: 3 },
  { key: "setting", label: "Settings",   capLabel: "0–2",   min: 0, max: 2 },
  { key: "content", label: "Content",    capLabel: "any",   min: 0, max: null },
];

interface Props {
  filmId: string;
  director: string;            // films.director — rendered virtually at slot 2
  vocab: TagsByFacet;          // canonical tag list per facet
  initial: {                   // current state (empty object for untagged films)
    primarySubgenreId: string | null;
    secondarySubgenreIds: string[];
    subjectIds: string[];
    toneIds: string[];
    themeIds: string[];
    settingIds: string[];
    contentIds: string[];
    orderedTagIds: string[];   // existing position order, [] if untagged
  };
}

export default function FilmTagEditor({ filmId, director, vocab, initial }: Props) {
  const [primary, setPrimary] = useState<string | null>(initial.primarySubgenreId);
  const [secondaries, setSecondaries] = useState<string[]>(initial.secondarySubgenreIds);
  const [subjects, setSubjects] = useState<string[]>(initial.subjectIds);
  const [tones, setTones] = useState<string[]>(initial.toneIds);
  const [themes, setThemes] = useState<string[]>(initial.themeIds);
  const [settings, setSettings] = useState<string[]>(initial.settingIds);
  const [contents, setContents] = useState<string[]>(initial.contentIds);
  const [ordered, setOrdered] = useState<string[]>(initial.orderedTagIds);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Whenever a chip is added/removed, sync ordered: append new ids, remove gone ids.
  function syncOrdered(allPicked: string[]) {
    setOrdered(prev => {
      const filtered = prev.filter(id => allPicked.includes(id));
      const missing = allPicked.filter(id => !filtered.includes(id));
      // Primary always first.
      const withoutPrimary = filtered.filter(id => id !== primary);
      const head = primary ? [primary] : [];
      return [...head, ...withoutPrimary.filter(id => id !== primary), ...missing.filter(id => id !== primary)];
    });
  }

  function togglePrimary(tagId: string) {
    setPrimary(prev => (prev === tagId ? null : tagId));
    // syncOrdered runs in next render via useEffect — done via change handler below.
  }

  function toggleMulti(
    tagId: string,
    list: string[],
    setter: (xs: string[]) => void,
    cap: number | null,
  ) {
    if (list.includes(tagId)) {
      setter(list.filter(id => id !== tagId));
    } else {
      if (cap != null && list.length >= cap) return; // hard cap, no add
      setter([...list, tagId]);
    }
  }

  // Composed picked list — feeds the ordered sync + the validation hint.
  const allPicked = [
    ...(primary ? [primary] : []),
    ...secondaries, ...subjects, ...tones, ...themes, ...settings, ...contents,
  ];

  // Keep `ordered` in sync.
  // Use a derivation pattern instead of useEffect to avoid stale-state races:
  // we call syncOrdered() inline in each toggle handler. Below it's wrapped
  // into a single helper updateAndSync. The implementer can inline if cleaner.

  function ChipRow(props: {
    options: TagOption[];
    selected: string[];
    onToggle: (id: string) => void;
    cap: number | null;
  }) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {props.options.map(opt => {
          const sel = props.selected.includes(opt.id);
          const atCap = !sel && props.cap != null && props.selected.length >= props.cap;
          return (
            <button
              type="button"
              key={opt.id}
              className={`tag-edit-pill ${sel ? "is-selected" : ""} ${atCap ? "is-disabled" : ""}`}
              disabled={atCap}
              onClick={() => props.onToggle(opt.id)}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    );
  }

  function PrimaryChipRow() {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {vocab.subgenre.map(opt => {
          const sel = primary === opt.id;
          return (
            <button
              type="button"
              key={opt.id}
              className={`tag-edit-pill ${sel ? "is-selected primary" : ""}`}
              onClick={() => {
                const next = sel ? null : opt.id;
                setPrimary(next);
                // recompute ordered with new primary anchored at slot 1
                setOrdered(prev => {
                  const present = new Set([
                    ...(next ? [next] : []),
                    ...secondaries, ...subjects, ...tones, ...themes, ...settings, ...contents,
                  ]);
                  const head = next ? [next] : [];
                  const tail = prev.filter(id => present.has(id) && id !== next);
                  return [...head, ...tail];
                });
              }}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    );
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const r = await setFilmTags({
        filmId,
        primarySubgenreId: primary ?? "",
        secondarySubgenreIds: secondaries,
        subjectIds: subjects, toneIds: tones, themeIds: themes,
        settingIds: settings, contentIds: contents,
        orderedTagIds: ordered,
      });
      if (r.ok) setMsg("Saved.");
      else setMsg(r.error);
    });
  }

  // Save-disabled hint: surface most blocking validation.
  let saveBlocker: string | null = null;
  if (!primary) saveBlocker = "Pick a Primary sub-genre.";
  else if (tones.length < 1) saveBlocker = "Pick at least one tone.";
  else if (secondaries.some(id => ordered.indexOf(id) < 4)) saveBlocker = "Drag Secondary sub-genres into the hidden tail.";

  return (
    <div className="film-tag-editor" style={{ marginTop: 24 }}>
      <h3 className="head" style={{ fontSize: 22, marginBottom: 12 }}>Tags</h3>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 18, color: "var(--muted)" }}>Pick</div>

      <div style={{ marginBottom: 16 }}>
        <div className="caps" style={{ fontSize: 10, marginBottom: 6 }}>
          Primary sub-genre <span style={{ color: "var(--muted)" }}>(required, 1)</span>
        </div>
        <PrimaryChipRow />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="caps" style={{ fontSize: 10, marginBottom: 6 }}>
          Secondary sub-genres <span style={{ color: "var(--muted)" }}>(0–2)</span> · {secondaries.length} picked
        </div>
        <ChipRow
          options={vocab.subgenre.filter(o => o.id !== primary)}
          selected={secondaries}
          cap={2}
          onToggle={(id) => {
            toggleMulti(id, secondaries, setSecondaries, 2);
            // Sync ordered with the post-update list happens after re-render via derive
          }}
        />
      </div>

      {FACETS.map(facet => {
        const selected =
          facet.key === "subject" ? subjects :
          facet.key === "tone"    ? tones :
          facet.key === "theme"   ? themes :
          facet.key === "setting" ? settings :
          contents;
        const setter =
          facet.key === "subject" ? setSubjects :
          facet.key === "tone"    ? setTones :
          facet.key === "theme"   ? setThemes :
          facet.key === "setting" ? setSettings :
          setContents;
        return (
          <div key={facet.key} style={{ marginBottom: 16 }}>
            <div className="caps" style={{ fontSize: 10, marginBottom: 6 }}>
              {facet.label} <span style={{ color: "var(--muted)" }}>({facet.capLabel})</span> · {selected.length} picked
            </div>
            <ChipRow
              options={vocab[facet.key]}
              selected={selected}
              cap={facet.max}
              onToggle={(id) => toggleMulti(id, selected, setter, facet.max)}
            />
          </div>
        );
      })}

      {/* Order stage lands in Task 8 — placeholder until then. */}
      <div className="eyebrow" style={{ fontSize: 11, marginTop: 24, marginBottom: 8, color: "var(--muted)" }}>Order</div>
      <div style={{ fontSize: 12, opacity: 0.6, fontStyle: "italic" }}>
        Drag-to-reorder UI ships in Task 8.
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          disabled={pending || !!saveBlocker}
          onClick={onSave}
        >
          {pending ? "Saving…" : "Save tags"}
        </button>
        {saveBlocker && <span style={{ fontSize: 12, color: "var(--muted)" }}>{saveBlocker}</span>}
        {msg && <span style={{ fontSize: 12, color: msg === "Saved." ? "var(--accent)" : "var(--blood)" }}>{msg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Extend tag-edit-pill CSS**

Append to `app/app/globals.css` after the existing `.tag-edit-pill` rules:

```css
.tag-edit-pill.primary {
  background: var(--accent);
  color: var(--void);
  border-color: var(--accent);
}
.tag-edit-pill.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Wire smoke-render in /admin/films/[id]/edit page**

Update `app/app/admin/films/[id]/edit/page.tsx` to fetch `getAllTagsGroupedByType` + `getFilmTags`, then pass to the new editor:

```tsx
import { getAllTagsGroupedByType, getFilmTags } from "@/lib/queries/film-tags";

// inside the page component, after fetching the film:
const [vocab, currentTags] = await Promise.all([
  getAllTagsGroupedByType(supabase),
  getFilmTags(supabase, film.id),
]);

const orderedAll = [...currentTags.visible, ...currentTags.hidden];
const primaryRow = orderedAll.find(t => t.is_primary);
const initial = {
  primarySubgenreId: primaryRow?.id ?? null,
  secondarySubgenreIds: orderedAll.filter(t => t.type === "subgenre" && !t.is_primary).map(t => t.id),
  subjectIds: orderedAll.filter(t => t.type === "subject").map(t => t.id),
  toneIds:    orderedAll.filter(t => t.type === "tone").map(t => t.id),
  themeIds:   orderedAll.filter(t => t.type === "theme").map(t => t.id),
  settingIds: orderedAll.filter(t => t.type === "setting").map(t => t.id),
  contentIds: orderedAll.filter(t => t.type === "content").map(t => t.id),
  orderedTagIds: orderedAll.map(t => t.id),
};

// JSX
<FilmTagEditor
  filmId={film.id}
  director={film.director}
  vocab={vocab}
  initial={initial}
/>
```

- [ ] **Step 4: Manual smoke**

```bash
cd app && npm run dev
```
Open `/admin/films/<some-film>/edit`. Verify the picker section renders all six facet rows + the Primary single-select chip group. Pick a Primary, a tone, save. Server action either saves successfully or shows the validation error in the inline message slot.

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/components/admin/FilmTagEditor.tsx app/app/globals.css app/app/admin/films/[id]/edit/page.tsx
git commit -m "feat(admin): rewrite FilmTagEditor — picker stage (six facets, per-facet caps)"
```

---

## Task 8: Editor v2 — drag-to-reorder stage

**Files:**
- Modify: `app/components/admin/FilmTagEditor.tsx`
- Modify: `app/app/globals.css`

- [ ] **Step 1: Add the SortableList sub-component using `@dnd-kit/sortable`**

Add at the top of `FilmTagEditor.tsx` (above the main component):

```tsx
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface OrderedRow {
  id: string;        // tag id, or "__director__" for the virtual director slot
  label: string;
  facet: string;     // "subgenre" / "subject" / etc, or "director"
  isPrimary: boolean;
  isVirtual: boolean;     // director row — non-draggable
  isPrimaryRow: boolean;  // primary subgenre — non-draggable (stays at slot 1)
}

function SortableRowItem({ row }: { row: OrderedRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id, disabled: row.isVirtual || row.isPrimaryRow,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={`tag-order-row ${row.isVirtual ? "is-virtual" : ""} ${row.isPrimaryRow ? "is-locked" : ""}`}
      {...attributes}
    >
      <span className="tag-order-handle" {...(row.isVirtual || row.isPrimaryRow ? {} : listeners)}>
        {row.isVirtual || row.isPrimaryRow ? "—" : "☰"}
      </span>
      <span className="tag-order-label">{row.label}</span>
      <span className="tag-order-meta">
        {row.facet}{row.isPrimary ? " · Primary" : ""}{row.facet === "subgenre" && !row.isPrimary ? " · Secondary" : ""}{row.isVirtual ? " · auto" : ""}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Replace the picker-only Order placeholder with a real drag list**

Inside the `FilmTagEditor` component, replace the placeholder:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

// Compose the rows with director virtually inserted at slot 2.
const orderedRows: OrderedRow[] = (() => {
  const rows: OrderedRow[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const tagId = ordered[i];
    // Look up label + facet from vocab.
    let opt: TagOption | undefined;
    let facet = "";
    for (const [k, list] of Object.entries(vocab) as [keyof TagsByFacet, TagOption[]][]) {
      const found = list.find(x => x.id === tagId);
      if (found) { opt = found; facet = k; break; }
    }
    if (!opt) continue;
    rows.push({
      id: tagId,
      label: opt.name,
      facet,
      isPrimary: tagId === primary,
      isVirtual: false,
      isPrimaryRow: tagId === primary,
    });
    // After slot 1 (Primary), insert virtual director row.
    if (i === 0) {
      rows.push({
        id: "__director__",
        label: director || "(no director set)",
        facet: "director",
        isPrimary: false,
        isVirtual: true,
        isPrimaryRow: false,
      });
    }
  }
  return rows;
})();

// drag-end: arrayMove on `ordered`, but anchor primary at index 0 + skip director row.
function onDragEnd(e: DragEndEvent) {
  const { active, over } = e;
  if (!over || active.id === over.id) return;
  if (active.id === "__director__" || over.id === "__director__") return;
  if (active.id === primary || over.id === primary) return;
  const oldIdx = ordered.indexOf(String(active.id));
  const newIdx = ordered.indexOf(String(over.id));
  if (oldIdx < 0 || newIdx < 0) return;
  setOrdered(prev => arrayMove(prev, oldIdx, newIdx));
}
```

Then render the sortable list with the visible/hidden divider:

```tsx
<div className="eyebrow" style={{ fontSize: 11, marginTop: 24, marginBottom: 8, color: "var(--muted)" }}>Order</div>
<p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
  Drag to reorder. Slots above the line show on the film page; slots below feed the recommender silently.
</p>
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
  <SortableContext items={orderedRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
    <div className="tag-order-list">
      {orderedRows.map((row, idx) => (
        <div key={row.id}>
          <SortableRowItem row={row} />
          {idx === 4 && (
            <div className="tag-order-divider">
              <span>visible above · hidden below</span>
            </div>
          )}
        </div>
      ))}
    </div>
  </SortableContext>
</DndContext>
```

- [ ] **Step 3: Add CSS for the sortable list**

Append to `app/app/globals.css`:

```css
.tag-order-list { display: flex; flex-direction: column; gap: 4px; }
.tag-order-row {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--void-2);
  border: 1px solid var(--muted);
  font-family: var(--font-ui);
  font-size: 13px;
  user-select: none;
}
.tag-order-row.is-virtual { opacity: 0.7; border-style: dashed; }
.tag-order-row.is-locked  { background: rgba(255, 45, 136, 0.08); }
.tag-order-handle { cursor: grab; color: var(--muted); font-size: 14px; }
.tag-order-row.is-virtual .tag-order-handle,
.tag-order-row.is-locked  .tag-order-handle { cursor: not-allowed; }
.tag-order-label { color: var(--bone); }
.tag-order-meta  { color: var(--muted); font-size: 11px; }
.tag-order-divider {
  display: flex; align-items: center; justify-content: center;
  margin: 8px 0; padding: 6px 0;
  border-top: 1px dashed var(--accent);
  border-bottom: 1px dashed var(--accent);
}
.tag-order-divider span {
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 4: Update `saveBlocker` to detect Secondary-in-visible**

Already present from Task 7 step 1. Verify:

```ts
else if (secondaries.some(id => ordered.indexOf(id) < 4)) saveBlocker = "Drag Secondary sub-genres into the hidden tail.";
```

- [ ] **Step 5: Manual smoke**

Run dev server, open `/admin/films/<some-film>/edit`. Pick a Primary + tone + a Secondary. Verify the drag list shows the Primary locked at slot 1, the director virtually at slot 2, and the Secondary draggable. Try dragging the Secondary into slot 3 — Save button stays disabled with the "Drag Secondary into hidden tail" message. Drag it past the visible/hidden divider — Save unblocks. Save → toast "Saved." → reload → state persists.

- [ ] **Step 6: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/components/admin/FilmTagEditor.tsx app/app/globals.css
git commit -m "feat(admin): FilmTagEditor — drag-to-reorder stage with visible/hidden divider"
```

---

## Task 9: Rewrite `<FilmTagsRow>` for visible-row render

**Files:**
- Modify: `app/components/FilmTagsRow.tsx`
- Modify: `app/app/globals.css` (extend pill styles per type)

- [ ] **Step 1: Rewrite the component**

Replace `app/components/FilmTagsRow.tsx`:

```tsx
import type { FilmTagRow } from "@/lib/queries/film-tags";

interface Props {
  visible: FilmTagRow[];   // from getFilmTags — positions 1-4
  director: string;
}

/**
 * Renders the editorial 5-slot capsule on /film/[id]:
 *   [ Primary subgenre · pink ]
 *   [ Director · plum ]
 *   [ visible[1] · seafoam ]
 *   [ visible[2] · seafoam ]
 *   [ visible[3] · seafoam ]
 *
 * Sparse curation: if a film has fewer than 4 visible tags, pills just stop.
 * No padding. If films.director is empty, that slot is omitted.
 */
export default function FilmTagsRow({ visible, director }: Props) {
  if (visible.length === 0 && !director) return null;

  const primary = visible.find(t => t.is_primary);
  const distinguishing = visible.filter(t => !t.is_primary).slice(0, 3);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
      {primary && <span className="tag-pill tag-pill-primary">{primary.name}</span>}
      {director && <span className="tag-pill tag-pill-director">{director}</span>}
      {distinguishing.map(t => (
        <span key={t.id} className="tag-pill tag-pill-mod">{t.name}</span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add pill styles**

Append to `app/app/globals.css`:

```css
.tag-pill {
  display: inline-block;
  padding: 4px 10px;
  font-family: var(--font-ui);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid;
  border-radius: 0;  /* zine, not bubbly */
}
.tag-pill-primary {
  background: var(--accent);
  color: var(--void);
  border-color: var(--accent);
}
.tag-pill-director {
  background: transparent;
  color: var(--plum);
  border-color: var(--plum);
}
.tag-pill-mod {
  background: transparent;
  color: var(--seafoam);
  border-color: var(--seafoam);
}
```

(If `--seafoam` and `--plum` aren't yet in `:root`, define them — `--plum: #9d6fc4` was added in PR #106; `--seafoam: #7a9d92` should also already be there from earlier work. Verify with grep before adding duplicates.)

- [ ] **Step 3: Typecheck + commit**

```bash
cd app && npm run typecheck
git add app/components/FilmTagsRow.tsx app/app/globals.css
git commit -m "feat(film-page): rewrite FilmTagsRow for v2 visible-row render"
```

---

## Task 10: Wire `/film/[id]` page

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Update the import + getFilmTags call**

In `app/app/film/[id]/page.tsx`:

```typescript
// Remove old destructure of getFilmTags's v1 shape; the new one returns
// { visible, hidden }.
const filmTags = await getFilmTags(supabase, id);
```

- [ ] **Step 2: Update the FilmTagsRow render**

Replace:

```tsx
<FilmTagsRow
  subgenre={filmTags.subgenre}
  director={film.director}
  vibes={filmTags.vibes}
/>
```

With:

```tsx
<FilmTagsRow
  visible={filmTags.visible}
  director={film.director}
/>
```

- [ ] **Step 3: Typecheck + manual smoke**

```bash
cd app && npm run typecheck && npm run dev
```

Tag a film via the admin editor (Task 7 + 8 must be live). Visit `/film/<id>`. Verify the 5-slot capsule renders correctly: pink Primary pill, plum director pill, up to 3 muted-seafoam distinguishing pills. Hidden tail tags should NOT appear visually.

- [ ] **Step 4: Commit**

```bash
git add app/app/film/[id]/page.tsx
git commit -m "feat(film-page): wire v2 FilmTagsRow with visible/director"
```

---

## Task 11: Update `/admin/films` "Untagged only" filter

**Files:**
- Modify: `app/lib/queries/admin/films.ts`

- [ ] **Step 1: Simplify the untagged query**

Replace the current two-step "find films with subgenre tag, exclude" logic with a simpler "find films with ANY tag, exclude" check. Untagged in v2 = zero rows in `film_tags` (since the action requires a Primary subgenre, any tagged film has at least one row).

Replace the `if (untagged) { … }` block in `listFilmsForAdmin`:

```typescript
if (untagged) {
  // V2: a film is untagged iff it has zero film_tags rows. The action
  // enforces "Primary subgenre required," so any tagged film has ≥1 row.
  const tagged = await client
    .from("film_tags")
    .select("film_id");
  if (tagged.error) throw tagged.error;
  const taggedIds = Array.from(new Set((tagged.data ?? []).map(r => r.film_id)));

  let q2 = client
    .from("films")
    .select("id, title, year, director, artwork_url, tracking, available, itunes_id", { count: "exact" })
    .order("title", { ascending: true });
  if (q.trim()) q2 = q2.ilike("title", `%${q.trim()}%`);
  if (taggedIds.length > 0) q2 = q2.not("id", "in", `(${taggedIds.join(",")})`);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await q2.range(from, to);
  if (error) throw error;
  return {
    rows: (data ?? []) as AdminFilmRow[],
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}
```

- [ ] **Step 2: Typecheck + smoke**

```bash
cd app && npm run typecheck
```

Hit `/admin/films?untagged=1` after seeding a few tags. Films with tags disappear; untagged films remain.

- [ ] **Step 3: Commit**

```bash
git add app/lib/queries/admin/films.ts
git commit -m "refactor(admin): simplify Untagged filter for v2 (any tag = tagged)"
```

---

## Task 12: Apply migration to prod Supabase

**Files:** none (migration runner)

- [ ] **Step 1: Source production env**

From repo root:

```bash
set -a; source app/.env.local; set +a
```

(Production `DATABASE_URL` lives there per CLAUDE.md.)

- [ ] **Step 2: Run migrations**

```bash
cd db && npm run migrate
```
Expected output: `Applied: 0152_tagging_system_v2.sql`. Anything previously applied (0151 etc.) reports as already-applied.

- [ ] **Step 3: Spot-check via SQL**

```bash
psql "$DATABASE_URL" -c "SELECT type, COUNT(*) FROM tags GROUP BY type ORDER BY type;"
```
Expected:
```
   type    | count
-----------+-------
 content   |     4
 setting   |     6
 subgenre  |    24
 subject   |    17
 theme     |    21
 tone      |    16
```

```bash
psql "$DATABASE_URL" -c "SELECT name FROM tags WHERE name = 'breakup horror';"
```
Expected: 1 row, `breakup horror`.

- [ ] **Step 4: No commit** — applying to prod is operational, not code.

---

## Task 13: CLAUDE.md + history + open PR + deploy

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/sub-project-history.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Append row 33 to sub-project history**

Add to `docs/sub-project-history.md`:

```
| 33 | Tagging system v2 — seven-facet positional system (24 subgenre + 17 subject + 16 tone + 21 theme + 6 setting + 4 content = 88 tags). Mig `0152` truncates v1 + reseeds, expands `tags.type` CHECK to six values, adds `film_tags.position SMALLINT` + `is_primary BOOLEAN` with partial unique index `(film_id) WHERE is_primary = TRUE`, adds `films.horror_adjacent BOOLEAN`. Rewrote `setFilmTags` with 12 distinct validation paths (per-facet caps, "Secondary in tail" rule, type defense, ordered-set equality). New two-stage editor on `/admin/films/[id]/edit`: chip-group picker → drag-to-reorder list with `@dnd-kit/sortable`, visible/hidden divider after slot 5 (= film_tags pos 4 + virtual director). Director still on `films.director`, rendered virtually at staff-guide position 2. New `<FilmTagsRow>` renders editorial 5-slot capsule (pink Primary + plum director + up to 3 seafoam distinguishing). Hidden tail (positions 5+) returned by `getFilmTags` for FYP recommender (sub-project B, still deferred). | `2026-05-02-tagging-system-v2-design.md` |
```

- [ ] **Step 2: Update CLAUDE.md "Last updated" line**

Replace the `**Last updated:**` paragraph with a note that includes `#33`. Update "Last shipped" to lead with the v2 tagging redesign.

- [ ] **Step 3: Update CLAUDE.md "Next up"**

Remove the "Curate film tags" item from "Next up" (still valid as ops follow-up but the new editor is what does it now). Add: "FYP recommender (sub-project B) is the next big feature — affinity scoring + `/for-you` route + `/tags/[name]` listing pages + onboarding lane-picker."

- [ ] **Step 4: Update roadmap.md**

In `docs/roadmap.md`:
- Drop the "Curate film tags" High-tier item (still valid, but absorbed into the FYP recommender prep).
- Update the "FYP recommender" Medium-high entry to reference v2 schema (the seven-facet positional system) as the new prerequisite.

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md docs/sub-project-history.md docs/roadmap.md
git commit -m "docs: note sub-project #33 — tagging system v2"
```

- [ ] **Step 6: Push branch and open PR**

```bash
git push -u origin feature/tagging-system-v2
gh pr create --title "feat: tagging system v2 (sub-project #33)" --body-file /tmp/pr-body-33.md
```

PR body content (write to `/tmp/pr-body-33.md` first):

```markdown
## Summary

Sub-project #33 — replaces sub-project #32's two-facet (`subgenre` + `vibe`) tag system with the seven-facet positional system from the v2 staff style guide. Spec: `docs/superpowers/specs/2026-05-02-tagging-system-v2-design.md`.

- **Mig 0152** truncates v1 + reseeds. Expands `tags.type` CHECK to six values (`subgenre`, `subject`, `tone`, `theme`, `setting`, `content`). Adds `film_tags.position SMALLINT` + `is_primary BOOLEAN` with partial unique index `(film_id) WHERE is_primary = TRUE`. Adds `films.horror_adjacent BOOLEAN`. 88 tag seed including the new `breakup horror` (theme).
- **`setFilmTags` rewritten** — 12 distinct validation paths (per-facet caps, "Secondary sub-genres in tail at position 5+" rule, type defense, ordered-set equality, "exactly 1 Primary, must be subgenre"). Service-role transaction: delete-then-insert film_tags + update films.horror_adjacent.
- **`<FilmTagEditor>` v2** — two-stage UX. Top: six chip-group rows (Primary subgenre single-select, Secondaries multi 0-2, subjects 0-3, tones 1-3, themes 0-3, settings 0-2, content unrestricted) with per-facet cap enforcement. Bottom: `@dnd-kit/sortable` drag list with Primary locked at slot 1, virtual director row locked at slot 2, dashed accent divider line between slot 5 and 6 reading "visible above · hidden below."
- **`<FilmTagsRow>` rewrite on `/film/[id]`** — renders editorial 5-slot capsule from the new `{visible, hidden}` shape: pink Primary pill, plum director pill, up to 3 seafoam-outline distinguishing pills.
- **`/admin/films` "Untagged only" filter simplified** — v2 untagged = zero rows in film_tags (any tagged film has ≥1 row from the Primary requirement).
- **Director continues to live on `films.director`.** Editor pins it as a virtual non-draggable row at slot 2; detail page renders it between visible[0] and visible[1].
- **`films.horror_adjacent`** is set on every save: `(primary_subgenre.name === 'thriller')`. Nothing reads it yet — the flag is for future discovery filters.
- **FYP recommender stays deferred** as sub-project B. Hidden tail (positions 5+) is returned by `getFilmTags` so it can be consumed when B ships.

## Test plan

- [x] `cd db && npm test` — pg-mem smoke includes mig 0152
- [x] `cd db && npm run test:rls` — extended specs cover partial unique on Primary, composite PK, type CHECK, horror_adjacent default + update
- [x] `cd app && npm run typecheck` clean
- [x] `cd app && npm test` — 12 new action specs covering every validation path; query specs covering visible/hidden split + grouped vocabulary
- [x] Migration applied to prod Supabase
- [ ] Manual smoke on Vercel preview: open `/admin/films` → pick an untagged film → tag with the worked example from the staff guide (e.g., "the vvitch" = folk horror, fever dream, family trauma, religious horror, witches, period setting…) → reload `/film/<id>` and verify the visible 5 capsule renders correctly with pink/plum/seafoam color treatment. Check `/admin/films?untagged=1` correctly excludes tagged films.
- [ ] Manual smoke: tag a thriller-Primary film (e.g., "holy spider") and verify `films.horror_adjacent = TRUE` via SQL.
```

- [ ] **Step 7: Merge + sync + deploy**

```bash
gh pr merge <pr-number> --squash --delete-branch
git checkout master && git pull --rebase origin master
npx vercel deploy --prod --yes
```

Run from repo root (Vercel CLI gotcha — see CLAUDE.md).

- [ ] **Step 8: Post-deploy manual smoke**

Tag a film end-to-end on prod. Verify the 5-slot capsule renders. Done.

---

## Notes for the implementer

**Total tasks: 13.** Tasks 1-6 are infrastructure (migration, types, queries, action) — mechanical with clear specs, prefer fast model. Tasks 7 + 8 are the editor — needs design judgment, prefer standard model. Task 9-13 are wiring + ops.

**Order matters.** Don't run Task 8 before Task 7 (the editor's drag stage builds on the picker stage). Don't run Task 9 before Task 5 (FilmTagsRow consumes getFilmTags's new shape). Don't run Task 10 before Task 9 (page wiring depends on the new component shape). Otherwise tasks are largely independent and can be reviewed in sequence.

**The editor (Tasks 7+8) is the meatiest piece.** ~350 lines of TSX + ~100 lines of CSS. State management has subtle interactions between picker selections and ordered list — the spec says "syncOrdered() inline in each toggle handler" but the implementer can refactor to `useEffect`-driven derivation if cleaner. Either approach is fine; the validation runs on `ordered` so as long as `ordered` reflects current selections at save time, it's correct.

**The 12 validation paths in `setFilmTags` are listed explicitly in the test file.** Implement each as a small named guard in the action body — don't try to compose them into a single big check. The named-guards approach makes the failure paths visible in code and easier to extend if the doc adds rules later.

**RLS unchanged.** v2 reuses the v1 RLS policies (public read on tags + film_tags, no client write grants, service-role for admin writes). Mig 0152 doesn't touch them.

**Spec self-review reminder:** the position-mapping table in the spec is the most important reference. `film_tags.position` is 1-indexed contiguous in DB (1, 2, 3, …). Visible cutoff is `position ≤ 4` in DB = 4 tags + 1 virtual director = 5 visible staff-side. Anytime the implementer is unsure, re-read that table.
