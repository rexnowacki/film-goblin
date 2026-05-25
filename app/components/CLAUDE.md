# app/components/ — Client Components

All files here are client components. Every file that uses hooks, browser APIs, or event handlers needs `"use client"` at the top.

## Directory structure

Three subdirectories for specific component types; everything else stays flat in root:

- **`modals/`** — sheet/overlay interaction components (9 files): `RecommendModal`, `WatchModal`, `CommentSheet`, `FilmRequestSheet`, `AddFilmModal`, `ThreadSheet`, `AvatarEditor`, `LikersBottomSheet`, `AnnouncementOverlay`
- **`nav/`** — chrome and navigation (6 files): `TopNav`, `TopNavChrome`, `BottomNav`, `BottomNavIcons`, `BackButton`, `UserMenu`
- **`ui/`** — reusable display primitives (7 files): `Avatar`, `HeartIcon`, `Stars`, `HalftoneBar`, `MatchPill`, `RoleBadge`, `NotificationBadge`

Import these via their full path: `@/components/nav/TopNav`, `@/components/ui/Avatar`, `@/components/modals/WatchModal`, etc.

## Type casting at PostgREST embed boundaries

PostgREST `.select("film:films!inner(…)")` always returns one row but generated types in `types.ts` sometimes emit `T[]`. Cast at the **prop boundary**, not inline:

```tsx
// correct — cast at the prop, not at the query
<FilmPoster film={row.film as never} />

// wrong — leaks uncertainty into query layer
const film = data.film as Film;
```

Use `as never`, not `as any`. The `as never` pattern preserves type-checking everywhere else; `as any` turns off checking for the variable.

## Responsive helpers

Single 720px breakpoint. Use CSS classes from `globals.css` / `styles/00-core.css`:

- `.mobile-only` — `display: none` on desktop, shown on mobile
- `.desktop-only` — `display: none` on mobile, shown on desktop
- `.mobile-only-flex` — same but uses `display: flex`
- `.stackable` — grid that forces `grid-template-columns: 1fr` at ≤720px

## Design system

Palette tokens (set on `:root`, live-switched via `[data-accent="…"]` on `<html>`):
- `--bone: #F3ECD8` — backgrounds
- `--void: #0A0A0A` — text, borders
- `--accent` — defaults to hot pink `#FF2D88`; also acid yellow, orange, blood

Type:
- **Rubik Wet Paint** — chrome/page titles, wordmark only
- **DM Serif Display** — content headings (film titles, section heads)
- **IBM Plex Sans/Serif/Mono** — UI body, review text

Storefront labels: always say "Apple TV" in user-facing strings. Internal identifiers (`itunes_id`, `itunes_url`) keep the `itunes` name because that's the API's name.

## Button conventions

Secondary buttons: `.btn-outline-bone` for non-destructive actions, `.btn-outline-blood` for destructive ones (delete, leave, revoke). See the comment block above `.btn` in `styles/00-core.css`.

## BottomSheet

`BottomSheet` and `LikersBottomSheet` manage their own scroll lock. Don't add `overflow: hidden` to a parent when opening a sheet — the component handles it. See `styles/40-bottom-sheet.css`.

## Safe-area inset

`TopNavChrome` pads `paddingTop: "env(safe-area-inset-top)"` for iOS standalone PWA. Any component that renders its own sticky top bar (e.g. a full-screen overlay) must do the same.
