# Summon the Coven — Gazing Feed Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Summon the coven" action that broadcasts a chosen Loft showtime to the user's coven feed as a new `gazing_invited` activity card, while leaving the existing private SMS share untouched.

**Architecture:** A new `broadcast` boolean on `gazing_invites` distinguishes a summon (`true`) from the existing SMS share (`false`). A `WHEN (NEW.broadcast IS TRUE)` trigger emits a `gazing_invited` row into the existing `activity` table — the same trigger-driven pattern every feed kind uses. A new `summonCoven` server action sets the flag; the feed query enriches the kind; a new renderer draws the card; `ShowtimesSheet` gains a second CTA.

**Tech Stack:** Postgres (migrations + plpgsql trigger), Next.js 15 server actions, React server/client components, TypeScript, vitest, testcontainers Postgres for DB tests.

**Node 20 required.** Prefix one-shot `npm`/`tsx` calls with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.

**Spec:** `docs/superpowers/specs/2026-06-03-summon-the-coven-gazing-feed-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `db/migrations/0198_gazing_invited_kind.sql` | Add `gazing_invited` enum value | Create |
| `db/migrations/0199_gazing_broadcast_trigger.sql` | `broadcast` column + fan-out trigger | Create |
| `db/tests/rls/gazing-broadcast-activity.test.ts` | Trigger fires on `broadcast=true`, not `false` | Create |
| `app/lib/supabase/types.ts` | Hand-edit: `broadcast` column + `gazing_invited` enum | Modify |
| `app/lib/gazing/summon-meta.ts` | Pure formatter for the card's meta line | Create |
| `app/tests/gazing/summon-meta.test.ts` | Unit tests for the formatter | Create |
| `app/lib/actions/gazing.ts` | Shared snapshot helper + `summonCoven` action | Modify |
| `app/tests/actions/summon-coven.test.ts` | `summonCoven` sets `broadcast=true`; share leaves it `false` | Create |
| `app/lib/queries/activity.ts` | `gazing_invited` union variant + enrichment case | Modify |
| `app/components/activity/ActivityGazingInvited.tsx` | Feed card renderer | Create |
| `app/components/activity/ActivityRow.tsx` | Register the new kind | Modify |
| `app/components/ShowtimesSheet.tsx` | "Summon the coven" CTA | Modify |

---

## Task 1: Migrations + DB trigger test

**Files:**
- Create: `db/migrations/0198_gazing_invited_kind.sql`
- Create: `db/migrations/0199_gazing_broadcast_trigger.sql`
- Test: `db/tests/rls/gazing-broadcast-activity.test.ts`

Requires Docker (testcontainers). Run all DB commands from `db/`.

- [ ] **Step 1: Write the failing test**

Create `db/tests/rls/gazing-broadcast-activity.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

async function insertInvite(client: TestDb["client"], userId: string, filmId: string, broadcast: boolean) {
  await client.query(
    `INSERT INTO gazing_invites
       (token, created_by, film_id, film_title, theater_name, starts_at, tickets_url, format_label, broadcast)
     VALUES ($1, $2, $3, 'Test Film', 'The Loft Cinema', now() + interval '2 days', 'https://loftcinema.org/film/x/', '70mm', $4)`,
    [`tok-${Math.random().toString(36).slice(2)}`, userId, filmId, broadcast],
  );
}

describe("gazing_invited activity — fires only when broadcast is true", () => {
  it("emits exactly one gazing_invited activity for a broadcast invite", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await insertInvite(db.client, fx.userA.id, fx.filmId, true);
    const r = await db.client.query<{ kind: string; payload: { film_id: string; token: string; theater_name: string; starts_at: string; format_label: string } }>(
      `SELECT kind, payload FROM activity WHERE kind = 'gazing_invited' AND actor_user_id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].payload.film_id).toBe(fx.filmId);
    expect(typeof r.rows[0].payload.token).toBe("string");
    expect(r.rows[0].payload.theater_name).toBe("The Loft Cinema");
    expect(r.rows[0].payload.format_label).toBe("70mm");
  });

  it("emits no activity for a non-broadcast (SMS) invite", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await insertInvite(db.client, fx.userA.id, fx.filmId, false);
    const r = await db.client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM activity WHERE kind = 'gazing_invited' AND actor_user_id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);
    expect(r.rows[0].n).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- gazing-broadcast-activity`
Expected: FAIL — `column "broadcast" of relation "gazing_invites" does not exist`.

- [ ] **Step 3: Create migration 0198 (enum value)**

Create `db/migrations/0198_gazing_invited_kind.sql`:

```sql
-- 0198_gazing_invited_kind.sql
-- Add the 'gazing_invited' activity kind. Separate file from the trigger (0199)
-- because ALTER TYPE … ADD VALUE must commit before a function can reference
-- the new value. Mirrors 0194/0195 (user_joined).

ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'gazing_invited';
```

- [ ] **Step 4: Create migration 0199 (column + trigger)**

Create `db/migrations/0199_gazing_broadcast_trigger.sql`:

```sql
-- 0199_gazing_broadcast_trigger.sql
-- "Summon the coven": a gazing_invites row with broadcast = true fans out to
-- an activity (kind = 'gazing_invited') so the inviter's coven sees the
-- showtime in their feed. The existing SMS-share path inserts broadcast = false
-- and never posts. Mirrors activity_on_library_insert (0134). Depends on 0198
-- (the 'gazing_invited' enum value committed in its own transaction).

ALTER TABLE gazing_invites
  ADD COLUMN broadcast boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.activity_on_gazing_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (
    NEW.created_by,
    'gazing_invited',
    jsonb_build_object(
      'film_id', NEW.film_id,
      'token', NEW.token,
      'theater_name', NEW.theater_name,
      'starts_at', NEW.starts_at,
      'format_label', NEW.format_label
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_gazing_broadcast
AFTER INSERT ON gazing_invites
FOR EACH ROW
WHEN (NEW.broadcast IS TRUE)
EXECUTE FUNCTION public.activity_on_gazing_broadcast();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- gazing-broadcast-activity`
Expected: PASS (both tests).

- [ ] **Step 6: Confirm pg-mem smoke still passes**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: PASS. (No `pg-mem.ts` change needed: `0199_*_trigger.sql` is skipped by the existing `f.includes("_trigger")` filter, and `0198`'s lone `ALTER TYPE` statement is stripped to nothing. If it unexpectedly fails, extend the skip list in `db/tests/helpers/pg-mem.ts` per `db/migrations/CLAUDE.md` — do not edit the migration.)

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0198_gazing_invited_kind.sql db/migrations/0199_gazing_broadcast_trigger.sql db/tests/rls/gazing-broadcast-activity.test.ts
git commit -F /tmp/commit-msg-1.txt
```

Where `/tmp/commit-msg-1.txt` contains:
```
feat(db): gazing_invited activity kind + broadcast trigger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 2: Hand-edit generated types

`types.ts` is regenerated from a live schema; since these migrations aren't applied to the remote yet, hand-edit per `app/lib/supabase/CLAUDE.md`.

**Files:**
- Modify: `app/lib/supabase/types.ts`

- [ ] **Step 1: Add `broadcast` to the `gazing_invites` Row/Insert/Update**

In `app/lib/supabase/types.ts`, in the `gazing_invites:` block (~line 561):

In `Row` (after `created_at: string`):
```ts
          broadcast: boolean
```
In `Insert` (after `created_at?: string`):
```ts
          broadcast?: boolean
```
In `Update` (after `created_at?: string`):
```ts
          broadcast?: boolean
```

- [ ] **Step 2: Add `gazing_invited` to the `activity_kind` enum union**

In the `Enums` block (~line 1717), append to the `activity_kind` union:
```ts
        | "gazing_invited"
```

- [ ] **Step 3: Add `gazing_invited` to the `Constants` array**

In the `Constants` block `activity_kind: [ … ]` (~line 1872), append after `"user_joined",`:
```ts
        "gazing_invited",
```

- [ ] **Step 4: Record the hand-edits in the warning block**

In the comment block near the top (~line 26), after the `gazing_invites: entire table` line, add:
```ts
//   gazing_invites: broadcast (boolean) — added by mig 0199
//   activity_kind enum: gazing_invited — added by mig 0198
```

- [ ] **Step 5: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add app/lib/supabase/types.ts
git commit -F /tmp/commit-msg-2.txt
```

`/tmp/commit-msg-2.txt`:
```
chore(types): broadcast column + gazing_invited kind

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 3: Card meta formatter (pure, TDD)

A small pure function the renderer uses to build the "The Loft · Fri 8:30pm · 70mm" line. Pure so it is cleanly unit-testable.

**Files:**
- Create: `app/lib/gazing/summon-meta.ts`
- Test: `app/tests/gazing/summon-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/gazing/summon-meta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatSummonMeta, normalizeTheaterName } from "@/lib/gazing/summon-meta";

describe("normalizeTheaterName", () => {
  it("shortens The Loft Cinema", () => {
    expect(normalizeTheaterName("The Loft Cinema")).toBe("The Loft");
  });
  it("passes other names through", () => {
    expect(normalizeTheaterName("Harkins Tucson")).toBe("Harkins Tucson");
  });
});

describe("formatSummonMeta", () => {
  // 2026-06-05T20:30:00-07:00 is Fri Jun 5, 8:30 PM in America/Phoenix.
  const iso = "2026-06-05T20:30:00-07:00";

  it("joins theater, day/time, and format with middots", () => {
    expect(formatSummonMeta("The Loft Cinema", iso, "70mm")).toBe("The Loft · Fri 8:30 PM · 70mm");
  });
  it("omits the format segment when null", () => {
    expect(formatSummonMeta("The Loft Cinema", iso, null)).toBe("The Loft · Fri 8:30 PM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- summon-meta`
Expected: FAIL — cannot find module `@/lib/gazing/summon-meta`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/gazing/summon-meta.ts`:

```ts
const PHOENIX = "America/Phoenix";

export function normalizeTheaterName(name: string): string {
  return name === "The Loft Cinema" ? "The Loft" : name;
}

function dayTime(iso: string): string {
  // Format weekday and time separately so we avoid Intl's "Fri, 8:30 PM" comma.
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: PHOENIX, weekday: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: PHOENIX, hour: "numeric", minute: "2-digit" }).format(d);
  return `${weekday} ${time}`;
}

/** "The Loft · Fri 8:30 PM · 70mm" — format segment omitted when null. */
export function formatSummonMeta(theaterName: string, startsAt: string, formatLabel: string | null): string {
  const parts = [normalizeTheaterName(theaterName), dayTime(startsAt)];
  if (formatLabel) parts.push(formatLabel);
  return parts.join(" · ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- summon-meta`
Expected: PASS. (If the formatted time differs in punctuation — e.g. `8:30 PM` vs `8:30 PM` — adjust the expected strings to match `Intl` output exactly; the goal is segment structure, not exact glyphs.)

- [ ] **Step 5: Commit**

```bash
git add app/lib/gazing/summon-meta.ts app/tests/gazing/summon-meta.test.ts
git commit -F /tmp/commit-msg-3.txt
```

`/tmp/commit-msg-3.txt`:
```
feat(gazing): summon card meta formatter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 4: `summonCoven` server action

Refactor the shared snapshot fetch out of `_createGazingInvite`, then add `_summonCoven` / `summonCoven` that insert with `broadcast: true`.

**Files:**
- Modify: `app/lib/actions/gazing.ts`
- Test: `app/tests/actions/summon-coven.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/actions/summon-coven.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocked showtime the service-role lookup returns.
const SHOWTIME = {
  id: "st-1",
  film_id: "film-1",
  starts_at: "2026-06-05T20:30:00-07:00",
  format_label: "70mm",
  tickets_url: "https://loftcinema.org/film/x/",
  theater: { name: "The Loft Cinema" },
  film: { title: "Test Film", artwork_url: "https://img/x.jpg" },
};

// Stub the Next-only imports so the "use server" module loads under vitest
// (we only exercise the private `_` functions, which never call these).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: async () => ({ data: SHOWTIME, error: null }) }),
        }),
      }),
    }),
  }),
}));

// Captures the gazing_invites insert payload.
let captured: Record<string, unknown> | null;

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table !== "gazing_invites") throw new Error(`unexpected table ${table}`);
      return { insert: async (payload: Record<string, unknown>) => { captured = payload; return { error: null }; } };
    },
  } as never;
}

beforeEach(() => { captured = null; });

describe("gazing invite actions set the broadcast flag", () => {
  it("_summonCoven inserts with broadcast = true", async () => {
    const { _summonCoven } = await import("@/lib/actions/gazing");
    const res = await _summonCoven(fakeClient(), "st-1");
    expect(captured?.broadcast).toBe(true);
    expect(captured?.created_by).toBe("user-1");
    expect(res.url).toMatch(/\/gazing\/.+/);
  });

  it("_createGazingInvite inserts with broadcast = false", async () => {
    const { _createGazingInvite } = await import("@/lib/actions/gazing");
    await _createGazingInvite(fakeClient(), "st-1");
    expect(captured?.broadcast).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- summon-coven`
Expected: FAIL — `_summonCoven` is not exported.

- [ ] **Step 3: Refactor + implement in `app/lib/actions/gazing.ts`**

Replace the body of `_createGazingInvite` and add the new action. The file becomes:

```ts
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { generateGazingToken } from "@/lib/gazing/token";

type Client = SupabaseClient<Database>;

const SITE_ORIGIN = "https://freshfromthepit.com";

interface ShowtimeSnapshot {
  id: string;
  film_id: string | null;
  starts_at: string;
  format_label: string | null;
  tickets_url: string;
  theater: { name: string } | { name: string }[] | null;
  film: { title: string; artwork_url: string | null } | { title: string; artwork_url: string | null }[] | null;
}

interface InviteSnapshot {
  film_id: string;
  film_title: string;
  poster_url: string | null;
  theater_name: string;
  starts_at: string;
  format_label: string | null;
  tickets_url: string;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Loads a matched, active showtime and freezes its display fields. Shared by
 *  the SMS-share and summon paths. Throws if the showtime isn't film-matched. */
async function loadInviteSnapshot(showtimeId: string): Promise<InviteSnapshot> {
  const svc = serviceRoleClient();
  const { data, error } = await svc
    .from("theater_showtimes")
    .select("id, film_id, starts_at, format_label, tickets_url, theater:theaters(name), film:films(title, artwork_url)")
    .eq("id", showtimeId)
    .eq("is_active", true)
    .single();
  if (error) throw error;

  const showtime = data as ShowtimeSnapshot;
  const film = one(showtime.film);
  const theater = one(showtime.theater);
  if (!showtime.film_id || !film || !theater) {
    throw new Error("Showtime is not matched to a film yet");
  }

  return {
    film_id: showtime.film_id,
    film_title: film.title,
    poster_url: film.artwork_url,
    theater_name: theater.name,
    starts_at: showtime.starts_at,
    format_label: showtime.format_label,
    tickets_url: showtime.tickets_url,
  };
}

export interface CreateGazingResult {
  url: string;
}

async function insertInvite(
  client: Client,
  showtimeId: string,
  snapshot: InviteSnapshot,
  userId: string,
  broadcast: boolean,
): Promise<CreateGazingResult> {
  const token = generateGazingToken();
  const { error } = await client.from("gazing_invites").insert({
    token,
    created_by: userId,
    showtime_id: showtimeId,
    film_id: snapshot.film_id,
    film_title: snapshot.film_title,
    poster_url: snapshot.poster_url,
    theater_name: snapshot.theater_name,
    starts_at: snapshot.starts_at,
    format_label: snapshot.format_label,
    tickets_url: snapshot.tickets_url,
    broadcast,
  });
  if (error) throw error;
  return { url: `${SITE_ORIGIN}/gazing/${token}` };
}

export async function _createGazingInvite(client: Client, showtimeId: string): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client);
  const snapshot = await loadInviteSnapshot(showtimeId);
  return insertInvite(client, showtimeId, snapshot, user.id, false);
}

export async function createGazingInvite(showtimeId: string): Promise<CreateGazingResult> {
  const supabase = await createClient();
  return _createGazingInvite(supabase, showtimeId);
}

export async function _summonCoven(client: Client, showtimeId: string): Promise<CreateGazingResult> {
  const user = await requireAuthUser(client);
  const snapshot = await loadInviteSnapshot(showtimeId);
  return insertInvite(client, showtimeId, snapshot, user.id, true);
}

export async function summonCoven(showtimeId: string): Promise<CreateGazingResult> {
  const supabase = await createClient();
  const result = await _summonCoven(supabase, showtimeId);
  revalidatePath("/home");
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test -- summon-coven`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/actions/gazing.ts app/tests/actions/summon-coven.test.ts
git commit -F /tmp/commit-msg-4.txt
```

`/tmp/commit-msg-4.txt`:
```
feat(gazing): summonCoven action broadcasts to the feed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 5: Feed enrichment

Add the `gazing_invited` variant to the activity union and its enrichment case. Verified by typecheck (the enrichment path is DB-coupled; the trigger test in Task 1 plus the build cover behavior).

**Files:**
- Modify: `app/lib/queries/activity.ts`

- [ ] **Step 1: Add the union variant**

In `app/lib/queries/activity.ts`, in the `EnrichedActivity` union (after the `user_joined` line ~46), add:

```ts
  | { kind: "gazing_invited"; film: FilmLite; token: string; theaterName: string; startsAt: string; formatLabel: string | null }
```

- [ ] **Step 2: Add the enrichment case**

In the `switch (r.kind)` block in `getEnrichedActivity` (after the `user_joined` case), add:

```ts
      case "gazing_invited":
        if (film) out.push({
          ...base,
          kind: "gazing_invited",
          film,
          token: payload.token ?? "",
          theaterName: payload.theater_name ?? "",
          startsAt: payload.starts_at ?? "",
          formatLabel: payload.format_label ?? null,
        });
        break;
```

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/queries/activity.ts
git commit -F /tmp/commit-msg-5.txt
```

`/tmp/commit-msg-5.txt`:
```
feat(feed): enrich gazing_invited activity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 6: Feed card renderer

**Files:**
- Create: `app/components/activity/ActivityGazingInvited.tsx`
- Modify: `app/components/activity/ActivityRow.tsx`

- [ ] **Step 1: Create the renderer**

Create `app/components/activity/ActivityGazingInvited.tsx` (mirrors `ActivityRecommendationSent.tsx`):

```tsx
import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import { formatSummonMeta } from "@/lib/gazing/summon-meta";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "gazing_invited" }>;

export default function ActivityGazingInvited({ item }: { item: Item }) {
  const gazingHref = `/gazing/${item.token}`;
  const meta = formatSummonMeta(item.theaterName, item.startsAt, item.formatLabel);

  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.username} color="var(--accent)" size={36} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
          {" summons the coven to a shared gazing of "}
          <Link prefetch={false} href={gazingHref} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4, color: "var(--muted)", letterSpacing: "0.04em" }}>{meta}</div>
        <ActivityFooter item={item} />
      </div>
      <Link prefetch={false} href={gazingHref}>
        <Image src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Register the kind in `ActivityRow.tsx`**

In `app/components/activity/ActivityRow.tsx`, add the import after the other activity imports:

```tsx
import ActivityGazingInvited from "./ActivityGazingInvited";
```

And add a case in the `switch (item.kind)`:

```tsx
    case "gazing_invited": return <ActivityGazingInvited item={item} />;
```

- [ ] **Step 3: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS — the `switch` is now exhaustive over the union.

- [ ] **Step 4: Commit**

```bash
git add app/components/activity/ActivityGazingInvited.tsx app/components/activity/ActivityRow.tsx
git commit -F /tmp/commit-msg-6.txt
```

`/tmp/commit-msg-6.txt`:
```
feat(feed): gazing_invited card renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 7: "Summon the coven" CTA in ShowtimesSheet

**Files:**
- Modify: `app/components/ShowtimesSheet.tsx`

- [ ] **Step 1: Import the action**

In `app/components/ShowtimesSheet.tsx`, update the gazing import (line ~6):

```tsx
import { createGazingInvite, summonCoven } from "@/lib/actions/gazing";
```

- [ ] **Step 2: Add summon state + handler**

After the `const [sharing, setSharing] = useState(false);` line, add:

```tsx
  const [summoning, setSummoning] = useState(false);
```

After the `onShare` function, add:

```tsx
  async function onSummon() {
    if (!canInvite) {
      window.location.href = `/auth/signup?redirect=${encodeURIComponent(`/film/${filmId}`)}`;
      return;
    }
    if (!selected) return;

    setSummoning(true);
    try {
      await summonCoven(selected.id);
      toast("Summoned the coven");
      setOpen(false);
    } catch {
      toast("Summon failed");
    } finally {
      setSummoning(false);
    }
  }
```

- [ ] **Step 3: Add the second CTA button**

In the JSX, immediately after the existing `<button … className="showtimes-share" …>…</button>`, add:

```tsx
          <button
            type="button"
            className="showtimes-share showtimes-summon"
            disabled={(canInvite && !selected) || summoning}
            onClick={onSummon}
          >
            {!canInvite
              ? "Sign in to summon the coven"
              : selected
                ? "👁 Summon the coven"
                : "Pick a showtime to summon the coven"}
          </button>
```

- [ ] **Step 4: Add a style hook so the two CTAs read as distinct**

In `app/app/styles/210-showtimes.css`, after the `.showtimes-share:disabled { … }` rule, add:

```css
.showtimes-summon {
  margin-top: 8px;
  background: var(--void);
  color: var(--bone);
  border-color: var(--bone);
  box-shadow: 4px 4px 0 var(--accent);
}
```

- [ ] **Step 5: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/ShowtimesSheet.tsx app/app/styles/210-showtimes.css
git commit -F /tmp/commit-msg-7.txt
```

`/tmp/commit-msg-7.txt`:
```
feat(showtimes): Summon the coven CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: App test suite**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test`
Expected: PASS (includes the new `summon-meta` and `summon-coven` tests).

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build`
Expected: build succeeds (compiles `/home`, `/film/[id]`, `/gazing/[token]`).

- [ ] **Step 4: DB suites**

Run: `cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all`
Expected: PASS (pg-mem smoke + RLS/trigger suite incl. the new gazing-broadcast test).

- [ ] **Step 5: Apply migrations to production**

Per `db/migrations/CLAUDE.md`:
```bash
set -a; source app/.env.local; set +a
cd db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```
Expected: `0198` and `0199` apply cleanly.

- [ ] **Step 6: Open PR, merge, deploy** (only when the user asks to ship)

```bash
git push -u origin feat/summon-the-coven
gh pr create --fill
```
After merge, from repo root: `npx vercel deploy --prod --yes`.

---

## Notes for the implementer

- **`broadcast` defaults to `false`**, so the existing SMS-share path needs no change — its insert omits `broadcast` and the trigger never fires for it.
- **Card target:** the feed card links to `/gazing/[token]`, reusing the landing page shipped in PR #163 — no new page.
- **The trigger fires once per broadcast insert.** There is no dedup; summoning the same showtime twice posts two cards (acceptable for v1, matches other kinds).
- **`Image` requires the poster host** to be allowlisted in `next.config` — it already is, since the existing recommendation/watch cards render `film.artwork_url` the same way.
