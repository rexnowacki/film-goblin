# The Claiming — Buy-Click Capture & Purchase Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the price when a user clicks Buy on Apple TV, ask on return whether they purchased, auto-add confirmed purchases to the grimoire with price paid, and show savings data.

**Architecture:** A pure localStorage queue module (`app/lib/purchase/pending.ts`) holds pending buy clicks. A shared client link component (`BuyOnAppleLink`) arms the queue at both buy surfaces. A layout-mounted `PurchasePrompt` raises a BottomSheet on tab refocus/page load and calls a new `confirmPurchase` server action, which inserts/updates `library.price_paid_usd` (new column, mig 0211 — the existing `library_added` DB trigger emits the activity for free on insert). Savings are computed at read time from `price_history` peaks; `/library` gains a stat strip.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (PostgREST + RLS), vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-buy-claim-loop-design.md`

## Global Constraints

- **Node 20 required.** Prefix every `npm`/`npx` command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`.
- All app commands run from `app/` unless stated otherwise.
- **Copy rule:** user-facing strings say "Apple TV", never "iTunes". Goblin voice for user-facing copy (modal, stat strip); plain prose everywhere else.
- **Migration 0211 reserved for this plan** (`db/migrations/0211_library_price_paid.sql`). Rollout order at ship time: **migration first, then app deploy** (only new code reads the column).
- **`app/lib/supabase/types.ts` is HAND-EDITED.** Add the new column by hand (Task 2 shows exactly where); do NOT run `npm run gen:types`.
- Queue timing constants (from spec): eligibility floor **2 minutes**, expiry **48 hours**, queue cap **10**, localStorage key **`fg_pending_buys`**.
- Action semantics (from spec): fresh insert stores the price and deletes any watchlist row (owning supersedes wanting); existing row only fills a NULL `price_paid_usd`, never overwrites; existing row with a price changes nothing.
- Signed-in only: anonymous clicks are not captured; `PurchasePrompt` mounts only for signed-in users.
- Action tests follow the env-gated integration pattern (`describe.skipIf(!hasEnv)` + `if (!hasEnv) return` guards inside every lifecycle hook) — see `app/tests/actions/library.test.ts` for the house shape.
- Branch: `feature/buy-claim-loop` (already exists; spec committed as `54d0779`).
- Commit-message gotcha: heredoc commit messages get mangled in this repo — use single-line `-m` or write the message to a file and `git commit -F`.

---

### Task 1: Pending-buy queue module

**Files:**
- Create: `app/lib/purchase/pending.ts`
- Test: `app/tests/purchase/pending.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (Tasks 4 and 5 import these from `@/lib/purchase/pending`):
  - `interface PendingBuy { filmId: string; title: string; price: number | null; clickedAt: string; deferred?: boolean }`
  - `interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }`
  - `addPendingBuy(storage: StorageLike, buy: Omit<PendingBuy, "deferred">): void`
  - `nextEligibleBuy(storage: StorageLike, now: Date): PendingBuy | null`
  - `resolvePendingBuy(storage: StorageLike, filmId: string, outcome: "confirmed" | "declined" | "dismissed"): void`

- [ ] **Step 1: Write the failing test**

Create `app/tests/purchase/pending.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  addPendingBuy,
  nextEligibleBuy,
  resolvePendingBuy,
  type StorageLike,
} from "../../lib/purchase/pending";

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function brokenStorage(): StorageLike {
  return {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
}

const T0 = new Date("2026-07-07T12:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const iso = (d: Date) => d.toISOString();

const buy = (filmId: string, clickedAt: Date, price: number | null = 9.99) => ({
  filmId,
  title: `Film ${filmId}`,
  price,
  clickedAt: iso(clickedAt),
});

describe("addPendingBuy", () => {
  it("adds an entry retrievable once past the 2-minute floor", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0));
    expect(nextEligibleBuy(s, minutes(1))).toBeNull();          // too fresh
    expect(nextEligibleBuy(s, minutes(3))?.filmId).toBe("a");   // eligible
  });

  it("replaces an older entry for the same film", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0, 14.99));
    addPendingBuy(s, buy("a", minutes(1), 9.99));
    const next = nextEligibleBuy(s, minutes(5));
    expect(next?.price).toBe(9.99);
  });

  it("caps the queue at 10, evicting the oldest", () => {
    const s = memStorage();
    for (let i = 0; i < 12; i++) addPendingBuy(s, buy(`f${i}`, minutes(i)));
    const raw = JSON.parse(s.map.get("fg_pending_buys")!);
    expect(raw).toHaveLength(10);
    expect(raw[0].filmId).toBe("f2"); // f0, f1 evicted
  });

  it("no-ops silently when storage throws", () => {
    expect(() => addPendingBuy(brokenStorage(), buy("a", T0))).not.toThrow();
  });
});

describe("nextEligibleBuy", () => {
  it("returns the most recent eligible entry when several qualify", () => {
    const s = memStorage();
    addPendingBuy(s, buy("old", T0));
    addPendingBuy(s, buy("new", minutes(10)));
    expect(nextEligibleBuy(s, minutes(20))?.filmId).toBe("new");
  });

  it("prunes entries older than 48h and returns null when all expired", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0));
    expect(nextEligibleBuy(s, minutes(49 * 60))).toBeNull();
    const raw = JSON.parse(s.map.get("fg_pending_buys")!);
    expect(raw).toHaveLength(0); // pruned, not just skipped
  });

  it("returns null on empty or corrupt storage", () => {
    const s = memStorage();
    expect(nextEligibleBuy(s, T0)).toBeNull();
    s.setItem("fg_pending_buys", "{not json");
    expect(nextEligibleBuy(s, T0)).toBeNull();
    expect(nextEligibleBuy(brokenStorage(), T0)).toBeNull();
  });
});

describe("resolvePendingBuy", () => {
  it("removes the entry on confirmed and declined", () => {
    for (const outcome of ["confirmed", "declined"] as const) {
      const s = memStorage();
      addPendingBuy(s, buy("a", T0));
      resolvePendingBuy(s, "a", outcome);
      expect(nextEligibleBuy(s, minutes(5))).toBeNull();
    }
  });

  it("defers once on dismissed, removes on second dismissal", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0));
    resolvePendingBuy(s, "a", "dismissed");
    expect(nextEligibleBuy(s, minutes(5))?.deferred).toBe(true); // still asked once more
    resolvePendingBuy(s, "a", "dismissed");
    expect(nextEligibleBuy(s, minutes(5))).toBeNull();           // gone
  });

  it("no-ops on unknown film or broken storage", () => {
    const s = memStorage();
    expect(() => resolvePendingBuy(s, "ghost", "declined")).not.toThrow();
    expect(() => resolvePendingBuy(brokenStorage(), "a", "dismissed")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/purchase/pending.test.ts`
Expected: FAIL — cannot resolve `../../lib/purchase/pending`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/purchase/pending.ts`:

```ts
// Pending buy-click queue for The Claiming (spec 2026-07-07). Pure functions
// over an injected StorageLike so the logic is testable without a browser;
// callers pass window.localStorage. Every operation swallows storage errors
// (private-mode Safari etc.) — the feature degrades to "no prompt", never
// breaks the page.

export interface PendingBuy {
  filmId: string;
  title: string;
  price: number | null; // price shown at click time; null if the surface had none
  clickedAt: string;    // ISO timestamp
  deferred?: boolean;   // dismissed once already — one more ask, then drop
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "fg_pending_buys";
const MAX_QUEUE = 10;
export const MIN_AGE_MS = 2 * 60 * 1000;       // don't ambush an instant bounce-back
export const MAX_AGE_MS = 48 * 60 * 60 * 1000; // stale questions die

function read(storage: StorageLike): PendingBuy[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PendingBuy =>
        !!e && typeof e === "object" &&
        typeof (e as PendingBuy).filmId === "string" &&
        typeof (e as PendingBuy).clickedAt === "string"
    );
  } catch {
    return [];
  }
}

function write(storage: StorageLike, entries: PendingBuy[]): void {
  try {
    storage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — degrade silently */
  }
}

export function addPendingBuy(storage: StorageLike, buy: Omit<PendingBuy, "deferred">): void {
  const entries = read(storage).filter(e => e.filmId !== buy.filmId);
  entries.push({ ...buy });
  while (entries.length > MAX_QUEUE) entries.shift();
  write(storage, entries);
}

/** Most recent entry inside the (2min, 48h) window; expired entries pruned. */
export function nextEligibleBuy(storage: StorageLike, now: Date): PendingBuy | null {
  const entries = read(storage);
  const fresh = entries.filter(e => {
    const age = now.getTime() - Date.parse(e.clickedAt);
    return Number.isFinite(age) && age < MAX_AGE_MS;
  });
  if (fresh.length !== entries.length) write(storage, fresh);
  const eligible = fresh.filter(e => now.getTime() - Date.parse(e.clickedAt) > MIN_AGE_MS);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (Date.parse(b.clickedAt) > Date.parse(a.clickedAt) ? b : a));
}

export function resolvePendingBuy(
  storage: StorageLike,
  filmId: string,
  outcome: "confirmed" | "declined" | "dismissed",
): void {
  const entries = read(storage);
  const idx = entries.findIndex(e => e.filmId === filmId);
  if (idx === -1) return;
  if (outcome === "dismissed" && !entries[idx].deferred) {
    entries[idx] = { ...entries[idx], deferred: true };
  } else {
    entries.splice(idx, 1);
  }
  write(storage, entries);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/purchase/pending.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/purchase/pending.ts app/tests/purchase/pending.test.ts
git commit -m "feat(claiming): pending buy-click queue module"
```

---

### Task 2: Migration 0211, types hand-edit, and the confirmPurchase action

**Files:**
- Create: `db/migrations/0211_library_price_paid.sql`
- Modify: `app/lib/supabase/types.ts` (library table types — hand-edit, do NOT regen)
- Modify: `app/lib/actions/library.ts`
- Test: `app/tests/actions/confirm-purchase.test.ts`

**Interfaces:**
- Consumes: existing `requireAuthUser`, `createClient`, `serviceRoleClient`, `createTheaterNotificationsForUserFilm` (all already imported in `library.ts`).
- Produces (Task 5 imports from `@/lib/actions/library`):
  - `confirmPurchase(filmId: string, pricePaid: number | null): Promise<{ alreadyOwnedWithPrice: boolean; peak: number | null }>`
  - private form `_confirmPurchase(client: Client, filmId: string, pricePaid: number | null)` with the same return type.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0211_library_price_paid.sql`:

```sql
-- 0211_library_price_paid.sql
-- The Claiming (spec 2026-07-07-buy-claim-loop): record what the user paid
-- when they confirm a purchase from the return-prompt. Nullable — manual
-- grimoire adds and all existing rows leave it NULL. No RLS change: the
-- existing library_select policy covers the column (price paid is
-- coven-visible alongside the row, accepted deliberately in the spec).
ALTER TABLE library ADD COLUMN price_paid_usd NUMERIC(6,2);
```

Do NOT apply to prod in this task — prod apply is Task 6 (rollout order: migration before deploy). If a local test Supabase is available (the `TEST_SUPABASE_*` env vars), apply it there so the action tests can run: `cd db && set -a; source ../app/.env.local; set +a; npm run migrate` — but ONLY against the local/test database; check `db/CLAUDE.md` for the migrate command's target before running.

- [ ] **Step 2: Hand-edit `app/lib/supabase/types.ts`**

Find the `library:` table definition (search for `library: {`). Add `price_paid_usd` to all three shapes, matching the file's existing style for nullable numerics:

- In `Row`: `price_paid_usd: number | null;`
- In `Insert`: `price_paid_usd?: number | null;`
- In `Update`: `price_paid_usd?: number | null;`

Do not run `npm run gen:types` — this file is hand-maintained and regen clobbers other hand edits.

- [ ] **Step 3: Write the failing action test**

Create `app/tests/actions/confirm-purchase.test.ts` (env-gated integration test, house pattern from `app/tests/actions/library.test.ts` — note the `if (!hasEnv) return` guard in EVERY lifecycle hook):

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _confirmPurchase } from "../../lib/actions/library";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 810000 + Math.floor(Math.random() * 100000), title: "Claim Test", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
  // Price history: peak 19.99, later 4.99.
  const { error: histErr } = await admin.from("price_history").insert([
    { film_id: filmId, price_usd: 19.99, captured_at: "2026-01-01T00:00:00Z" },
    { film_id: filmId, price_usd: 4.99, captured_at: "2026-06-01T00:00:00Z" },
  ]);
  if (histErr) throw histErr;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) {
    const admin = adminClient();
    await admin.from("price_history").delete().eq("film_id", filmId);
    await admin.from("films").delete().eq("id", filmId);
  }
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("library").delete().eq("user_id", userA.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
});

describe.skipIf(!hasEnv)("actions/confirmPurchase", () => {
  it("inserts a library row with price paid and removes any watchlist row", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: filmId, max_price_usd: 5.99 });

    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, 4.99);

    expect(res.alreadyOwnedWithPrice).toBe(false);
    expect(res.peak).toBe(19.99);

    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(lib).toHaveLength(1);
    expect(Number(lib![0].price_paid_usd)).toBe(4.99);

    const { data: wl } = await admin.from("watchlists").select("*").eq("user_id", userA.id).eq("film_id", filmId);
    expect(wl).toHaveLength(0);
  });

  it("fills a NULL price on an already-owned film without duplicating the row", async () => {
    const admin = adminClient();
    await admin.from("library").insert({ user_id: userA.id, film_id: filmId }); // manual add, no price

    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, 7.99);

    expect(res.alreadyOwnedWithPrice).toBe(false);
    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(lib).toHaveLength(1);
    expect(Number(lib![0].price_paid_usd)).toBe(7.99);
  });

  it("never overwrites an existing price", async () => {
    const admin = adminClient();
    await admin.from("library").insert({ user_id: userA.id, film_id: filmId, price_paid_usd: 3.99 });

    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, 9.99);

    expect(res.alreadyOwnedWithPrice).toBe(true);
    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(Number(lib![0].price_paid_usd)).toBe(3.99);
  });

  it("accepts a null price (claim without a known figure)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, null);
    expect(res.alreadyOwnedWithPrice).toBe(false);
    const admin = adminClient();
    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(lib![0].price_paid_usd).toBeNull();
  });

  it("rejects out-of-range prices", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(_confirmPurchase(c as any, filmId, 0)).rejects.toThrow();
    await expect(_confirmPurchase(c as any, filmId, -1)).rejects.toThrow();
    await expect(_confirmPurchase(c as any, filmId, 1000)).rejects.toThrow();
    await expect(_confirmPurchase(c as any, filmId, NaN)).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/actions/confirm-purchase.test.ts`
Expected: FAIL with `_confirmPurchase` not exported (or SKIP if `TEST_SUPABASE_*` env is absent — in that case rely on typecheck in Step 6 and note it in your report).

- [ ] **Step 5: Implement the action**

Append to `app/lib/actions/library.ts` (all imports it needs are already present in the file):

```ts
/**
 * The Claiming (spec 2026-07-07-buy-claim-loop): confirm a purchase from the
 * return-prompt. Fresh insert stores price_paid_usd and deletes any watchlist
 * row (owning supersedes wanting — same semantics as _addToLibrary; the
 * library_added activity comes from the DB insert trigger, mig 0134, so the
 * fill-price UPDATE path correctly emits nothing). An existing row only has a
 * NULL price filled — never overwritten.
 */
export async function _confirmPurchase(
  client: Client,
  filmId: string,
  pricePaid: number | null,
): Promise<{ alreadyOwnedWithPrice: boolean; peak: number | null }> {
  const user = await requireAuthUser(client);
  if (pricePaid != null && !(Number.isFinite(pricePaid) && pricePaid > 0 && pricePaid < 1000)) {
    throw new Error("invalid price");
  }

  let alreadyOwnedWithPrice = false;

  const { error: insertErr } = await client
    .from("library")
    .insert({ user_id: user.id, film_id: filmId, price_paid_usd: pricePaid });

  if (insertErr && insertErr.code !== "23505") throw insertErr;

  if (insertErr) {
    // Already owned — fill a NULL price only.
    const { data: row, error: selErr } = await client
      .from("library")
      .select("price_paid_usd")
      .eq("user_id", user.id)
      .eq("film_id", filmId)
      .single();
    if (selErr) throw selErr;
    if (row.price_paid_usd != null) {
      alreadyOwnedWithPrice = true;
    } else if (pricePaid != null) {
      const { error: updErr } = await client
        .from("library")
        .update({ price_paid_usd: pricePaid })
        .eq("user_id", user.id)
        .eq("film_id", filmId);
      if (updErr) throw updErr;
    }
  } else {
    // Fresh insert — owning supersedes wanting.
    await client
      .from("watchlists")
      .delete()
      .eq("user_id", user.id)
      .eq("film_id", filmId);
  }

  const { data: peakRow, error: peakErr } = await client
    .from("price_history")
    .select("price_usd")
    .eq("film_id", filmId)
    .order("price_usd", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (peakErr) throw peakErr;

  return { alreadyOwnedWithPrice, peak: peakRow ? Number(peakRow.price_usd) : null };
}

export async function confirmPurchase(filmId: string, pricePaid: number | null) {
  const supabase = await createClient();
  const result = await _confirmPurchase(supabase, filmId, pricePaid);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await createTheaterNotificationsForUserFilm(serviceRoleClient(), user.id, filmId);
  }
  revalidatePath("/library");
  revalidatePath("/watchlist");
  revalidatePath(`/film/${filmId}`);
  return result;
}
```

- [ ] **Step 6: Typecheck + run the test**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` — Expected: exit 0 (this validates the types.ts hand-edit even if the integration test skips).
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/actions/confirm-purchase.test.ts` — Expected: PASS (5 tests) with env, or all skipped without.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0211_library_price_paid.sql app/lib/supabase/types.ts app/lib/actions/library.ts app/tests/actions/confirm-purchase.test.ts
git commit -m "feat(claiming): mig 0211 price_paid_usd + confirmPurchase action"
```

---

### Task 3: Savings query and grimoire stat strip

**Files:**
- Modify: `app/lib/queries/library.ts`
- Modify: `app/app/library/page.tsx`
- Test: `app/tests/purchase/savings.test.ts`

**Interfaces:**
- Consumes: `library.price_paid_usd` (Task 2), existing query patterns in `app/lib/queries/library.ts` (client injection — first arg is the Supabase client).
- Produces:
  - `summarizeSavings(rows: { paid: number; peak: number | null }[]): { claimedCount: number; totalPaid: number; totalSaved: number }` (pure, exported for tests)
  - `getLibrarySavings(client: Client, userId: string): Promise<{ claimedCount: number; totalPaid: number; totalSaved: number }>`

- [ ] **Step 1: Write the failing test for the pure summary**

Create `app/tests/purchase/savings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeSavings } from "../../lib/queries/library";

describe("summarizeSavings", () => {
  it("sums paid and peak-minus-paid savings", () => {
    const out = summarizeSavings([
      { paid: 4.99, peak: 19.99 },
      { paid: 7.99, peak: 14.99 },
    ]);
    expect(out.claimedCount).toBe(2);
    expect(out.totalPaid).toBeCloseTo(12.98);
    expect(out.totalSaved).toBeCloseTo(15.0 + 7.0);
  });

  it("floors per-film savings at zero (paid above peak)", () => {
    const out = summarizeSavings([{ paid: 19.99, peak: 9.99 }]);
    expect(out.totalSaved).toBe(0);
  });

  it("counts films with no price history as claimed, $0 saved", () => {
    const out = summarizeSavings([{ paid: 4.99, peak: null }]);
    expect(out.claimedCount).toBe(1);
    expect(out.totalPaid).toBeCloseTo(4.99);
    expect(out.totalSaved).toBe(0);
  });

  it("returns zeros for empty input", () => {
    expect(summarizeSavings([])).toEqual({ claimedCount: 0, totalPaid: 0, totalSaved: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/purchase/savings.test.ts`
Expected: FAIL — `summarizeSavings` not exported.

- [ ] **Step 3: Implement query + summary**

Append to `app/lib/queries/library.ts`:

```ts
/** Pure aggregation for the grimoire stat strip. Exported for tests. */
export function summarizeSavings(
  rows: { paid: number; peak: number | null }[],
): { claimedCount: number; totalPaid: number; totalSaved: number } {
  let totalPaid = 0;
  let totalSaved = 0;
  for (const r of rows) {
    totalPaid += r.paid;
    if (r.peak != null) totalSaved += Math.max(r.peak - r.paid, 0);
  }
  return { claimedCount: rows.length, totalPaid, totalSaved };
}

/**
 * Savings summary for the /library stat strip: films with a recorded
 * price_paid_usd, measured against each film's all-time price_history peak.
 * Savings are computed at read time — never stored (spec §Decision summary).
 * Scale note: pulls all history rows for claimed films; fine at current
 * catalog/user scale, aggregate in SQL if this ever shows up in timings.
 */
export async function getLibrarySavings(
  client: Client,
  userId: string,
): Promise<{ claimedCount: number; totalPaid: number; totalSaved: number }> {
  const { data, error } = await client
    .from("library")
    .select("film_id, price_paid_usd")
    .eq("user_id", userId)
    .not("price_paid_usd", "is", null);
  if (error) throw error;
  const owned = data ?? [];
  if (owned.length === 0) return { claimedCount: 0, totalPaid: 0, totalSaved: 0 };

  const { data: hist, error: histErr } = await client
    .from("price_history")
    .select("film_id, price_usd")
    .in("film_id", owned.map(r => r.film_id));
  if (histErr) throw histErr;

  const peaks = new Map<string, number>();
  for (const h of hist ?? []) {
    const p = Number(h.price_usd);
    const prev = peaks.get(h.film_id);
    if (prev == null || p > prev) peaks.set(h.film_id, p);
  }

  return summarizeSavings(
    owned.map(r => ({ paid: Number(r.price_paid_usd), peak: peaks.get(r.film_id) ?? null })),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vitest run tests/purchase/savings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the stat strip to `/library`**

Read `app/app/library/page.tsx` first — find where the page fetches data (it calls `getLibrary(...)`) and where the heading/section markup starts. Add `getLibrarySavings` to the page's parallel fetches (same client, the signed-in user's id), then render directly under the page heading, hidden when nothing is claimed:

```tsx
{savings.claimedCount > 0 && (
  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "12px 0 20px", fontFamily: "var(--font-ui)" }}>
    <div>
      <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Claimed</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{savings.claimedCount}</div>
    </div>
    <div>
      <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Tithed to Apple</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>${savings.totalPaid.toFixed(2)}</div>
    </div>
    <div>
      <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>Kept from the fire</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>${savings.totalSaved.toFixed(2)}</div>
    </div>
  </div>
)}
```

Adapt the exact wrapper placement to the page's real structure (match neighboring spacing/markup conventions); keep the three stats and their copy exactly as shown.

- [ ] **Step 6: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add app/lib/queries/library.ts app/app/library/page.tsx app/tests/purchase/savings.test.ts
git commit -m "feat(claiming): getLibrarySavings + grimoire stat strip"
```

---

### Task 4: BuyOnAppleLink capture component, wired at both surfaces

**Files:**
- Create: `app/components/BuyOnAppleLink.tsx`
- Modify: `app/app/film/[id]/page.tsx` (~lines 209–213, the Buy button)
- Modify: `app/app/watchlist/page.tsx` (~lines 116–127, the "Apple TV · $X →" caption anchor)

**Interfaces:**
- Consumes: `addPendingBuy` from `@/lib/purchase/pending` (Task 1).
- Produces: default export `BuyOnAppleLink({ filmId, title, price, href, signedIn, className, style, children })` — a drop-in replacement for a plain outbound `<a>`.

- [ ] **Step 1: Write the component**

Create `app/components/BuyOnAppleLink.tsx`:

```tsx
"use client";

import { addPendingBuy } from "@/lib/purchase/pending";

interface Props {
  filmId: string;
  title: string;
  price: number | null;
  href: string;
  signedIn: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

// Outbound Apple TV buy link that arms the purchase-confirmation prompt
// (spec 2026-07-07-buy-claim-loop). Renders the same anchor the caller
// would have rendered — appearance is entirely the caller's. The click
// handler only records; it never blocks or delays navigation.
export default function BuyOnAppleLink({ filmId, title, price, href, signedIn, className, style, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
      onClick={() => {
        if (!signedIn) return;
        addPendingBuy(window.localStorage, {
          filmId,
          title,
          price,
          clickedAt: new Date().toISOString(),
        });
      }}
    >
      {children}
    </a>
  );
}
```

(`addPendingBuy` already swallows storage errors internally — no try/catch needed here.)

- [ ] **Step 2: Wire the film page**

In `app/app/film/[id]/page.tsx`, add the import alongside the other component imports:

```tsx
import BuyOnAppleLink from "@/components/BuyOnAppleLink";
```

Replace the Buy anchor (current code):

```tsx
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
```

With:

```tsx
              {film.itunes_url && (
                <BuyOnAppleLink
                  filmId={film.id}
                  title={film.title}
                  price={currentPrice}
                  href={film.itunes_url}
                  signedIn={Boolean(user)}
                  className="btn btn-lg"
                >
                  Buy on Apple TV →
                </BuyOnAppleLink>
              )}
```

(`user` and `currentPrice` are existing variables in the page — see ~lines 90–99.)

- [ ] **Step 3: Wire the watchlist caption link**

In `app/app/watchlist/page.tsx`, add the same import. Replace the caption anchor (current code):

```tsx
                      {r.film.itunes_url && (
                        <a
                          href={r.film.itunes_url}
                          target="_blank"
                          rel="noreferrer"
                          className="caps"
                          style={{ display: "inline-block", fontSize: 10, color: "var(--accent)", marginTop: 4, textDecoration: "none" }}
                        >
                          Apple TV{r.film.latest_price != null ? ` · $${r.film.latest_price.toFixed(2)}` : ""} →
                        </a>
                      )}
```

With:

```tsx
                      {r.film.itunes_url && (
                        <BuyOnAppleLink
                          filmId={r.film.id}
                          title={r.film.title}
                          price={r.film.latest_price}
                          href={r.film.itunes_url}
                          signedIn
                          className="caps"
                          style={{ display: "inline-block", fontSize: 10, color: "var(--accent)", marginTop: 4, textDecoration: "none" }}
                        >
                          Apple TV{r.film.latest_price != null ? ` · $${r.film.latest_price.toFixed(2)}` : ""} →
                        </BuyOnAppleLink>
                      )}
```

(`/watchlist` is an authenticated page — `signedIn` is unconditionally true. If `r.film.latest_price`'s type is `number | undefined` rather than `number | null`, pass `price={r.film.latest_price ?? null}`.)

- [ ] **Step 4: Typecheck**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/components/BuyOnAppleLink.tsx "app/app/film/[id]/page.tsx" app/app/watchlist/page.tsx
git commit -m "feat(claiming): BuyOnAppleLink capture component at both buy surfaces"
```

---

### Task 5: PurchasePrompt modal + layout mount

**Files:**
- Create: `app/components/PurchasePrompt.tsx`
- Modify: `app/app/layout.tsx` (mount next to `AnnouncementOverlay`, ~line 143)

**Interfaces:**
- Consumes: `nextEligibleBuy`, `resolvePendingBuy`, `PendingBuy` from `@/lib/purchase/pending` (Task 1); `confirmPurchase` from `@/lib/actions/library` (Task 2); `BottomSheet` from `@/components/BottomSheet` (existing — props `{ open, onClose, title, children }`).
- Produces: default export `PurchasePrompt()` (no props).

- [ ] **Step 1: Write the component**

Create `app/components/PurchasePrompt.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import { nextEligibleBuy, resolvePendingBuy, type PendingBuy } from "@/lib/purchase/pending";
import { confirmPurchase } from "@/lib/actions/library";

// The return-prompt for The Claiming (spec 2026-07-07-buy-claim-loop).
// Mounted once in the signed-in layout; checks the pending-buy queue on
// mount and whenever the tab regains visibility. One prompt per mount
// lifetime — subsequent pending entries surface on later page loads.
export default function PurchasePrompt() {
  const [buy, setBuy] = useState<PendingBuy | null>(null);
  const [reward, setReward] = useState<{ peak: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);

  const check = useCallback(() => {
    if (shown.current) return;
    const next = nextEligibleBuy(window.localStorage, new Date());
    if (next) {
      shown.current = true;
      setBuy(next);
    }
  }, []);

  useEffect(() => {
    check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [check]);

  if (!buy) return null;

  const finish = () => {
    setBuy(null);
    setReward(null);
  };

  const dismiss = () => {
    if (!reward) resolvePendingBuy(window.localStorage, buy.filmId, "dismissed");
    finish();
  };

  const decline = () => {
    resolvePendingBuy(window.localStorage, buy.filmId, "declined");
    finish();
  };

  const claim = async () => {
    setBusy(true);
    try {
      const res = await confirmPurchase(buy.filmId, buy.price);
      resolvePendingBuy(window.localStorage, buy.filmId, "confirmed");
      if (res.alreadyOwnedWithPrice) {
        finish();
        return;
      }
      setReward({ peak: res.peak });
    } catch {
      // Action failed — leave the entry pending so a later visit can retry.
      finish();
    } finally {
      setBusy(false);
    }
  };

  const savings =
    reward && reward.peak != null && buy.price != null && reward.peak > buy.price
      ? reward.peak - buy.price
      : null;

  return (
    <BottomSheet open onClose={dismiss} title={reward ? "It is done." : "A question from the pit"}>
      {reward ? (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>{buy.title}</strong> joins your grimoire
            {buy.price != null ? <> — claimed at ${buy.price.toFixed(2)}</> : null}.
          </p>
          {savings != null && (
            <p style={{ margin: "0 0 16px", color: "var(--accent)", fontWeight: 700 }}>
              ${savings.toFixed(2)} below its peak. Well haggled.
            </p>
          )}
          <button type="button" className="btn" onClick={finish}>
            Close
          </button>
        </div>
      ) : (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 16px" }}>
            Did you claim <strong style={{ fontStyle: "italic" }}>{buy.title}</strong>
            {buy.price != null ? <> at ${buy.price.toFixed(2)}</> : null}?
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={claim} disabled={busy}>
              {busy ? "Binding…" : "Claimed it"}
            </button>
            <button type="button" className="btn-outline" onClick={decline} disabled={busy}>
              Not this time
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
```

Note: check the real secondary-button class in `app/styles/00-core.css` before committing — root CLAUDE.md records it as `.btn-outline` (the `.btn-outline-bone` name in `app/components/CLAUDE.md` is conceptual). Use whatever the neighboring modals (`RecommendModal.tsx`) actually use.

- [ ] **Step 2: Mount in the layout**

In `app/app/layout.tsx`, add the import:

```tsx
import PurchasePrompt from "@/components/PurchasePrompt";
```

And in the body (around line 143), mount for signed-in users only:

```tsx
        <ToastProvider>
          {children}
          {pending && <AnnouncementOverlay announcement={pending} />}
          {user && <PurchasePrompt />}
        </ToastProvider>
```

(`user` already exists in the layout from `getServerUser()`.)

- [ ] **Step 3: Typecheck + full suite**

Run (from `app/`):
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck` — Expected: exit 0.
`PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — Expected: all pass, no new failures (the 10 pending-queue + 4 savings tests included).

- [ ] **Step 4: Manual smoke (dev server)**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev`
This step needs the mig 0211 column present in whatever database the dev server points at — if dev points at prod and Task 6 hasn't run, defer the parts that exercise `confirmPurchase` and note it. Checklist:
- Signed in, click Buy on a priced film → `localStorage.fg_pending_buys` gains an entry (DevTools).
- Manually edit the entry's `clickedAt` back 3+ minutes, reload → modal appears with title + price.
- "Not this time" → entry removed, no re-prompt on reload.
- Re-arm, dismiss via backdrop → entry has `deferred: true`, re-prompts on next reload, second dismissal removes it.
- Signed out → Buy click adds nothing.

- [ ] **Step 5: Commit**

```bash
git add app/components/PurchasePrompt.tsx app/app/layout.tsx
git commit -m "feat(claiming): PurchasePrompt return modal, mounted in layout"
```

---

### Task 6: Docs, prod migration, deploy, live smoke

**Files:**
- Modify: `CLAUDE.md` (root — "Current state" + "Open threads")
- Modify: `docs/sub-project-history.md` (append next row — check the current last row number first; it was 38 as of 2026-07-07 morning)

**Interfaces:**
- Consumes: shipped state from Tasks 1–5.
- Produces: session documentation + live feature.

- [ ] **Step 1: Update root `CLAUDE.md`**

Add a new "Last shipped (2026-07-07, …)" paragraph at the top of Current state (demote the previous entry's label to "Previously shipped" per the file's convention; bump `**Last updated:**`). Content: The Claiming — buy-click capture (`fg_pending_buys` localStorage queue, 2min–48h window, defer-once dismissal), `BuyOnAppleLink` at film page + watchlist, `PurchasePrompt` in the signed-in layout, `confirmPurchase` (fill-null-only price semantics; activity via the existing mig 0134 insert trigger), mig 0211 `library.price_paid_usd`, `/library` stat strip (claimed / tithed / kept from the fire; savings computed at read time vs `price_history` peak). Note the accepted privacy point (price paid is coven-visible with the row) and the deferred items (cross-device pending table, profile display, price-paid editing). Cite spec + plan paths.

- [ ] **Step 2: Append the sub-project-history row**

Append the next row (number = last row + 1) to `docs/sub-project-history.md` in the established dense style, citing mig 0211, the new files, the fill-null-only semantics, and the spec filename `2026-07-07-buy-claim-loop-design.md`.

- [ ] **Step 3: Full verification**

Run (from `app/`): `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: both exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/sub-project-history.md
git commit -m "docs: record The Claiming ship"
```

- [ ] **Step 5: Ship sequence (after merge to master — controller/owner step)**

1. Apply mig 0211 to prod (from `db/`): `set -a; source ../app/.env.local; set +a; npm run migrate` — expect it to report 0211 applied. (Session-mode pooler connection; see root CLAUDE.md "Supabase prod DB" gotcha.)
2. Deploy from repo root: `npx vercel deploy --prod --yes`.
3. Live smoke: signed-in buy click on prod → return → confirm → row lands with `price_paid_usd` (`SELECT price_paid_usd FROM library WHERE film_id = …`), `/library` strip shows the claim; iPhone PWA pass per spec §8.

**Ship sequence:** migration 0211 FIRST, then deploy — stated in Global Constraints; only new code reads the new column.
