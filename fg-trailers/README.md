# fg-trailers — FilmGoblin Trailer Forge

Internal Rust TUI for curating YouTube trailer links on the `films` table in Supabase.

Two-pane terminal app: scroll/search/filter films on the left, edit trailer URL +
label + verified flag on the right, save back to Supabase. Designed to be the
fastest way to walk a backlog of films missing trailers.

## What it does

- Loads every row from `public.films` via the Supabase REST API.
- Lets you fuzzy-narrow by title or year, or filter to films with no trailer.
- Validates pasted YouTube URLs and extracts the canonical video ID.
- Opens the YouTube search page (`Y`) for the selected film so you can grab the
  official trailer in your browser without leaving the keyboard.
- PATCHes `trailer_url`, `trailer_source`, `trailer_youtube_id`, `trailer_label`,
  `trailer_verified`, and `trailer_updated_at` back to Supabase.
- Retires (or un-retires) a film with `X` — flips `tracking` and `available`
  together, mirroring the main app's `adminRetireFilm`. Reversible.

## Required schema

Apply migration `db/migrations/0150_film_trailers.sql` against the database
(`db/ npm run migrate`). The same DDL lives at `fg-trailers/sql/add_trailer_fields.sql`
for portability.

Columns added:

| column                | type        | default            |
|-----------------------|-------------|--------------------|
| `trailer_url`         | text        | null               |
| `trailer_source`      | text        | `'youtube'`        |
| `trailer_youtube_id`  | text        | null               |
| `trailer_label`       | text        | `'Official Trailer'` |
| `trailer_verified`    | boolean     | `false`            |
| `trailer_updated_at`  | timestamptz | null               |

## Environment

Copy `.env.example` → `.env` and fill in:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ The service role key bypasses RLS. This is an internal local-only admin
> tool. Never commit `.env`. Never ship the service role key to the browser.

## Run

From `fg-trailers/`:

```sh
cargo run --release
```

First build pulls dependencies and takes a few minutes; subsequent runs are fast.

## Keybindings

| key        | action                                            |
|------------|---------------------------------------------------|
| `↑`/`↓` or `j`/`k` | move film selection (in left pane); in right pane, `↑/↓` move between fields |
| `←`/`→`    | jump between left pane (films) and right pane (fields) |
| `/`        | enter search mode                                 |
| `Tab` / `Shift+Tab` | cycle through all four fields           |
| `Enter`    | start editing focused field / commit text edit    |
| `Esc`      | exit search/edit/confirm, or quit if browsing     |
| `Space`    | toggle verified (when not editing text)           |
| `S`        | save trailer metadata to Supabase                 |
| `C`        | clear local trailer fields (then `S` to persist)  |
| `O`        | open trailer URL in browser                       |
| `Y`        | open YouTube search for selected film             |
| `M`        | toggle missing-trailer-only filter                |
| `R`        | refresh films from Supabase                       |
| `N`        | jump to next film missing a trailer               |
| `X`        | retire the selected film (or un-retire if already retired); confirms with `y/n` |
| `Q`        | quit                                              |

## Status icons

- `✓` verified trailer exists
- `?` trailer URL set, not verified
- `—` no trailer
- `⊘` retired (`tracking = false`, `available = false`)

## Safety notes

- The tool talks to Supabase as the service role, so any save bypasses RLS.
- Saving with an empty trailer URL clears the remote trailer fields (intentional —
  use `C` then `S` to remove a bad trailer).
- Terminal raw mode is restored on quit, panic, and signal so you don't get a
  garbled prompt.
