# Summon the Coven — Gazing Invites as a Feed Action

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan
**Scope:** v1 — broadcast a Loft showtime to the coven feed, distinct from private SMS share

## Summary

Today a "shared gazing" invite is a private `/gazing/[token]` link created from the film
page's `ShowtimesSheet` and blasted out over SMS via the Web Share API. It never touches
the activity feed.

This adds a distinct **"Summon the coven"** action that broadcasts a chosen showtime to the
user's coven feed as a new activity card. The existing SMS share is left completely unchanged
— summon is a separate affordance, not a side effect of sharing.

Coven mates see the card (actor, poster, film title, theater + day/time), can react and
comment like any other feed item, and click through to the existing `/gazing/[token]` landing
page for tickets / add-to-watchlist.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| What "action on the feed" means | Creating a broadcast invite **posts an activity card** to the coven feed |
| Trigger point | **Separate "Summon the coven" action** — SMS share stays as-is (no feed post) |
| Summon vs. SMS distinction | A `broadcast` boolean on `gazing_invites`; trigger fires only when true |
| Emission mechanism | **DB trigger** on `gazing_invites` insert (consistent with all other activity kinds) |
| Card link target | `/gazing/[token]` — reuse the existing landing page |
| Profile broadcast toggle | **None** in v1 — summon is already an explicit per-showtime opt-in |
| Dedup / grouping | **None** in v1 — summoning twice posts twice (low volume, matches other kinds) |

## How it fits the existing pattern

Every feed kind is a row in the singular `activity` table (`kind` enum value + jsonb
`payload` + `actor_user_id`), emitted by an `AFTER INSERT` trigger on a natural source table
(e.g. `library_added` fires on `library` insert, gated by `profiles.broadcast_library`; see
`db/migrations/0134_library_added_trigger.sql`). The feed query
(`app/lib/queries/activity.ts`) reads `activity`, enriches `payload.film_id` against `films`,
and a per-kind renderer under `app/components/activity/` draws each card.

A gazing invite is the natural source table for a "summon," so this design stays fully
consistent with that pattern.

## Data model

### `gazing_invites.broadcast`

Add one column:

```sql
ALTER TABLE gazing_invites
  ADD COLUMN broadcast boolean NOT NULL DEFAULT false;
```

- Existing `createGazingInvite` (SMS share): leaves `broadcast = false` → **no feed post**.
- New `summonCoven` action: inserts with `broadcast = true` → trigger fires.

No other schema change to `gazing_invites`; all snapshot fields the card needs
(`film_id`, `token`, `theater_name`, `starts_at`, `format_label`) already exist on the row.

### New activity kind

`gazing_invited`, added to the `activity_kind` enum.

Payload shape written by the trigger:

```json
{
  "film_id":      "<uuid>",
  "token":        "<gazing token>",
  "theater_name": "The Loft Cinema",
  "starts_at":    "2026-06-05T20:30:00-07:00",
  "format_label": "70mm"        // nullable
}
```

`film_id` rides the feed's existing film-enrichment path (poster + title from `films`); the
remaining fields are snapshotted into the payload so the card renders correctly even after the
weekly showtimes refresh inactivates the underlying slot.

## Migrations

Next numbers are `0198` / `0199`. Split into two files mirroring the `0194`/`0195`
(`user_joined`) precedent, because `ALTER TYPE … ADD VALUE` must commit before a function can
reference the new value.

- **`0198_gazing_invited_kind.sql`**
  ```sql
  ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'gazing_invited';
  ```

- **`0199_gazing_broadcast_trigger.sql`**
  - `ALTER TABLE gazing_invites ADD COLUMN broadcast boolean NOT NULL DEFAULT false;`
  - `activity_on_gazing_broadcast()` — `SECURITY DEFINER`, `SET search_path = public`,
    inserts into `activity (actor_user_id, kind, payload)` with `actor_user_id = NEW.created_by`,
    `kind = 'gazing_invited'`, and the payload above built from `NEW`.
  - `CREATE TRIGGER on_gazing_broadcast AFTER INSERT ON gazing_invites FOR EACH ROW
    WHEN (NEW.broadcast IS TRUE) EXECUTE FUNCTION activity_on_gazing_broadcast();`

## Server action

In `app/lib/actions/gazing.ts`:

- Lift the shared "load showtime → build snapshot" logic out of `_createGazingInvite` into a
  small helper so both code paths reuse it (showtime fetch, `one()` flattening, the
  matched-film guard, snapshot assembly).
- Add `_summonCoven(client, showtimeId)` / `summonCoven(showtimeId)` following the
  `_private`/`public` split. Identical to `createGazingInvite` except it inserts with
  `broadcast: true`. Returns `{ url }` (the `/gazing/[token]`), same as the share action, so
  the UI can optionally surface the link.
- The public wrapper `revalidatePath`s `/home` so the summoner sees their own card on next
  load.

Auth is enforced by `requireAuthUser` exactly as in the existing action.

## Feed enrichment

In `app/lib/queries/activity.ts`:

- Extend the `EnrichedActivity` union:
  ```ts
  | { kind: "gazing_invited"; film: FilmLite; token: string; theaterName: string; startsAt: string; formatLabel: string | null }
  ```
- Add a `case "gazing_invited"` to the enrichment switch: requires `film` (from the existing
  `filmMap` lookup on `payload.film_id`); reads `token`, `theater_name`, `starts_at`,
  `format_label` from the payload. Drops the row gracefully if the film is missing (same guard
  style as the other film-bearing kinds).

No grouping changes — `gazing_invited` is not added to the grouped kinds; each card stands
alone.

## Renderer

`app/components/activity/ActivityGazingInvited.tsx`, matching the scaffolding of the existing
cards (e.g. `ActivityRecommendationSent.tsx`):

- `Avatar` + actor line + `ActivityFooter` (reactions/comments come free from the base item).
- Copy: **"{actor} summons the coven to a shared gazing of {film} — The Loft · Fri 8:30pm."**
  Theater name normalized to "The Loft" the same way `ShowtimesSheet.pillTheaterName` does;
  day/time formatted in `America/Phoenix`. Optional `formatLabel` (e.g. "70mm") appended.
- Poster thumbnail (right, like the recommendation card) and the actor/film text link to
  `/gazing/[token]`.
- Register the new kind in `app/components/activity/ActivityRow.tsx`.

## UI affordance

In `app/components/ShowtimesSheet.tsx`, after a slot is selected, render **two** CTAs in the
share area:

1. Existing **"Invite a goblin to {time}"** — SMS share, unchanged.
2. New **"👁 Summon the coven"** — calls `summonCoven(selected.id)`, toasts
   "Summoned the coven", and closes the sheet on success.

Both share the same selected-slot + auth gating already present (`canInvite`; logged-out users
are routed to signup). New button styling reuses the existing `.showtimes-*` tokens in
`app/app/styles/210-showtimes.css`.

## Error handling

- Unmatched showtime (no `film_id`) → `summonCoven` throws "Showtime is not matched to a film
  yet" (same guard as `createGazingInvite`); the sheet toasts a failure.
- Trigger only fires `WHEN (NEW.broadcast IS TRUE)`, so the SMS path can never accidentally
  post to the feed.
- Enrichment drops a `gazing_invited` row whose film was deleted, rather than erroring the feed.

## Testing (vitest + DB/RLS, existing patterns)

- **DB/RLS test:** inserting a `gazing_invites` row with `broadcast = true` creates exactly one
  `activity` row with `kind = 'gazing_invited'` and the correct payload; inserting with
  `broadcast = false` creates **none**.
- **Enrichment unit:** a `gazing_invited` raw row enriches into the right shape (film + token +
  theater + starts_at + format), and is dropped when the referenced film is absent.
- **Action test:** `summonCoven` inserts with `broadcast = true`; `createGazingInvite` leaves it
  `false`. (Mirrors `app/tests/actions/gazing.test.ts`.)

## Out of scope (v1, noted for later)

- Per-user profile toggle to opt out of broadcasting summons.
- Dedup guard (skip re-posting the same showtime within a window).
- Grouping multiple summons by the same actor.
- RSVP / "I'm in" responses on the feed card (no attendee model exists yet).
- Surfacing summons from theaters other than the Loft (blocked on multi-theater showtimes).
