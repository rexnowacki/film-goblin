# Discovery Chrome Polish (B1) — Design

**Status:** spec
**Date:** 2026-04-25
**Sub-project:** B1 of the Discovery brief follow-through (B2 = Social signal on posters, deferred)

## Goal

Tighten the `/films` Archive page chrome and give the app an installable identity:

1. Replace the sort `<select>` with a curated 4-chip row (zine voice + thumb-friendly).
2. Kill the "Chapter II · The Archive" eyebrow (chapter framing as a system is dropped, not relocated).
3. Add a bare-minimum installable PWA shell — manifest, iOS meta, favicons — using a goblin-skull glyph as the source mark.

Zero DB work. One PR. Ships as a single tight sub-project.

## Out of scope

- New DB queries, schema, or RLS policies.
- Service worker / offline shell / "Add to Home Screen" prompt UI.
- Per-device iOS startup splash images.
- Chapter eyebrows on other routes (the framing is killed entirely).
- Restoring the dropped sort options (`Alphabetical`, `Highest price`).
- Theme-color overrides per route.

## Section 1 — `/films` chip swap

### Curated chip set (4 chips, in display order)

| Chip label          | `sort` value   | URL behavior |
|---------------------|----------------|--------------|
| `Recently added`    | `added`        | Default — `?sort=` is omitted |
| `Lowest price`      | `price_low`    | `?sort=price_low` |
| `Most watchlisted`  | `watchlisted`  | `?sort=watchlisted` |
| `Release year`      | `release`      | `?sort=release` |

Dropped from the UI: `Alphabetical` (`title`) and `Highest price` (`price_high`). The `FilmsSort` type still permits both values, so deep links like `/films?sort=title` keep returning the correct ordering server-side — they're just unselectable from the chip row.

### Component

**File:** `app/app/films/FilmsSortChips.tsx` — replaces `app/app/films/FilmsSortSelect.tsx` (deleted).

**Props:** `{ currentSort: FilmsSort; currentQ: string }` — identical to the old select.

**Behavior:** clicking a chip pushes `/films?sort=<value>`, omitting `sort` when the value is `added` (the new default). `q` is preserved across chip clicks; `page` is dropped to reset pagination. Implementation uses `useRouter` + `useSearchParams` like the existing select.

**Markup:** a `<div role="tablist">` containing 4 `<button role="tab" aria-selected="…">` elements. Tablist semantics because chips are mutually-exclusive same-data-different-axis. Keyboard: arrow-left/right moves focus between chips, Enter/Space activates (via roving tabindex).

**Placement:** chips render above the grid as their own row (not jammed onto the meta row's right edge). The film count line (`123 films matching "X"`) stays where it is — different question, doesn't compete.

### CSS classes (added to `app/app/globals.css`)

- `.films-sort-chips` — flex row, `gap: 10px`, `flex-wrap: wrap`, `margin-bottom: 20px`. Wraps to 2 rows at narrow viewports rather than scrolling.
- `.films-sort-chip` — sharp corners, `2px solid var(--void)` border, `var(--bone)` fill, `var(--void)` text, `padding: 10px 14px`, `font-family: var(--font-ui)`, `font-size: 12px`, `text-transform: uppercase`, `letter-spacing: 0.14em`, `font-weight: 700`. Mirrors the `.btn` typography family.
- `.films-sort-chip[aria-selected="true"]` — `background: var(--accent)`, `color: var(--void)`, `box-shadow: 4px 4px 0 var(--void)`. Offset shadow direction varies from the search bar's pink-on-bone to keep surface-shadow language unmistakable per surface.
- `.films-sort-chip:focus-visible` — `outline: 3px solid var(--accent); outline-offset: 2px;` matching existing `.btn` focus treatment.

### Page wiring

`app/app/films/page.tsx`:
- Drop the `<div className="eyebrow">Chapter II · The Archive</div>` line entirely (next section).
- Remove the `<FilmsSortSelect …>` call from the meta row's right edge.
- Insert `<FilmsSortChips currentSort={sort} currentQ={q} />` as its own row above the grid, between the meta row and the `films.length === 0 ?` ternary.
- Update import: `FilmsSortSelect` → `FilmsSortChips`.

## Section 2 — Eyebrow removal

Single change in `app/app/films/page.tsx`: delete the `<div className="eyebrow">Chapter II · The Archive</div>` element. The `.eyebrow` CSS class itself stays in `globals.css` as a typographic primitive for future use.

Visual consequence: the bone hero zone shrinks by another ~24–28px, putting it at ~80–90px tall on desktop — closer to a true masthead than a chapter-page intro. Combined with the recent hotfix compression, the h1 "Every Film, *Indexed*." becomes the first thing the eye lands on.

## Section 3 — PWA: manifest + icons + iOS meta

### Source asset

`app/public/icons/source.png` — the goblin-skull glyph (hot pink halftone skull on bone, pointed ears, fangs). Provided pre-implementation by the user at ≥1024×1024. Single source-of-truth for all derived sizes.

### Derived icon set (committed to git, generated once via `npx sharp-cli`)

| File                                     | Size       | Purpose |
|------------------------------------------|------------|---------|
| `app/public/icons/icon-192.png`          | 192×192    | Android home-screen + manifest |
| `app/public/icons/icon-512.png`          | 512×512    | Android splash + manifest |
| `app/public/icons/apple-touch-icon.png`  | 180×180    | iOS Add-to-Home-Screen |
| `app/public/icons/favicon-32.png`        | 32×32      | Browser tab |
| `app/public/icons/favicon-16.png`        | 16×16      | Browser tab (small) |
| `app/public/favicon.ico`                 | 32+16 multi-res | Legacy fallback |

Derived icons preserve the bone background and pink halftone skull as-is — no recolor, no padding adjustment. The square crop is what `source.png` already is.

### Manifest

`app/app/manifest.ts` — Next 15's typed manifest route handler (not a static `manifest.json`):

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Film Goblin",
    short_name: "Film Goblin",
    description: "Hunt price drops on Apple TV movies. Join the coven.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F3ECD8",  // bone — matches the icon's bg, no flash on launch
    theme_color: "#0A0A0A",        // void — matches the chrome
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

The 512 file is reused for `purpose: "maskable"` since the skull has comfortable margin in the source crop. If Android crops it badly later, we cut a dedicated maskable variant — YAGNI for now.

### Layout metadata

`app/app/layout.tsx` extends the existing `metadata` and `viewport` exports. No raw `<meta>` tags — Next 15 emits them.

```ts
export const metadata: Metadata = {
  title: "Film Goblin — A Field Guide To Cheap Movies",
  description: "Hunt price drops on Apple TV movies. Join the coven.",
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    title: "Film Goblin",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};
```

`statusBarStyle: "black-translucent"` lets content extend behind the iOS notch in standalone mode, which the recent hotfix already wired via `viewportFit: "cover"` + 100dvh — comes "free."

## File map

| Action | Path |
|--------|------|
| Create | `app/app/films/FilmsSortChips.tsx` |
| Delete | `app/app/films/FilmsSortSelect.tsx` |
| Modify | `app/app/films/page.tsx` |
| Modify | `app/app/globals.css` |
| Create | `app/app/manifest.ts` |
| Modify | `app/app/layout.tsx` |
| Create | `app/public/icons/source.png` |
| Create | `app/public/icons/icon-192.png` |
| Create | `app/public/icons/icon-512.png` |
| Create | `app/public/icons/apple-touch-icon.png` |
| Create | `app/public/icons/favicon-32.png` |
| Create | `app/public/icons/favicon-16.png` |
| Create | `app/public/favicon.ico` |

13 file changes. Zero migrations. No permanent npm dependency added (`sharp-cli` runs once via `npx`).

## Testing

No new automated tests. The chip component is a ~50-line URL-rewriter; the manifest + icons are static assets. Adding tests would be ceremony.

**Gates:**
- `cd app && npm run typecheck` — must pass.
- Manual /films verification: 4 chips render, each updates the URL correctly, default chip strips `?sort=` from URL, `?q=` preserved across chip clicks, pagination resets on chip switch.
- View page source on `/` — `<link rel="apple-touch-icon">`, `<link rel="manifest">`, `<meta name="theme-color">` all present.
- `/manifest.webmanifest` — returns valid JSON with the goblin icons.
- `curl -I` on each `/icons/*.png` and `/favicon.ico` — 200.
- iOS Safari post-deploy: Add film-goblin.vercel.app to home screen, verify icon is goblin skull, app opens standalone (no Safari chrome), notch handled correctly.

## Implementation slicing (preview for plan)

Four tasks, suitable for inline execution rather than subagent-driven (no DB, no review-gated complexity):

1. **Chip component + CSS + page swap + eyebrow removal.** All client-only UI. Verify with typecheck + manual /films load.
2. **Drop `source.png` + generate icon set.** One-shot `npx sharp-cli` script. Commit all 7 generated assets.
3. **`manifest.ts` + layout metadata extension.** Verify `/manifest.webmanifest` returns expected JSON.
4. **Manual smoke + deploy + iOS install verification.**

The exact step-by-step lands in the plan doc.
