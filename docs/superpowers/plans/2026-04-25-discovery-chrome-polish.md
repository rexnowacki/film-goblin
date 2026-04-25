# Discovery Chrome Polish (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/films` sort `<select>` with a 4-chip row, drop the "Chapter II · The Archive" eyebrow, and add a bare-minimum installable PWA shell (manifest + iOS meta + 7 derived icons from a goblin-skull source glyph).

**Architecture:** Pure UI work in `app/` plus static assets in `app/public/icons/`. No DB, no migrations, no server actions. The chip component mirrors the URL semantics of the deleted `FilmsSortSelect`. Icons are generated once from `source.png` via a committed Node script using `sharp` + `png-to-ico` invoked via `npx`.

**Tech Stack:** Next.js 15 App Router, TypeScript, `next/navigation` for client-side URL updates, `sharp` (one-shot icon resize), `png-to-ico` (one-shot ICO generation), Next 15's `MetadataRoute.Manifest` for typed manifest output.

**Spec:** `docs/superpowers/specs/2026-04-25-discovery-chrome-polish-design.md` (commit `a0d9823`).

**Note on testing:** This sub-project has no automated tests. The chip component is a ~50-line URL-rewriter that mirrors the existing `FilmsSortSelect` (which had no tests either); the manifest + icons are static assets. Each task ends with concrete manual gates (typecheck + curl + visual check) instead of unit tests. The plan steps below replace "write failing test" with "verify the gate fails" and "implement", "verify the gate passes" — same TDD-shape, just the gate is a typecheck or HTTP probe instead of `vitest`.

---

## Task 1: Chip component + CSS + page swap + eyebrow removal

**Files:**
- Create: `app/app/films/FilmsSortChips.tsx`
- Delete: `app/app/films/FilmsSortSelect.tsx`
- Modify: `app/app/films/page.tsx`
- Modify: `app/app/globals.css` (append CSS rules at end of file)

- [ ] **Step 1: Verify the gate fails (chips don't exist)**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: PASS (current state is clean — this is the baseline before changes). Then visually confirm at `npm run dev` → http://localhost:3000/films that you see a `<select>` dropdown labeled "Sort" and an eyebrow "Chapter II · The Archive". Those are what we're replacing.

- [ ] **Step 2: Create `FilmsSortChips.tsx`**

Create `app/app/films/FilmsSortChips.tsx` with the following content:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import type { FilmsSort } from "@/lib/queries/films";

interface Props {
  currentSort: FilmsSort;
  currentQ: string;
}

const CHIPS: { value: FilmsSort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "price_low", label: "Lowest price" },
  { value: "watchlisted", label: "Most watchlisted" },
  { value: "release", label: "Release year" },
];

export default function FilmsSortChips({ currentSort, currentQ }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // If currentSort is one of the dropped values (title, price_high), no chip
  // is selected; the first chip becomes the tab-stop so the row is reachable.
  const selectedIndex = CHIPS.findIndex(c => c.value === currentSort);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function selectChip(value: FilmsSort) {
    const p = new URLSearchParams(params);
    if (value === "added") p.delete("sort"); else p.set("sort", value);
    if (currentQ) p.set("q", currentQ); else p.delete("q");
    p.delete("page");
    const s = p.toString();
    router.push(s ? `/films?${s}` : "/films");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = e.key === "ArrowRight"
      ? (idx + 1) % CHIPS.length
      : (idx - 1 + CHIPS.length) % CHIPS.length;
    chipRefs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Sort films" className="films-sort-chips">
      {CHIPS.map((chip, idx) => {
        const isSelected = chip.value === currentSort;
        return (
          <button
            key={chip.value}
            ref={el => { chipRefs.current[idx] = el; }}
            role="tab"
            type="button"
            aria-selected={isSelected}
            tabIndex={idx === tabStopIndex ? 0 : -1}
            onClick={() => selectChip(chip.value)}
            onKeyDown={e => onKeyDown(e, idx)}
            className="films-sort-chip"
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Append chip CSS to `globals.css`**

Open `app/app/globals.css` and append the following at the end of the file (after the last existing rule):

```css
/* ---------- /films sort chips ---------- */
.films-sort-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}
.films-sort-chip {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 10px 14px;
  background: var(--bone);
  color: var(--void);
  border: 2px solid var(--void);
  cursor: pointer;
}
.films-sort-chip[aria-selected="true"] {
  background: var(--accent);
  color: var(--void);
  box-shadow: 4px 4px 0 var(--void);
}
.films-sort-chip:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Swap the import in `films/page.tsx`**

In `app/app/films/page.tsx`, find:

```tsx
import FilmsSortSelect from "./FilmsSortSelect";
```

Replace with:

```tsx
import FilmsSortChips from "./FilmsSortChips";
```

- [ ] **Step 5: Drop the eyebrow div**

In `app/app/films/page.tsx`, find:

```tsx
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>Chapter II · The Archive</div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
```

Replace with:

```tsx
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
```

- [ ] **Step 6: Move sort component out of meta row, render chips above the grid**

In `app/app/films/page.tsx`, find:

```tsx
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
              {total} {total === 1 ? "film" : "films"}{q ? ` matching "${q}"` : ""}
            </div>
            <FilmsSortSelect currentSort={sort} currentQ={q} />
          </div>
```

Replace with:

```tsx
          <FilmsSortChips currentSort={sort} currentQ={q} />
          <div style={{ marginBottom: 20, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
            {total} {total === 1 ? "film" : "films"}{q ? ` matching "${q}"` : ""}
          </div>
```

- [ ] **Step 7: Delete the old `FilmsSortSelect.tsx`**

```bash
rm app/app/films/FilmsSortSelect.tsx
```

- [ ] **Step 8: Run typecheck — must pass**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: PASS, no errors. If `FilmsSort` import path is wrong or chip props mismatch, fix here.

- [ ] **Step 9: Manual /films smoke**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

In a browser at http://localhost:3000/films, verify:
1. No "Chapter II · The Archive" eyebrow above the h1.
2. A row of 4 chips renders above the grid: `Recently added`, `Lowest price`, `Most watchlisted`, `Release year`.
3. `Recently added` is the highlighted (accent-filled, offset-shadow) chip on first load — URL is `/films` with no `?sort=`.
4. Click `Lowest price` → URL becomes `/films?sort=price_low`, chip highlight moves, grid re-orders by price.
5. With `?q=blade` in URL, click any chip — `q=blade` is preserved and `page` param is dropped.
6. Tab into the chip row from the search bar → focus lands on the selected chip; Arrow-Right moves focus to the next chip without changing the selection; Enter activates.

Stop the dev server with Ctrl-C.

- [ ] **Step 10: Commit Task 1**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(/films): chip-row sort + drop Chapter II eyebrow

Replaces the FilmsSortSelect dropdown with a 4-chip row using ARIA
tablist semantics + roving tabindex. Curated set: Recently added (default,
omits ?sort= from URL) / Lowest price / Most watchlisted / Release year.
Alphabetical and Highest price stay valid in the FilmsSort type so deep
links keep working server-side, just unselectable from the chip UI.

Drops the "Chapter II · The Archive" eyebrow — the chapter framing
follow-through was killed at design time, not relocated. The .eyebrow
class itself stays in globals.css for other potential uses.

Chips render above the grid as their own row; the film count line stays
on its own row beneath. Visual: bone fill / void border default; accent
fill + 4px void offset shadow on selected. Focus outline matches existing
.btn family.
EOF
git add app/app/films/FilmsSortChips.tsx app/app/films/page.tsx app/app/globals.css
git rm app/app/films/FilmsSortSelect.tsx
git commit -F /tmp/msg.txt
```

---

## Task 2: Drop `source.png` + generate icon set

**Files:**
- Create: `app/public/icons/source.png` (user-supplied)
- Create: `app/scripts/generate-icons.mjs`
- Create: `app/public/icons/icon-192.png` (generated)
- Create: `app/public/icons/icon-512.png` (generated)
- Create: `app/public/icons/apple-touch-icon.png` (generated)
- Create: `app/public/icons/favicon-32.png` (generated)
- Create: `app/public/icons/favicon-16.png` (generated)
- Create: `app/public/favicon.ico` (generated)

- [ ] **Step 1: Drop the source glyph**

Save the goblin-skull glyph (provided by the user during brainstorming, hot pink halftone skull on bone background, ≥1024×1024) to `app/public/icons/source.png`. Verify:

```bash
mkdir -p /home/cthulhulemon/film_goblin/app/public/icons
ls -la /home/cthulhulemon/film_goblin/app/public/icons/source.png
file /home/cthulhulemon/film_goblin/app/public/icons/source.png
```

Expected: file exists, type is "PNG image data", dimensions ≥ 1024×1024 (visible in the `file` output).

- [ ] **Step 2: Create the icon generation script**

Create `app/scripts/generate-icons.mjs`:

```js
// One-shot icon generator. Run via:
//   cd app && npx --yes -p sharp -p png-to-ico -- node scripts/generate-icons.mjs
// Reads public/icons/source.png and writes the derived PNG set + favicon.ico.
// Re-run if you swap source.png. Output is committed to git.

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "public/icons/source.png";

const sizes = [
  { out: "public/icons/icon-192.png", size: 192 },
  { out: "public/icons/icon-512.png", size: 512 },
  { out: "public/icons/apple-touch-icon.png", size: 180 },
  { out: "public/icons/favicon-32.png", size: 32 },
  { out: "public/icons/favicon-16.png", size: 16 },
];

for (const { out, size } of sizes) {
  await sharp(SRC).resize(size, size, { fit: "cover" }).png().toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}

// favicon.ico — multi-resolution (32 + 16) ICO
const ico = await pngToIco([
  readFileSync("public/icons/favicon-32.png"),
  readFileSync("public/icons/favicon-16.png"),
]);
writeFileSync("public/favicon.ico", ico);
console.log("wrote public/favicon.ico (32+16 multi-res)");
```

- [ ] **Step 3: Run the generator**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx --yes -p sharp -p png-to-ico -- node scripts/generate-icons.mjs
```

Expected output:
```
wrote public/icons/icon-192.png (192x192)
wrote public/icons/icon-512.png (512x512)
wrote public/icons/apple-touch-icon.png (180x180)
wrote public/icons/favicon-32.png (32x32)
wrote public/icons/favicon-16.png (16x16)
wrote public/favicon.ico (32+16 multi-res)
```

- [ ] **Step 4: Verify the outputs exist and are valid PNGs/ICO**

```bash
ls -la /home/cthulhulemon/film_goblin/app/public/icons/ /home/cthulhulemon/film_goblin/app/public/favicon.ico
file /home/cthulhulemon/film_goblin/app/public/icons/icon-192.png /home/cthulhulemon/film_goblin/app/public/icons/icon-512.png /home/cthulhulemon/film_goblin/app/public/icons/apple-touch-icon.png /home/cthulhulemon/film_goblin/app/public/icons/favicon-32.png /home/cthulhulemon/film_goblin/app/public/icons/favicon-16.png /home/cthulhulemon/film_goblin/app/public/favicon.ico
```

Expected: all 7 files exist; PNGs report correct dimensions; favicon.ico reports "MS Windows icon resource".

- [ ] **Step 5: Visual sanity check**

Open `app/public/icons/icon-512.png` and `app/public/icons/icon-192.png` in an image viewer. The skull should be cleanly resized without distortion or background bleed. The bone background should be intact.

If the skull looks cropped/squished, re-export `source.png` at a square aspect ratio (the existing `fit: "cover"` in sharp will center-crop non-square sources, which is fine for slight aspect mismatches but bad for landscape sources).

- [ ] **Step 6: Commit Task 2**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(pwa): icon set generated from goblin source glyph

Adds app/public/icons/source.png (hot pink halftone goblin skull on bone,
matching var(--accent) and var(--bone) tokens) plus 5 derived PNGs
(192/512 for manifest, 180 for apple-touch-icon, 32/16 for favicons) and
a multi-res favicon.ico. All generated by the new committed script
app/scripts/generate-icons.mjs which uses sharp + png-to-ico via npx —
no permanent npm dependency added. Re-run the script after swapping
source.png to regenerate.
EOF
git add app/public/ app/scripts/generate-icons.mjs
git commit -F /tmp/msg.txt
```

---

## Task 3: `manifest.ts` + layout metadata extension

**Files:**
- Create: `app/app/manifest.ts`
- Modify: `app/app/layout.tsx`

- [ ] **Step 1: Create the manifest route**

Create `app/app/manifest.ts`:

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
    background_color: "#F3ECD8",
    theme_color: "#0A0A0A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 2: Extend `metadata` and `viewport` in `layout.tsx`**

In `app/app/layout.tsx`, find:

```tsx
export const metadata: Metadata = {
  title: "Film Goblin — A Field Guide To Cheap Movies",
  description: "Hunt price drops on Apple TV movies. Join the coven.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
```

Replace with:

```tsx
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

- [ ] **Step 3: Run typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: PASS. If `appleWebApp` or `viewportFit` types fail, the `next` package version may be older than expected — check `app/package.json` shows `"next": "^15"` and re-run `npm install` if needed.

- [ ] **Step 4: Verify the manifest endpoint locally**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3000/manifest.webmanifest | head -40
```

Expected: a JSON document containing `"name": "Film Goblin"`, `"display": "standalone"`, `"theme_color": "#0A0A0A"`, and the 3 icon entries.

- [ ] **Step 5: Verify icon assets serve at the right paths**

```bash
for path in /favicon.ico /icons/favicon-16.png /icons/favicon-32.png /icons/apple-touch-icon.png /icons/icon-192.png /icons/icon-512.png; do
  echo -n "$path → "
  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3000$path"
done
```

Expected: every line ends in `200 image/png` or `200 image/x-icon` / `200 image/vnd.microsoft.icon`.

- [ ] **Step 6: Verify HTML head emits the right tags**

```bash
curl -s http://localhost:3000/ | grep -E '(manifest|apple-touch|theme-color|apple-mobile)' | head -10
```

Expected: lines containing
- `<link rel="manifest" href="/manifest.webmanifest"` (Next emits the canonical extension)
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"`
- `<meta name="theme-color" content="#0A0A0A"`
- `<meta name="apple-mobile-web-app-capable" content="yes"`
- `<meta name="apple-mobile-web-app-title" content="Film Goblin"`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"`

Stop the dev server with Ctrl-C.

- [ ] **Step 7: Commit Task 3**

```bash
cd /home/cthulhulemon/film_goblin
cat > /tmp/msg.txt <<'EOF'
feat(pwa): manifest.ts + layout metadata

Adds app/app/manifest.ts as Next 15's typed manifest route handler
(name, short_name, display:standalone, void theme_color, bone bg) and
extends app/app/layout.tsx's metadata + viewport exports with favicon
links, apple-touch-icon, appleWebApp config (capable, black-translucent
status bar), and themeColor on viewport. With the icon set from the
previous commit, iOS "Add to Home Screen" produces a properly-named,
properly-iconed standalone app and Android picks up the manifest for
installable PWA UI.
EOF
git add app/app/manifest.ts app/app/layout.tsx
git commit -F /tmp/msg.txt
```

---

## Task 4: Deploy + iOS install verification

**Files:** none (this task is verification + deploy only).

- [ ] **Step 1: Push to origin**

```bash
cd /home/cthulhulemon/film_goblin
git push origin master
```

Expected: 3 commits pushed (chips, icons, manifest).

- [ ] **Step 2: Deploy to production**

From the **repo root** (not `app/` — see CLAUDE.md Gotchas):

```bash
cd /home/cthulhulemon/film_goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes
```

Expected: `readyState: "READY"` in the deploy JSON, aliased to `https://film-goblin.vercel.app`. Should take ~50–60s.

- [ ] **Step 3: Smoke test the deployed manifest + icons**

```bash
curl -sI https://film-goblin.vercel.app/films | head -3
curl -s https://film-goblin.vercel.app/manifest.webmanifest | head -20
for path in /favicon.ico /icons/apple-touch-icon.png /icons/icon-192.png /icons/icon-512.png; do
  echo -n "$path → "
  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://film-goblin.vercel.app$path"
done
```

Expected: /films returns 200; manifest JSON contains `"name": "Film Goblin"`; all icon paths return 200 with image content types.

- [ ] **Step 4: iOS Safari install verification**

On a real iPhone (or iOS Simulator if available):

1. Open Safari → navigate to `https://film-goblin.vercel.app`.
2. Tap the share icon → "Add to Home Screen".
3. The default name should pre-fill as "Film Goblin"; the icon preview should show the goblin skull (not a generic Safari snapshot).
4. Add it. Tap the new home-screen icon.
5. The app should open in **standalone mode** — no Safari address bar, no bottom toolbar. Status bar should be `black-translucent` (content extends behind notch).
6. Verify `/films` chip row works correctly under the standalone chrome.
7. Reload by pulling down; layout should not shift the URL bar (it doesn't exist in standalone).

- [ ] **Step 5: Mark sub-project complete**

If all of Task 4's verification passed, B1 is done. Update the project memory snapshot if appropriate (the sub-project queue at `CLAUDE.md` "Sub-project history" should be edited to add B1 to the shipped list — but as a separate housekeeping commit, not part of this PR).

---

## Self-Review

**Spec coverage** (against `2026-04-25-discovery-chrome-polish-design.md`):
- Section 1 (chips): Task 1 covers component creation, CSS, page wiring, dropping `FilmsSortSelect`. ✓
- Section 2 (eyebrow): Task 1 Step 5 deletes the eyebrow div. ✓
- Section 3 (PWA): Task 2 covers source + derived icons; Task 3 covers manifest + layout metadata. ✓
- File map (13 files): all enumerated across Tasks 1-3. ✓
- Testing strategy (no automated tests, manual gates): Task 1 Step 9 covers /films manual smoke; Tasks 3-4 cover manifest + icon HTTP probes; Task 4 Step 4 covers iOS install. ✓
- Out-of-scope items: not implemented (correct). ✓

**Placeholder scan:** No TBDs, no "fill in details", no vague handwaves. Every code block is complete. Every command is exact. ✓

**Type consistency:**
- `FilmsSort` type is imported from `@/lib/queries/films` in the chip component — same path used by the deleted `FilmsSortSelect.tsx`. ✓
- Chip URL semantics (omit `?sort=` when `value === "added"`, preserve `q`, drop `page`) match exactly what the deleted select did post-hotfix. ✓
- `MetadataRoute.Manifest` and `Viewport` types are Next 15 standard exports; `themeColor` belongs on `viewport` (not `metadata`) per Next 14+ guidance. ✓
- `appleWebApp.statusBarStyle: "black-translucent"` is valid in `@types/next` for Next 15. ✓

**One spec deviation flagged:** the spec says "tablist semantics + roving tabindex" which I implemented literally, but a more idiomatic pattern for filter chips would be `role="group"` + `aria-pressed` toggle buttons. Sticking with the spec's tablist call since it's a contract; if the spec reviewer or implementation reviewer wants to flip it, that's a one-line change in `FilmsSortChips.tsx`.

No issues to fix.

---

## Implementation handoff

This plan is 4 tasks, ~20 min of work each, no DB, no review-gated complexity, no risky operations. Inline execution via `superpowers:executing-plans` is the natural fit — subagent dispatch overhead would dominate the actual implementation time. If sticking to the framework default, subagent-driven still works fine.
