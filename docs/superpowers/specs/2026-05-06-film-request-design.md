# Film Request Feature — Sub-project #39

**Status:** Spec approved. Not yet planned.
**Trigger:** User searches /films, gets zero results, wants to request the missing film.

---

## Goal

When a signed-in user searches the discover page and finds nothing, give them a one-tap path to request the film. Requests feed an admin queue with request counts and one-click (or pre-filled form) add-to-catalog. Users get a bell notification when their film lands.

## Out of scope

- Guest (logged-out) requests — signed-in only
- Email notifications for fulfillment — bell only in v1; email system can adopt the new kind later
- Auto-fulfillment when an admin adds a film via the normal flow — explicit queue action only
- Multiple candidate picker in the confirmation sheet — single best match, user edits query if wrong
- Request cancellation or editing by the user

---

## Schema

### Migration `0165_film_requests.sql`

**`film_requests`** — one row per unique requested film, deduped by `itunes_id` (when available) or `title + year`:

```sql
CREATE TABLE film_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  itunes_id         BIGINT,                          -- NULL when source = 'tmdb' | 'manual'
  tmdb_id           INT,                             -- NULL when source = 'itunes'
  title             TEXT        NOT NULL,
  year              INT,
  artwork_url       TEXT,
  director          TEXT,
  description       TEXT,
  runtime_min       INT,
  genre_primary     TEXT,
  content_advisory  TEXT,
  itunes_url        TEXT,
  source            TEXT        NOT NULL CHECK (source IN ('itunes', 'tmdb', 'manual')),
  needs_itunes_id   BOOLEAN     NOT NULL DEFAULT false,
  request_count     INT         NOT NULL DEFAULT 1,
  status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled')),
  fulfilled_film_id UUID        REFERENCES films(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`film_request_users`** — join table: who requested what (notifications + per-user dedup):

```sql
CREATE TABLE film_request_users (
  request_id  UUID        NOT NULL REFERENCES film_requests(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);
```

**Profiles change** — new opt-out toggle:

```sql
ALTER TABLE profiles ADD COLUMN notify_film_requests BOOLEAN NOT NULL DEFAULT true;
```

**Notification kind** — extend the existing CHECK constraint on `notifications.kind` to include `'film_request_fulfilled'`.

**RLS:**
- `film_requests`: authenticated users can INSERT; read own rows via join on `film_request_users`; staff role can SELECT/UPDATE all.
- `film_request_users`: authenticated users can INSERT and SELECT their own rows; staff role can SELECT all.

---

## Search Fallback Action

**`searchFilmForRequest(query: string)`** in `app/lib/actions/film-requests.ts` — authenticated, not admin-gated.

Runs four steps in order, stopping at the first hit:

1. **iTunes Search API direct** — `searchFilms` from the worker (`itunes.apple.com/search?entity=movie`). Fast, no external key. Returns `source: 'itunes'`.
2. **Brave → Apple TV → iTunes Lookup** — `tryBraveSearch` logic extracted from `apple-tv-search.ts` into a shared helper (`app/lib/search/apple-tv.ts`), minus the `requireAdmin` gate. Returns `source: 'itunes'`.
3. **TMDB** — `adminSearchTmdb` logic extracted into a shared helper (`app/lib/search/tmdb.ts`), minus `requireAdmin`. Sets `needs_itunes_id: true`. Returns `source: 'tmdb'`.
4. **Manual fallback** — all three failed. Returns `source: 'manual'` with just the query string.

The extraction of steps 2 and 3 into `app/lib/search/` gives the existing admin actions a cleaner import — small improvement, not a refactor.

**Return type:**

```ts
type FilmRequestCandidate =
  | { source: 'itunes'; hit: ITunesSearchHit }
  | { source: 'tmdb';   hit: TmdbCandidate }
  | { source: 'manual'; title: string }

type SearchForRequestResult =
  | { ok: true;  result: FilmRequestCandidate }
  | { ok: false; error: string }
```

Returns the single best match — not a multi-candidate picker. The confirmation sheet is the review step.

---

## Submit Action

**`submitFilmRequest(data: FilmRequestInput)`** — authenticated:

1. Check `films` for existing match by `itunes_id` (if present) or `title + year` → return `{ status: 'already_in_catalog', filmId }`.
2. Check `film_requests` for existing pending row by same keys → if found:
   - Upsert `film_request_users` (no-op if user already there)
   - Increment `request_count` if user was not already in the join table
   - Return `{ status: 'already_requested', requestCount }`
3. Otherwise: insert `film_requests` row + `film_request_users` row → return `{ status: 'ok' }`.

---

## User-Facing Flow

### Empty state on `/films`

When `q` is non-empty, `films.length === 0`, and user is signed in, the existing "The void returned nothing." text gains a request button below it:

```
The void returned nothing.
[Request this film →]
```

Button click calls `searchFilmForRequest(q)` with a loading state, then opens `FilmRequestSheet`.

### `FilmRequestSheet` (BottomSheet)

**Found — iTunes or TMDB:**
```
[poster]  The Fly
          1986 · David Cronenberg

"This the one?"
[Request it]   [Not quite]
```
"Not quite" dismisses — user edits their search query and tries again.

**Manual fallback (nothing found anywhere):**
```
We couldn't find this film in any database.
You can still request it by title:

[_The Fly________________]   ← pre-filled, editable

[Request it]
```

**Post-submit states (swapped in after action resolves):**
- `already_in_catalog` → "Already in the catalog →" — links to `/film/:id`
- `already_requested` (user not yet on list) → "Already requested by N people — you're now on the list."
- `already_requested` (user already on list) → "You've already requested this one."
- `ok` → sheet closes, toast: *"Request sent. We'll notify you when it's added."*

---

## Admin Queue

### `/admin/film-requests`

New page, linked from the admin dashboard tile grid.

**List:** sorted by `request_count DESC`, then `created_at DESC`. Pending by default; "Show fulfilled (N)" toggle at top reveals completed rows.

**Row anatomy:**
```
[artwork]  The Fly                           iTunes  ·  12 requests
           1986 · David Cronenberg                   [Add to catalog]

[artwork]  Crimes of the Future             TMDB ⚠ needs iTunes ID  ·  4 requests
           2022 · David Cronenberg                   [Review & Add]

[artwork]  "some obscure title"             manual ⚠ needs iTunes ID  ·  1 request
           year unknown                              [Review & Add]
```

### "Add to catalog" — iTunes source

Calls `fulfillFilmRequest(requestId)` server action:
1. Calls existing `createFilm` logic with stored metadata.
2. Calls shared `fulfillRequest(client, requestId, filmId)` helper.
3. `revalidatePath` on `/admin/film-requests` + `/films`.

### "Review & Add" — TMDB or manual source

Navigates to `/admin/films/new?request_id=<id>`. `AddFilmClient` reads `request_id` from search params, fetches stored metadata, pre-fills `FilmForm`. The `itunes_id` field is empty and highlighted with the existing admin-note styling:

> *"iTunes ID not set — film will be unavailable until added."*

On save, the `createFilm` action checks for `request_id` in the payload and calls `fulfillRequest` after a successful insert.

### Shared `fulfillRequest(client, requestId, filmId)` helper

Called by both paths — no duplication:
1. Sets `film_requests.status = 'fulfilled'`, `fulfilled_film_id = filmId`, `updated_at = now()`.
2. Fetches all `user_id` rows from `film_request_users` for the request.
3. Filters to users with `notify_film_requests = true`.
4. Batch-inserts `film_request_fulfilled` notifications.

---

## Notifications

**Kind:** `film_request_fulfilled`

**Payload:** `{ film_id: string; film_title: string; request_id: string }`

**Recipients:** all users in `film_request_users` for the fulfilled request with `notify_film_requests = true`.

**Grouping:** none — personal fulfillment notification, not a social event.

**Bell copy:** *"Your request for [The Fly] was added to the catalog."* Deep-links to `/film/:id`.

**Settings:** new `notify_film_requests` toggle in `/settings` notification section alongside existing toggles. Default on.

---

## Files Changed / Created

| Path | Change |
|------|--------|
| `db/migrations/0165_film_requests.sql` | New tables, profile column, notification kind |
| `app/lib/search/apple-tv.ts` | Extract `tryBraveSearch` from `apple-tv-search.ts` |
| `app/lib/search/tmdb.ts` | Extract search logic from `admin/tmdb.ts` |
| `app/lib/actions/film-requests.ts` | `searchFilmForRequest`, `submitFilmRequest`, `fulfillFilmRequest`, `fulfillRequest` helper |
| `app/lib/actions/admin/apple-tv-search.ts` | Update import to use shared helper |
| `app/lib/actions/admin/tmdb.ts` | Update import to use shared helper |
| `app/components/FilmRequestSheet.tsx` | New BottomSheet variant |
| `app/app/films/page.tsx` | Empty state — add request button |
| `app/app/admin/film-requests/page.tsx` | New admin queue page |
| `app/app/admin/page.tsx` | Add Film Requests tile |
| `app/app/admin/films/new/AddFilmClient.tsx` | Read `request_id` param, pre-fill form |
| `app/app/settings/SettingsForm.tsx` | `notify_film_requests` toggle |
| `app/lib/supabase/types.ts` | Regen after migration |

---

## Testing

Pure-logic units (no real DB needed):
- `searchFilmForRequest`: mock each search helper, verify fallback chain fires in order, verify manual fallback when all fail
- `submitFilmRequest`: mock DB, verify dedup paths (`already_in_catalog`, `already_requested` both variants, `ok`)
- `fulfillRequest`: mock DB, verify status update + notification inserts + opt-out filter

Integration (env-gated, `describe.skipIf(!hasEnv)`):
- Submit → fulfill round-trip against real DB
- Notification insertion respects opt-out flag
