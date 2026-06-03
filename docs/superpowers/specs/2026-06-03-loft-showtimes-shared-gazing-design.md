# Loft Showtimes + Shared Gazing — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan
**Scope:** v1 — The Loft Cinema only

## Summary

Add a "currently showing" experience to Film Goblin:

1. A weekly worker scrapes The Loft Cinema's **showtimes** page and stores individual showtime slots (datetime granularity) for the **next 7 days**.
2. Film pages whose film is playing at the Loft show a **"▸ Now at The Loft"** pill.
3. The pill opens a bottom-sheet modal — a **full-week agenda** of showtimes grouped by day.
4. A user selects a showtime and **shares it with a friend** via the native share sheet. The shared link opens a **"shared gazing"** landing page whose link-preview card (OG image) shows the poster + flavor text. The gazing page doubles as a soft signup funnel.

This extends, but does not replace, the existing coming-soon theater-alerts pipeline (`app/lib/theaters/`, `theater_showings`), which remains date-granular and watchlist-notification oriented.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Theaters in v1 | **Loft only** (Cinemark/Guild deferred) |
| Time horizon | **Next 7 days** only |
| Share mechanism | **Web Share API** + link with rich OG preview (no Twilio/MMS) |
| Share target | **Persisted gazing invite** at `/gazing/[token]` (not an ephemeral deep link) |
| Pill visibility | **Everyone** (pill names the theater) |
| Modal layout | **Full-week agenda**, grouped by day, in a `BottomSheet` |
| Aesthetic | Existing FG zine system (bone bg, 2px void borders, hard offset shadows, pink accent, serif heads, mono labels) |

## Source page structure (confirmed against live HTML 2026-06-03)

`https://loftcinema.org/showtimes/` server-renders **all** showtimes (~4 weeks, 175 slots) into the initial HTML. The on-page date selector is **client-side filtering only** — no AJAX, no per-day URL. The worker fetches one page and filters to the 7-day window itself.

Per-showtime markup:

```html
<div class="date-showings">
  <h3><a href="https://loftcinema.org/film/death-becomes-her/">Death Becomes Her</a></h3>
  <div class="date-collection-wrapper">
    <div class="date-collection active" data-date="700101">
      <div class="selectable-date  screen-4" data-sid="630215"
           data-title="Death Becomes Her" data-date="Fri 6/5 @ 8:30pm" data-tickets="44">
        <div class="date-oval">8:30pm</div><p>Screen 4</p>
      </div>
      ...
    </div>
  </div>
</div>
```

Fields used:
- `data-sid` — stable per-showtime ID → natural upsert key.
- `data-title` — film title (raw).
- `data-date` — `"Fri 6/5 @ 8:30pm"` — weekday + month/day + time, **no year**.
- screen class (`screen-4`, `open-air-cinema`) + inner `<p>` — screen/format label.
- enclosing `<h3><a href>` — film slug + canonical Loft URL (used as `source_url` / `tickets_url`).

Scoped to the next 7 days this yields ≈116 slots across ≈10 films — a realistic week.

**Format caveat:** format sometimes rides in the title (e.g. `"Close Encounters of the Third Kind in 70mm"`) and sometimes in the screen label (`open-air-cinema`). The parser captures the screen `<p>` as `screen_label`; a known-format regex (`35mm|70mm|open air`) over title + screen produces an optional `format_label`. Title normalization for film matching strips trailing format phrases.

## Data model

Two new tables (migration in `db/migrations/`). `theater_showtimes` is deliberately separate from the existing date-granular `theater_showings`.

### `theater_showtimes`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `theater_id` | uuid → theaters | |
| `film_id` | uuid → films, null | set by title match; null = unmatched |
| `source_sid` | text | Loft `data-sid` |
| `title` | text | raw `data-title` |
| `normalized_title` | text | for matching + unmatched display |
| `starts_at` | timestamptz | resolved from `data-date` in Loft tz |
| `screen_label` | text null | e.g. "Screen 4", "Open Air Cinema" |
| `format_label` | text null | e.g. "70mm", "35mm" when detected |
| `tickets_url` | text | film Loft page (v1) |
| `source_url` | text | film Loft page |
| `is_active` | boolean | future slots absent from latest scrape → false |
| `last_seen_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

Constraints: `unique(theater_id, source_sid)`. Index on `(film_id, is_active, starts_at)` for the film-page query.

RLS: public read of active rows; writes service-role only (worker).

### `gazing_invites`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `token` | text unique | url-safe random (~16 bytes base64url) |
| `created_by` | uuid → profiles | inviter |
| `showtime_id` | uuid → theater_showtimes, null | nullable; slot may later go inactive |
| `film_id` | uuid → films | for the "add to watchlist" CTA |
| `film_title` | text | **snapshot** |
| `poster_url` | text | **snapshot** |
| `theater_name` | text | **snapshot** |
| `starts_at` | timestamptz | **snapshot** |
| `format_label` | text null | **snapshot** |
| `created_at` | timestamptz | |

Snapshot fields are frozen at creation so the gazing page + OG image render correctly even after the weekly refresh inactivates or removes the underlying slot.

RLS: public read by `token` (the page + OG route are unauthenticated); insert restricted to the authenticated `created_by`. No RSVP/attendee table in v1.

## Worker + cron

New module `app/lib/theaters/showtimes/`:

- `parse-loft-showtimes.ts` — parse `selectable-date` blocks → `ScrapedShowtime[]` (title, sid, raw date, screen, film slug/url).
- `resolve-datetime.ts` — turn `"Fri 6/5 @ 8:30pm"` into a `timestamptz`. Infer year by choosing the next occurrence of that month/day **whose weekday matches** the given weekday, on or after today, in the Loft timezone (`America/Phoenix`, no DST — simpler). Reject slots whose weekday can't be reconciled (logged, skipped).
- `filter-window.ts` (or inline) — keep only slots with `starts_at` within `[now, now + 7 days]`.
- `match-showtimes.ts` — set `film_id` via the existing `normalize-title` + `match-showings` matching against `films`.
- `upsert-showtimes.ts` — idempotent upsert on `(theater_id, source_sid)`; mark `is_active=false` for future-dated active rows of this theater absent from the latest scrape (mirrors `upsert-showings.ts`).

Cron route `app/api/cron/refresh-showtimes/route.ts` — `Authorization: Bearer $CRON_SECRET`, `acquireCronLock` (reuse `lock.ts`). Returns `{ ok, summary }`. **Weekly cadence, manual trigger** (Hobby cron cap — consistent with the other dropped crons; document the `curl` in CLAUDE.md "Open threads").

Reuses where possible: `html.ts`, `normalize-title.ts`, `lock.ts`, `source-hash.ts` patterns.

## Film page pill + showtimes modal

- `/film/[id]` server component runs a query for `theater_showtimes` where `film_id = id AND is_active AND starts_at >= now()`, ordered by `starts_at`. If non-empty, render the pill.
- **Pill** — rotated pink chip, mono uppercase: "▸ Now at The Loft". Styled with existing tokens (`--pink`, 2px `--void` border, hard shadow, slight rotate). Placed in the film hero metadata area.
- **`ShowtimesSheet`** (`"use client"`) — opens via existing `BottomSheet` (which owns scroll-lock). Renders the agenda: slots grouped under `Day · M/D` headers (dashed divider), each slot a bordered button showing time + optional format tag. Selecting a slot reveals the share CTA: "👁 Invite a goblin to {time} →".
- Share CTA calls `createGazingInvite(showtimeId)` then `navigator.share({ url, text })`; fallback copies the link and toasts.

## Gazing create + share + landing

- **Server action** `createGazingInvite(showtimeId)` (`app/lib/actions/...`, auth-guarded per the `_private`/`public` split): loads the showtime + film, writes a `gazing_invites` row with snapshot, returns `{ url: '/gazing/<token>' }`.
- **`/gazing/[token]`** — public server component (no auth gate; reachable by logged-out friends). Renders the landing page: "{inviter} summons you to a SHARED GAZING", rotated poster, flavor line, details block (When / Where / Form), CTA stack: **Get tickets** (→ `tickets_url`), **Add to watchlist** (auth → adds `film_id`; logged-out → signup, preserving intent), **Join the coven** (signup). Unknown/expired token → friendly zine 404.
- **`generateMetadata`** on the gazing page sets `og:image` to `/api/og/gazing/[token]`.
- **`/api/og/gazing/[token]`** — `ImageResponse` mirroring the existing `/api/og/film/[id]` route: poster left; "SHARED GAZING" label, film title, date/time, theater, Film Goblin wordmark right. Same zine treatment.

## Error handling

- Scrape fetch non-200 / timeout (10s, AbortController like `loft.ts`) → log, abort the run, **never** wipe existing rows.
- Year/weekday irreconcilable → skip that slot, log.
- Unmatched titles → stored with `film_id = null` (no pill surfaces them; harmless; visible to a future admin view if wanted).
- `navigator.share` unavailable (desktop) → copy-link fallback + toast.
- Gazing token missing/expired → friendly 404 page.

## Testing (vitest, existing patterns)

- `parse-loft-showtimes` against a committed **trimmed HTML fixture** taken from the real page → asserts slot count, sid, title, screen, slug.
- `resolve-datetime` units: year inference, weekday validation, year rollover (Dec→Jan), Phoenix-tz correctness.
- `filter-window`: boundary at now and now+7d.
- `upsert-showtimes`: insert/update idempotency + future-dated stale → inactive; past rows untouched.
- `gazing_invites` snapshot integrity: invite still renders after its showtime is inactivated.
- DB/RLS test: public read by token, owner-only insert, public read of active showtimes.

## Out of scope (v1, noted for later)

- Cinemark / zip-code theater lookup (no documented public API — needs its own investigation).
- Guild showtimes (scraper exists at coming-soon granularity; extend later).
- Per-showtime deep ticket links via `data-tickets` (v1 links to the film's Loft page).
- RSVP / "I'm in" on the gazing page; inviter avatar; map/directions link.
- Location/opt-in gating of the pill (revisit when theaters are geographically spread).
