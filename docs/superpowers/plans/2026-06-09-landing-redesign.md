# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pre-login landing page (`app/app/page.tsx`) as a dark, social-first page with a real-activity feed card hero, per `docs/superpowers/specs/2026-06-09-landing-redesign-design.md`.

**Architecture:** Two new public read queries (`getLandingFeed` in a new `landing.ts` module; `getRecentlySummoned` in `films.ts`) cached via the existing `unstable_cache` + `serviceRoleClient()` pattern in `cached.ts`. A new server component `LandingFeedCard` renders the feed card. `page.tsx` is rewritten top-to-bottom; landing-specific CSS goes in a new `220-landing.css`.

**Tech Stack:** Next.js 15 App Router (server components only — no client JS), Supabase PostgREST, vitest with mocked client chains.

**Environment notes for the engineer:**
- Run all npm commands from `app/` with Node 20: prefix `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` (system default is Node 16; background bash calls don't share shell state).
- Branch `feature/landing-redesign` already exists with the spec committed. Work on it.
- Repo gotcha: don't use heredocs for commit messages. Plain `git commit -m "short message"` is fine.

---

### Task 1: `getLandingFeed` query

**Files:**
- Create: `app/lib/queries/landing.ts`
- Test: `app/tests/queries/landing.test.ts`

The query returns a discriminated-union row list for the landing feed card: recent activity rows (5 social kinds) enriched with actor + film, plus the most recent global price drop (≤14 days old) spliced in by timestamp. Rows with missing actor/film/recipient are dropped. No reactions/comments/viewer enrichment — this is intentionally much lighter than `getEnrichedActivity`.

- [ ] **Step 1: Write the failing test**

Create `app/tests/queries/landing.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getLandingFeed } from "@/lib/queries/landing";

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

function makeClient(opts: {
  activityRows?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  films?: Array<Record<string, unknown>>;
  alertRows?: Array<Record<string, unknown>>;
} = {}) {
  const fromCalls: string[] = [];
  const activityChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: opts.activityRows ?? [], error: null }),
  };
  const profilesChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: opts.profiles ?? [], error: null }),
  };
  const filmsChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: opts.films ?? [], error: null }),
  };
  const alertsChain: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: opts.alertRows ?? [], error: null }),
  };
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "activity") return activityChain;
      if (table === "profiles") return profilesChain;
      if (table === "films") return filmsChain;
      if (table === "price_alerts") return alertsChain;
      throw new Error(`unexpected table ${table}`);
    }),
  } as any;
  return { client, fromCalls, activityChain };
}

const actor = { id: "u1", username: "moss.witch", display_name: "Moss Witch", avatar_url: null };
const film = { id: "f1", title: "Possession", artwork_url: "http://x/p.jpg" };

describe("getLandingFeed — row shaping", () => {
  it("shapes a watch_logged row with actor and film", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(3 * MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
    });
    const rows = await getLandingFeed(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "watch_logged",
      actor: { username: "moss.witch" },
      film: { id: "f1", title: "Possession" },
    });
  });

  it("includes recipient on recommendation_sent and drops the row when recipient is missing", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "recommendation_sent", payload: { film_id: "f1", to_user_id: "u2" }, created_at: iso(MIN), actor_user_id: "u1" },
        { id: "a2", kind: "recommendation_sent", payload: { film_id: "f1", to_user_id: "ghost" }, created_at: iso(2 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor, { id: "u2", username: "vhs.ghoul", display_name: null, avatar_url: null }],
      films: [film],
    });
    const rows = await getLandingFeed(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "recommendation_sent", recipient: { username: "vhs.ghoul" } });
  });

  it("drops rows whose actor or film is missing", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "missing" },
        { id: "a2", kind: "watch_logged", payload: { film_id: "missing" }, created_at: iso(2 * MIN), actor_user_id: "u1" },
        { id: "a3", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(3 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor],
      films: [film],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.id)).toEqual(["a3"]);
  });

  it("respects the limit after filtering", async () => {
    const { client } = makeClient({
      activityRows: [1, 2, 3].map(n => ({
        id: `a${n}`, kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(n * MIN), actor_user_id: "u1",
      })),
      profiles: [actor],
      films: [film],
    });
    const rows = await getLandingFeed(client, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual(["a1", "a2"]);
  });
});

describe("getLandingFeed — price drop splice", () => {
  it("splices a fresh price alert into timestamp order with computed pctOff", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(1 * MIN), actor_user_id: "u1" },
        { id: "a2", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(60 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor],
      films: [film, { id: "f2", title: "Suspiria", artwork_url: null }],
      alertRows: [{ id: "pa1", film_id: "f2", old_price_usd: 9.99, new_price_usd: 4.99, created_at: iso(30 * MIN) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged", "price_drop", "watch_logged"]);
    const drop = rows[1] as Extract<(typeof rows)[number], { kind: "price_drop" }>;
    expect(drop.newPriceUsd).toBeCloseTo(4.99);
    expect(drop.pctOff).toBe(50);
    expect(drop.film.title).toBe("Suspiria");
  });

  it("ignores price alerts older than 14 days", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
      alertRows: [{ id: "pa1", film_id: "f1", old_price_usd: 9.99, new_price_usd: 4.99, created_at: iso(15 * DAY) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged"]);
  });

  it("ignores alerts where the price did not actually drop", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
      alertRows: [{ id: "pa1", film_id: "f1", old_price_usd: 4.99, new_price_usd: 4.99, created_at: iso(MIN) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged"]);
  });
});

describe("getLandingFeed — empty states", () => {
  it("returns [] and skips profile/film fetches when there is no activity and no alert", async () => {
    const { client, fromCalls } = makeClient();
    const rows = await getLandingFeed(client);
    expect(rows).toEqual([]);
    expect(fromCalls).not.toContain("profiles");
    expect(fromCalls).not.toContain("films");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `app/`:
```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/landing.test.ts
```
Expected: FAIL — cannot resolve `@/lib/queries/landing`.

- [ ] **Step 3: Implement `app/lib/queries/landing.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

// Kinds shown on the pre-login landing feed card. Deliberately excludes
// user_joined / coven_joined / list_* / gazing_* — film-centric rows only.
const LANDING_KINDS = [
  "watch_logged",
  "review_published",
  "recommendation_sent",
  "watchlist_added",
  "library_added",
] as const;
type LandingKind = (typeof LANDING_KINDS)[number];

const PRICE_DROP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface LandingActor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}
export interface LandingFilm {
  id: string;
  title: string;
  artwork_url: string | null;
}

export type LandingFeedRow =
  | {
      kind: Exclude<LandingKind, "recommendation_sent">;
      id: string;
      created_at: string;
      actor: LandingActor;
      film: LandingFilm;
    }
  | {
      kind: "recommendation_sent";
      id: string;
      created_at: string;
      actor: LandingActor;
      film: LandingFilm;
      recipient: { username: string };
    }
  | {
      kind: "price_drop";
      id: string;
      created_at: string;
      film: LandingFilm;
      newPriceUsd: number;
      pctOff: number;
    };

/**
 * Public landing-page feed: latest film-centric activity with real usernames,
 * plus the most recent site-wide price drop (≤14 days old) spliced in by
 * timestamp. Service-role only — called through the cached wrapper in
 * lib/supabase/cached.ts. Over-fetches 3× limit to survive dropped rows.
 */
export async function getLandingFeed(client: Client, limit = 5): Promise<LandingFeedRow[]> {
  const [activityRes, alertRes] = await Promise.all([
    client
      .from("activity")
      .select("id, kind, payload, created_at, actor_user_id")
      .in("kind", [...LANDING_KINDS])
      .order("created_at", { ascending: false })
      .limit(limit * 3),
    client
      .from("price_alerts")
      .select("id, film_id, old_price_usd, new_price_usd, created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (activityRes.error) throw activityRes.error;
  if (alertRes.error) throw alertRes.error;
  const raw = activityRes.data ?? [];

  const alertRow = (alertRes.data ?? [])[0] ?? null;
  const oldPrice = alertRow ? Number(alertRow.old_price_usd) : 0;
  const newPrice = alertRow ? Number(alertRow.new_price_usd) : 0;
  const alert =
    alertRow &&
    Date.now() - new Date(alertRow.created_at).getTime() <= PRICE_DROP_MAX_AGE_MS &&
    oldPrice > newPrice
      ? alertRow
      : null;

  const actorIds = [...new Set(raw.map(r => r.actor_user_id))];
  const payloadOf = (r: { payload: unknown }) => (r.payload ?? {}) as { film_id?: string; to_user_id?: string };
  const filmIds = [
    ...new Set([
      ...raw.map(r => payloadOf(r).film_id).filter((v): v is string => Boolean(v)),
      ...(alert ? [alert.film_id] : []),
    ]),
  ];
  const recipientIds = [
    ...new Set(
      raw
        .filter(r => r.kind === "recommendation_sent")
        .map(r => payloadOf(r).to_user_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  if (actorIds.length === 0 && filmIds.length === 0) return [];

  const allProfileIds = [...new Set([...actorIds, ...recipientIds])];
  const [profilesRes, filmsRes] = await Promise.all([
    allProfileIds.length
      ? client.from("profiles").select("id, username, display_name, avatar_url").in("id", allProfileIds)
      : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
    filmIds.length
      ? client.from("films").select("id, title, artwork_url").in("id", filmIds)
      : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (filmsRes.error) throw filmsRes.error;

  const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
  const filmMap = new Map((filmsRes.data ?? []).map((f: any) => [f.id, f]));

  const out: LandingFeedRow[] = [];
  for (const r of raw) {
    const payload = payloadOf(r);
    const profile = profileMap.get(r.actor_user_id);
    const filmRow = payload.film_id ? filmMap.get(payload.film_id) : undefined;
    if (!profile || !filmRow) continue;
    const actor: LandingActor = {
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
    const film: LandingFilm = { id: filmRow.id, title: filmRow.title, artwork_url: filmRow.artwork_url };
    if (r.kind === "recommendation_sent") {
      const recipient = payload.to_user_id ? profileMap.get(payload.to_user_id) : undefined;
      if (!recipient) continue;
      out.push({ kind: "recommendation_sent", id: r.id, created_at: r.created_at, actor, film, recipient: { username: recipient.username } });
    } else {
      out.push({ kind: r.kind as Exclude<LandingKind, "recommendation_sent">, id: r.id, created_at: r.created_at, actor, film });
    }
  }

  if (alert) {
    const filmRow = filmMap.get(alert.film_id);
    if (filmRow) {
      out.push({
        kind: "price_drop",
        id: alert.id,
        created_at: alert.created_at,
        film: { id: filmRow.id, title: filmRow.title, artwork_url: filmRow.artwork_url },
        newPriceUsd: newPrice,
        pctOff: Math.round((1 - newPrice / oldPrice) * 100),
      });
    }
  }

  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out.slice(0, limit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/landing.test.ts
```
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/queries/landing.ts app/tests/queries/landing.test.ts
git commit -m "feat(landing): getLandingFeed query for public activity card"
```

---

### Task 2: `getRecentlySummoned` query + cached wrappers

**Files:**
- Modify: `app/lib/queries/films.ts:9-18` (replace `getLandingMarquee`)
- Modify: `app/lib/supabase/cached.ts`
- Test: `app/tests/queries/films.test.ts` (append one describe block)

`getLandingMarquee` (ordered by `last_priced_at` — the "deals" framing) is replaced by `getRecentlySummoned` (ordered by `first_seen_at` — latest catalog additions). Its only callers are `cached.ts` → `page.tsx`, both rewritten in this plan.

- [ ] **Step 1: Write the failing test**

Append to `app/tests/queries/films.test.ts`:

```ts
import { getRecentlySummoned } from "@/lib/queries/films";

describe("getRecentlySummoned", () => {
  it("orders by first_seen_at desc and filters to available films", async () => {
    const order = vi.fn().mockReturnThis();
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order,
      limit: vi.fn().mockResolvedValue({ data: [{ id: "f1" }], error: null }),
    };
    const client = { from: vi.fn(() => chain) } as any;
    const rows = await getRecentlySummoned(client);
    expect(rows).toEqual([{ id: "f1" }]);
    expect(chain.eq).toHaveBeenCalledWith("available", true);
    expect(order).toHaveBeenCalledWith("first_seen_at", { ascending: false });
  });
});
```

(`vi`, `describe`, `it`, `expect` are already imported at the top of the file.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/films.test.ts
```
Expected: FAIL — `getRecentlySummoned` is not exported.

- [ ] **Step 3: Replace `getLandingMarquee` in `app/lib/queries/films.ts`**

Replace the entire `getLandingMarquee` function (lines 9–18) with:

```ts
export async function getRecentlySummoned(client: Client, limit = 10) {
  const { data, error } = await client
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, itunes_url")
    .eq("available", true)
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Update `app/lib/supabase/cached.ts`**

Replace the import line and the `getLandingMarquee` wrapper:

```ts
import { getRecentlySummoned as _getRecentlySummoned } from "@/lib/queries/films";
import { getLandingFeed as _getLandingFeed } from "@/lib/queries/landing";
```

```ts
export const getRecentlySummoned = unstable_cache(
  async () => _getRecentlySummoned(serviceRoleClient()),
  ["recently-summoned"],
  { revalidate: 300, tags: ["films"] },
);

// Landing feed card. Failure degrades to an empty list (page hides the card)
// rather than 500ing the front door. Nothing revalidates the tag — the 300s
// TTL is the only refresh, which is fine for a logged-out landing page.
export const getLandingFeed = unstable_cache(
  async () => {
    try {
      return await _getLandingFeed(serviceRoleClient());
    } catch {
      return [];
    }
  },
  ["landing-feed"],
  { revalidate: 300, tags: ["landing-feed"] },
);
```

Note: `app/app/page.tsx` still imports `getLandingMarquee` at this point — it will not compile until Task 4 rewrites it. That's fine; tests don't build the page. Don't run `typecheck` until Task 4.

- [ ] **Step 5: Run the test to verify it passes**

```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/queries/films.test.ts
```
Expected: PASS (existing `getFilms` tests + the new block).

- [ ] **Step 6: Commit**

```bash
git add app/lib/queries/films.ts app/lib/supabase/cached.ts app/tests/queries/films.test.ts
git commit -m "feat(landing): getRecentlySummoned + cached landing-feed wrapper"
```

---

### Task 3: landing CSS + `LandingFeedCard` component

**Files:**
- Create: `app/app/styles/220-landing.css`
- Modify: `app/app/globals.css` (append one import)
- Create: `app/components/LandingFeedCard.tsx`

No unit test — this is presentational server-component markup; it's verified by typecheck (Task 4) and visual check (Task 6).

- [ ] **Step 1: Create `app/app/styles/220-landing.css`**

```css
/* ============================================================
   Landing page (pre-login) — feed card + rites band
   ============================================================ */

.landing-feed-card {
  background: var(--void-2);
  border: 3px solid var(--bone);
  box-shadow: 8px 8px 0 var(--accent);
  transform: rotate(var(--card-rotation));
  padding: 18px 20px;
  max-width: 420px;
  width: 100%;
  justify-self: center;
}

.landing-feed-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 11px 0;
  border-bottom: 2px dashed var(--muted-dark);
}
.landing-feed-row:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.landing-pct {
  background: var(--highlight);
  color: var(--void);
  font-family: var(--font-ui);
  font-weight: 900;
  font-size: 11px;
  padding: 1px 5px;
}

.landing-rites {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.landing-rite {
  padding: 0 22px;
}
.landing-rite:first-child {
  padding-left: 0;
}
.landing-rite + .landing-rite {
  border-left: 2px solid var(--void);
}
@media (max-width: 720px) {
  .landing-rites {
    grid-template-columns: 1fr;
  }
  .landing-rite {
    padding: 14px 0;
  }
  .landing-rite:first-child {
    padding-top: 0;
  }
  .landing-rite + .landing-rite {
    border-left: none;
    border-top: 2px solid var(--void);
  }
}
```

- [ ] **Step 2: Register it in `app/app/globals.css`**

Append after the `210-showtimes.css` import:

```css
@import "./styles/220-landing.css";
```

- [ ] **Step 3: Create `app/components/LandingFeedCard.tsx`**

Server component — no `"use client"` (no hooks, no handlers; `Avatar` and `relativeTime` are both server-safe). Note the components/CLAUDE.md "all client" note describes the norm, not a constraint — this file is deliberately server so the landing page ships zero JS.

```tsx
import Link from "next/link";
import Image from "next/image";
import Avatar from "./Avatar";
import { relativeTime } from "./activity/relativeTime";
import type { LandingFeedRow, LandingFilm } from "@/lib/queries/landing";

// Pre-login landing page feed card. Static server-rendered snapshot of real
// site activity (cached 5 min upstream) — timestamps are as-of cache time.

function Title({ film }: { film: LandingFilm }) {
  return <em style={{ fontFamily: "var(--font-head)", fontStyle: "italic" }}>{film.title}</em>;
}

function Sentence({ row }: { row: LandingFeedRow }) {
  switch (row.kind) {
    case "watch_logged":
      return <><b>{row.actor.username}</b> watched <Title film={row.film} /> 👁</>;
    case "review_published":
      return <><b>{row.actor.username}</b> published a review of <Title film={row.film} /></>;
    case "recommendation_sent":
      return <><b>{row.actor.username}</b> pressed <Title film={row.film} /> on <b>{row.recipient.username}</b></>;
    case "watchlist_added":
      return <><b>{row.actor.username}</b> is stalking <Title film={row.film} /></>;
    case "library_added":
      return <><b>{row.actor.username}</b> now owns <Title film={row.film} /></>;
    case "price_drop":
      return <><span className="landing-pct">−{row.pctOff}%</span> <Title film={row.film} /> fell to <b>${row.newPriceUsd.toFixed(2)}</b></>;
  }
}

function Thumb({ film }: { film: LandingFilm }) {
  return (
    <Link href={`/film/${film.id}`} style={{ marginLeft: "auto", flexShrink: 0 }}>
      {film.artwork_url ? (
        <Image
          src={film.artwork_url}
          alt={film.title}
          width={30}
          height={44}
          style={{ width: 30, height: 44, objectFit: "cover", border: "1.5px solid var(--bone)", display: "block" }}
        />
      ) : (
        <span style={{ display: "block", width: 30, height: 44, background: "var(--void-3)", border: "1.5px solid var(--bone)" }} />
      )}
    </Link>
  );
}

export default function LandingFeedCard({ rows }: { rows: LandingFeedRow[] }) {
  return (
    <div className="landing-feed-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span className="caps" style={{ fontSize: 11, color: "var(--highlight)" }}>⛧ The Feed</span>
        <span className="caps" style={{ fontSize: 9, color: "var(--muted)" }}>live · unhallowed hours</span>
      </div>
      {rows.map(row => (
        <div key={row.id} className="landing-feed-row">
          {row.kind === "price_drop" ? (
            <span aria-hidden style={{ width: 26, flexShrink: 0 }} />
          ) : (
            <Avatar name={row.actor.display_name || row.actor.username} url={row.actor.avatar_url} size={26} />
          )}
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
            <Sentence row={row} />
            <div className="caps" style={{ fontSize: 8, color: "var(--muted)", marginTop: 3 }}>{relativeTime(row.created_at)}</div>
          </div>
          <Thumb film={row.film} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/app/styles/220-landing.css app/app/globals.css app/components/LandingFeedCard.tsx
git commit -m "feat(landing): LandingFeedCard component + landing styles"
```

---

### Task 4: rewrite `page.tsx` + remove dead hero-posters CSS

**Files:**
- Modify: `app/app/page.tsx` (full rewrite)
- Modify: `app/app/styles/00-core.css:458-470` (delete `.hero-posters` mobile block)

- [ ] **Step 1: Rewrite `app/app/page.tsx`**

Full replacement:

```tsx
import Link from "next/link";
import { getLandingFeed, getRecentlySummoned } from "@/lib/supabase/cached";
import FilmPoster from "@/components/FilmPoster";
import HalftoneBar from "@/components/HalftoneBar";
import LandingFeedCard from "@/components/LandingFeedCard";

// Pre-login landing page. Middleware redirects authenticated users from "/"
// to /home, so this only ever renders logged-out.
export default async function LandingPage() {
  const [feedRows, summoned] = await Promise.all([getLandingFeed(), getRecentlySummoned()]);
  const hasFeed = feedRows.length > 0;

  // Double the strip for a seamless marquee loop
  const marqueeStrip = [...summoned, ...summoned];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh", fontFamily: "var(--font-ui)" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "2px solid var(--bone)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px var(--container-pad)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Film <span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <span className="eyebrow desktop-only" style={{ marginLeft: 6, color: "var(--muted)" }}>Est. 2026 · Issue nº1</span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <Link href="/films" className="caps" style={{ fontSize: 12 }}>Films</Link>
            <Link href="/lists" className="caps" style={{ fontSize: 12 }}>Lists</Link>
            <Link href="/auth/signin" className="btn btn-outline btn-sm">Sign In</Link>
          </div>
        </div>
      </div>

      {/* HERO — pitch + live feed card */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div className="container-wide" style={{ padding: "48px var(--container-pad) 44px" }}>
          <div
            className="stackable"
            style={{ "--stack-template": hasFeed ? "1.15fr 1fr" : "1fr", "--stack-gap": "40px", alignItems: "center" } as React.CSSProperties}
          >
            <div style={hasFeed ? undefined : { maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
              <div className="stamp" style={{ color: "var(--highlight)", marginBottom: 20 }}>✦ Watch Weirder ✦</div>
              <h1 className="display" style={{ fontSize: "clamp(64px, 11vw, 160px)", margin: 0, lineHeight: 0.82, letterSpacing: "-0.02em" }}>
                FILM
                <br />
                <span style={{ color: "var(--accent)" }}>GOBLIN</span>
              </h1>
              <p className="head" style={{ fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.12, margin: "26px 0 12px", maxWidth: hasFeed ? 460 : undefined }}>
                A coven for people who take movies seriously.
              </p>
              <p style={{ fontSize: 15, maxWidth: hasFeed ? 440 : 480, lineHeight: 1.55, margin: hasFeed ? "0 0 28px" : "0 auto 28px", color: "var(--bone-2)" }}>
                Log what you watch. Press films on your friends. Keep a watchlist
                that hunts price drops on Apple TV while you sleep.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: hasFeed ? undefined : "center" }}>
                <Link href="/auth/signup" className="btn btn-lg">✦ Join The Coven</Link>
                <Link href="/films" className="btn btn-outline btn-lg">Browse Films</Link>
              </div>
            </div>
            {hasFeed && <LandingFeedCard rows={feedRows} />}
          </div>
        </div>
        <HalftoneBar color="var(--accent)" height={18} />
      </section>

      {/* THE RITES — bone band */}
      <section className="grain-light" style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "2px solid var(--void)" }}>
        <div className="container-wide landing-rites" style={{ padding: "30px var(--container-pad)" }}>
          <div className="landing-rite">
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>⛧ Rite I</div>
            <div className="head" style={{ fontSize: 22, marginBottom: 6 }}>The Feed</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>
              Every watch, rating, and review your coven logs — one haunted scroll.
            </p>
          </div>
          <div className="landing-rite">
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>⛧ Rite II</div>
            <div className="head" style={{ fontSize: 22, marginBottom: 6 }}>Recommendations</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>
              Press a film on a friend. They&apos;ll see it until they watch it. No escape.
            </p>
          </div>
          <div className="landing-rite">
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>⛧ Rite III</div>
            <div className="head" style={{ fontSize: 22, marginBottom: 6 }}>The Hunt</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>
              Your watchlist stalks Apple TV prices and howls when one drops.
            </p>
          </div>
        </div>
      </section>

      {/* RECENTLY SUMMONED — marquee */}
      <section style={{ background: "var(--void-2)", padding: "28px 0 32px", overflow: "hidden" }}>
        <div className="container-wide" style={{ marginBottom: 18 }}>
          <h2 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Recently <span style={{ color: "var(--accent)", fontStyle: "italic" }}>Summoned</span>
          </h2>
        </div>
        <div style={{ overflow: "hidden", padding: "10px 0" }}>
          <div className="marquee" style={{ gap: 24 }}>
            {marqueeStrip.map((f, i) => (
              <FilmPoster key={`${f.id}-${i}`} film={f} size="md" />
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section style={{ borderTop: "2px solid var(--bone)", textAlign: "center", padding: "44px var(--container-pad) 56px" }}>
        <div className="head" style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontStyle: "italic", marginBottom: 22 }}>
          The moon is right. The prices are wrong.
        </div>
        <Link href="/auth/signup" className="btn btn-lg">✦ Join The Coven</Link>
        <div className="eyebrow" style={{ color: "var(--muted)", marginTop: 28 }}>
          Film Goblin · Est. 2026 · Printed in a garage
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Delete the dead `.hero-posters` block in `app/app/styles/00-core.css`**

Remove these lines (the tilted-poster hero is gone; nothing else references `.hero-posters` / `.hero-poster`):

```css
/* Landing hero posters — on mobile, drop the absolute positioning and rotations. */
@media (max-width: 720px) {
  .hero-posters { min-height: auto !important; }
  .hero-posters .hero-poster {
    position: static !important;
    transform: none !important;
    margin: 0 auto 20px !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
  }
}
```

- [ ] **Step 3: Typecheck and full test suite**

Run from `app/`:
```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test
```
Expected: both clean. If typecheck complains about `FilmPoster` film props from `getRecentlySummoned` rows, cast at the prop boundary per repo convention: `film={f as never}`.

- [ ] **Step 4: Commit**

```bash
git add app/app/page.tsx app/app/styles/00-core.css
git commit -m "feat(landing): dark social-first landing page with live feed hero"
```

---

### Task 5: CLAUDE.md invite-gate correction

**Files:**
- Modify: `CLAUDE.md` (repo root)

Invite gating is disabled (owner confirmed 2026-06-09); the doc still says it's live in two places.

- [ ] **Step 1: Fix the "Next up" line**

In the **Next up** section, change:

> Nothing queued. **Invite gate is live.** Pre-launch: …

to:

> Nothing queued. **Invite gate is disabled — signup is open** (re-enable by setting `INVITE_GATE=1` in Vercel env). Pre-launch: …

- [ ] **Step 2: Fix the historical "(1) Invite codes" entry**

In the **Previously shipped (2026-05-07)** paragraph, change:

> **Gate is LIVE on production.** Delete `INVITE_GATE` from Vercel env to open signup.

to:

> Gate shipped live, **since disabled** (env var removed; set `INVITE_GATE=1` to re-arm).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: invite gate is disabled — correct stale CLAUDE.md state"
```

---

### Task 6: visual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server**

From `app/`:
```bash
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```
Needs `app/.env.local` (already present on this machine) — the landing queries hit prod Supabase via the service role key.

- [ ] **Step 2: Verify logged-out desktop**

Open `http://localhost:3000/` in a logged-out browser context. Check:
- Dark page; top bar with bone border; Sign In outline button.
- Hero: stamp, FILM GOBLIN wordmark, feed card on the right with **real usernames/films**, pink hard shadow, dashed row separators, relative timestamps, poster thumbs linking to `/film/[id]`.
- If a price drop ≤14 days exists: yellow −NN% chip row.
- Halftone divider, bone Rites band (3 columns with vertical rules), "Recently Summoned" marquee animating, footer CTA.

- [ ] **Step 3: Verify mobile (≤720px)**

Resize to ~390px width. Check:
- Hero stacks pitch-above-card; card is unrotated (`--card-rotation: 0`), full-width up to 420px.
- Rites stack vertically with horizontal rules between them.
- No horizontal overflow (iOS "zoom" gotcha) — scroll right edge stays put.

- [ ] **Step 4: Verify empty-feed fallback**

Temporarily hardcode `const feedRows: Awaited<ReturnType<typeof getLandingFeed>> = [];` in `page.tsx`, reload — pitch centers, no card, no empty border box. **Revert the hardcode.**

- [ ] **Step 5: Done — hand off**

Implementation complete. Use the `superpowers:finishing-a-development-branch` skill (PR per repo rules — never merge directly).
```

---

## Self-review notes

- **Spec coverage:** structure §1–6 → Task 4; `getLandingFeed` → Task 1; `getRecentlySummoned` + cached wrappers + `getLandingMarquee` removal → Task 2; `LandingFeedCard` + new stylesheet → Task 3; `.hero-posters` deletion → Task 4; CLAUDE.md correction → Task 5; error degradation → Task 2 wrapper + Task 6 step 4; tests → Tasks 1–2; visual + typecheck → Tasks 4, 6.
- **Type consistency:** `LandingFeedRow`/`LandingActor`/`LandingFilm` defined in Task 1, consumed by name in Task 3; `getLandingFeed`/`getRecentlySummoned` names match across Tasks 1–4.
- The deliberate mid-plan broken state (Task 2 leaves `page.tsx` importing a deleted function until Task 4) is called out inline so the engineer doesn't panic-run typecheck early.
