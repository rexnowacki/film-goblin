# Tag content infrastructure (sub-project A)

**Date:** 2026-05-01
**Status:** Spec
**Sub-project:** #32

## Background

The proposal review at `docs/proposals/2026-05-01-tagging-and-fyp-review.md` outlined a tagging-plus-recommendation system. We're splitting it into two sub-projects:

- **A. Content infrastructure (this spec).** Tag schema, canonical lists, admin editor, public film-page display. Ends with a working tagging system that exposes data on the page but doesn't recommend.
- **B. FYP recommender.** Affinity scoring, candidate ranking, `/for-you` route, tag pages, onboarding lane-picker. Builds on top of A.

This spec scopes A only. The two sub-projects are sequenced because B depends on A's data — shipping a recommender against an empty tag store would be embarrassing.

The brand is functionally horror-only. The few non-horror catalog stragglers are getting deleted as separate housekeeping. Future possible adjacents (sword + sorcery) are deferred until the user commits to that category — adding a sub-genre is a one-row INSERT later.

The current `/film/[id]` page renders a visual demo of the tagging row (PRs #105–#107) using `films.genre_primary` for sub-genre and a hashed pool of demo vibes. That demo gets replaced by real data in this sub-project.

## Goals

- Curated tagging at the film level: 1 sub-genre + 0–3 vibes per film. Director continues to live on `films.director`.
- Hand-curated only — no auto-derivation. Untagged films simply don't render a sub-genre pill.
- Admin editor on `/admin/films/[id]` for assigning tags film-by-film.
- "Untagged films" filter on `/admin/films` so the user can work through the catalog efficiently.
- Real tag data replaces the demo `FilmTagsRow` on `/film/[id]`. Director still reads from `films.director`.

## Non-goals (deferred to sub-project B)

- FYP recommender — affinity scoring, candidate ranking, variety buckets, reason text.
- `/for-you` route.
- `/tags/<name>` listing pages.
- Onboarding lane-picker / cold-start tag affinity seeding.
- Sub-genre pill on `FilmPoster` (poster grids).
- Hidden / non-visible tags.
- Tag affinity weights, library / watchlist / watched-as-signal feeding into a taste profile.

## Non-goals (out of scope entirely)

- Non-horror sub-genre buckets.
- Backfill migration linking films to iTunes-derived sub-genres.
- A tag-governance UI (merge, rename, retire). Done via direct SQL for now.
- A public "all tags" index page.

## Scope decisions (locked during brainstorming)

| Decision | Choice | Reason |
|---|---|---|
| Catalog scope | Lean horror | Brand voice is horror-coded; non-horror stragglers being deleted as separate cleanup |
| Default-tagging policy | Hand-curated from scratch | Editorial commitment matches the zine voice; default to no tag, render gracefully |
| Canonical lists | Full proposal lists — 18 sub-genres + 36 vibes | Curated set; pruning later via "tag must apply to ≥5 films" governance is cheaper than expanding |
| Director representation | `films.director` (unchanged) | Existing column populated from iTunes; not duplicated as a tag |
| Tag pages `/tags/<name>` | Defer to B | Listings without ranking feel half-baked; FYP is the right place |
| Sub-genre on poster grids | Defer indefinitely | User explicitly said this isn't data they want on a poster |
| `tags.visible` / `tags.weight` columns | Drop | YAGNI; can ALTER TABLE later if needed |
| Schema PK on `film_tags` | Composite `(film_id, tag_id)` | Same precedent as `library`, `activity_comment_reactions` |
| Write privilege | Service-role from staff-checked server action | Matches the pattern from sub-project #30's onboarding-invite-flow |
| Read privilege | Public (anon + authenticated) | Tags are catalog data; no privacy concern |
| Seed for non-horror | None | Catalog will be horror-only |
| Untagged-films queue | Filter chip on existing `/admin/films` | New route is overkill; the films list already exists |

## Architecture

### 1. Migration `0151_tags_and_film_tags.sql`

```sql
-- 0151: tag content infrastructure for the eventual FYP recommender.
--
-- Two-table normalized model: `tags` is the canonical vocabulary,
-- `film_tags` is the join. Composite PK on the join (matches library
-- and activity_comment_reactions precedents). Public read; writes
-- happen via service-role from staff-checked server actions.

CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('subgenre', 'vibe')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE film_tags (
  film_id     UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (film_id, tag_id)
);

CREATE INDEX idx_film_tags_tag ON film_tags (tag_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_select_all ON tags
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY film_tags_select_all ON film_tags
  FOR SELECT TO authenticated, anon USING (true);

GRANT SELECT ON tags TO authenticated, anon;
GRANT SELECT ON film_tags TO authenticated, anon;
-- No INSERT / UPDATE / DELETE grants for clients; writes via service-role.

-- Canonical horror sub-genres (18, lowercased).
INSERT INTO tags (name, type) VALUES
  ('body horror',          'subgenre'),
  ('cosmic horror',        'subgenre'),
  ('creature feature',     'subgenre'),
  ('cursed media',         'subgenre'),
  ('folk horror',          'subgenre'),
  ('found footage',        'subgenre'),
  ('giallo',               'subgenre'),
  ('haunted house',        'subgenre'),
  ('home invasion',        'subgenre'),
  ('horror comedy',        'subgenre'),
  ('psychological horror', 'subgenre'),
  ('religious horror',     'subgenre'),
  ('slasher',              'subgenre'),
  ('supernatural horror',  'subgenre'),
  ('survival horror',      'subgenre'),
  ('vampires',             'subgenre'),
  ('witchcraft',           'subgenre'),
  ('zombies',              'subgenre');

-- Canonical vibe tags (36, lowercased).
INSERT INTO tags (name, type) VALUES
  ('occult',               'vibe'),
  ('cult',                 'vibe'),
  ('slow-burn',            'vibe'),
  ('arthouse',             'vibe'),
  ('surreal',              'vibe'),
  ('gore',                 'vibe'),
  ('campy',                'vibe'),
  ('bleak',                'vibe'),
  ('funny',                'vibe'),
  ('violent',              'vibe'),
  ('psychological',        'vibe'),
  ('isolation',            'vibe'),
  ('grief',                'vibe'),
  ('paranoia',             'vibe'),
  ('possession',           'vibe'),
  ('demonic',              'vibe'),
  ('ritual',               'vibe'),
  ('coven',                'vibe'),
  ('female-led',           'vibe'),
  ('period setting',       'vibe'),
  ('small town',           'vibe'),
  ('rural horror',         'vibe'),
  ('urban horror',         'vibe'),
  ('family trauma',        'vibe'),
  ('coming-of-age',        'vibe'),
  ('relationship horror',  'vibe'),
  ('revenge',              'vibe'),
  ('serial killer',        'vibe'),
  ('traps',                'vibe'),
  ('creepy kids',          'vibe'),
  ('creature',             'vibe'),
  ('cursed object',        'vibe'),
  ('cursed place',         'vibe'),
  ('conspiracy',           'vibe'),
  ('splatter',             'vibe'),
  ('midnight movie',       'vibe');
```

No backfill of `film_tags`. All films start untagged. Admin curates over time.

### 2. Read-side: query helpers

**`app/lib/queries/film-tags.ts`** (new):

```ts
export interface FilmTags {
  subgenre: string | null;     // tag.name where type='subgenre', or null
  vibes: string[];             // tag.name list where type='vibe'
}

export async function getFilmTags(client: Client, filmId: string): Promise<FilmTags>;
export async function getAllSubgenres(client: Client): Promise<Array<{ id: string; name: string }>>;
export async function getAllVibes(client: Client): Promise<Array<{ id: string; name: string }>>;
```

`getFilmTags` joins `film_tags` to `tags` and partitions by type. The schema technically allows multiple sub-genre rows per film, but the editor enforces 1; on read we treat it as `[0]` if present, null otherwise.

`getAllSubgenres` / `getAllVibes` power the admin editor's option lists. Cached per request via React's `cache()` (matches `getServerUser` pattern) since the same lists render on every editor render.

### 3. Write-side: server action

**`app/lib/actions/admin/film-tags.ts`** (new):

```ts
export interface SetFilmTagsInput {
  filmId: string;
  subgenreTagId: string | null;
  vibeTagIds: string[];   // 0..3
}

export async function setFilmTags(input: SetFilmTagsInput): Promise<{ ok: true } | { ok: false; error: string }>;
```

Implementation:
1. Authenticate the caller, check staff role (existing helper, e.g. `requireAdmin()` from `app/lib/admin/...`).
2. Validate: `vibeTagIds.length <= 3`. All passed IDs must exist in `tags`. Sub-genre ID must be `type='subgenre'`; vibe IDs must be `type='vibe'`.
3. Service-role transaction:
   - DELETE all `film_tags` for `filmId` (clears prior sub-genre + vibes).
   - INSERT new rows: subgenre row if set, plus vibe rows.
4. `revalidatePath` for `/film/[id]` and `/admin/films/[id]`.

Replace-by-delete-and-insert is simpler than diffing and rare-write surfaces don't need optimistic concurrency. The composite PK guards against true duplicate inserts.

### 4. Admin editor — `app/components/admin/FilmTagEditor.tsx` (new)

Section on `/admin/films/[id]`. Renders:

- **Sub-genre** — single-choice. Either a styled `<select>` or a chip group (probably chips for visual consistency with the eventual public render). 18 options + a "no sub-genre" option. Required to be selected before save unless the user wants the film explicitly untagged.
- **Vibes** — multi-select chip group, 36 options. UI prevents picking a 4th. Visual feedback on the count (`2 / 3 vibes selected`).
- **Save** button calls `setFilmTags`. Existing tags are pre-selected when the editor mounts.

Visual style: matches the existing /admin form aesthetic (probably plain bone-on-void or whatever `/admin/films/[id]` uses — doesn't need ✦ ritual styling, this is utility).

### 5. Untagged-films queue

A new chip / filter on the existing `/admin/films` list page: **`Untagged only`**. Toggling it adds a server-side condition: films with no `film_tags` row of `type='subgenre'`.

Implementation: extend the existing `/admin/films` query to optionally `LEFT JOIN film_tags ft ON ft.film_id = films.id AND tag.type='subgenre'` and filter for `ft.tag_id IS NULL`. Or a separate query path triggered by the filter param.

Whichever is cleaner given the existing query shape — to be decided in the plan.

### 6. Public display

Replace the demo `FilmTagsRow` from PRs #105–#107:

- Drop `demoVibesForFilm` helper from `/film/[id]/page.tsx`.
- Drop the italic "✦ tag system preview — vibe tags are demo data" disclaimer line.
- Call `getFilmTags(supabase, id)` in the page's existing data-fetch block.
- Pass real `subgenre` (string | null) and `vibes` (string[]) into `<FilmTagsRow>`.
- Director still threads from `films.director`.
- `<FilmTagsRow>` already renders subgenre as `null`-safe (only renders the pill when truthy). Vibes already renders empty when array is empty. No component changes needed.

### 7. Types

`app/lib/supabase/types.ts` hand-edit (matches the convention from #25, #27):

- New `tags` table type: `{ id, name, type, created_at }` (Row + Insert + Update).
- New `film_tags` table type with composite PK shape.

### 8. Tests

**`db/tests/rls/tags-and-film-tags.test.ts`** (new, testcontainers):

- Anon SELECT on `tags` returns the seeded rows.
- Authenticated SELECT on `film_tags` after a service-role insert returns the row.
- Authenticated INSERT into `film_tags` is denied (no GRANT).
- ON DELETE CASCADE: deleting a film clears its `film_tags`; deleting a tag clears all `film_tags` referring to it.
- Composite PK rejects duplicate inserts.

**`app/tests/actions/film-tags.test.ts`** (new, env-skipIf integration):

- `setFilmTags` with subgenre + 2 vibes inserts 3 `film_tags` rows.
- Re-calling `setFilmTags` with different tags REPLACES (delete-then-insert).
- `setFilmTags` with 4 vibes is rejected at the validation layer.
- Non-staff caller is rejected.

**`app/tests/queries/film-tags.test.ts`** (new, env-skipIf integration):

- `getFilmTags` returns `{ subgenre: null, vibes: [] }` for an untagged film.
- Returns the subgenre name + vibe names when tagged.

**No new app-side suite for `FilmTagsRow` rendering** — the component is trivial pure JSX.

### 9. Files affected

**New:**
- `db/migrations/0151_tags_and_film_tags.sql`
- `app/lib/queries/film-tags.ts`
- `app/lib/actions/admin/film-tags.ts`
- `app/components/admin/FilmTagEditor.tsx`
- `db/tests/rls/tags-and-film-tags.test.ts`
- `app/tests/actions/film-tags.test.ts`
- `app/tests/queries/film-tags.test.ts`

**Modified:**
- `app/components/FilmTagsRow.tsx` — minor; might need no changes if the demo shape already matches, otherwise drop demo-only fields.
- `app/app/film/[id]/page.tsx` — drop `demoVibesForFilm`, drop the demo disclaimer, call `getFilmTags`, pass real props.
- `app/app/admin/films/[id]/page.tsx` — render `<FilmTagEditor>`.
- `app/app/admin/films/page.tsx` — add `Untagged only` filter chip.
- `app/lib/supabase/types.ts` — hand-edit for `tags` + `film_tags`.
- `CLAUDE.md` + `docs/sub-project-history.md` — sub-project #32 row.

## Risks

- **iTunes "Horror" mismatch.** The untagged-films filter assumes you can identify horror films somehow. If the catalog truly is functionally horror-only after the housekeeping cleanup, the filter is just "any film without a subgenre tag" — no horror gate needed. If non-horror stragglers remain in the DB during the tagging period, those will appear in the untagged queue too. Acceptable; you'd hit them, decide to retire them, and move on.
- **Vibe-only film.** A film could have 3 vibes but no sub-genre. The display gracefully handles it (sub-genre pill doesn't render). The FYP sub-project will need to decide if this counts as "tagged" for ranking purposes.
- **Tag rename.** If a sub-genre name needs to change ("witchcraft" → "occult ritual"), it's a single UPDATE on the `tags` row. All `film_tags` references continue working because they FK to `tag.id`, not `tag.name`. Display refreshes on next page render. Good.
- **Tag merge / split.** Out of scope for v1. If two tags need merging, do it via SQL: UPDATE film_tags SET tag_id = <winner> WHERE tag_id = <loser>; DELETE FROM tags WHERE id = <loser>. Composite PK collisions handled with ON CONFLICT DO NOTHING in the UPDATE step.
- **Catalog cleanup is a prerequisite.** Non-horror stragglers should be deleted before the editor work-pace makes them visible. Flag in the open threads after this ships.

## Open questions

None. All scope decisions locked.
