# Tagging System v2 — Sub-project #33

**Status:** Spec draft. Not yet planned.
**Replaces:** Sub-project #32 (`tag content infrastructure`) — clean wipe + reseed.
**Source of truth (editorial):** `filmgoblin-tagging-guide-v2.pdf` (the staff style guide).
**Source of truth (data + system):** this document.

## Goal

Replace the two-facet (`subgenre` / `vibe`) tagging system shipped in sub-project #32 with the seven-facet positional system described in the v2 staff guide. Visible film-page tag row reads as an editorial five-tag capsule; the full ordered list (including hidden tail at position 5+) feeds the future FYP recommender (sub-project B, still deferred). No FYP work in this sub-project — taxonomy, schema, editor, render. That's it.

## What changes for staff

- The chip picker on `/admin/films/[id]/edit` grows from 2 facets to 6 (sub-genre + subjects + tones + themes + settings + content). Director continues to live on `films.director` and is shown in the editor as a non-draggable virtual row.
- Per-facet caps mirror the guide: 1 sub-genre Primary required, 0–2 sub-genre Secondaries, 0–3 subjects, 1–3 tones, 0–3 themes, 0–2 settings, content unrestricted.
- After picking, the admin orders all selected tags in a single drag-to-reorder list. A divider line marks the visible/hidden cutoff. The Primary sub-genre is locked at the top; the virtual director row is locked at slot 2; everything else is draggable.

## What changes for users

- The film detail page renders the same five-slot capsule (sub-genre, director, three distinguishing tags) but driven by the new position-ordered data.
- Films tagged with `thriller` as Primary get `horror_adjacent = TRUE`, which lets future discovery shelves filter them out cleanly.
- Hidden tags (position 5+ in the film's ordered tag list) don't render anywhere user-visible in v2. They exist purely to feed the FYP recommender when sub-project B ships.

## What stays out of scope

- FYP recommender / `/for-you` route — sub-project B, separate spec.
- Tag listing pages `/tags/[name]` — deferred.
- Onboarding lane-picker that seeds an initial affinity vector — deferred to sub-project B.
- Sub-genre pill on poster grids on `/films`, `/library`, `/watched` — listed in roadmap as "Rating pills on poster grids" follow-up.
- Search filtering by tag — not in v2.
- Any UI for `horror_adjacent` to leak into the user-facing experience. The flag is set; nothing reads it yet. Future discovery filters can.

## The seven facets

Director isn't a tag-table tag — it lives on `films.director` and is rendered virtually at slot 2. The other six facets live in `tags`.

### 1. Sub-genre (24)
`type = 'subgenre'`. Exactly 1 Primary required (`is_primary = TRUE`), 0–2 Secondaries (Secondaries live in the tail at position 5+, never adjacent to Primary).

```
body horror, cosmic horror, creature feature, cursed media, eco-horror,
erotic horror, exploitation, extreme horror, folk horror, found footage,
giallo, gothic, haunted house, home invasion, horror comedy, monster movie,
psychological horror, religious horror, slasher, splatterpunk,
supernatural horror, survival horror, techno-horror, thriller
```

### 2. Subjects (17)
`type = 'subject'`. 0–3.

```
vampires, zombies, witches, werewolves, ghosts, demons, aliens, kaiju,
serial killer, cult, coven, creepy kids, cursed object, cursed place,
possession, ritual, traps
```

### 3. Tones (16)
`type = 'tone'`. **1–3 required.** (Per the guide's "pick 1–3" — every film must have at least one tone tag.)

```
arthouse, atmospheric, bleak, campy, claustrophobic, dreamlike, fever dream,
funny, hangout, mean-spirited, midnight movie, nihilistic, nostalgic,
psychedelic, slow-burn, surreal
```

### 4. Themes (21, including the new addition)
`type = 'theme'`. 0–3.

```
addiction, body autonomy, breakup horror, colonialism, coming-of-age,
conspiracy, family trauma, grief, isolation, masculinity, motherhood,
obsession, paranoia, queer, race, relationship horror, religion, revenge,
sexuality, social class, technology
```

`breakup horror` is the new addition requested for v2 — lives in themes (sits adjacent to `relationship horror` and `family trauma`).

`social class` is the canonical name for the class-consciousness theme (renamed from `class` in mig 0153 for clarity — `class` reads ambiguously, the social-class meaning needed pinning).

### 5. Settings (6)
`type = 'setting'`. 0–2.

```
period setting, rural horror, small town, suburban, urban horror, wilderness
```

### 6. Content (4)
`type = 'content'`. Unrestricted (any subset).

```
gore, splatter, sexual content, violent
```

### Total
**24 + 17 + 16 + 21 + 6 + 4 = 88 tags** in the canonical seed.

### Format rules (from the guide's "Format" section)
- All lowercase.
- Spaces in multi-word tags (`fever dream`, `breakup horror`) — except where the canonical tag is hyphenated (`coming-of-age`, `slow-burn`, `eco-horror`, `mean-spirited`, `techno-horror`).
- No quotes.
- Comma-delimited when reading a film's tag list back as a string for editorial reference.

## Schema

### Mig 0152 — replace #32's tags + film_tags

```sql
-- 0152_tagging_system_v2.sql
--
-- Replaces sub-project #32's two-facet tag system with the v2 seven-facet
-- positional system. Clean wipe — film_tags from #32 had no curated rows
-- worth preserving (films were untagged or near-untagged at write time).

-- Wipe.
TRUNCATE TABLE film_tags;
TRUNCATE TABLE tags;

-- Expand facet vocabulary.
ALTER TABLE tags DROP CONSTRAINT tags_type_check;
ALTER TABLE tags ADD CONSTRAINT tags_type_check
  CHECK (type IN ('subgenre','subject','tone','theme','setting','content'));

-- Position + Primary on film_tags.
ALTER TABLE film_tags
  ADD COLUMN position SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Hard guarantee: at most one Primary per film. The action layer additionally
-- enforces "exactly one" + "Primary must be subgenre type."
CREATE UNIQUE INDEX film_tags_one_primary_per_film
  ON film_tags(film_id) WHERE is_primary = TRUE;

-- Convenience: query "tags ordered by position for a film" cheaply.
CREATE INDEX film_tags_film_position_idx ON film_tags(film_id, position);

-- horror_adjacent on films, set by setFilmTags when Primary subgenre is 'thriller'.
ALTER TABLE films
  ADD COLUMN horror_adjacent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX films_horror_adjacent_idx ON films(horror_adjacent)
  WHERE horror_adjacent = TRUE;

-- Seed: 88 canonical tags. Composed inline so failures are atomic.
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
  ('social class','theme'), ('colonialism','theme'), ('coming-of-age','theme'),
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

-- (RLS policies from 0151 still apply — public read, no client write grants.)
```

### Final shape

```
tags(id, name UNIQUE, type CHECK IN (six), created_at)
film_tags(film_id, tag_id, position SMALLINT, is_primary BOOLEAN)
   PK (film_id, tag_id)
   FKs CASCADE on both sides
   UNIQUE (film_id) WHERE is_primary
   INDEX (film_id, position)
films + horror_adjacent BOOLEAN
```

### Position semantics — important and slightly subtle

`film_tags.position` is **1-indexed contiguous within a film** (`1, 2, 3, …, N`). It does **not** correspond directly to the staff guide's "Position 1–5 visible" numbering, because the guide counts director as Position 2 and director isn't in `film_tags`.

The mapping:

| Staff guide position | Source |
|---|---|
| 1 | `film_tags` row at position 1 (always Primary sub-genre, `is_primary = TRUE`) |
| 2 | `films.director` (rendered virtually) |
| 3 | `film_tags` row at position 2 |
| 4 | `film_tags` row at position 3 |
| 5 | `film_tags` row at position 4 |
| 6+ | `film_tags` rows at position 5+ (hidden tail) |

So the **visible cutoff in `film_tags` is position ≤ 4** (which becomes 4 visible tags + 1 virtual director row = 5 visible slots staff-side). This is documented inline in the editor and getFilmTags so future readers don't have to re-derive it.

### Per-facet validation (server action layer)

`setFilmTags` enforces all of these in a single transaction. The DB enforces a subset (composite PK, type CHECK, partial unique on Primary).

- Exactly 1 tag with `is_primary = TRUE`, must be `type = 'subgenre'`.
- 0–2 additional `subgenre` tags (Secondaries), distinct from Primary.
- 0–3 `subject` tags.
- 1–3 `tone` tags. (At least one tone is required — every film has feel.)
- 0–3 `theme` tags.
- 0–2 `setting` tags.
- Any subset of `content` tags.
- All Secondary sub-genres must have `position ≥ 5` in `film_tags` (= staff-guide position 6+, the hidden tail). Per the guide: "Secondary Sub-Genres go in the tail (position 6+), not adjacent to the Primary." Enforced by the action — the DB doesn't constrain it.
- `position` values are contiguous 1..N, no gaps, no duplicates within a film.
- Hard validation minimum: **2 tags** in `film_tags` (1 Primary subgenre + 1 tone). Anything below that is rejected.
- Soft editorial guidance (not enforced — the guide is intentionally fuzzy): floor 4 in `film_tags` = 5 total visible slots once director is counted, typical 6–9, ceiling ~12.

### `horror_adjacent` rule

In the same transaction:
```
films.horror_adjacent =
  (the tag at film_tags.position = 1 has tags.name = 'thriller')
```

Set on every `setFilmTags` call. Cleared automatically when Primary changes away from `thriller`.

## Server action — `setFilmTags`

Replaces the v1 `setFilmTags` from sub-project #32. Same path: `app/lib/actions/admin/film-tags.ts`. Same pattern: delete-then-insert under service-role inside `requireAdmin`.

### Input shape

```ts
type SetFilmTagsInput = {
  filmId: string;
  // Picker output, by facet — drives validation.
  primarySubgenreId: string;             // exactly 1
  secondarySubgenreIds: string[];        // 0..2
  subjectIds: string[];                  // 0..3
  toneIds: string[];                     // 1..3
  themeIds: string[];                    // 0..3
  settingIds: string[];                  // 0..2
  contentIds: string[];                  // any
  // Editor output: full ordered list of every selected tag id.
  // Must be exactly the union of all the above. Order = position 1..N.
  orderedTagIds: string[];
};
```

### Behavior

1. `requireAdmin()`.
2. Validate per-facet caps. Reject with structured error if any cap is violated.
3. Validate `orderedTagIds` is exactly the union of the per-facet lists (set equality).
4. Verify `orderedTagIds[0]` is `primarySubgenreId`.
5. Verify all `secondarySubgenreIds` appear at indices ≥ 4 in `orderedTagIds` (position ≥ 5).
6. Look up each tag id in `tags` to verify type matches the slot it was placed in (server-side defense; the picker should already prevent this).
7. Open a service-role transaction:
   - `DELETE FROM film_tags WHERE film_id = filmId`.
   - `INSERT INTO film_tags (film_id, tag_id, position, is_primary)` for each in `orderedTagIds`. Position is `index + 1`. `is_primary = (tag_id === primarySubgenreId)`.
   - `UPDATE films SET horror_adjacent = (primary tag name === 'thriller') WHERE id = filmId`. Read the primary tag's name from `tags` in the same transaction.
8. `revalidatePath('/film/' + filmId)`, `revalidatePath('/admin/films')`, `revalidatePath('/admin/films/' + filmId + '/edit')`.

Returns `{ ok: true } | { ok: false, error: string }` so the editor can surface the specific validation message inline.

## Editor — `<FilmTagEditor>` v2

Same file path, same name as sub-project #32's component. Major rewrite.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  PICK                                                         │
│  ─────────────────                                            │
│  Primary sub-genre (required, 1)                              │
│    [chip] [chip] [chip] …                                     │
│                                                                │
│  Secondary sub-genres (0–2)                                   │
│    [chip] [chip] [chip] …                                     │
│                                                                │
│  Subjects (0–3)         [chip] [chip] [chip] …                │
│  Tones (1–3, at least 1) [chip] [chip] [chip] …               │
│  Themes (0–3)           [chip] [chip] [chip] …                │
│  Settings (0–2)         [chip] [chip] [chip] …                │
│  Content (any)          [chip] [chip] [chip] …                │
│                                                                │
│  ORDER                                                         │
│  ─────────────────                                            │
│  Drag to reorder. Slots above the line show on the film       │
│  page; slots below feed the recommender silently.             │
│                                                                │
│  1.  [☰ folk horror]              (subgenre · Primary)        │
│  2.  [— robert eggers]            (director · auto)           │
│  3.  [☰ family trauma]            (theme)                     │
│  4.  [☰ religious horror]         (subgenre · Secondary)      │
│  5.  [☰ witches]                  (subject)                   │
│  ─── visible above · hidden below ───                          │
│  6.  [☰ period setting]           (setting)                   │
│  7.  [☰ fever dream]              (tone)                      │
│  …                                                             │
│                                                                │
│  [ Save tags ]                                                 │
└──────────────────────────────────────────────────────────────┘
```

### Behavior

- Picking a chip in any facet group adds the tag to the ordered list at the bottom (default position: end of facet's existing tags within the list, but in practice we just append to the tail and let staff drag).
- Unpicking a chip removes the tag from the ordered list.
- Slot 1 is always the Primary sub-genre — non-draggable, locked. Picking a different Primary sub-genre swaps the slot-1 row.
- Slot 2 is the virtual director row — non-draggable, fixed. Reads `films.director` and just shows it as `(director · auto)`. If `films.director` is empty/null, slot 2 still exists (says "no director set") and the editor surfaces a warning but lets the admin save.
- Slots 3+ are draggable. Secondary sub-genres are visually flagged but draggable into any position 5+ — admin gets an inline validation error if they drop a Secondary into slot 3 or 4. (The Save button stays disabled until all validations pass.)
- The visible/hidden divider is a literal piece of the UI: a horizontal line with the label "visible above · hidden below" between slots 5 and 6 (= film_tags positions 4 and 5 in DB terms).
- Live tag count + per-facet count badges next to each facet header (e.g., "Tones (1–3) · 2 picked").
- "Save tags" calls the server action; on success shows toast "Tags saved." On error shows the structured error inline.

### Why this UX

- Staff have to read the doc to know that "positions 3–5 should distinguish." Rather than over-engineering an automated distinguishing-tag detector, the editor just makes the visible/hidden cutoff visible. Staff drag what they want into the top slots.
- Per-facet caps prevent the most common mistake (picking 5 themes). The doc's caps are the schema's caps.
- Director-at-slot-2 is rendered (not editable) so staff see the convention every time they tag, and the visible row in their editor matches what the user will see on the film page.

### Drag library

`@dnd-kit/core` + `@dnd-kit/sortable`. Already a common React drag library; no native HTML5 drag (which is buggy on iOS Safari and overkill for a desktop-only admin surface). Admin pages are desktop-only — no mobile drag UX to design.

## Render contract — film detail page

`<FilmTagsRow>` rewrites to read the new shape.

### `getFilmTags(client, filmId)` returns:

```ts
type FilmTagRow = {
  id: string;
  name: string;
  type: 'subgenre' | 'subject' | 'tone' | 'theme' | 'setting' | 'content';
  position: number;       // 1-indexed in film_tags
  is_primary: boolean;    // only true for the primary subgenre
};

type FilmTags = {
  visible: FilmTagRow[];  // film_tags rows where position <= 4 (max 4 entries)
  hidden: FilmTagRow[];   // film_tags rows where position >= 5 (the FYP tail)
};
```

Director continues to be read from `films.director` directly — not in the tag arrays.

### Display order on `/film/[id]`

The `<FilmTagsRow>` component renders in this fixed order, drawing from `visible` and `films.director`:

```
[ visible[0] ]   <- Primary subgenre, pink pill
[ director ]     <- films.director, plum pill
[ visible[1] ]   <- pill colored by tag type
[ visible[2] ]
[ visible[3] ]
```

If a film has fewer than 4 visible tags (sparse curation), the row just renders fewer pills; nothing is padded.

If `films.director` is empty, the director slot is omitted — staff fix it by editing the film, not the tag editor.

### Pill color treatment

The visible row should read as a unified capsule, not a rainbow. So three treatments only:

- **Sub-genre Primary**: solid pink (`var(--accent)` background, void text). It's the loudest signal — the form/tradition of the film.
- **Director**: plum (`var(--plum)` from #29 work). Already established.
- **Everything else** (subject / tone / theme / setting / content): muted seafoam outline (`var(--seafoam)` border, transparent fill, bone text). One visual treatment for all four "modifier" facet types.

Hidden tail tags are not rendered visually anywhere on the film detail page in v2.

## Test surface

### DB-side (`db/tests/rls/`)
- Migration replays cleanly (idempotency check via re-applying mig 0152 against a clean DB).
- Anon SELECT on `tags` returns the 88 expected rows.
- Anon SELECT on `film_tags` works after service-role inserts.
- Authenticated INSERT on either table is denied (RLS unchanged from #32).
- Composite PK rejects duplicate `(film_id, tag_id)`.
- Partial unique idx rejects two `is_primary = TRUE` rows for the same `film_id`.
- ON DELETE CASCADE works on both FK directions.
- The new `horror_adjacent` column defaults FALSE and accepts updates.

### App-side (`app/tests/`)
- `setFilmTags` rejects: 0 primary, 2 primary, primary that isn't subgenre type, > 3 tones, < 1 tone, > 3 themes, > 2 secondaries, secondary same as primary, secondary at position 3, ordered list missing one of the picked tags, ordered list with extra tags.
- `setFilmTags` writes correct `horror_adjacent`: true when Primary is `thriller`, false otherwise. Verifies it flips back to false when Primary changes off `thriller`.
- `getFilmTags` returns visible=4 max, hidden=rest, all in correct order. Returns `{visible:[], hidden:[]}` for an untagged film. Director not in either array.
- Editor component: chip-picker enforces per-facet caps client-side (chip becomes disabled at the cap). Save button disabled when validation fails. Drag-to-reorder updates orderedTagIds in component state.

## Migration of currently-tagged films

Per Q5 in the brainstorm: clean wipe. `TRUNCATE film_tags; TRUNCATE tags;` runs in mig 0152. Anything tagged via the v1 editor between #32 ship and #33 ship is lost — confirmed by the user during brainstorm.

## Files

### New / modified
- `db/migrations/0152_tagging_system_v2.sql` — schema migration above.
- `db/tests/rls/tags-and-film-tags.test.ts` — extend existing #32 test file with the new specs.
- `app/lib/supabase/types.ts` — hand-edit: extend `tags.type` literal union, add `position` + `is_primary` on `film_tags`, add `horror_adjacent` on `films`.
- `app/lib/queries/film-tags.ts` — rewrite `getFilmTags` to return `{visible, hidden}` shape. `getAllSubgenres`/`getAllVibes` deleted; replaced with `getAllTagsByType('subgenre' | 'subject' | …)` or a single `getAllTagsGroupedByType()` that returns a record keyed by type.
- `app/lib/actions/admin/film-tags.ts` — rewrite `setFilmTags` to the new input shape and validation rules.
- `app/components/admin/FilmTagEditor.tsx` — rewrite to two-stage UX with `@dnd-kit/sortable`.
- `app/components/FilmTagsRow.tsx` — rewrite to read `{visible}` shape + render pill color treatment per type.
- `app/app/admin/films/[id]/edit/page.tsx` — pass new shape to editor (all six facet vocabularies + current ordered tag list).
- `app/app/film/[id]/page.tsx` — pass new shape to `<FilmTagsRow>`.
- `app/app/admin/films/page.tsx` — `untagged` filter chip continues to work; updates to use the new tags table type instead of subgenre-specific check. Effectively: a film is "untagged" if it has zero rows in `film_tags`. (Simpler than the v1 two-step that filtered by `is_primary` subgenre.)

### New deps
- `@dnd-kit/core`, `@dnd-kit/sortable`. Pinned to current stable.

## Telemetry & rollout

- Apply mig 0152 to prod via the documented `db/ npm run migrate` flow before merging the app PR.
- No feature flag — the editor swap is total. The new editor renders for any admin who hits `/admin/films/[id]/edit`.
- Manual smoke after deploy: tag one Eggers film (e.g. The VVitch) per the doc's worked example. Verify `/film/[id]` renders the right capsule and `films.horror_adjacent` is FALSE. Then tag Holy Spider with thriller as Primary, verify `films.horror_adjacent` flips to TRUE.

## Open questions answered during brainstorm

| Q | Answer |
|---|---|
| Editor UX | Two-stage: chip-group picker → drag-to-reorder ordered list with visible/hidden divider |
| Schema for Primary | `film_tags.is_primary BOOLEAN` + partial unique idx on `(film_id) WHERE is_primary = TRUE`. Action enforces "exactly one + must be subgenre type" |
| Horror-adjacent | `films.horror_adjacent BOOLEAN`, set in same transaction as `setFilmTags`, value = (Primary tag name is `thriller`) |
| Director | Stays on `films.director`. Editor shows it as a non-draggable virtual row at slot 2. Detail page renders it between visible[0] and visible[1] |
| Migration | Clean wipe — `TRUNCATE` both tables in mig 0152 |

## Risks / mild concerns

1. **`@dnd-kit` is desktop-only friendly.** Admin pages are desktop-only by current convention, so this is fine. If staff ever want to tag films from a phone, the drag-list needs a fallback (up/down buttons). Not building that for v2.
2. **Validation has a lot of branches.** Twelve distinct rejection paths in `setFilmTags`. Tests need to cover them; spec calls them out explicitly so the test plan can list them mechanically. Implementer should write the validation as a series of small named checks (`validatePrimary`, `validateSecondaries`, `validateToneRange`, etc.) so the failure paths are clear in code.
3. **`is_primary` redundancy.** Technically `is_primary = (position = 1 AND type = 'subgenre')` could be derived. We're storing it as an explicit column for the partial unique index — it's the cheapest way to get "≤1 Primary per film" enforcement at the DB layer. The action keeps the column in sync; nothing else writes it.
4. **Director-empty edge case.** Some seeded films have `director = ''` (empty string, not NULL — confirmed by the worker's `parseFilm` defaults). Editor needs to handle that: shows "no director set" warning in slot 2 but doesn't block save. Detail page just omits the director pill.

## Changelog

- v1 (this doc, 2026-05-02) — initial spec for sub-project #33.
