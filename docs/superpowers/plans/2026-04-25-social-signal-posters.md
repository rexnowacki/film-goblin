# Social Signal on Posters — B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Global social-signal badges (👁 N eyeing, ✓ N watched) overlaid on the bottom-left corner of `/films` archive cards, plus a goblin-voice prose caption ("43 goblins are eyeing this · 12 have watched it") on the `/film/[id]` hero. Each badge hides when its own count is 0.

**Architecture:** One additive view extension (`films_with_stats.watcher_count` via correlated subquery on `watched`). `FilmPoster` gains two optional props that control corner-pill rendering. `/films` passes the counts; `/film/[id]` switches its read to the same `films_with_stats` row and renders an italic-serif caption. No new tables, RLS policies, server actions, or component test infra.

**Tech Stack:** Postgres 15 (Supabase), Next.js 15 App Router, Supabase SSR, vitest + pg-mem for the smoke gate.

**Spec:** `docs/superpowers/specs/2026-04-25-social-signal-posters-design.md` (commit `c4f24bb`).

---

## Task 1: Migration 0125 + pg-mem smoke

**Files:**
- Create: `db/migrations/0125_films_with_stats_watcher_count.sql`

This task lands the view extension. The pg-mem smoke helper auto-strips `CREATE VIEW`/`DROP VIEW` per the post-hygiene-sweep extension at `db/tests/helpers/pg-mem.ts`, so the file silently no-ops in the smoke run — but the smoke must keep passing as a "still green" check. There's no RLS test addition because no policies change.

- [ ] **Step 1: Verify the gate is green before touching anything**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10
```

Expected: 1 passed (the existing migration smoke). If anything is red, STOP — there's prior breakage to investigate before adding new work.

- [ ] **Step 2: Create the migration**

Create `db/migrations/0125_films_with_stats_watcher_count.sql` with this exact content:

```sql
-- B2: Extend films_with_stats with watcher_count for the social-signal badges
-- on /films Archive cards. Counts DISTINCT user_id from watched (one row per
-- watcher, not one per watch event — multiple rewatches of the same film by
-- the same user count as 1).
DROP VIEW IF EXISTS films_with_stats;
CREATE VIEW films_with_stats AS
SELECT
  f.id, f.itunes_id, f.title, f.director, f.year, f.runtime_min,
  f.genre_primary, f.description, f.content_advisory, f.artwork_url,
  f.itunes_url, f.tracking, f.available, f.first_seen_at,
  f.last_checked_at, f.last_priced_at,
  (SELECT count(*)::int FROM watchlists w WHERE w.film_id = f.id) AS watchlist_count,
  (SELECT count(*)::int FROM library l WHERE l.film_id = f.id) AS owned_count,
  (SELECT count(DISTINCT user_id)::int FROM watched WHERE film_id = f.id) AS watcher_count,
  (SELECT price_usd FROM price_history ph WHERE ph.film_id = f.id ORDER BY captured_at DESC LIMIT 1) AS latest_price
FROM films f;

GRANT SELECT ON films_with_stats TO anon, authenticated;
```

- [ ] **Step 3: Re-run the pg-mem smoke**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10
```

Expected: 1 passed. The smoke helper strips the CREATE/DROP VIEW statements before applying, so the new migration is a no-op there but the suite must remain green.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin
git add db/migrations/0125_films_with_stats_watcher_count.sql
git commit -m "feat(b2): 0125 films_with_stats.watcher_count"
```

If `git commit -m` mangles the message (the known heredoc gotcha), fall back to writing the message to `/tmp/msg-b2-task1.txt` via the Write tool, then `git commit -F /tmp/msg-b2-task1.txt`.

---

## Task 2: Apply migrations to prod + regenerate types

**Files:**
- Modify: `app/lib/supabase/types.ts` (regenerated, not hand-edited)

The migrate runner wraps each `.sql` in `BEGIN/COMMIT`. The `_migrations` tracking table makes re-runs idempotent. The `DATABASE_URL` in `app/.env.local` may point at the IPv6-only direct host (per the CLAUDE.md gotcha); if so, construct the pooler URL inline (the prior C2 task 3 followed the same workaround). The local `npm run gen:types` script targets a local Supabase that doesn't exist in this project — the established workaround is `npx supabase gen types typescript --db-url <pooler-url>`.

- [ ] **Step 1: Apply 0125 to prod Supabase**

```bash
cd /home/cthulhulemon/film_goblin/db
set -a; source ../app/.env.local; set +a
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

If this errors with `ENETUNREACH` or DNS failure, the direct host is unreachable from this machine. Read `passwords.txt` at the repo root for the pooler connection string + password, then re-run with the pooler URL substituted into `DATABASE_URL` for that single command. The prior C2 implementer's notes confirm this approach works.

Expected: output reports applying `0125_films_with_stats_watcher_count.sql` (1 new migration). Older migrations are skipped because they're already in `_migrations`.

- [ ] **Step 2: Verify migration landed**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query('SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC LIMIT 3');
  for (const row of r.rows) console.log(row.applied_at.toISOString(), row.name);
  await c.end();
})();
"
```

Expected: `0125_films_with_stats_watcher_count.sql` is the most recent entry, with a timestamp from this session. The two prior entries (`0124_watch_logged_trigger.sql`, `0123_watched.sql`) confirm we're operating on the same prod DB the C2 work touched.

- [ ] **Step 3: Regenerate types**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run gen:types 2>&1 | tail -10
```

If this fails because the Supabase CLI is targeting a non-existent local instance, fall back to:

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx supabase gen types typescript --db-url "$DATABASE_URL" > lib/supabase/types.ts
```

Expected: `app/lib/supabase/types.ts` updates. Confirm with:

```bash
grep -E "watcher_count" /home/cthulhulemon/film_goblin/app/lib/supabase/types.ts | head -5
```

Expected: at least one `watcher_count: number` line in the `films_with_stats` view's row type.

- [ ] **Step 4: Typecheck (sanity check — should be green; nothing references `watcher_count` yet)**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin
git add app/lib/supabase/types.ts
git commit -m "chore(b2): regenerated types after 0125 prod migration"
```

If the message mangles, use `Write` → `git commit -F /tmp/msg-b2-task2.txt`.

---

## Task 3: Extend `getFilms` + switch `getFilm` to the view

**Files:**
- Modify: `app/lib/queries/films.ts`

Two surgical changes to the existing read queries. `getFilms` already reads from `films_with_stats` — just add `watcher_count` to the select column list and the return-type shape. `getFilm` currently reads from `films` with `select("*")` — switch it to `films_with_stats` with an explicit column list that includes all fields the `/film/[id]` page consumes plus the two new aggregate columns.

The page consumes (per `app/app/film/[id]/page.tsx`): `id`, `title`, `director`, `year`, `runtime_min`, `genre_primary`, `description`, `itunes_url`, `artwork_url` (via `FilmPoster`), plus the new `watchlist_count` and `watcher_count`. The view also exposes `tracking`, `available`, `first_seen_at`, `last_checked_at`, `last_priced_at`, `latest_price`, `owned_count`, `itunes_id`, `content_advisory` — include them in the select to preserve any consumers that touch them (the page passes `film as any` to `FilmPoster`, so being permissive on the column list is safer than tight).

- [ ] **Step 1: Edit `getFilms` to include `watcher_count`**

In `/home/cthulhulemon/film_goblin/app/lib/queries/films.ts`, find the `getFilms` function. The `.select(...)` call currently looks like:

```ts
.select(
  "id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, latest_price, watchlist_count",
  { count: "exact" },
)
```

Replace with:

```ts
.select(
  "id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, latest_price, watchlist_count, watcher_count",
  { count: "exact" },
)
```

Also extend the return-type shape declared just above the function body. Find:

```ts
): Promise<{
  rows: Array<{
    id: string; itunes_id: number | null; title: string; director: string;
    year: number; runtime_min: number; genre_primary: string; artwork_url: string;
    latest_price: number | null; watchlist_count: number;
  }>;
  total: number;
  pageSize: number;
}> {
```

Replace with:

```ts
): Promise<{
  rows: Array<{
    id: string; itunes_id: number | null; title: string; director: string;
    year: number; runtime_min: number; genre_primary: string; artwork_url: string;
    latest_price: number | null; watchlist_count: number; watcher_count: number;
  }>;
  total: number;
  pageSize: number;
}> {
```

- [ ] **Step 2: Switch `getFilm` to read from `films_with_stats`**

In the same file, find the `getFilm` function. It currently reads:

```ts
export async function getFilm(client: Client, id: string) {
  const { data, error } = await client
    .from("films")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
```

Replace with:

```ts
export async function getFilm(client: Client, id: string) {
  const { data, error } = await client
    .from("films_with_stats")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available, first_seen_at, last_checked_at, last_priced_at, watchlist_count, owned_count, watcher_count, latest_price")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors. The page-level destructuring (`film.title`, `film.description`, etc.) on `/film/[id]/page.tsx` works against the view's row type because the view exposes the same column names as `films`.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin
git add app/lib/queries/films.ts
git commit -m "feat(b2): expose watcher_count + switch getFilm to films_with_stats"
```

If the message mangles, use `Write` → `git commit -F /tmp/msg-b2-task3.txt`.

---

## Task 4: FilmPoster badge props + render + CSS

**Files:**
- Modify: `app/components/FilmPoster.tsx`
- Modify: `app/app/globals.css`

`FilmPoster` already uses `position: relative` on its outer `<div>` (the existing image, halftone, and grain overlays stack with `position: absolute`). Adding an absolutely-positioned badge cluster just composes another layer.

The cluster has `pointer-events: none` so the badges don't intercept the parent `<Link>`'s tap-to-navigate.

- [ ] **Step 1: Extend the props interface**

In `/home/cthulhulemon/film_goblin/app/components/FilmPoster.tsx`, find:

```ts
interface FilmPosterProps {
  film: Film;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: React.CSSProperties;
}
```

Replace with:

```ts
interface FilmPosterProps {
  film: Film;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: React.CSSProperties;
  watchlistCount?: number;
  watcherCount?: number;
}
```

- [ ] **Step 2: Update the function signature to accept the new props with safe defaults**

Find:

```ts
export default function FilmPoster({ film, size = "md", className = "", style = {} }: FilmPosterProps) {
```

Replace with:

```ts
export default function FilmPoster({ film, size = "md", className = "", style = {}, watchlistCount = 0, watcherCount = 0 }: FilmPosterProps) {
```

- [ ] **Step 3: Add the badge cluster render block before the closing `</div>` of the outer poster wrapper**

The current file ends the JSX with `</div>}` (line 169) and then `</div>` (line 170) closing the outer wrapper. Find this block (the last conditional `!hasArt` block ending on line 169):

```tsx
      {!hasArt && <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        padding: s.w > 100 ? "10px 12px 12px" : "6px 6px 8px",
        background: film.titleBg || (size === "xs" || size === "sm" ? `linear-gradient(to top, ${bg} 70%, transparent)` : "none"),
      }}>
        <div style={{
          fontFamily: film.titleFont === "display" ? "var(--font-display)" : "var(--font-head)",
          fontSize: s.title,
          lineHeight: 0.96,
          color: fg,
          textTransform: film.case === "upper" ? "uppercase" : "none",
          letterSpacing: "-0.005em",
        }}>
          {film.title}
        </div>
        {s.year >= 10 && (
          <div style={{
            fontFamily: "var(--font-ui)",
            fontSize: s.year,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginTop: 4,
            opacity: 0.7,
          }}>
            {film.director || film.year}
          </div>
        )}
      </div>}
    </div>
  );
}
```

Insert the badge cluster between the `</div>}` and the outer `</div>` (i.e., right before the final `</div>` that closes the poster wrapper):

```tsx
      {!hasArt && <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        padding: s.w > 100 ? "10px 12px 12px" : "6px 6px 8px",
        background: film.titleBg || (size === "xs" || size === "sm" ? `linear-gradient(to top, ${bg} 70%, transparent)` : "none"),
      }}>
        <div style={{
          fontFamily: film.titleFont === "display" ? "var(--font-display)" : "var(--font-head)",
          fontSize: s.title,
          lineHeight: 0.96,
          color: fg,
          textTransform: film.case === "upper" ? "uppercase" : "none",
          letterSpacing: "-0.005em",
        }}>
          {film.title}
        </div>
        {s.year >= 10 && (
          <div style={{
            fontFamily: "var(--font-ui)",
            fontSize: s.year,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginTop: 4,
            opacity: 0.7,
          }}>
            {film.director || film.year}
          </div>
        )}
      </div>}

      {(watchlistCount > 0 || watcherCount > 0) && (
        <div className="film-poster-signals">
          {watchlistCount > 0 && (
            <span className="film-poster-signal" title={`${watchlistCount} on watchlists`}>
              👁 {watchlistCount > 99 ? "99+" : watchlistCount}
            </span>
          )}
          {watcherCount > 0 && (
            <span className="film-poster-signal" title={`${watcherCount} watched`}>
              ✓ {watcherCount > 99 ? "99+" : watcherCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Append the badge styles to `globals.css`**

In `/home/cthulhulemon/film_goblin/app/app/globals.css`, append the following at the end of the file (after the `.diary-row` block from C2 — anywhere at EOF is fine):

```css
.film-poster-signals {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  z-index: 2;
}
.film-poster-signal {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 3px 6px;
  background: var(--void);
  color: var(--bone);
  border: 1px solid var(--bone);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5
```

Expected: no errors. Existing call sites that don't pass the new props default to 0/0 and skip badge rendering — no breakage.

- [ ] **Step 6: Commit**

```bash
cd /home/cthulhulemon/film_goblin
git add app/components/FilmPoster.tsx app/app/globals.css
git commit -m "feat(b2): FilmPoster corner-pill badges + CSS"
```

If the message mangles, use `Write` → `git commit -F /tmp/msg-b2-task4.txt`.

---

## Task 5: Wire `/films` and `/film/[id]`

**Files:**
- Modify: `app/app/films/page.tsx`
- Modify: `app/app/film/[id]/page.tsx`

The badges need their counts passed in from the page level. `/films` already maps over rows from `getFilms` and renders `<FilmPoster film={f as never} … />` — just pass two more props per card. `/film/[id]` reads from `getFilm` (now extended in Task 3) and renders the new caption inside the existing hero text block.

- [ ] **Step 1: Pass counts on `/films`**

In `/home/cthulhulemon/film_goblin/app/app/films/page.tsx`, find the `<FilmPoster …>` invocation inside the `films.map` block (around line 74):

```tsx
<FilmPoster film={f as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
```

Replace with:

```tsx
<FilmPoster
  film={f as never}
  size="md"
  watchlistCount={f.watchlist_count}
  watcherCount={f.watcher_count}
  style={{ width: "100%", height: "auto", aspectRatio: "2/3" }}
/>
```

- [ ] **Step 2: Render the goblin-voice caption on `/film/[id]`**

In `/home/cthulhulemon/film_goblin/app/app/film/[id]/page.tsx`, find the existing description paragraph in the hero (around line 63):

```tsx
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.35, margin: "28px 0", maxWidth: 620 }}>
              "{film.description}"
            </p>
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
```

Insert the caption block BETWEEN the `</p>` of the description and the opening `<div className="hero-actions">`:

```tsx
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.35, margin: "28px 0", maxWidth: 620 }}>
              "{film.description}"
            </p>
            {(film.watchlist_count > 0 || film.watcher_count > 0) && (
              <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--muted)", margin: "0 0 18px" }}>
                {film.watchlist_count > 0 && (
                  <span><strong style={{ color: "var(--accent)" }}>{film.watchlist_count}</strong> goblin{film.watchlist_count === 1 ? " is" : "s are"} eyeing this</span>
                )}
                {film.watchlist_count > 0 && film.watcher_count > 0 && " · "}
                {film.watcher_count > 0 && (
                  <span><strong style={{ color: "var(--accent)" }}>{film.watcher_count}</strong> ha{film.watcher_count === 1 ? "s" : "ve"} watched it</span>
                )}
              </p>
            )}
            <div className="hero-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
```

Don't change anything else on the page.

- [ ] **Step 3: Typecheck**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -10
```

Expected: no errors. `f.watchlist_count` and `f.watcher_count` resolve via the extended `getFilms` return type. `film.watchlist_count` and `film.watcher_count` resolve via the extended `getFilm` return type (which now reads from the `films_with_stats` view).

- [ ] **Step 4: Visual verification via dev server**

```bash
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Open http://localhost:3000/films and verify:
- Films with both `watchlist_count > 0` and `watcher_count > 0` show TWO pills stacked vertically in the bottom-left corner (👁 first, ✓ below).
- Films with only one signal show ONE pill.
- Films with both at 0 show clean poster art (no overlay).
- Pills use bone-on-void styling, sit inside the 2:3 frame, don't block the link's tap target.
- Long counts cap at `99+` (won't see this in practice with current data; trust the JSX).

Open a film detail page (e.g. http://localhost:3000/film/<some-id> for a film with at least one count > 0) and verify:
- The italic-serif caption sits between the description and the action buttons.
- Both clauses appear when both > 0, joined with ` · `.
- Single clause when only one > 0.
- Whole caption hidden when both at 0.
- Singular vs plural agreement: "1 goblin is eyeing" vs "12 goblins are eyeing"; "1 has watched it" vs "12 have watched it".

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin
git add app/app/films/page.tsx app/app/film/[id]/page.tsx
git commit -m "feat(b2): wire badges on /films + goblin-voice caption on /film/[id]"
```

If the message mangles, use `Write` → `git commit -F /tmp/msg-b2-task5.txt`.

---

## Task 6: Final review + deploy + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

Final verification: run all tests + typecheck + build, deploy via Vercel, update the project docs to mark B2 shipped + collapse the queue to empty (no work left after this).

- [ ] **Step 1: Run the full app + db suites + typecheck + build**

```bash
cd /home/cthulhulemon/film_goblin/db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all 2>&1 | tail -10

cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test 2>&1 | tail -10

cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck 2>&1 | tail -5

cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build 2>&1 | tail -10
```

Expected: db pg-mem smoke passes; db RLS suite passes (~106 tests); app vitest is 0 failed (skipped count from env-blocked tests is fine); typecheck clean; build succeeds (no compile errors, prerender succeeds).

- [ ] **Step 2: Deploy to Vercel from the repo root**

Per the Vercel gotcha: deploy MUST run from the repo root (or worktree root, but this plan executes on master). Never from `app/`.

```bash
cd /home/cthulhulemon/film_goblin
ls -la .vercel/project.json && pwd
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes 2>&1 | tail -15
```

The path output must end in the repo root (`/home/cthulhulemon/film_goblin`), NOT `/app`. Expected: deploy succeeds; deploy URL appears in the output.

- [ ] **Step 3: Production smoke check**

Open https://film-goblin.vercel.app/films in a browser. Verify:
- The grid loads (200 OK).
- For films with non-zero `watchlist_count` or `watcher_count` (the C1/C2 work has seeded some), badges appear as expected.
- Film detail pages render the goblin-voice caption when counts > 0.

If anything is broken in prod that wasn't broken locally, capture the error from `npx vercel logs` and fix before continuing.

- [ ] **Step 4: Update CLAUDE.md "Current state" + sub-project history + queued sub-projects**

Edit `/home/cthulhulemon/film_goblin/CLAUDE.md`. Three changes:

a) Replace the "Current state" section's `**Last updated:**` / `**Last shipped:**` / `**Next up:**` / `**Open threads:**` blocks with:

```markdown
**Last updated:** 2026-04-25 (end of session that shipped B2)

**Last shipped:** B2 — Social signal on posters. Two corner-pill badges (👁 N eyeing, ✓ N watched) overlaid on `/films` Archive cards via additive props on `FilmPoster`; each badge hides when its own count is 0 so clean poster art stays clean. Goblin-voice caption ("43 goblins are eyeing this · 12 have watched it") on the `/film/[id]` hero. View extension `films_with_stats.watcher_count` (count DISTINCT user_id from watched). No new tables, RLS, or actions. Spec `2026-04-25-social-signal-posters-design.md`, plan `2026-04-25-social-signal-posters.md`. Migration 0125 applied to prod. Live at https://film-goblin.vercel.app/films.

**Next up:** Queue is empty. The Library / Watched / Social-signal trio (C1, C2, B2) is fully shipped. Future micro-projects on deck per the deferred lists in C2's spec and B2's spec — coven-overlap signals on profile pages, owned/review badges, year-in-review, ratings on diary, etc. Brainstorm the next pick when there's appetite.

**Open threads worth knowing about:**
- `passwords.txt` at repo root holds the Supabase prod pooler URL + password (gitignored). See the "Passwords scratchpad" auto-memory.
- B2 deferred: coven-scoped signals (future profile-page sub-project), owned + review badges (additive props on FilmPoster + view extensions), most-watched sort on `/films`, badges on other poster surfaces (`/library`, `/home` marquee, `/watched` strip), `/film/[id]` stat block beyond the single caption, compact unit display (1.2K, 12K) past 99+.
```

b) Append a row to the "Sub-project history" table (find row 14 for Watched Action C2):

```markdown
| 15 | Social signal on posters (B2) — `films_with_stats.watcher_count` view extension; `FilmPoster` opt-in `watchlistCount`/`watcherCount` props with corner-pill render; `/films` archive grid badges; `/film/[id]` hero goblin-voice caption | `2026-04-25-social-signal-posters-design.md` |
```

c) Replace the "Queued sub-projects" section. Currently it lists B2 only (after C2 shipped). After B2 ships, the queue is empty:

```markdown
## Queued sub-projects

The Library / Watched / Social-signal trio (C1, C2, B2) is shipped. No formally-locked next project. When ready, brainstorm a new sub-project from the deferred lists in C2's and B2's specs (coven-overlap signals on `/p/[handle]`, year-in-review on `/watched`, owned/review badges, etc.) or pick a fresh direction.

**Tier-zero hygiene:** Done 2026-04-25. pg-mem smoke fixed at the helper layer (not the migration), all action+admin test files retrofitted with `describe.skipIf`, `/watchlist` hero compressed to match `/films` + `/library`.
```

- [ ] **Step 5: Commit the docs update**

```bash
cd /home/cthulhulemon/film_goblin
git add CLAUDE.md
git commit -m "docs(claude.md): B2 shipped; queue is empty"
```

If the message mangles, use `Write` → `git commit -F /tmp/msg-b2-docs.txt`.

- [ ] **Step 6: Final verification**

```bash
cd /home/cthulhulemon/film_goblin
git log --oneline -10
git status --short
```

Expected: a clean chain of B2 commits ending with the docs update. Status shows only the pre-existing untracked items (`.claude/`, `film-goblin/`, `worker/hehe.txt`); nothing else.

B2 ships when this task completes.
