# Loft Showtimes + Shared Gazing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weekly-scrape The Loft Cinema's next-7-days showtimes, surface a "Now at The Loft" pill + showtimes bottom-sheet on film pages, and let a user share a specific showtime as a persisted "shared gazing" invite via the native share sheet with a poster OG card.

**Architecture:** A new `app/lib/theaters/showtimes/` module (parse → resolve datetime → filter to 7-day window → match to films → upsert) driven by a `CRON_SECRET`-guarded cron route, mirroring the existing coming-soon pipeline. Two new tables (`theater_showtimes`, `gazing_invites`). Film page gains a server query + pill + client `BottomSheet`. A server action mints a `gazing_invites` row (with snapshot fields); a public `/gazing/[token]` page + `/api/og/gazing/[token]` route render it, both using `serviceRoleClient()` to bypass RLS exactly like the existing film OG route.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + RLS), vitest, `next/og` `ImageResponse`, Web Share API. Node 20.

**Node 20 reminder:** prefix one-shot commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Run app commands from `app/`, migration commands from `db/`.

**Conventions confirmed from codebase:**
- Loft timezone is `America/Phoenix` (no DST → constant UTC−7).
- Films poster column is `films.artwork_url`; title `films.title`, year `films.year`.
- Production base URL in user-facing links is `https://freshfromthepit.com`.
- The Loft theater row already exists in `theaters` with `slug = 'loft-cinema'` (seeded in migration 0164).
- Public OG/landing surfaces use `serviceRoleClient()` (see `app/app/api/og/film/[id]/route.tsx`).

---

## File Structure

**Create:**
- `db/migrations/0197_loft_showtimes_gazing.sql` — two tables + RLS + indexes.
- `app/lib/theaters/showtimes/types.ts` — `ScrapedShowtime` + result types.
- `app/lib/theaters/showtimes/parse-loft-showtimes.ts` — HTML → `ScrapedShowtime[]`.
- `app/lib/theaters/showtimes/resolve-datetime.ts` — `"Fri 6/5 @ 8:30pm"` → ISO timestamptz (year inference).
- `app/lib/theaters/showtimes/filter-window.ts` — keep slots within `[now, now+7d)`.
- `app/lib/theaters/showtimes/match-showtimes.ts` — set `film_id` by title match.
- `app/lib/theaters/showtimes/upsert-showtimes.ts` — idempotent upsert + stale-inactivation.
- `app/lib/theaters/showtimes/scrape-loft-showtimes.ts` — orchestrator (fetch + parse + resolve + filter + upsert + match).
- `app/app/api/cron/refresh-showtimes/route.ts` — cron entrypoint.
- `app/lib/queries/showtimes.ts` — `getActiveShowtimesForFilm(client, filmId)`.
- `app/lib/actions/gazing.ts` — `createGazingInvite` server action.
- `app/components/ShowtimesSheet.tsx` — client pill + bottom sheet + share.
- `app/app/gazing/[token]/page.tsx` — public landing page.
- `app/app/api/og/gazing/[token]/route.tsx` — OG image.
- `app/styles/210-showtimes.css` — pill + sheet + gazing styling (imported via globals).
- Tests under `app/tests/theaters/showtimes/` and `app/tests/actions/`.

**Modify:**
- `app/app/film/[id]/page.tsx` — query showtimes, render `<ShowtimesSheet>`.
- `app/app/globals.css` — `@import "./styles/210-showtimes.css";`
- `app/lib/supabase/types.ts` — regenerated to include the two new tables.
- `CLAUDE.md` — add the manual-trigger note under "Open threads".

---

## Task 1: Migration — tables, RLS, indexes

**Files:**
- Create: `db/migrations/0197_loft_showtimes_gazing.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0197_loft_showtimes_gazing.sql
-- Individual showtime slots (datetime granularity) + shared-gazing invites.

CREATE TABLE theater_showtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  film_id UUID REFERENCES films(id) ON DELETE SET NULL,

  source_sid TEXT NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,

  starts_at TIMESTAMPTZ NOT NULL,
  screen_label TEXT,
  format_label TEXT,

  tickets_url TEXT NOT NULL,
  source_url TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (theater_id, source_sid)
);

CREATE INDEX theater_showtimes_film_active_idx
  ON theater_showtimes (film_id, is_active, starts_at);

CREATE TABLE gazing_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  showtime_id UUID REFERENCES theater_showtimes(id) ON DELETE SET NULL,
  film_id UUID REFERENCES films(id) ON DELETE SET NULL,

  -- Snapshot fields: frozen at creation so the page/OG render correctly
  -- even after the weekly refresh inactivates the underlying slot.
  film_title TEXT NOT NULL,
  poster_url TEXT,
  theater_name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  format_label TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX gazing_invites_created_by_idx ON gazing_invites (created_by);

ALTER TABLE theater_showtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gazing_invites ENABLE ROW LEVEL SECURITY;

-- Showtimes: authenticated users read active rows (parallels theater_showings).
CREATE POLICY theater_showtimes_read_active ON theater_showtimes
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

-- Gazing: the owner can read their own; inserts must be self-authored.
-- Public (anon) reads of the landing page go through serviceRoleClient(),
-- which bypasses RLS, so no anon SELECT policy is required.
CREATE POLICY gazing_invites_owner_read ON gazing_invites
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY gazing_invites_owner_insert ON gazing_invites
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

GRANT SELECT ON theater_showtimes TO authenticated;
GRANT SELECT, INSERT ON gazing_invites TO authenticated;
```

- [ ] **Step 2: Apply locally and smoke-test**

Run (from `db/`, with `DATABASE_URL` set):
```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: migration applies; pg-mem smoke test passes. If pg-mem chokes on a construct, add a skip per `db/CLAUDE.md`.

- [ ] **Step 3: RLS test**

Run (from `db/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls`
Expected: PASS (existing suite still green; new tables don't break it).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0197_loft_showtimes_gazing.sql
git commit -m "feat(db): theater_showtimes + gazing_invites tables (mig 0197)"
```

---

## Task 2: Regenerate Supabase types

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Regenerate against local Supabase**

Run (from `app/`, requires local Supabase running with the migration applied):
```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run gen:types
```
Expected: `types.ts` now contains `theater_showtimes` and `gazing_invites` Row/Insert/Update types.

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit (own PR-able commit — types.ts is hand-edited; keep isolated per root CLAUDE.md)**

```bash
git add app/lib/supabase/types.ts
git commit -m "chore(types): regen for theater_showtimes + gazing_invites"
```

---

## Task 3: Showtime types

**Files:**
- Create: `app/lib/theaters/showtimes/types.ts`

- [ ] **Step 1: Write the types**

```typescript
export interface ScrapedShowtime {
  sid: string;            // Loft data-sid — stable natural key
  title: string;         // raw data-title
  rawDate: string;       // e.g. "Fri 6/5 @ 8:30pm"
  screenLabel: string;   // e.g. "Screen 4", "Open Air Cinema"
  filmUrl: string;       // canonical Loft film page (tickets + source)
}

export interface ResolvedShowtime extends ScrapedShowtime {
  startsAt: string;          // ISO timestamptz
  formatLabel: string | null;
}

export interface ShowtimesRunSummary {
  scraped: number;
  inWindow: number;
  inserted: number;
  updated: number;
  staleMarkedInactive: number;
  matched: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/theaters/showtimes/types.ts
git commit -m "feat(showtimes): scraped/resolved showtime types"
```

---

## Task 4: Parse Loft showtimes HTML

**Files:**
- Create: `app/lib/theaters/showtimes/parse-loft-showtimes.ts`
- Test: `app/tests/theaters/showtimes/parse-loft-showtimes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseLoftShowtimes } from "@/lib/theaters/showtimes/parse-loft-showtimes";

const HTML = `
<div class="date-showings">
  <h3><a href="https://loftcinema.org/film/death-becomes-her/">Death Becomes Her</a></h3>
  <div class="date-collection-wrapper">
    <div class="date-collection active" data-date="700101">
      <div class="selectable-date  open-air-cinema" data-sid="630176" data-title="Death Becomes Her" data-date="Fri 6/5 @ 7:45pm" data-tickets="67">
        <div class="date-oval">7:45pm</div><p>Open Air Cinema\t</p>
      </div>
      <div class="selectable-date  screen-4" data-sid="630215" data-title="Death Becomes Her" data-date="Fri 6/5 @ 8:30pm" data-tickets="44">
        <div class="date-oval">8:30pm</div><p>Screen 4\t</p>
      </div>
    </div>
  </div>
</div>
<div class="date-showings">
  <h3><a href="https://loftcinema.org/film/close-encounters/">Close Encounters of the Third Kind in 70mm</a></h3>
  <div class="date-collection-wrapper">
    <div class="date-collection active" data-date="700101">
      <div class="selectable-date  screen-1" data-sid="640001" data-title="Close Encounters of the Third Kind in 70mm" data-date="Sat 6/7 @ 2:00pm" data-tickets="12">
        <div class="date-oval">2:00pm</div><p>Screen 1\t</p>
      </div>
    </div>
  </div>
</div>
`;

describe("parseLoftShowtimes", () => {
  it("extracts one row per selectable-date with sid, title, date, screen, film url", () => {
    const rows = parseLoftShowtimes(HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      sid: "630176",
      title: "Death Becomes Her",
      rawDate: "Fri 6/5 @ 7:45pm",
      screenLabel: "Open Air Cinema",
      filmUrl: "https://loftcinema.org/film/death-becomes-her/",
    });
    expect(rows[1].sid).toBe("630215");
    expect(rows[1].screenLabel).toBe("Screen 4");
  });

  it("associates each showtime with the film url of its enclosing block", () => {
    const rows = parseLoftShowtimes(HTML);
    expect(rows[2].filmUrl).toBe("https://loftcinema.org/film/close-encounters/");
    expect(rows[2].title).toBe("Close Encounters of the Third Kind in 70mm");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- parse-loft-showtimes`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
import type { ScrapedShowtime } from "./types";

const BLOCK_RE = /<div class="date-showings[\s\S]*?(?=<div class="date-showings|$)/g;
const FILM_LINK_RE = /<h3>\s*<a[^>]*href=["']([^"']+)["']/i;
const SLOT_RE =
  /<div class="selectable-date\b([^"]*)"[^>]*data-sid="([^"]*)"[^>]*data-title="([^"]*)"[^>]*data-date="([^"]*)"[\s\S]*?<p>([^<]*)<\/p>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#0?38;/g, "&")
    .trim();
}

export function parseLoftShowtimes(html: string): ScrapedShowtime[] {
  const out: ScrapedShowtime[] = [];
  const blocks = html.match(BLOCK_RE) ?? [];
  for (const block of blocks) {
    const filmUrl = block.match(FILM_LINK_RE)?.[1];
    if (!filmUrl) continue;
    SLOT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SLOT_RE.exec(block))) {
      const [, , sid, title, rawDate, screenRaw] = m;
      if (!sid || !rawDate) continue;
      out.push({
        sid,
        title: decodeEntities(title),
        rawDate: decodeEntities(rawDate),
        screenLabel: decodeEntities(screenRaw),
        filmUrl,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- parse-loft-showtimes`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/theaters/showtimes/parse-loft-showtimes.ts app/tests/theaters/showtimes/parse-loft-showtimes.test.ts
git commit -m "feat(showtimes): parse Loft showtimes HTML"
```

---

## Task 5: Resolve datetime (year inference)

**Files:**
- Create: `app/lib/theaters/showtimes/resolve-datetime.ts`
- Test: `app/tests/theaters/showtimes/resolve-datetime.test.ts`

The Loft is `America/Phoenix` — constant UTC−7, no DST — so we can build the ISO string with a literal `-07:00` offset. `data-date` gives weekday + M/D + time but no year; infer the year whose calendar puts that weekday on that date, at or after `now`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { resolveShowtimeDate, detectFormatLabel } from "@/lib/theaters/showtimes/resolve-datetime";

// 2026-06-03 is a Wednesday.
const now = new Date("2026-06-03T12:00:00Z");

describe("resolveShowtimeDate", () => {
  it("resolves a near-future slot to an ISO timestamp in Phoenix time (UTC-7)", () => {
    // Fri 6/5 8:30pm Phoenix = 2026-06-06T03:30:00Z
    expect(resolveShowtimeDate("Fri 6/5 @ 8:30pm", now)).toBe("2026-06-06T03:30:00.000Z");
  });

  it("handles am times and noon/midnight", () => {
    expect(resolveShowtimeDate("Sat 6/6 @ 11:00am", now)).toBe("2026-06-06T18:00:00.000Z");
    expect(resolveShowtimeDate("Sat 6/6 @ 12:00pm", now)).toBe("2026-06-06T19:00:00.000Z");
  });

  it("rolls to next year when the month/day already passed this year", () => {
    // Fri 1/1 in 2027 is a Friday; from June 2026 the next 1/1 is 2027.
    expect(resolveShowtimeDate("Fri 1/1 @ 7:00pm", now)).toBe("2027-01-02T02:00:00.000Z");
  });

  it("returns null when no nearby year matches the given weekday", () => {
    // 6/5 is a Friday in 2026; "Mon 6/5" matches no plausible year.
    expect(resolveShowtimeDate("Mon 6/5 @ 8:30pm", now)).toBeNull();
  });
});

describe("detectFormatLabel", () => {
  it("pulls a known format from title or screen", () => {
    expect(detectFormatLabel("Close Encounters in 70mm", "Screen 1")).toBe("70mm");
    expect(detectFormatLabel("Some Film", "Open Air Cinema")).toBe("Open Air Cinema");
    expect(detectFormatLabel("Plain Film", "Screen 4")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- resolve-datetime`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PHOENIX_OFFSET = "-07:00"; // Arizona, no DST

interface Parsed {
  weekday: string;
  month: number;
  day: number;
  hour24: number;
  minute: number;
}

function parseRawDate(raw: string): Parsed | null {
  const m = raw.match(/^([A-Za-z]{3})\s+(\d{1,2})\/(\d{1,2})\s+@\s+(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!m) return null;
  const [, wd, mo, da, hh, mm, ap] = m;
  let hour24 = Number(hh) % 12;
  if (ap.toLowerCase() === "pm") hour24 += 12;
  return { weekday: wd, month: Number(mo), day: Number(da), hour24, minute: Number(mm) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function resolveShowtimeDate(raw: string, now: Date): string | null {
  const p = parseRawDate(raw);
  if (!p) return null;
  const wantWeekday = p.weekday.slice(0, 3).toLowerCase();
  const baseYear = now.getUTCFullYear();
  for (const year of [baseYear, baseYear + 1]) {
    const iso = `${year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour24)}:${pad(p.minute)}:00.000${PHOENIX_OFFSET}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const actualWeekday = WEEKDAYS[
      new Date(`${year}-${pad(p.month)}-${pad(p.day)}T12:00:00.000${PHOENIX_OFFSET}`).getUTCDay()
    ].toLowerCase();
    if (actualWeekday !== wantWeekday) continue;
    // Accept slots from up to 1 day in the past (tz edge) through ~400 days out.
    const ageMs = d.getTime() - now.getTime();
    if (ageMs < -36 * 3600 * 1000) continue;
    if (ageMs > 400 * 24 * 3600 * 1000) continue;
    return d.toISOString();
  }
  return null;
}

const FORMAT_RE = /\b(70mm|35mm|16mm|imax|4k restoration|open air)\b/i;

export function detectFormatLabel(title: string, screenLabel: string): string | null {
  const fromTitle = title.match(FORMAT_RE);
  if (fromTitle) return fromTitle[1].replace(/imax/i, "IMAX").replace(/mm/i, "mm");
  if (/open air/i.test(screenLabel)) return screenLabel.trim();
  return null;
}
```

> Note on the weekday check: it computes the calendar weekday from the date alone (noon Phoenix to avoid any boundary ambiguity) and compares to the label. This is what disambiguates the year.

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- resolve-datetime`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/theaters/showtimes/resolve-datetime.ts app/tests/theaters/showtimes/resolve-datetime.test.ts
git commit -m "feat(showtimes): resolve data-date to timestamptz with year inference"
```

---

## Task 6: Filter to the 7-day window

**Files:**
- Create: `app/lib/theaters/showtimes/filter-window.ts`
- Test: `app/tests/theaters/showtimes/filter-window.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { withinWindow } from "@/lib/theaters/showtimes/filter-window";

const now = new Date("2026-06-03T12:00:00Z");

describe("withinWindow", () => {
  it("keeps slots from now through now+7 days, drops the rest", () => {
    expect(withinWindow("2026-06-03T13:00:00.000Z", now)).toBe(true);  // later today
    expect(withinWindow("2026-06-10T11:00:00.000Z", now)).toBe(true);  // < 7d
    expect(withinWindow("2026-06-10T13:00:00.000Z", now)).toBe(false); // > 7d
    expect(withinWindow("2026-06-03T11:00:00.000Z", now)).toBe(false); // already past
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- filter-window`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function withinWindow(startsAtIso: string, now: Date): boolean {
  const t = new Date(startsAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() && t < now.getTime() + WINDOW_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- filter-window`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/theaters/showtimes/filter-window.ts app/tests/theaters/showtimes/filter-window.test.ts
git commit -m "feat(showtimes): 7-day window filter"
```

---

## Task 7: Upsert showtimes (idempotent + stale-inactivation)

**Files:**
- Create: `app/lib/theaters/showtimes/upsert-showtimes.ts`
- Test: `app/tests/theaters/showtimes/upsert-showtimes.test.ts`

This mirrors `upsert-showings.ts`: upsert on `(theater_id, source_sid)`, then mark future-dated active rows absent from the latest scrape as inactive. The DB-coupled `upsertShowtimes` is exercised by the cron smoke test (Task 10); here we unit-test the two **pure helpers** it delegates to (`buildShowtimeRows`, `selectStaleIds`), which carry all the real logic.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildShowtimeRows, selectStaleIds } from "@/lib/theaters/showtimes/upsert-showtimes";
import type { ResolvedShowtime } from "@/lib/theaters/showtimes/types";

const now = new Date("2026-06-03T12:00:00Z");

const scraped: ResolvedShowtime[] = [
  { sid: "100", title: "Death Becomes Her", rawDate: "Fri 6/5 @ 8:30pm", screenLabel: "Screen 4", filmUrl: "https://loftcinema.org/film/death-becomes-her/", startsAt: "2026-06-06T03:30:00.000Z", formatLabel: "Open Air Cinema" },
];

describe("buildShowtimeRows", () => {
  it("maps a scraped showtime to a DB row keyed by source_sid", () => {
    const rows = buildShowtimeRows("loft-id", scraped);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      theater_id: "loft-id",
      source_sid: "100",
      title: "Death Becomes Her",
      normalized_title: "death becomes her",
      starts_at: "2026-06-06T03:30:00.000Z",
      screen_label: "Screen 4",
      format_label: "Open Air Cinema",
      tickets_url: "https://loftcinema.org/film/death-becomes-her/",
      source_url: "https://loftcinema.org/film/death-becomes-her/",
      is_active: true,
    });
  });
});

describe("selectStaleIds", () => {
  it("returns only future active rows absent from the latest scrape", () => {
    const existing = [
      { id: "gone-1", source_sid: "999", starts_at: "2026-06-07T02:00:00.000Z" }, // future, absent -> stale
      { id: "past-1", source_sid: "888", starts_at: "2026-06-01T02:00:00.000Z" }, // past, absent -> leave
      { id: "kept-1", source_sid: "100", starts_at: "2026-06-06T03:30:00.000Z" }, // present -> keep
    ];
    const keptSids = new Set(scraped.map((s) => s.sid));
    expect(selectStaleIds(existing, keptSids, now)).toEqual(["gone-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- upsert-showtimes`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ResolvedShowtime } from "./types";
import { normalizeTitle } from "../normalize-title";

type Client = SupabaseClient<Database>;

export interface UpsertShowtimesResult {
  inserted: number;
  updated: number;
  staleMarkedInactive: number;
  showtimeIds: string[];
  theaterName: string;
}

export function buildShowtimeRows(theaterId: string, scraped: ResolvedShowtime[]) {
  const nowIso = new Date().toISOString();
  return scraped.map((s) => ({
    theater_id: theaterId,
    source_sid: s.sid,
    title: s.title,
    normalized_title: normalizeTitle(s.title),
    starts_at: s.startsAt,
    screen_label: s.screenLabel || null,
    format_label: s.formatLabel,
    tickets_url: s.filmUrl,
    source_url: s.filmUrl,
    is_active: true,
    last_seen_at: nowIso,
    updated_at: nowIso,
  }));
}

export function selectStaleIds(
  existing: Array<{ id: string; source_sid: string; starts_at: string }>,
  keptSids: Set<string>,
  now: Date,
): string[] {
  return existing
    .filter((row) => !keptSids.has(row.source_sid))
    .filter((row) => new Date(row.starts_at).getTime() >= now.getTime())
    .map((row) => row.id);
}

export async function upsertShowtimes(
  client: Client,
  theaterSlug: string,
  scraped: ResolvedShowtime[],
  now: Date = new Date(),
): Promise<UpsertShowtimesResult> {
  const { data: theater, error: theaterErr } = await client
    .from("theaters")
    .select("id, name")
    .eq("slug", theaterSlug)
    .single();
  if (theaterErr) throw theaterErr;

  const rows = buildShowtimeRows(theater.id, scraped);
  let showtimeIds: string[] = [];
  if (rows.length > 0) {
    const { data, error } = await client
      .from("theater_showtimes")
      .upsert(rows, { onConflict: "theater_id,source_sid" })
      .select("id");
    if (error) throw error;
    showtimeIds = (data ?? []).map((r) => r.id);
  }

  const keptSids = new Set(scraped.map((s) => s.sid));
  const active = await client
    .from("theater_showtimes")
    .select("id, source_sid, starts_at")
    .eq("theater_id", theater.id)
    .eq("is_active", true);
  if (active.error) throw active.error;
  const staleIds = selectStaleIds(active.data ?? [], keptSids, now);
  if (staleIds.length > 0) {
    const { error } = await client
      .from("theater_showtimes")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", staleIds);
    if (error) throw error;
  }

  return {
    inserted: rows.length, // existing rows re-upsert idempotently; inserted is an upper bound for the digest
    updated: 0,
    staleMarkedInactive: staleIds.length,
    showtimeIds,
    theaterName: theater.name,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- upsert-showtimes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/theaters/showtimes/upsert-showtimes.ts app/tests/theaters/showtimes/upsert-showtimes.test.ts
git commit -m "feat(showtimes): idempotent upsert + stale inactivation"
```

---

## Task 8: Match showtimes to films

**Files:**
- Create: `app/lib/theaters/showtimes/match-showtimes.ts`
- Test: `app/tests/theaters/showtimes/match-showtimes.test.ts`

Loft showtime titles carry no year, so match by exact (case-insensitive) title, then by `normalizeTitle`. Set `film_id` only when exactly one film matches; otherwise leave `null`. Logic lives in a pure `chooseFilmId` helper for testability.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { chooseFilmId } from "@/lib/theaters/showtimes/match-showtimes";

const films = [
  { id: "f1", title: "Death Becomes Her", year: 1992 },
  { id: "f2", title: "The Substance", year: 2024 },
  { id: "f3", title: "Substance", year: 1999 },
];

describe("chooseFilmId", () => {
  it("matches on exact title (case-insensitive)", () => {
    expect(chooseFilmId("death becomes her", films)).toBe("f1");
  });

  it("matches on normalized title when exactly one film normalizes equal", () => {
    // "The Substance" normalizes to "substance"; so does "Substance" -> ambiguous -> null
    expect(chooseFilmId("The Substance", films)).toBe(null);
  });

  it("returns null when no film matches", () => {
    expect(chooseFilmId("Backrooms", films)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- match-showtimes`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizeTitle } from "../normalize-title";

type Client = SupabaseClient<Database>;

interface FilmRow { id: string; title: string; year: number | null }

export function chooseFilmId(title: string, films: FilmRow[]): string | null {
  const exact = films.filter((f) => f.title.toLowerCase() === title.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  const norm = normalizeTitle(title);
  const normMatches = films.filter((f) => normalizeTitle(f.title) === norm);
  if (normMatches.length === 1) return normMatches[0].id;
  return null;
}

/** Sets film_id on active, still-unmatched showtimes. Returns count matched. */
export async function matchShowtimes(client: Client): Promise<number> {
  const [showtimesRes, filmsRes] = await Promise.all([
    client.from("theater_showtimes").select("id, title, film_id").eq("is_active", true).is("film_id", null),
    client.from("films").select("id, title, year").eq("available", true),
  ]);
  if (showtimesRes.error) throw showtimesRes.error;
  if (filmsRes.error) throw filmsRes.error;
  const films = (filmsRes.data ?? []) as FilmRow[];

  let matched = 0;
  for (const st of showtimesRes.data ?? []) {
    const filmId = chooseFilmId(st.title, films);
    if (!filmId) continue;
    const { error } = await client.from("theater_showtimes").update({ film_id: filmId }).eq("id", st.id);
    if (error) throw error;
    matched++;
  }
  return matched;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- match-showtimes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/theaters/showtimes/match-showtimes.ts app/tests/theaters/showtimes/match-showtimes.test.ts
git commit -m "feat(showtimes): match showtimes to films by title"
```

---

## Task 9: Orchestrator — scrape Loft showtimes

**Files:**
- Create: `app/lib/theaters/showtimes/scrape-loft-showtimes.ts`

Pure glue; covered end-to-end by the cron smoke test in Task 10. No new unit test (each step is already tested).

- [ ] **Step 1: Write the implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { parseLoftShowtimes } from "./parse-loft-showtimes";
import { resolveShowtimeDate, detectFormatLabel } from "./resolve-datetime";
import { withinWindow } from "./filter-window";
import { upsertShowtimes } from "./upsert-showtimes";
import { matchShowtimes } from "./match-showtimes";
import type { ResolvedShowtime, ShowtimesRunSummary } from "./types";

type Client = SupabaseClient<Database>;

const SOURCE_URL = "https://loftcinema.org/showtimes/";

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "FilmGoblinBot/0.1 (+local-haunts)" },
    });
    if (!res.ok) throw new Error(`Loft showtimes fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLoftShowtimes(
  client: Client,
  now: Date = new Date(),
): Promise<ShowtimesRunSummary> {
  const html = await fetchText(SOURCE_URL);
  const scraped = parseLoftShowtimes(html);

  const resolved: ResolvedShowtime[] = [];
  for (const s of scraped) {
    const startsAt = resolveShowtimeDate(s.rawDate, now);
    if (!startsAt) continue;
    if (!withinWindow(startsAt, now)) continue;
    resolved.push({ ...s, startsAt, formatLabel: detectFormatLabel(s.title, s.screenLabel) });
  }

  const upserted = await upsertShowtimes(client, "loft-cinema", resolved, now);
  const matched = await matchShowtimes(client);

  return {
    scraped: scraped.length,
    inWindow: resolved.length,
    inserted: upserted.inserted,
    updated: upserted.updated,
    staleMarkedInactive: upserted.staleMarkedInactive,
    matched,
  };
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/theaters/showtimes/scrape-loft-showtimes.ts
git commit -m "feat(showtimes): Loft showtimes scrape orchestrator"
```

---

## Task 10: Cron route

**Files:**
- Create: `app/app/api/cron/refresh-showtimes/route.ts`

Mirrors `app/app/api/cron/theater-alerts/route.ts` exactly (auth, Sentry, lock, service-role client).

- [ ] **Step 1: Write the implementation**

```typescript
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/node";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { acquireCronLock } from "@/lib/theaters/lock";
import { runLoftShowtimes } from "@/lib/theaters/showtimes/scrape-loft-showtimes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  try {
    const supabase = serviceRoleClient();
    const locked = await acquireCronLock(supabase, "refresh-showtimes");
    if (!locked) {
      return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
    }
    const summary = await runLoftShowtimes(supabase);
    console.log("refresh-showtimes:", summary);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron refresh-showtimes failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke (local dev server)**

Run dev server (`npm run dev` from `app/`), then:
```bash
curl -s -H "Authorization: Bearer $(cat .cron-secret)" http://localhost:3000/api/cron/refresh-showtimes | head
```
Expected: `{"ok":true,"summary":{...}}` with non-zero `scraped`. (Requires local Supabase with migration + the seeded Loft theater row.)

- [ ] **Step 4: Commit**

```bash
git add app/app/api/cron/refresh-showtimes/route.ts
git commit -m "feat(showtimes): refresh-showtimes cron route"
```

---

## Task 11: Film-page showtimes query

**Files:**
- Create: `app/lib/queries/showtimes.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface FilmShowtime {
  id: string;
  starts_at: string;
  screen_label: string | null;
  format_label: string | null;
  tickets_url: string;
  theater_name: string;
}

/** Active, future showtimes for a film across all theaters, soonest first. */
export async function getActiveShowtimesForFilm(client: Client, filmId: string): Promise<FilmShowtime[]> {
  const { data, error } = await client
    .from("theater_showtimes")
    .select("id, starts_at, screen_label, format_label, tickets_url, theater:theaters(name)")
    .eq("film_id", filmId)
    .eq("is_active", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    screen_label: r.screen_label,
    format_label: r.format_label,
    tickets_url: r.tickets_url,
    theater_name: (r.theater as never as { name: string }).name,
  }));
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/lib/queries/showtimes.ts
git commit -m "feat(showtimes): film-page showtimes query"
```

---

## Task 12: createGazingInvite server action

**Files:**
- Create: `app/lib/actions/gazing.ts`
- Test: `app/tests/actions/gazing.test.ts`

Follows the `_private(client,…)` + public-wrapper pattern (see `app/lib/actions/library.ts`). The token generator is a pure helper covered by the test.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { generateGazingToken } from "@/lib/actions/gazing";

describe("generateGazingToken", () => {
  it("produces a url-safe token of stable length", () => {
    const a = generateGazingToken();
    const b = generateGazingToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- gazing`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
"use server";

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export function generateGazingToken(): string {
  return randomBytes(16).toString("base64url");
}

export interface CreateGazingResult {
  url: string;
}

export async function _createGazingInvite(client: Client, showtimeId: string): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client);

  // Load showtime + theater + film snapshot via service role (showtime is public-ish,
  // but we need theater name + film poster regardless of the caller's RLS view).
  const svc = serviceRoleClient();
  const { data: st, error: stErr } = await svc
    .from("theater_showtimes")
    .select("id, film_id, starts_at, format_label, theater:theaters(name), film:films(title, artwork_url)")
    .eq("id", showtimeId)
    .single();
  if (stErr) throw stErr;
  if (!st.film_id) throw new Error("Showtime is not matched to a film yet");

  const film = st.film as never as { title: string; artwork_url: string | null };
  const theater = st.theater as never as { name: string };
  const token = generateGazingToken();

  const { error: insErr } = await client.from("gazing_invites").insert({
    token,
    created_by: user.id,
    showtime_id: st.id,
    film_id: st.film_id,
    film_title: film.title,
    poster_url: film.artwork_url,
    theater_name: theater.name,
    starts_at: st.starts_at,
    format_label: st.format_label,
  });
  if (insErr) throw insErr;

  return { url: `https://freshfromthepit.com/gazing/${token}` };
}

export async function createGazingInvite(showtimeId: string): Promise<CreateGazingResult> {
  const supabase = await createClient();
  return _createGazingInvite(supabase, showtimeId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- gazing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/gazing.ts app/tests/actions/gazing.test.ts
git commit -m "feat(gazing): createGazingInvite server action"
```

---

## Task 13: Showtimes styling

**Files:**
- Create: `app/styles/210-showtimes.css`
- Modify: `app/app/globals.css`

- [ ] **Step 1: Write the CSS** (zine system — bone bg, 2px void borders, hard offset shadows, pink accent, rotations)

```css
/* ============================================================
   Showtimes pill + bottom sheet + gazing landing
   ============================================================ */

.showtimes-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--void);
  background: var(--accent);
  border: 2px solid var(--void);
  box-shadow: 3px 3px 0 var(--void);
  padding: 6px 11px;
  transform: rotate(-1.5deg);
  cursor: pointer;
}
.showtimes-pill:hover { transform: rotate(-1.5deg) translate(-1px, -1px); box-shadow: 4px 4px 0 var(--void); }

.showtimes-day { margin-top: 14px; }
.showtimes-day-hdr {
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700;
  color: var(--void);
  border-bottom: 1.5px dashed var(--muted);
  padding-bottom: 4px; margin-bottom: 10px;
}
.showtimes-slots { display: flex; flex-wrap: wrap; gap: 8px; }
.showtimes-slot {
  font-family: var(--font-mono); font-size: 13px; font-weight: 700;
  padding: 8px 12px; background: var(--bone); color: var(--void);
  border: 2px solid var(--void); box-shadow: 2px 2px 0 var(--void); cursor: pointer;
}
.showtimes-slot[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }
.showtimes-slot .fmt { display: block; font-size: 8px; letter-spacing: 0.1em; color: var(--muted-dark); }
.showtimes-share {
  margin-top: 16px; width: 100%; text-align: center;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700;
  color: var(--bone); background: var(--void);
  border: 2px solid var(--void); box-shadow: 3px 3px 0 var(--accent); padding: 12px;
}
.showtimes-share:disabled { opacity: 0.5; box-shadow: none; }

/* Gazing landing */
.gazing { max-width: 460px; margin: 0 auto; padding: 24px 18px 48px; }
.gazing-hero { text-align: center; border: 2px solid var(--void); box-shadow: 8px 8px 0 var(--void); background: var(--bone); padding: 22px 18px; }
.gazing-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; }
.gazing-eyebrow b { background: var(--accent); color: var(--accent-ink); border: 2px solid var(--void); padding: 2px 6px; display: inline-block; transform: rotate(-2deg); }
.gazing-poster { width: 150px; aspect-ratio: 2/3; object-fit: cover; border: 2px solid var(--void); box-shadow: 5px 5px 0 var(--void); transform: rotate(-2deg); margin: 18px auto; display: block; }
.gazing-flavor { font-family: var(--font-head); font-style: italic; font-size: 18px; }
.gazing-deets { margin-top: 16px; }
.gazing-deets .ti { font-family: var(--font-head); font-size: 26px; line-height: 1; }
.gazing-deets .ro { display: flex; gap: 8px; font-family: var(--font-mono); font-size: 13px; margin-top: 9px; }
.gazing-deets .k { color: var(--accent-deep); font-weight: 700; }
.gazing-cta { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
```

- [ ] **Step 2: Import it in globals**

Add to `app/app/globals.css` alongside the other `@import "./styles/...";` lines:
```css
@import "./styles/210-showtimes.css";
```

- [ ] **Step 3: Typecheck/build sanity**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build` (or `npm run dev` and load any page).
Expected: CSS compiles, no import error.

- [ ] **Step 4: Commit**

```bash
git add app/styles/210-showtimes.css app/app/globals.css
git commit -m "feat(showtimes): zine styling for pill, sheet, gazing page"
```

---

## Task 14: ShowtimesSheet component (pill + sheet + share)

**Files:**
- Create: `app/components/ShowtimesSheet.tsx`

Groups showtimes by Phoenix calendar day, renders the pill that opens the `BottomSheet`, lets the user pick a slot, then shares via `navigator.share` with a copy-link fallback.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useMemo, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import type { FilmShowtime } from "@/lib/queries/showtimes";
import { createGazingInvite } from "@/lib/actions/gazing";

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix", weekday: "short", month: "numeric", day: "numeric",
  }).format(new Date(iso)); // e.g. "Fri, 6/5"
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso)); // e.g. "8:30 PM"
}

interface Group { key: string; slots: FilmShowtime[] }

export default function ShowtimesSheet({ showtimes, filmTitle }: { showtimes: FilmShowtime[]; filmTitle: string }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const theaterName = showtimes[0]?.theater_name ?? "the theater";
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, FilmShowtime[]>();
    for (const s of showtimes) {
      const k = dayKey(s.starts_at);
      (map.get(k) ?? map.set(k, []).get(k)!).push(s);
    }
    return [...map.entries()].map(([key, slots]) => ({ key, slots }));
  }, [showtimes]);

  const selected = showtimes.find((s) => s.id === selectedId) ?? null;

  async function onShare() {
    if (!selected) return;
    setSharing(true);
    try {
      const { url } = await createGazingInvite(selected.id);
      const text = "a fellow goblin invites you to a shared gazing 👁";
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: filmTitle, text, url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        alert("Invite link copied to clipboard");
      }
    } catch {
      // user cancelled share sheet or share failed — no-op
    } finally {
      setSharing(false);
    }
  }

  if (showtimes.length === 0) return null;

  return (
    <>
      <button type="button" className="showtimes-pill" onClick={() => setOpen(true)}>
        ▸ Now at {theaterName}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Showtimes — ${filmTitle}`}>
        {groups.map((g) => (
          <div key={g.key} className="showtimes-day">
            <div className="showtimes-day-hdr">{g.key}</div>
            <div className="showtimes-slots">
              {g.slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="showtimes-slot"
                  aria-pressed={selectedId === s.id}
                  onClick={() => setSelectedId(s.id)}
                >
                  {timeLabel(s.starts_at)}
                  {s.format_label ? <span className="fmt">{s.format_label}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}

        <button type="button" className="showtimes-share" disabled={!selected || sharing} onClick={onShare}>
          {selected ? `👁 Invite a goblin to ${timeLabel(selected.starts_at)} →` : "Pick a showtime to invite a goblin"}
        </button>
      </BottomSheet>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/ShowtimesSheet.tsx
git commit -m "feat(showtimes): ShowtimesSheet pill + bottom sheet + share"
```

---

## Task 15: Wire pill into the film page

**Files:**
- Modify: `app/app/film/[id]/page.tsx`

- [ ] **Step 1: Add the import** (near the other component imports at the top)

```tsx
import ShowtimesSheet from "@/components/ShowtimesSheet";
import { getActiveShowtimesForFilm } from "@/lib/queries/showtimes";
```

- [ ] **Step 2: Fetch showtimes in the page body**

In `FilmDetailPage`, after the film is loaded and the supabase client (`createClient()`) is available, add:
```tsx
const showtimes = await getActiveShowtimesForFilm(supabase, film.id);
```
(Use the same `supabase` server client already created in the component; if it's named differently, match the existing variable.)

- [ ] **Step 3: Render the pill in the hero metadata area**

Place near the existing action buttons / metadata row (e.g. beside `ShareFilmButton`):
```tsx
{showtimes.length > 0 && <ShowtimesSheet showtimes={showtimes} filmTitle={film.title} />}
```

- [ ] **Step 4: Typecheck + visual check**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Then `npm run dev` and load a film that has showtimes (after running the cron locally). Expected: pill renders; clicking opens the sheet with grouped days; selecting a slot enables the share button.

- [ ] **Step 5: Commit**

```bash
git add "app/app/film/[id]/page.tsx"
git commit -m "feat(film): Now-at-The-Loft showtimes pill"
```

---

## Task 16: Gazing landing page

**Files:**
- Create: `app/app/gazing/[token]/page.tsx`

Public page (no auth gate). Reads the invite via `serviceRoleClient()` so logged-out friends can view it. Inviter name comes from the `profiles` row of `created_by`.

- [ ] **Step 1: Write the page**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function loadInvite(token: string) {
  const sb = serviceRoleClient();
  const { data } = await sb
    .from("gazing_invites")
    .select("token, created_by, film_id, film_title, poster_url, theater_name, starts_at, format_label")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const { data: profile } = await sb
    .from("profiles").select("username").eq("id", data.created_by).maybeSingle();
  return { ...data, inviter: profile?.username ?? "A fellow goblin" };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) return { title: "Shared Gazing — Film Goblin" };
  const ogUrl = `https://freshfromthepit.com/api/og/gazing/${token}`;
  return {
    title: `A shared gazing: ${invite.film_title} — Film Goblin`,
    description: "a fellow goblin invites you to a shared gazing",
    openGraph: { images: [{ url: ogUrl, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", images: [ogUrl] },
  };
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export default async function GazingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) notFound();

  return (
    <main className="gazing">
      <div className="gazing-hero">
        <div className="gazing-eyebrow">{invite.inviter} summons you to a<br /><b>SHARED GAZING</b></div>
        {invite.poster_url && <img className="gazing-poster" src={invite.poster_url} alt={invite.film_title} />}
        <p className="gazing-flavor">&ldquo;A fellow goblin invites you into the dark.&rdquo;</p>
      </div>

      <div className="gazing-deets">
        <div className="ti">{invite.film_title}</div>
        <div className="ro"><span className="k">WHEN</span> {when(invite.starts_at)}</div>
        <div className="ro"><span className="k">WHERE</span> {invite.theater_name}</div>
        {invite.format_label && <div className="ro"><span className="k">FORM</span> {invite.format_label}</div>}
      </div>

      <div className="gazing-cta">
        {invite.film_id && (
          <Link className="btn" href={`/film/${invite.film_id}`}>Answer the summons →</Link>
        )}
        <Link className="btn-outline" href="/auth/signup">Join the coven</Link>
      </div>
    </main>
  );
}
```

> The "Add to watchlist" CTA for logged-out friends routes through signup; once signed in they land on the film page where the existing watchlist action lives. This keeps the gazing page dependency-free of auth state. (`btn` / `btn-outline` are existing classes in `00-core.css`.)

- [ ] **Step 2: Confirm the gazing route is not blocked by auth middleware**

Check `app/middleware.ts` (or `app/proxy.ts`) for the public-path allowlist. If authenticated-only by default, add `/gazing` (and `/api/og/gazing`) to the public matcher so logged-out friends can view. Match the existing pattern used for `/invite` and `/auth`.

- [ ] **Step 3: Typecheck + manual check**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Then create an invite locally (select a slot → share triggers `createGazingInvite`) and open `/gazing/<token>` in a logged-out browser. Expected: page renders; unknown token → 404.

- [ ] **Step 4: Commit**

```bash
git add "app/app/gazing/[token]/page.tsx" app/middleware.ts
git commit -m "feat(gazing): public /gazing/[token] landing page"
```

---

## Task 17: Gazing OG image route

**Files:**
- Create: `app/app/api/og/gazing/[token]/route.tsx`

Mirrors `app/app/api/og/film/[id]/route.tsx` (same dark card, poster column, pink eyebrow) but labelled "SHARED GAZING" with showtime details.

- [ ] **Step 1: Write the route**

```tsx
import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function upscale(url: string): string {
  return url.replace(/\d+x\d+bb/, "600x900bb");
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = serviceRoleClient();
  const { data: invite } = await sb
    .from("gazing_invites")
    .select("film_title, poster_url, theater_name, starts_at, format_label")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#0A0A0A", alignItems: "center", justifyContent: "center", color: "#FF2D88", fontSize: 48, fontWeight: 800, fontFamily: "sans-serif" }}>
          FILM GOBLIN
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const poster = invite.poster_url ? upscale(invite.poster_url) : null;
  const metaParts = [when(invite.starts_at), invite.theater_name, invite.format_label].filter(Boolean);

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0A0A0A", color: "#F3ECD8", fontFamily: "sans-serif" }}>
        {poster && (
          <div style={{ display: "flex", width: 280, height: 630, flexShrink: 0, position: "relative" }}>
            <img src={poster} width={280} height={630} style={{ objectFit: "cover" }} alt="" />
            <div style={{ display: "flex", position: "absolute", top: 0, right: 0, bottom: 0, width: 100, background: "linear-gradient(to right, transparent, #0A0A0A)" }} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: poster ? "52px 60px 52px 36px" : "52px 60px", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: "#FF2D88", fontWeight: 700, marginBottom: 20 }}>
              Shared Gazing
            </div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.0, color: "#F3ECD8", marginBottom: 24 }}>
              {invite.film_title}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: "rgba(243,236,216,0.7)", letterSpacing: "0.04em" }}>
              {metaParts.join("  ·  ")}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: 19, fontStyle: "italic", color: "rgba(243,236,216,0.75)" }}>
              a fellow goblin invites you to a shared gazing
            </div>
            <div style={{ fontSize: 13, color: "rgba(243,236,216,0.35)", letterSpacing: "0.04em" }}>
              freshfromthepit.com
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
```

- [ ] **Step 2: Manual check**

Run dev server, open `http://localhost:3000/api/og/gazing/<token>` for a real token.
Expected: 1200×630 PNG with poster + "SHARED GAZING" + film/time/theater.

- [ ] **Step 3: Commit**

```bash
git add "app/app/api/og/gazing/[token]/route.tsx"
git commit -m "feat(gazing): OG image route for shared gazing"
```

---

## Task 18: Full test pass + docs note

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the whole app test suite**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test`
Expected: all green, including the new showtimes + gazing tests.

- [ ] **Step 2: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Add the manual-trigger note to CLAUDE.md "Open threads"**

Add a bullet mirroring the other dropped crons:
```markdown
- **Showtimes cron** — schedule dropped (Hobby cap). `curl -H "Authorization: Bearer $CRON_SECRET" https://film-goblin.vercel.app/api/cron/refresh-showtimes`. Scrapes Loft next-7-days showtimes into `theater_showtimes`; powers the "Now at The Loft" pill on `/film/[id]` and the `/gazing/[token]` share. Details: `docs/superpowers/specs/2026-06-03-loft-showtimes-shared-gazing-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: showtimes cron manual-trigger note"
```

---

## Production apply (after merge)

1. Apply migration to prod (from `db/`, env sourced per root CLAUDE.md):
   ```bash
   set -a; source app/.env.local; set +a
   cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
   ```
2. Deploy from repo root: `npx vercel deploy --prod --yes`.
3. Trigger the first scrape:
   ```bash
   curl -H "Authorization: Bearer $(cat .cron-secret)" https://film-goblin.vercel.app/api/cron/refresh-showtimes
   ```
4. Verify a currently-playing film's page shows the pill and the sheet lists this week's times.

---

## Notes / deferrals (from spec, do NOT build in v1)

- Cinemark / zip-code lookup; Guild showtimes; per-showtime `data-tickets` deep links; RSVP / "I'm in"; inviter avatar; map link; location-gated pill. These are explicitly out of scope.
