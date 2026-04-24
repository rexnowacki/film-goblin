# Admin Dashboard v1 — Design Spec

**Status:** ready for implementation planning.
**Scope:** internal operations panel for managing films and users. Staff-only, server-side enforced, extensible to future admin sections (challenges, featured, moderation).

## Goal

Give admins a tight, safe internal tool that (a) makes adding films fast and reliable — the current fragile path is the acute pain — and (b) covers a minimal user-management surface for testing and cleanup. Not a back-office platform. Room to grow; lean first build.

## Non-goals

- User management beyond floor inspection: no impersonate, suspend, admin-reset-password, email-change, role promotion/demotion UI, audit log.
- Hard-delete for films. "Delete" is soft-retire (flips `tracking` and `available` off).
- Poster upload to Supabase Storage. Posters are URL-only in v1.
- TMDB fallback, Letterboxd import, bulk CSV, scheduled auto-enrichment.
- User drill-down inside admin: no watchlist, activity, coven/follow lists. Admin can click through to the public `/p/<handle>` profile for that.
- Landing-page dashboard counts, recent-items widgets, at-a-glance health — a follow-up once logs/Sentry prove insufficient.
- Component-level tests (RTL, Playwright).
- Staff creation/promotion flow — new admins still provisioned via DB migration or service-role script.
- Top-nav `/admin` link. Entry is via the `UserMenu` dropdown only.

## Architecture

### Routes

Under `app/app/admin/` (App Router):

| Route | Purpose |
|-------|---------|
| `/admin` | Section grid: Films + Users tiles. Extensible for future sections. |
| `/admin/films` | Paginated list, title-substring search, "Add film" CTA. |
| `/admin/films/new` | iTunes search + iTunes URL/ID paste + manual form (three entry paths, one converging form). |
| `/admin/films/[id]/edit` | Pre-filled edit form including `tracking` and `available` toggles. Retire button. |
| `/admin/users` | Paginated list, search by handle / email / display_name / UUID. |
| `/admin/users/new` | Admin-only test-user creation (`email_confirm: true`, not the public signup). |
| `/admin/users/[id]` | Floor-level detail + delete button. |

### Auth enforcement (two layers, both required)

1. **Layout guard** at `app/app/admin/layout.tsx` (server component). Fetches user via `createClient()`, checks `staff.role = 'admin'`, redirects non-admins to `/home` and signed-out to `/auth/signin`. Child pages don't re-check.
2. **`requireAdmin(supabase)` helper** at `app/lib/auth/require-admin.ts`. Every admin server action starts with `await requireAdmin(supabase)`. Throws on non-admin regardless of how the action was reached. Prevents direct server-action invocation from bypassing the layout.

### Service-role usage

Lazy-instantiated **after `requireAdmin` passes**, for operations the admin's authenticated client cannot do (`auth.admin.createUser`, `auth.admin.deleteUser`, and cross-schema joins into `auth.users` for the users list).

- Client factory: `app/lib/supabase/service-role.ts` — reads `SUPABASE_SERVICE_ROLE_KEY` (server-only env), never imported in client components.
- Enforced by file convention + lint: any `"use client"` file that imports `service-role` is a bug.

### Nav entry

New `Admin` link in `UserMenu.tsx` dropdown, server-rendered conditional on `staff.role = 'admin'`. Non-admins never see it. Top nav is unchanged.

## Data model

### Migration `0118_films_nullable_itunes_id_and_rls.sql`

The worker's original `0001_films.sql` never enabled RLS on `films`. CI's grants step compensates by enabling RLS + creating a `films_public_read` policy at test-setup time, but the production migration chain has no such policy. This migration corrects both: makes `itunes_id` nullable AND puts films on the same RLS footing as every other table.

```sql
-- Allow manual-entry films that have no iTunes listing.
ALTER TABLE films ALTER COLUMN itunes_id DROP NOT NULL;

-- Replace the old UNIQUE constraint with a partial unique index
-- so multiple NULL-itunes-id rows can coexist.
ALTER TABLE films DROP CONSTRAINT films_itunes_id_key;
CREATE UNIQUE INDEX films_itunes_id_unique
  ON films (itunes_id)
  WHERE itunes_id IS NOT NULL;

-- Bring films onto the same RLS footing as every other public table.
ALTER TABLE films ENABLE ROW LEVEL SECURITY;

-- Public read — the app has always assumed anyone can read films.
DROP POLICY IF EXISTS films_public_read ON films;
CREATE POLICY films_public_read ON films
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admin writes — mirrors the pattern used in 0107_reviews.sql.
DROP POLICY IF EXISTS films_admin_write ON films;
CREATE POLICY films_admin_write ON films
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));
```

The worker (which writes films during seed and price-refresh runs) uses service-role and bypasses RLS unchanged. This migration defines the user-session write rule explicitly for the first time: admin-authenticated only.

### Downstream effects of nullable `itunes_id`

- Worker selection (`db.ts` `selectStalestFilms`) already filters by `tracking = true`; manual films default to `tracking = false` so they stay out of the iTunes refresh pipeline.
- Price-chart rendering (`app/app/film/[id]/page.tsx`) renders "No price history yet" when `price_history` is empty, which is the correct behavior for manual films.
- `/api/cron/refresh-prices` loads films via the worker selection above — unaffected.

## Films flow

### List page (`/admin/films`)

- Server-rendered list, 20 per page, sorted by `created_at DESC`.
- Query params: `?q=<substring>&page=<n>`.
- Columns: poster thumb (24×36), title (link to edit), year, director, `tracking` badge, `available` badge, `Edit` button, `Retire` button.
- Search is `ilike '%q%'` on `title`. Empty query = all films.

### Add film (`/admin/films/new`) — three entry paths, one converging form

**Path 1: iTunes search.** Text input labelled "Search iTunes (title, actor, director)." Submit → new server action → calls `worker/src/itunes.ts` `searchFilms(query, { entity: 'movie', limit: 10 })` → renders up to 10 result cards with poster / title / year / director / trackId. Admin clicks one → form pre-fills with the parsed fields from `parseFilm(result)`.

**Path 2: iTunes URL / ID paste.** Text input accepts either a full Apple TV URL (regex-parse trackId out of `id<digits>`) or a bare numeric trackId. Submit → server action calls `fetchPrices([id])` → `parseFilm` → pre-fill form. Errors surface inline ("No results for trackId 1234", "URL doesn't contain an Apple TV trackId").

**Path 3: Manual.** "No iTunes match?" toggle expands the form blank. `itunes_id` field stays `NULL`. `tracking` checkbox defaults to `false`. `available` defaults to `true`.

**Form (single, shared across all three paths):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | text | ✓ | |
| director | text | ✓ | |
| year | int | ✓ | 1900–(current year + 5) |
| genre_primary | text | ✓ | free text; public surfaces use this as the hero pill |
| runtime_min | int | | 0 allowed |
| description | textarea | | |
| artwork_url | text (URL) | | direct image URL |
| itunes_id | bigint | | nullable; manual films leave blank |
| itunes_url | text (URL) | | |
| content_advisory | text | | |
| tracking | boolean | | defaults to `true` for iTunes-sourced, `false` for manual |
| available | boolean | | defaults to `true` |

**Submit logic:**
- If `itunes_id` is present → server action calls `upsertFilm(client, parsed)` reusing the worker helper. Handles insert + update on conflict.
- If `itunes_id` is NULL → new helper `insertManualFilm(client, fields)` in `worker/src/db.ts` that does a plain INSERT with no ON CONFLICT branch.
- Either path redirects to `/admin/films/[id]/edit` on success.

### Edit page (`/admin/films/[id]/edit`)

Same form, pre-filled from DB. Update happens in place (standard Supabase update via the admin-authenticated client; RLS policy enforces the admin check). Admin can edit any field including `itunes_id` (useful if a manual film is later identified on Apple TV).

### Retire flow

"Retire" button on both the list page and the edit page. Opens a context-summary modal:

> You are about to retire **[title] ([year])**.
>
> - Watchlist entries that reference it: **N** — stay intact
> - List entries: **M** — stay intact
> - Reviews: **P** — stay intact
> - Activity entries: **Q** — stay intact
>
> Public visibility will be hidden (`available = false`) and price tracking stopped (`tracking = false`). Reversible — edit the film and flip the flags back on.
>
> [Cancel] [Retire film]

Submitting sets `tracking = false, available = false`. One UPDATE. Redirects back to the list.

No hard delete in v1.

### Code reuse

The worker's existing surface is consumed from the admin server actions via the existing `"film-goblin-worker": "file:../worker"` dependency:

- `fetchPrices` — iTunes lookup by trackId
- `searchFilms` — iTunes search by free text
- `parseFilm` — raw-result → ParsedFilm
- `upsertFilm` — ON-CONFLICT insert for iTunes-sourced films

New helpers to add to the worker package:
- `insertManualFilm(client, fields)` — plain INSERT; returns UUID
- Maybe `retireFilm(client, id)` — single-line update; admin action can do this inline without a helper, but centralizing keeps the write surface in `db.ts`

## Users flow

### List page (`/admin/users`)

- Paginated 20 per page, sorted by `created_at DESC`.
- Single search input that dispatches by input shape:
  - Matches UUID regex → `WHERE id = $1`
  - Contains `@` → email substring (`ilike`)
  - Otherwise → handle OR display_name substring (`ilike`)
- Columns: avatar, handle, display_name, email (truncated to 24 chars), created_at (relative), last_sign_in_at (relative, "never" if null), staff role badge if any, `View` link.

**Cross-schema join:** the list needs `profiles` (public schema) joined with `auth.users` (auth schema, off-limits to normal clients). Query runs via the service-role client. The server action still gates on `requireAdmin` first; service-role is only used for the read.

### Detail page (`/admin/users/[id]`) — floor only

- Profile: avatar, handle, display_name, bio
- Auth: email, created_at, last_sign_in_at, identity provider list
- Staff role badge if any
- Link: "View public profile" → `/p/<handle>` (same origin, opens in same tab)
- Danger zone: single "Delete user" button

No counts, no activity, no watchlist, no coven. Drill-through is the public profile.

### Create test user (`/admin/users/new`)

- Page header with an explicit note: "This creates a user without email verification. Not the public signup flow. Use this for testing and internal accounts only."
- Form: email, password (pre-filled with a 16-char random default; "Regenerate" button), display_name (optional — if blank, handle defaults to the email local-part)
- Server action: `requireAdmin` → service-role `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { created_by_admin: true } })`
- `email_confirm: true` means no confirmation email; user is immediately usable
- On success → redirect to `/admin/users/[id]`

The public signup flow at `/auth/signup` is untouched. The existence of the admin path does not change it.

### Delete user

Button on detail page. Two confirmation paths:

**Fast path (test-user shape):** if `created_at` < 24h ago AND `last_sign_in_at IS NULL`, button is labeled "Delete test user" and opens a small two-button modal:

> Delete **@handle**? This user has never signed in and was created within the last 24 hours. [Cancel] [Delete]

No typing required.

**Typed-confirmation path (everyone else):** button labeled "Delete user" opens a modal with:

> You are about to permanently delete **@handle** (email, joined date).
>
> Watchlist entries, reviews, recommendations, coven memberships, follows, and activity entries all cascade-delete via FKs. This cannot be undone.
>
> To confirm, type the handle `handle` below.
>
> [text input]
>
> [Cancel] [Delete user — disabled until input matches exactly]

On submit → `requireAdmin` → service-role `auth.admin.deleteUser(id)`. Profiles row deletion cascades through all dependent tables via existing `ON DELETE CASCADE` FKs. Redirect to `/admin/users`.

## Testing

Auth-gate + RLS only, per the scope decision. Forms, search, iTunes lookup all manual-verified during smoke.

### `app/tests/admin/layout-guard.test.ts` (3 cases)

- Signed-out user redirects to `/auth/signin`
- Signed-in non-staff user redirects to `/home`
- Signed-in admin stays on `/admin`

### `app/tests/admin/require-admin.test.ts` (4 cases)

- Throws for signed-out
- Throws for non-staff authenticated user
- Throws for `staff.role = 'reviewer'`
- Returns silently for `staff.role = 'admin'`

### `db/tests/rls/films-admin-write.test.ts` (new testcontainers RLS case, ~4 cases)

- `anon` cannot INSERT, UPDATE, or DELETE films
- Non-admin `authenticated` cannot write films
- `authenticated` reviewer cannot write films
- `authenticated` admin can INSERT, UPDATE, and DELETE films

Total: ~11 new test cases across two files + one existing RLS suite.

## Files touched

### New

- `app/app/admin/layout.tsx` — auth gate
- `app/app/admin/page.tsx` — section grid
- `app/app/admin/films/page.tsx` — list + search
- `app/app/admin/films/new/page.tsx` — add form + three entry paths
- `app/app/admin/films/[id]/edit/page.tsx` — edit form
- `app/app/admin/films/FilmForm.tsx` — shared form component (client)
- `app/app/admin/films/iTunesSearchBox.tsx` — search widget (client)
- `app/app/admin/films/iTunesPasteBox.tsx` — URL/ID paste widget (client)
- `app/app/admin/films/RetireModal.tsx` — context-summary delete modal
- `app/app/admin/users/page.tsx` — list + search
- `app/app/admin/users/new/page.tsx` — create-test-user form
- `app/app/admin/users/[id]/page.tsx` — detail + delete
- `app/app/admin/users/DeleteUserModal.tsx` — dual-path confirmation modal
- `app/lib/auth/require-admin.ts` — helper
- `app/lib/supabase/service-role.ts` — server-only service-role client factory
- `app/lib/actions/admin/films.ts` — create / edit / retire server actions + iTunes search/paste helpers
- `app/lib/actions/admin/users.ts` — create-test-user / delete-user server actions
- `app/lib/queries/admin/films.ts` — list + search queries (RLS-backed)
- `app/lib/queries/admin/users.ts` — list + search queries (service-role cross-schema join)
- `db/migrations/0118_films_nullable_itunes_id.sql`
- `app/tests/admin/layout-guard.test.ts`
- `app/tests/admin/require-admin.test.ts`
- `db/tests/rls/films-admin-write.test.ts`

### Modified

- `app/components/UserMenu.tsx` — adds staff-gated Admin link
- `worker/src/db.ts` — adds `insertManualFilm` helper (and possibly `retireFilm`)

### Untouched

- Public app surfaces (landing, feed, film detail, profile, settings, onboarding) — zero changes.
- Worker scheduling and cron routes — zero changes.
- Public signup flow at `/auth/signup` — zero changes.

## Success criteria

- An admin signed into the production app can add a specific film they have in mind (e.g. "The Blair Witch Project") end-to-end in under 60 seconds via the iTunes search path.
- Adding a manual film (no iTunes ID) succeeds and leaves `tracking = false` by default so it stays out of the refresh pipeline.
- A non-admin user who navigates directly to `/admin` is redirected to `/home` without a flash of admin UI.
- A non-admin authenticated user calling the admin server actions via any client receives an error; the DB state is unchanged.
- Creating a test user via `/admin/users/new` produces a user who can immediately sign in at `/auth/signin` without clicking a confirmation link.
- Deleting a test user fresh-created removes their row from `auth.users` and cascade-removes the `profiles` row.

## Rough estimate

~4.5 days of focused work:

| Piece | Effort |
|-------|--------|
| Migration + `requireAdmin` + layout guard + UserMenu link + service-role factory | 0.5d |
| Films list + search + pagination | 0.5d |
| Films add page: iTunes search + iTunes paste + manual + shared form + server actions | 1.5d |
| Films edit + retire modal + retire action | 0.5d |
| Users list (cross-schema join) + search + detail page | 0.5d |
| Create-test-user form + server action | 0.25d |
| Delete user (fast path + typed-confirmation path) | 0.25d |
| Auth-gate tests + RLS test + smoke | 0.5d |

## Out-of-scope follow-ups (ideas graveyard)

When these come back as real needs, each is its own small sub-project:

- Poster upload via Supabase Storage `posters` bucket.
- TMDB fallback for films with no iTunes listing.
- Admin-side user drill-down: watchlist, activity, coven/follow tables.
- Suspend/reactivate account flag column.
- Admin password reset, email change.
- Staff promotion UI.
- Hard-delete film.
- Audit log for admin actions.
- Landing-page counts / recent-items widgets.
- Bulk CSV / Letterboxd import.
