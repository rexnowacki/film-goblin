# Admin Dashboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a staff-gated internal operations panel at `/admin` for adding/editing/retiring films and creating/inspecting/deleting users.

**Architecture:** Next.js App Router under `app/app/admin/`. Two-layer admin auth (layout guard + per-action `requireAdmin`). Films writes go through the admin-authenticated Supabase client with a new RLS policy. User management goes through a lazy service-role client because `auth.admin.*` demands it. iTunes search/lookup is reused from the worker package via the existing `file:` dependency — no duplication.

**Tech Stack:** Next.js 15 App Router, React 19 Server + Client Components, Supabase SSR + service-role, Postgres + RLS, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-24-admin-dashboard-v1-design.md`.

---

## Preamble: worktree setup

**Before starting any task:** create a worktree at `.worktrees/admin` on branch `feat/admin-dashboard` so work is isolated from master.

```bash
cd /home/cthulhulemon/film_goblin
git worktree add .worktrees/admin -b feat/admin-dashboard master
cd .worktrees/admin
```

All file paths below are relative to the worktree root.

**Node 20:** prefix `npm` / `tsx` / `node` commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` unless you've run `nvm use 20` in the shell.

**Deploy rule:** always run `npx vercel deploy` from the worktree ROOT (not from `app/`). Copy `.vercel/project.json` to `.worktrees/admin/.vercel/project.json` before the first deploy.

---

## File structure

### New files

| File | Role |
|------|------|
| `db/migrations/0118_films_nullable_itunes_id_and_rls.sql` | Migration: nullable `itunes_id`, partial unique index, enable RLS, `films_public_read` + `films_admin_write` policies. |
| `worker/src/itunes.ts` (export-only change) | Re-export `insertManualFilm` from `db.ts` + ensure `searchFilms`, `parseFilm`, `fetchPrices`, `upsertFilm` are reachable from the app. |
| `worker/src/db.ts` (add helper) | New `insertManualFilm(client, fields)` function for manual-entry films. |
| `app/lib/supabase/service-role.ts` | Server-only service-role client factory. Never imported from a client component. |
| `app/lib/auth/require-admin.ts` | `requireAdmin(supabase)` throws for non-admins. |
| `app/app/admin/layout.tsx` | Auth gate; redirects non-admins. |
| `app/app/admin/page.tsx` | Section-tile grid (Films, Users). |
| `app/lib/actions/admin/films.ts` | Server actions: iTunes search, iTunes ID lookup, create film (iTunes or manual), update film, retire film. |
| `app/lib/actions/admin/users.ts` | Server actions: create test user, delete user. |
| `app/lib/queries/admin/films.ts` | Read helpers for admin list + search. |
| `app/lib/queries/admin/users.ts` | Read helpers for admin list + detail (service-role cross-schema). |
| `app/app/admin/films/page.tsx` | Film list + search + pagination. |
| `app/app/admin/films/FilmForm.tsx` | Shared create/edit form (client component). |
| `app/app/admin/films/iTunesSearchBox.tsx` | Search widget (client). |
| `app/app/admin/films/iTunesPasteBox.tsx` | URL/ID paste widget (client). |
| `app/app/admin/films/RetireModal.tsx` | Retire confirmation modal (client). |
| `app/app/admin/films/new/page.tsx` | Add-film page (composes three entry paths + FilmForm). |
| `app/app/admin/films/[id]/edit/page.tsx` | Edit-film page. |
| `app/app/admin/users/page.tsx` | User list + search. |
| `app/app/admin/users/new/page.tsx` | Create-test-user form. |
| `app/app/admin/users/[id]/page.tsx` | User detail + delete. |
| `app/app/admin/users/DeleteUserModal.tsx` | Dual-path delete confirmation (client). |
| `app/tests/admin/layout-guard.test.ts` | Auth-gate test (3 cases). |
| `app/tests/admin/require-admin.test.ts` | Helper test (4 cases). |
| `db/tests/rls/films-admin-write.test.ts` | RLS coverage for admin-only writes. |

### Modified files

- `app/components/TopNav.tsx` — fetch `staff.role` alongside profile, pass `isAdmin` down.
- `app/components/TopNavChrome.tsx` — accept `isAdmin` prop, forward to `UserMenu`.
- `app/components/UserMenu.tsx` — render conditional "Admin" link when `isAdmin`.

---

## Task 1: Migration — nullable itunes_id + RLS policies

**Files:**
- Create: `db/migrations/0118_films_nullable_itunes_id_and_rls.sql`

- [ ] **Step 1: Create the migration**

Create `db/migrations/0118_films_nullable_itunes_id_and_rls.sql` with:

```sql
-- Allow manual-entry films that have no iTunes listing.
ALTER TABLE films ALTER COLUMN itunes_id DROP NOT NULL;

-- Replace the old UNIQUE constraint with a partial unique index
-- so multiple NULL-itunes-id rows can coexist.
ALTER TABLE films DROP CONSTRAINT films_itunes_id_key;
CREATE UNIQUE INDEX films_itunes_id_unique
  ON films (itunes_id)
  WHERE itunes_id IS NOT NULL;

-- Bring films onto the same RLS footing as every other public table.
ALTER TABLE films ENABLE ROW LEVEL SECURITY;

-- Public read — the app has always assumed anyone can read films.
DROP POLICY IF EXISTS films_public_read ON films;
CREATE POLICY films_public_read ON films
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admin writes — mirrors the pattern used in 0107_reviews.sql.
DROP POLICY IF EXISTS films_admin_write ON films;
CREATE POLICY films_admin_write ON films
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));
```

- [ ] **Step 2: Run the smoke test to confirm the migration parses cleanly**

```bash
cd db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: `tests/migrations.smoke.test.ts` passes, showing every expected table was created.

- [ ] **Step 3: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add db/migrations/0118_films_nullable_itunes_id_and_rls.sql
git commit -m "feat(db): migration 0118 — nullable films.itunes_id + films RLS policies"
```

---

## Task 2: Worker — `insertManualFilm` helper + re-exports

**Files:**
- Modify: `worker/src/db.ts` (add function)
- Modify: `worker/src/worker.ts` (re-export surface)
- Modify: `worker/package.json` (no change expected; exports map already points at `worker.ts`)

- [ ] **Step 1: Add `insertManualFilm` to `worker/src/db.ts`**

Open `worker/src/db.ts`. Locate the existing `upsertFilm` function. Immediately after it, add:

```ts
export interface ManualFilmFields {
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  tracking: boolean;
  available: boolean;
}

export async function insertManualFilm(client: Client, f: ManualFilmFields): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO films (
       itunes_id, title, director, year, runtime_min, genre_primary,
       description, content_advisory, artwork_url, itunes_url, tracking, available
     ) VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      f.title, f.director, f.year, f.runtime_min, f.genre_primary,
      f.description, f.content_advisory, f.artwork_url, f.itunes_url,
      f.tracking, f.available,
    ]
  );
  return r.rows[0].id;
}
```

- [ ] **Step 2: Re-export the needed helpers from `worker/src/worker.ts`**

The app imports from the package root (`film-goblin-worker`), which resolves to `worker/src/worker.ts`. Open that file and add at the end (after the existing `runOnce` export):

```ts
// Re-exports for the Next.js admin dashboard — do not break these without updating
// app/lib/actions/admin/films.ts.
export { searchFilms, parseFilm, fetchPrices } from "./itunes.js";
export type { ParsedFilm } from "./itunes.js";
export { upsertFilm, insertManualFilm } from "./db.js";
export type { ManualFilmFields } from "./db.js";
```

If the existing worker.ts already re-exports some of these, don't duplicate — leave existing lines alone and add only the missing ones.

- [ ] **Step 3: Typecheck the worker package**

```bash
cd worker
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Run the worker tests to confirm no regression**

```bash
cd worker
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: all tests pass. Existing tests don't reference `insertManualFilm` yet, so they should be unaffected.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add worker/src/db.ts worker/src/worker.ts
git commit -m "feat(worker): insertManualFilm helper + re-export surface for admin app"
```

---

## Task 3: Service-role Supabase client factory

**Files:**
- Create: `app/lib/supabase/service-role.ts`

- [ ] **Step 1: Create the factory**

Create `app/lib/supabase/service-role.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * IMPORTANT: only call this from server-side code (server actions, route
 * handlers, server components). It reads SUPABASE_SERVICE_ROLE_KEY which is a
 * server-only env var. Any "use client" file that imports this module is a bug
 * — the key must never ship to the browser.
 *
 * Call this ONLY after `requireAdmin()` has succeeded. The client has
 * database god-mode.
 */
export function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (required for admin operations)");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/lib/supabase/service-role.ts
git commit -m "feat(app): service-role Supabase client factory (server-only)"
```

---

## Task 4: `requireAdmin` helper + tests

**Files:**
- Create: `app/lib/auth/require-admin.ts`
- Create: `app/tests/admin/require-admin.test.ts`

- [ ] **Step 1: Create the failing tests**

Create `app/tests/admin/require-admin.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { requireAdmin, NotAdminError } from "../../lib/auth/require-admin";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { createClient as createSbClient } from "@supabase/supabase-js";

let nonStaff: TestUser;
let reviewer: TestUser;
let admin: TestUser;

beforeAll(async () => {
  nonStaff = await createTestUser();
  reviewer = await createTestUser();
  admin = await createTestUser();
  const ac = adminClient();
  await ac.from("staff").insert({ user_id: reviewer.id, role: "reviewer" });
  await ac.from("staff").insert({ user_id: admin.id, role: "admin" });
});

afterAll(async () => {
  const ac = adminClient();
  await ac.from("staff").delete().in("user_id", [reviewer.id, admin.id]);
  await deleteTestUser(nonStaff.id);
  await deleteTestUser(reviewer.id);
  await deleteTestUser(admin.id);
});

function anonSb() {
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function asUser(user: TestUser) {
  const sb = anonSb();
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw error ?? new Error("no session");
  return sb;
}

describe("requireAdmin", () => {
  it("throws NotAdminError when signed out", async () => {
    const sb = anonSb();
    await expect(requireAdmin(sb)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("throws NotAdminError for non-staff user", async () => {
    const sb = await asUser(nonStaff);
    await expect(requireAdmin(sb)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("throws NotAdminError for staff with role=reviewer", async () => {
    const sb = await asUser(reviewer);
    await expect(requireAdmin(sb)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("resolves silently for staff with role=admin", async () => {
    const sb = await asUser(admin);
    await expect(requireAdmin(sb)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test tests/admin/require-admin.test.ts
```

Expected: FAIL because `require-admin.ts` doesn't exist.

- [ ] **Step 3: Implement the helper**

Create `app/lib/auth/require-admin.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export class NotAdminError extends Error {
  constructor() {
    super("admin role required");
    this.name = "NotAdminError";
  }
}

export type AdminAccessResult = "ok" | "not-authed" | "not-admin";

/**
 * Returns a discriminated result for use in redirect/decision logic
 * (layouts, middleware). For server actions use `requireAdmin` below,
 * which throws on any non-"ok" result.
 */
export async function checkAdminAccess(supabase: SupabaseClient<Database>): Promise<AdminAccessResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "not-authed";
  const { data, error } = await supabase
    .from("staff")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return "not-authed";
  if (!data || data.role !== "admin") return "not-admin";
  return "ok";
}

/**
 * Throws NotAdminError unless the caller is authenticated AND has
 * staff.role = 'admin'. Use at the top of every admin server action.
 */
export async function requireAdmin(supabase: SupabaseClient<Database>): Promise<void> {
  const result = await checkAdminAccess(supabase);
  if (result !== "ok") throw new NotAdminError();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test tests/admin/require-admin.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/lib/auth/require-admin.ts app/tests/admin/require-admin.test.ts
git commit -m "feat(app): requireAdmin helper + tests"
```

---

## Task 5: Admin layout guard + test

**Files:**
- Create: `app/app/admin/layout.tsx`
- Create: `app/tests/admin/layout-guard.test.ts`

- [ ] **Step 1: Create the failing test**

Create `app/tests/admin/layout-guard.test.ts`. The layout itself invokes Next's `cookies()` via `createClient()` which throws outside a request scope, so we test `checkAdminAccess` directly — that's the auth-decision logic the layout wraps. The integration is exercised by manual smoke in Task 18.

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../../lib/auth/require-admin";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

let nonStaff: TestUser;
let admin: TestUser;

beforeAll(async () => {
  nonStaff = await createTestUser();
  admin = await createTestUser();
  await adminClient().from("staff").insert({ user_id: admin.id, role: "admin" });
});

afterAll(async () => {
  await adminClient().from("staff").delete().eq("user_id", admin.id);
  await deleteTestUser(nonStaff.id);
  await deleteTestUser(admin.id);
});

function anonSb() {
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function asUser(user: TestUser) {
  const sb = anonSb();
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw error ?? new Error("no session");
  return sb;
}

describe("checkAdminAccess (layout-guard decision logic)", () => {
  it("returns 'not-authed' when signed-out", async () => {
    expect(await checkAdminAccess(anonSb())).toBe("not-authed");
  });

  it("returns 'not-admin' when signed-in but not staff", async () => {
    const sb = await asUser(nonStaff);
    expect(await checkAdminAccess(sb)).toBe("not-admin");
  });

  it("returns 'ok' when signed-in admin", async () => {
    const sb = await asUser(admin);
    expect(await checkAdminAccess(sb)).toBe("ok");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test tests/admin/layout-guard.test.ts
```

Expected: FAIL because `app/app/admin/layout.tsx` doesn't exist.

- [ ] **Step 3: Run tests to verify they pass (helpers already exist)**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test tests/admin/layout-guard.test.ts
```

Expected: 3/3 pass. `checkAdminAccess` was implemented in Task 4.

- [ ] **Step 4: Create the layout**

Create `app/app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import TopNav from "@/components/TopNav";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const result = await checkAdminAccess(supabase);
  if (result === "not-authed") redirect("/auth/signin");
  if (result === "not-admin") redirect("/home");

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="admin" />
      <div className="container-wide" style={{ padding: "32px var(--container-pad)" }}>
        <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 6 }}>✦ Internal ✦</div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/layout.tsx app/tests/admin/layout-guard.test.ts
git commit -m "feat(admin): layout guard — redirects non-admins"
```

---

## Task 6: Admin landing page (section grid)

**Files:**
- Create: `app/app/admin/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/app/admin/page.tsx`:

```tsx
import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Admin</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--grid-gap)" }}>
        <Tile href="/admin/films" title="Films" blurb="Add, edit, or retire films. iTunes lookup or manual entry." />
        <Tile href="/admin/users" title="Users" blurb="Search accounts, create test users, delete accounts." />
      </div>
    </div>
  );
}

function Tile({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: 22,
        border: "2px solid var(--bone)",
        background: "var(--void-2)",
        color: "var(--bone)",
        textDecoration: "none",
      }}
    >
      <div className="head" style={{ fontSize: 28, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, opacity: 0.8 }}>{blurb}</div>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/page.tsx
git commit -m "feat(admin): /admin section-tile landing page"
```

---

## Task 7: UserMenu "Admin" link

**Files:**
- Modify: `app/components/TopNav.tsx`
- Modify: `app/components/TopNavChrome.tsx`
- Modify: `app/components/UserMenu.tsx`

- [ ] **Step 1: Fetch staff role in TopNav**

In `app/components/TopNav.tsx`, after the `profile` fetch block (after line 21), add:

```tsx
  let isAdmin = false;
  if (user) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = staffRow?.role === "admin";
  }
```

Then extend the `<TopNavChrome ...>` props at the bottom of the component:

```tsx
    <TopNavChrome
      items={items}
      current={current}
      user={Boolean(user)}
      profile={profile}
      isAdmin={isAdmin}
    />
```

- [ ] **Step 2: Thread `isAdmin` through TopNavChrome**

In `app/components/TopNavChrome.tsx`:

Add `isAdmin: boolean` to the `Props` interface.

In the component signature destructure `isAdmin` from props.

Find the `<UserMenu ... />` invocation and add the prop:

```tsx
            <UserMenu
              handle={profile?.handle ?? "you"}
              displayName={profile?.display_name ?? profile?.handle ?? "You"}
              avatarUrl={profile?.avatar_url}
              isAdmin={isAdmin}
            />
```

- [ ] **Step 3: Render the Admin link in UserMenu**

In `app/components/UserMenu.tsx`:

Extend `Props`:

```tsx
interface Props {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}
```

Destructure `isAdmin` from props.

In the dropdown, between the `@handle` block and the `Settings` link, add the conditional:

```tsx
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              style={{ display: "block", padding: "10px 14px", color: "var(--accent-deep)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid var(--void)" }}
            >
              Admin
            </Link>
          )}
```

- [ ] **Step 4: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/components/TopNav.tsx app/components/TopNavChrome.tsx app/components/UserMenu.tsx
git commit -m "feat(admin): UserMenu shows Admin link for staff admins"
```

---

## Task 8: Films list page + search + pagination

**Files:**
- Create: `app/lib/queries/admin/films.ts`
- Create: `app/app/admin/films/page.tsx`

- [ ] **Step 1: Create the read helper**

Create `app/lib/queries/admin/films.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface AdminFilmRow {
  id: string;
  title: string;
  year: number;
  director: string;
  artwork_url: string;
  tracking: boolean;
  available: boolean;
  itunes_id: number | null;
}

const PAGE_SIZE = 20;

export async function listFilmsForAdmin(
  client: Client,
  q: string,
  page: number,
): Promise<{ rows: AdminFilmRow[]; total: number; pageSize: number }> {
  let query = client
    .from("films")
    .select("id, title, year, director, artwork_url, tracking, available, itunes_id", { count: "exact" })
    .order("title", { ascending: true });

  if (q.trim()) {
    query = query.ilike("title", `%${q.trim()}%`);
  }
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return {
    rows: (data ?? []) as AdminFilmRow[],
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}
```

- [ ] **Step 2: Create the list page**

Create `app/app/admin/films/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFilmsForAdmin } from "@/lib/queries/admin/films";

export default async function AdminFilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const supabase = await createClient();
  const { rows, total, pageSize } = await listFilmsForAdmin(supabase, q, page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>Films</h1>
        <Link href="/admin/films/new" className="btn">+ Add film</Link>
      </div>

      <form method="get" style={{ marginBottom: 20 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title…"
          style={{ width: "100%", maxWidth: 480, padding: "10px 14px", background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
      </form>

      {rows.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
          No films match.
        </div>
      ) : (
        <div style={{ border: "1px solid #333" }}>
          {rows.map(f => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr auto auto", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #333" }}>
              {f.artwork_url ? (
                <img src={f.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} />
              ) : (
                <div style={{ width: 48, height: 72, background: "var(--void-2)", border: "1px solid #333" }} />
              )}
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 18, lineHeight: 1.1 }}>{f.title}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{f.director || "—"} · {f.year || "—"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span className="caps" style={{ fontSize: 9, padding: "2px 6px", border: "1px solid", borderColor: f.tracking ? "var(--accent)" : "var(--muted)", color: f.tracking ? "var(--accent)" : "var(--muted)" }}>
                    {f.tracking ? "tracking" : "not tracking"}
                  </span>
                  <span className="caps" style={{ fontSize: 9, padding: "2px 6px", border: "1px solid", borderColor: f.available ? "var(--accent)" : "var(--blood)", color: f.available ? "var(--accent)" : "var(--blood)" }}>
                    {f.available ? "available" : "retired"}
                  </span>
                </div>
              </div>
              <Link href={`/admin/films/${f.id}/edit`} className="btn btn-sm btn-outline">Edit</Link>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
          {page > 1 && (
            <Link href={`/admin/films?q=${encodeURIComponent(q)}&page=${page - 1}`} className="btn btn-sm btn-outline">← Prev</Link>
          )}
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, opacity: 0.7 }}>
            Page {page} of {totalPages} · {total} total
          </span>
          {page < totalPages && (
            <Link href={`/admin/films?q=${encodeURIComponent(q)}&page=${page + 1}`} className="btn btn-sm btn-outline">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/lib/queries/admin/films.ts app/app/admin/films/page.tsx
git commit -m "feat(admin): /admin/films list + title search + pagination"
```

---

## Task 9: Films server actions

**Files:**
- Create: `app/lib/actions/admin/films.ts`

- [ ] **Step 1: Create the actions module**

Create `app/lib/actions/admin/films.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  searchFilms,
  parseFilm,
  fetchPrices,
  type ParsedFilm,
} from "film-goblin-worker";

export interface ITunesSearchHit {
  itunes_id: number;
  title: string;
  director: string;
  year: number;
  artwork_url: string;
  itunes_url: string;
  price_usd: number | null;
}

export interface FilmFormFields {
  itunes_id: number | null;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  genre_primary: string;
  description: string;
  content_advisory: string;
  artwork_url: string;
  itunes_url: string;
  tracking: boolean;
  available: boolean;
}

function parseIdFromUrlOrId(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const m = trimmed.match(/id(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

function toHit(p: ParsedFilm): ITunesSearchHit {
  return {
    itunes_id: p.itunes_id,
    title: p.title,
    director: p.director,
    year: p.year,
    artwork_url: p.artwork_url,
    itunes_url: p.itunes_url,
    price_usd: p.price_usd,
  };
}

export async function adminSearchItunes(term: string): Promise<ITunesSearchHit[]> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  if (!term.trim()) return [];
  const res = await searchFilms(term, { limit: 10 });
  return res.results
    .map(r => parseFilm(r))
    .filter((p): p is ParsedFilm => p !== null)
    .map(toHit);
}

export async function adminLookupItunes(urlOrId: string): Promise<
  | { ok: true; hit: ITunesSearchHit }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const id = parseIdFromUrlOrId(urlOrId);
  if (id === null) return { ok: false, error: "Could not extract an iTunes trackId from that input." };
  const res = await fetchPrices([id]);
  if (res.resultCount === 0) return { ok: false, error: `No iTunes result for trackId ${id}.` };
  const parsed = parseFilm(res.results[0]);
  if (!parsed) return { ok: false, error: `Result for trackId ${id} did not parse (wrong media type or invalid price).` };
  return { ok: true, hit: toHit(parsed) };
}

function validateForm(fields: FilmFormFields): string | null {
  if (!fields.title.trim()) return "Title is required.";
  if (!fields.director.trim()) return "Director is required.";
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isFinite(fields.year) || fields.year < 1900 || fields.year > thisYear + 5) {
    return `Year must be between 1900 and ${thisYear + 5}.`;
  }
  if (!fields.genre_primary.trim()) return "Genre primary is required.";
  return null;
}

export async function adminCreateFilm(fields: FilmFormFields): Promise<
  | { ok: true; filmId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const err = validateForm(fields);
  if (err) return { ok: false, error: err };

  const payload = {
    itunes_id: fields.itunes_id,
    title: fields.title.trim(),
    director: fields.director.trim(),
    year: fields.year,
    runtime_min: fields.runtime_min,
    genre_primary: fields.genre_primary.trim(),
    description: fields.description,
    content_advisory: fields.content_advisory,
    artwork_url: fields.artwork_url.trim(),
    itunes_url: fields.itunes_url.trim(),
    tracking: fields.tracking,
    available: fields.available,
  };

  const { data, error } = await supabase
    .from("films")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/films");
  return { ok: true, filmId: data.id };
}

export async function adminUpdateFilm(id: string, fields: FilmFormFields): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const err = validateForm(fields);
  if (err) return { ok: false, error: err };

  const { error } = await supabase
    .from("films")
    .update({
      itunes_id: fields.itunes_id,
      title: fields.title.trim(),
      director: fields.director.trim(),
      year: fields.year,
      runtime_min: fields.runtime_min,
      genre_primary: fields.genre_primary.trim(),
      description: fields.description,
      content_advisory: fields.content_advisory,
      artwork_url: fields.artwork_url.trim(),
      itunes_url: fields.itunes_url.trim(),
      tracking: fields.tracking,
      available: fields.available,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/films");
  revalidatePath(`/admin/films/${id}/edit`);
  return { ok: true };
}

export async function adminRetireFilm(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const { error } = await supabase
    .from("films")
    .update({ tracking: false, available: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/films");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/lib/actions/admin/films.ts
git commit -m "feat(admin): film server actions — iTunes search/lookup, create, update, retire"
```

---

## Task 10: Shared FilmForm component

**Files:**
- Create: `app/app/admin/films/FilmForm.tsx`

- [ ] **Step 1: Create the component**

Create `app/app/admin/films/FilmForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateFilm, adminUpdateFilm, type FilmFormFields } from "@/lib/actions/admin/films";

interface Props {
  mode: "create" | "edit";
  filmId?: string; // required when mode=edit
  initial: FilmFormFields;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: 10,
  background: "var(--void-2)",
  border: "2px solid var(--muted)",
  color: "var(--bone)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
};

const LABEL_STYLE: React.CSSProperties = { display: "block", marginBottom: 14 };
const CAPS_STYLE: React.CSSProperties = { fontSize: 11, marginBottom: 6 };

export default function FilmForm({ mode, filmId, initial }: Props) {
  const [fields, setFields] = useState<FilmFormFields>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function set<K extends keyof FilmFormFields>(k: K, v: FilmFormFields[K]) {
    setFields(f => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const result = mode === "create"
        ? await adminCreateFilm(fields)
        : await adminUpdateFilm(filmId!, fields);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      if (mode === "create") {
        router.push(`/admin/films/${(result as { ok: true; filmId: string }).filmId}/edit`);
      } else {
        router.refresh();
      }
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 720 }}>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Title *</div>
        <input style={INPUT_STYLE} value={fields.title} onChange={e => set("title", e.target.value)} required />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Director *</div>
        <input style={INPUT_STYLE} value={fields.director} onChange={e => set("director", e.target.value)} required />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <label>
          <div className="caps" style={CAPS_STYLE}>Year *</div>
          <input style={INPUT_STYLE} type="number" min={1900} max={new Date().getFullYear() + 5} value={fields.year || ""} onChange={e => set("year", Number(e.target.value))} required />
        </label>
        <label>
          <div className="caps" style={CAPS_STYLE}>Runtime (min)</div>
          <input style={INPUT_STYLE} type="number" min={0} value={fields.runtime_min || ""} onChange={e => set("runtime_min", Number(e.target.value))} />
        </label>
      </div>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Genre primary *</div>
        <input style={INPUT_STYLE} value={fields.genre_primary} onChange={e => set("genre_primary", e.target.value)} required />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Description</div>
        <textarea style={{ ...INPUT_STYLE, fontFamily: "var(--font-serif)", fontStyle: "italic" }} rows={4} value={fields.description} onChange={e => set("description", e.target.value)} />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Content advisory</div>
        <input style={INPUT_STYLE} value={fields.content_advisory} onChange={e => set("content_advisory", e.target.value)} placeholder="e.g. R, TV-MA" />
      </label>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>Artwork URL</div>
        <input style={INPUT_STYLE} type="url" value={fields.artwork_url} onChange={e => set("artwork_url", e.target.value)} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
        <label>
          <div className="caps" style={CAPS_STYLE}>iTunes ID</div>
          <input style={INPUT_STYLE} type="number" value={fields.itunes_id ?? ""} onChange={e => set("itunes_id", e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label>
          <div className="caps" style={CAPS_STYLE}>iTunes URL</div>
          <input style={INPUT_STYLE} type="url" value={fields.itunes_url} onChange={e => set("itunes_url", e.target.value)} />
        </label>
      </div>
      <label className="check-zine" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={fields.tracking} onChange={e => set("tracking", e.target.checked)} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Tracking (worker polls iTunes for price updates)</span>
      </label>
      <label className="check-zine" style={{ marginBottom: 20, display: "flex" }}>
        <input type="checkbox" checked={fields.available} onChange={e => set("available", e.target.checked)} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Available (visible on public surfaces)</span>
      </label>

      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Saving…" : mode === "create" ? "Create film" : "Save changes"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/films/FilmForm.tsx
git commit -m "feat(admin): shared FilmForm component for create + edit"
```

---

## Task 11: iTunes search + paste widgets

**Files:**
- Create: `app/app/admin/films/iTunesSearchBox.tsx`
- Create: `app/app/admin/films/iTunesPasteBox.tsx`

- [ ] **Step 1: Create the search widget**

Create `app/app/admin/films/iTunesSearchBox.tsx`:

```tsx
"use client";

import { useState } from "react";
import { adminSearchItunes, type ITunesSearchHit } from "@/lib/actions/admin/films";

interface Props {
  onPick: (hit: ITunesSearchHit) => void;
}

export default function ITunesSearchBox({ onPick }: Props) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<ITunesSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const results = await adminSearchItunes(term);
      setHits(results);
      if (results.length === 0) setErr("No iTunes results.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally { setLoading(false); }
  }

  return (
    <div>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search iTunes (title, director, actor)…"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !term.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {hits.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
          {hits.map(h => (
            <button
              key={h.itunes_id}
              type="button"
              onClick={() => onPick(h)}
              style={{ textAlign: "left", display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 12, alignItems: "center", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {h.artwork_url ? <img src={h.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} /> : <div style={{ width: 48, height: 72, background: "#222" }} />}
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>{h.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{h.director || "—"} · {h.year || "—"}</div>
              </div>
              <span className="caps" style={{ fontSize: 10, opacity: 0.6 }}>Pick →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the paste widget**

Create `app/app/admin/films/iTunesPasteBox.tsx`:

```tsx
"use client";

import { useState } from "react";
import { adminLookupItunes, type ITunesSearchHit } from "@/lib/actions/admin/films";

interface Props {
  onPick: (hit: ITunesSearchHit) => void;
}

export default function ITunesPasteBox({ onPick }: Props) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await adminLookupItunes(raw);
      if (res.ok) onPick(res.hit);
      else setErr(res.error);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lookup failed.");
    } finally { setLoading(false); }
  }

  return (
    <div>
      <form onSubmit={onLookup} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder="Paste Apple TV URL or iTunes trackId"
          style={{ flex: 1, padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
        <button type="submit" className="btn btn-sm" disabled={loading || !raw.trim()}>
          {loading ? "Looking up…" : "Fetch"}
        </button>
      </form>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{err}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/films/iTunesSearchBox.tsx app/app/admin/films/iTunesPasteBox.tsx
git commit -m "feat(admin): iTunes search + paste widgets for film create"
```

---

## Task 12: Add-film page

**Files:**
- Create: `app/app/admin/films/new/page.tsx`
- Create: `app/app/admin/films/new/AddFilmClient.tsx`

- [ ] **Step 1: Create the client composer**

Create `app/app/admin/films/new/AddFilmClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import FilmForm from "../FilmForm";
import ITunesSearchBox from "../iTunesSearchBox";
import ITunesPasteBox from "../iTunesPasteBox";
import type { ITunesSearchHit } from "@/lib/actions/admin/films";
import type { FilmFormFields } from "@/lib/actions/admin/films";

const BLANK: FilmFormFields = {
  itunes_id: null,
  title: "",
  director: "",
  year: 0,
  runtime_min: 0,
  genre_primary: "",
  description: "",
  content_advisory: "",
  artwork_url: "",
  itunes_url: "",
  tracking: false,
  available: true,
};

export default function AddFilmClient() {
  const [initial, setInitial] = useState<FilmFormFields | null>(null);
  const [formKey, setFormKey] = useState(0);

  function prefillFromHit(hit: ITunesSearchHit) {
    setInitial({
      itunes_id: hit.itunes_id,
      title: hit.title,
      director: hit.director,
      year: hit.year,
      runtime_min: 0,
      genre_primary: "",
      description: "",
      content_advisory: "",
      artwork_url: hit.artwork_url,
      itunes_url: hit.itunes_url,
      tracking: true,
      available: true,
    });
    setFormKey(k => k + 1);
  }

  function startManual() {
    setInitial({ ...BLANK });
    setFormKey(k => k + 1);
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {!initial && (
        <>
          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 1 — Search iTunes</h2>
            <ITunesSearchBox onPick={prefillFromHit} />
          </section>

          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 2 — Paste Apple TV URL or iTunes ID</h2>
            <ITunesPasteBox onPick={prefillFromHit} />
          </section>

          <section>
            <h2 className="head" style={{ fontSize: 22, marginBottom: 10 }}>Option 3 — No iTunes match?</h2>
            <button type="button" className="btn btn-outline" onClick={startManual}>
              Enter manually
            </button>
          </section>
        </>
      )}

      {initial && (
        <section>
          <div style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setInitial(null)}>
              ← Start over
            </button>
          </div>
          <FilmForm key={formKey} mode="create" initial={initial} />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `app/app/admin/films/new/page.tsx`:

```tsx
import AddFilmClient from "./AddFilmClient";

export default function NewFilmPage() {
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Add film</h1>
      <AddFilmClient />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/films/new/page.tsx app/app/admin/films/new/AddFilmClient.tsx
git commit -m "feat(admin): /admin/films/new — three entry paths (search / paste / manual)"
```

---

## Task 13: Edit-film page + retire modal

**Files:**
- Create: `app/app/admin/films/[id]/edit/page.tsx`
- Create: `app/app/admin/films/RetireModal.tsx`

- [ ] **Step 1: Create the retire modal**

Create `app/app/admin/films/RetireModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRetireFilm } from "@/lib/actions/admin/films";

interface Props {
  filmId: string;
  title: string;
  year: number;
  counts: { watchlist: number; lists: number; reviews: number; activity: number };
}

export default function RetireModal({ filmId, title, year, counts }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onConfirm() {
    setSubmitting(true);
    setErr(null);
    const res = await adminRetireFilm(filmId);
    setSubmitting(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    router.push("/admin/films");
  }

  return (
    <>
      <button type="button" className="btn btn-sm" style={{ background: "transparent", color: "var(--blood)", borderColor: "var(--blood)" }} onClick={() => setOpen(true)}>
        Retire film
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", boxShadow: "6px 6px 0 var(--accent)", padding: 22, maxWidth: 460, width: "100%" }}>
            <div className="head" style={{ fontSize: 22, marginBottom: 10 }}>Retire {title} ({year})?</div>
            <ul style={{ fontFamily: "var(--font-ui)", fontSize: 13, margin: "0 0 16px 0", paddingLeft: 18 }}>
              <li>Watchlist entries referencing it: <strong>{counts.watchlist}</strong> — stay intact</li>
              <li>List entries: <strong>{counts.lists}</strong> — stay intact</li>
              <li>Reviews: <strong>{counts.reviews}</strong> — stay intact</li>
              <li>Activity entries: <strong>{counts.activity}</strong> — stay intact</li>
            </ul>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16 }}>
              Sets <code>tracking = false</code> and <code>available = false</code>. Reversible — edit the film and flip the flags back on.
            </p>
            {err && <div style={{ color: "var(--blood)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ color: "var(--void)", borderColor: "var(--void)" }} onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className="btn btn-sm" style={{ background: "var(--blood)", color: "var(--bone)", borderColor: "var(--blood)" }} onClick={onConfirm} disabled={submitting}>
                {submitting ? "Retiring…" : "Retire film"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create the edit page**

Create `app/app/admin/films/[id]/edit/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FilmForm from "../../FilmForm";
import RetireModal from "../../RetireModal";
import type { FilmFormFields } from "@/lib/actions/admin/films";

export default async function EditFilmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: film } = await supabase
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available")
    .eq("id", id)
    .maybeSingle();
  if (!film) notFound();

  const [watchlistCount, listsCount, reviewsCount, activityCount] = await Promise.all([
    supabase.from("watchlists").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("list_films").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("reviews").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("activity").select("id", { count: "exact", head: true }).contains("payload", { film_id: id }).then(r => r.count ?? 0),
  ]);

  const initial: FilmFormFields = {
    itunes_id: film.itunes_id,
    title: film.title,
    director: film.director,
    year: film.year,
    runtime_min: film.runtime_min,
    genre_primary: film.genre_primary,
    description: film.description,
    content_advisory: film.content_advisory,
    artwork_url: film.artwork_url,
    itunes_url: film.itunes_url,
    tracking: film.tracking,
    available: film.available,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>Edit: {film.title}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/films" className="btn btn-sm btn-outline">← Back</Link>
          <RetireModal filmId={film.id} title={film.title} year={film.year} counts={{ watchlist: watchlistCount, lists: listsCount, reviews: reviewsCount, activity: activityCount }} />
        </div>
      </div>
      <FilmForm mode="edit" filmId={film.id} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/films/[id]/edit/page.tsx app/app/admin/films/RetireModal.tsx
git commit -m "feat(admin): edit-film page + retire modal with impact counts"
```

---

## Task 14: Users list page + search

**Files:**
- Create: `app/lib/queries/admin/users.ts`
- Create: `app/app/admin/users/page.tsx`

- [ ] **Step 1: Create the query helpers**

Create `app/lib/queries/admin/users.ts`:

```ts
import { serviceRoleClient } from "@/lib/supabase/service-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminUserRow {
  id: string;
  email: string | null;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  staff_role: "admin" | "reviewer" | null;
}

const PAGE_SIZE = 20;

export async function listUsersForAdmin(
  q: string,
  page: number,
): Promise<{ rows: AdminUserRow[]; total: number; pageSize: number }> {
  const sb = serviceRoleClient();
  const trimmed = q.trim();

  // profile filter based on input shape
  let profileQuery = sb
    .from("profiles")
    .select("id, handle, display_name, avatar_url", { count: "exact" });

  if (trimmed) {
    if (UUID_RE.test(trimmed)) {
      profileQuery = profileQuery.eq("id", trimmed);
    } else if (!trimmed.includes("@")) {
      profileQuery = profileQuery.or(`handle.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`);
    }
    // Email is handled below via auth.users admin API (cross-schema).
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: profiles, count, error } = await profileQuery.order("handle").range(from, to);
  if (error) throw error;

  const ids = (profiles ?? []).map(p => p.id);
  if (ids.length === 0 && !(trimmed && trimmed.includes("@"))) {
    return { rows: [], total: count ?? 0, pageSize: PAGE_SIZE };
  }

  // Fetch auth metadata in bulk via admin listUsers; filter to the ids we have.
  // listUsers is paginated at 1000/page which is plenty for the test-volume sizes we care about.
  const { data: authList, error: authErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authErr) throw authErr;

  // Email-search path: if q is email-shaped, override profile filter with auth email matches.
  let authMap = new Map(authList.users.map(u => [u.id, u]));
  let effectiveProfiles = profiles ?? [];
  let effectiveCount = count ?? 0;

  if (trimmed && trimmed.includes("@")) {
    const matchingIds = new Set(authList.users.filter(u => (u.email ?? "").toLowerCase().includes(trimmed.toLowerCase())).map(u => u.id));
    effectiveCount = matchingIds.size;
    const { data: emailProfiles } = await sb
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .in("id", Array.from(matchingIds).slice(0, 1000));
    effectiveProfiles = (emailProfiles ?? []).slice(from, to + 1);
  }

  const staffRows = effectiveProfiles.length
    ? (await sb.from("staff").select("user_id, role").in("user_id", effectiveProfiles.map(p => p.id))).data ?? []
    : [];
  const staffMap = new Map(staffRows.map(s => [s.user_id, s.role as "admin" | "reviewer"]));

  const rows: AdminUserRow[] = effectiveProfiles.map(p => {
    const au = authMap.get(p.id);
    return {
      id: p.id,
      email: au?.email ?? null,
      handle: p.handle,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      created_at: au?.created_at ?? "",
      last_sign_in_at: au?.last_sign_in_at ?? null,
      staff_role: staffMap.get(p.id) ?? null,
    };
  });

  return { rows, total: effectiveCount, pageSize: PAGE_SIZE };
}

export async function getUserForAdmin(id: string): Promise<AdminUserRow & { bio: string | null; identities: string[] } | null> {
  const sb = serviceRoleClient();
  const { data: profile } = await sb.from("profiles").select("id, handle, display_name, avatar_url, bio").eq("id", id).maybeSingle();
  if (!profile) return null;
  const { data: authInfo } = await sb.auth.admin.getUserById(id);
  const { data: staffRow } = await sb.from("staff").select("role").eq("user_id", id).maybeSingle();
  return {
    id,
    email: authInfo?.user?.email ?? null,
    handle: profile.handle,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    bio: profile.bio ?? null,
    created_at: authInfo?.user?.created_at ?? "",
    last_sign_in_at: authInfo?.user?.last_sign_in_at ?? null,
    identities: (authInfo?.user?.identities ?? []).map(i => i.provider),
    staff_role: (staffRow?.role as "admin" | "reviewer" | null) ?? null,
  };
}
```

- [ ] **Step 2: Create the list page**

Create `app/app/admin/users/page.tsx`:

```tsx
import Link from "next/link";
import { listUsersForAdmin } from "@/lib/queries/admin/users";

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const { rows, total, pageSize } = await listUsersForAdmin(q, page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>Users</h1>
        <Link href="/admin/users/new" className="btn">+ Create test user</Link>
      </div>

      <form method="get" style={{ marginBottom: 20 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search handle, email, display name, or UUID…"
          style={{ width: "100%", maxWidth: 480, padding: "10px 14px", background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
      </form>

      {rows.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No users match.</div>
      ) : (
        <div style={{ border: "1px solid #333" }}>
          {rows.map(u => (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #333" }}>
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>@{u.handle} {u.staff_role && <span className="caps" style={{ fontSize: 9, padding: "1px 6px", marginLeft: 6, background: "var(--accent)", color: "var(--accent-ink)" }}>{u.staff_role}</span>}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{u.display_name ?? "—"} · {u.email ?? "—"} · joined {fmtDate(u.created_at)} · last seen {fmtDate(u.last_sign_in_at)}</div>
              </div>
              <Link href={`/admin/users/${u.id}`} className="btn btn-sm btn-outline">View</Link>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
          {page > 1 && <Link href={`/admin/users?q=${encodeURIComponent(q)}&page=${page - 1}`} className="btn btn-sm btn-outline">← Prev</Link>}
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, opacity: 0.7 }}>Page {page} of {totalPages} · {total} total</span>
          {page < totalPages && <Link href={`/admin/users?q=${encodeURIComponent(q)}&page=${page + 1}`} className="btn btn-sm btn-outline">Next →</Link>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/lib/queries/admin/users.ts app/app/admin/users/page.tsx
git commit -m "feat(admin): /admin/users list + dispatched search"
```

---

## Task 15: Create-test-user flow

**Files:**
- Create: `app/lib/actions/admin/users.ts`
- Create: `app/app/admin/users/new/page.tsx`
- Create: `app/app/admin/users/new/CreateUserClient.tsx`

- [ ] **Step 1: Create the server actions module**

Create `app/lib/actions/admin/users.ts`:

```ts
"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface CreateTestUserFields {
  email: string;
  password: string;
  display_name: string;
}

export async function generatePassword(): Promise<string> {
  return randomBytes(12).toString("base64url");
}

function validEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export async function adminCreateTestUser(fields: CreateTestUserFields): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  if (!validEmail(fields.email)) return { ok: false, error: "Invalid email." };
  if (fields.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const sr = serviceRoleClient();
  const { data, error } = await sr.auth.admin.createUser({
    email: fields.email,
    password: fields.password,
    email_confirm: true,
    user_metadata: { created_by_admin: true, display_name: fields.display_name || null },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "createUser failed" };

  // The profiles row is created by the auth→profile trigger; update display_name if provided.
  if (fields.display_name.trim()) {
    await sr.from("profiles").update({ display_name: fields.display_name.trim() }).eq("id", data.user.id);
  }

  revalidatePath("/admin/users");
  return { ok: true, userId: data.user.id };
}

export async function adminDeleteUser(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const sr = serviceRoleClient();
  const { error } = await sr.auth.admin.deleteUser(id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
```

- [ ] **Step 2: Create the client form**

Create `app/app/admin/users/new/CreateUserClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateTestUser, generatePassword } from "@/lib/actions/admin/users";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)",
  color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14,
};

export default function CreateUserClient({ initialPassword }: { initialPassword: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(initialPassword);
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function regenerate() {
    setPassword(await generatePassword());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const res = await adminCreateTestUser({ email, password, display_name: displayName });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    router.push(`/admin/users/${res.userId}`);
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 520, display: "grid", gap: 14 }}>
      <div style={{ padding: 12, background: "var(--void-2)", border: "1px solid var(--accent)", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
        Creates a user with <code>email_confirm: true</code>. No verification email is sent. Not the public signup flow.
      </div>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Email</div>
        <input style={INPUT_STYLE} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Password</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...INPUT_STYLE, flex: 1 }} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          <button type="button" className="btn btn-sm btn-outline" onClick={regenerate}>Regenerate</button>
        </div>
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Display name (optional)</div>
        <input style={INPUT_STYLE} value={displayName} onChange={e => setDisplayName(e.target.value)} />
      </label>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{err}</div>}
      <button type="submit" className="btn" disabled={saving}>{saving ? "Creating…" : "Create test user"}</button>
    </form>
  );
}
```

- [ ] **Step 3: Create the page**

Create `app/app/admin/users/new/page.tsx`:

```tsx
import CreateUserClient from "./CreateUserClient";
import { generatePassword } from "@/lib/actions/admin/users";

export default async function NewUserPage() {
  const initialPassword = await generatePassword();
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 20 }}>Create test user</h1>
      <CreateUserClient initialPassword={initialPassword} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 5: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/lib/actions/admin/users.ts app/app/admin/users/new/page.tsx app/app/admin/users/new/CreateUserClient.tsx
git commit -m "feat(admin): create-test-user flow (email_confirm: true, outside public signup)"
```

---

## Task 16: User detail page + delete modal

**Files:**
- Create: `app/app/admin/users/[id]/page.tsx`
- Create: `app/app/admin/users/DeleteUserModal.tsx`

- [ ] **Step 1: Create the delete modal**

Create `app/app/admin/users/DeleteUserModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteUser } from "@/lib/actions/admin/users";

interface Props {
  userId: string;
  handle: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

function isTestUser(createdAt: string, lastSignInAt: string | null): boolean {
  if (lastSignInAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < 24 * 60 * 60 * 1000;
}

export default function DeleteUserModal({ userId, handle, email, createdAt, lastSignInAt }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const testShape = isTestUser(createdAt, lastSignInAt);

  async function onConfirm() {
    if (!testShape && typed !== handle) return;
    setSubmitting(true);
    setErr(null);
    const res = await adminDeleteUser(userId);
    setSubmitting(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    router.push("/admin/users");
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        style={{ background: "transparent", color: "var(--blood)", borderColor: "var(--blood)" }}
        onClick={() => { setOpen(true); setTyped(""); setErr(null); }}
      >
        {testShape ? "Delete test user" : "Delete user"}
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ background: "var(--bone)", color: "var(--void)", border: "3px solid var(--void)", boxShadow: "6px 6px 0 var(--blood)", padding: 22, maxWidth: 480, width: "100%" }}>
            {testShape ? (
              <>
                <div className="head" style={{ fontSize: 22, marginBottom: 10 }}>Delete @{handle}?</div>
                <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16 }}>
                  This user has never signed in and was created within the last 24 hours.
                </p>
              </>
            ) : (
              <>
                <div className="head" style={{ fontSize: 22, marginBottom: 10 }}>Permanently delete @{handle}</div>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, marginBottom: 10 }}>
                  <strong>Email:</strong> {email ?? "—"}<br />
                  <strong>Joined:</strong> {new Date(createdAt).toISOString().slice(0, 10)}
                </p>
                <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 12 }}>
                  Watchlist entries, reviews, recommendations, coven memberships, follows, and activity entries all cascade-delete. This cannot be undone.
                </p>
                <label style={{ display: "block", marginBottom: 16 }}>
                  <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Type <code>{handle}</code> to confirm</div>
                  <input
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "white", border: "2px solid var(--void)", color: "var(--void)", fontFamily: "var(--font-ui)", fontSize: 14 }}
                    autoFocus
                  />
                </label>
              </>
            )}
            {err && <div style={{ color: "var(--blood)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-sm btn-outline" style={{ color: "var(--void)", borderColor: "var(--void)" }} onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: "var(--blood)", color: "var(--bone)", borderColor: "var(--blood)", opacity: (!testShape && typed !== handle) ? 0.4 : 1 }}
                onClick={onConfirm}
                disabled={submitting || (!testShape && typed !== handle)}
              >
                {submitting ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create the detail page**

Create `app/app/admin/users/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserForAdmin } from "@/lib/queries/admin/users";
import DeleteUserModal from "../DeleteUserModal";

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserForAdmin(id);
  if (!user) notFound();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>@{user.handle}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/users" className="btn btn-sm btn-outline">← Back</Link>
          <Link href={`/p/${user.handle}`} className="btn btn-sm btn-outline">Public profile →</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 28 }}>
        <Section title="Profile">
          <Field label="Handle" value={`@${user.handle}`} />
          <Field label="Display name" value={user.display_name ?? "—"} />
          <Field label="Bio" value={user.bio ?? "—"} />
          <Field label="Staff role" value={user.staff_role ?? "—"} />
        </Section>
        <Section title="Auth">
          <Field label="Email" value={user.email ?? "—"} />
          <Field label="Created" value={fmtDate(user.created_at)} />
          <Field label="Last sign-in" value={fmtDate(user.last_sign_in_at)} />
          <Field label="Identity providers" value={user.identities.length ? user.identities.join(", ") : "—"} />
        </Section>
      </div>

      <div style={{ borderTop: "1px solid var(--blood)", paddingTop: 20 }}>
        <div className="caps" style={{ color: "var(--blood)", fontSize: 12, marginBottom: 10 }}>Danger zone</div>
        <DeleteUserModal
          userId={user.id}
          handle={user.handle}
          email={user.email}
          createdAt={user.created_at}
          lastSignInAt={user.last_sign_in_at}
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--void-2)", border: "1px solid #333", padding: 16 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 10, color: "var(--accent)" }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add app/app/admin/users/[id]/page.tsx app/app/admin/users/DeleteUserModal.tsx
git commit -m "feat(admin): user detail page + dual-path delete modal"
```

---

## Task 17: Films RLS test

**Files:**
- Create: `db/tests/rls/films-admin-write.test.ts`

- [ ] **Step 1: Write the test**

Create `db/tests/rls/films-admin-write.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: films admin writes", () => {
  it("anon cannot INSERT", async () => {
    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`INSERT INTO films (title, director, year, genre_primary) VALUES ('T','D',2024,'G')`)
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("non-staff authenticated cannot UPDATE", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO films (title, director, year, genre_primary) VALUES ('X','D',2024,'G') RETURNING id`
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const upd = await db.client.query(`UPDATE films SET title='Y' WHERE id=$1`, [r.rows[0].id]);
      expect(upd.rowCount).toBe(0); // policy blocks it silently — no rows match
    } finally { await rollback(db.client); }
  });

  it("authenticated reviewer cannot INSERT", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      await expect(
        db.client.query(`INSERT INTO films (title, director, year, genre_primary) VALUES ('T','D',2024,'G')`)
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("authenticated admin can INSERT, UPDATE, and DELETE", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const ins = await db.client.query<{ id: string }>(
        `INSERT INTO films (title, director, year, genre_primary) VALUES ('Admin','D',2024,'G') RETURNING id`
      );
      expect(ins.rowCount).toBe(1);

      const upd = await db.client.query(`UPDATE films SET title='Admin2' WHERE id=$1`, [ins.rows[0].id]);
      expect(upd.rowCount).toBe(1);

      const del = await db.client.query(`DELETE FROM films WHERE id=$1`, [ins.rows[0].id]);
      expect(del.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/films-admin-write.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 3: Commit**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
git add db/tests/rls/films-admin-write.test.ts
git commit -m "test(db): films admin-write RLS coverage"
```

---

## Task 18: Full smoke + deploy

**Files:** none — verification only.

- [ ] **Step 1: Apply the new migration to local Supabase**

```bash
cd db
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Expected: `Applied: 0118_films_nullable_itunes_id_and_rls.sql`, or `No pending migrations.` if already applied.

- [ ] **Step 2: Promote yourself to admin (service-role script, one-off)**

If you're not already admin in local or prod Supabase, insert a `staff` row via the Supabase Studio SQL editor or psql:

```sql
INSERT INTO staff (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = '<your-email>'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
```

- [ ] **Step 3: Local dev smoke**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Sign in at http://localhost:3000/auth/signin, confirm:
- User menu (avatar dropdown) now shows "Admin" link.
- `/admin` renders the Films + Users tiles.
- `/admin/films` shows the list; search by title reduces results; pagination works.
- `/admin/films/new` — try iTunes search: type "blair witch project" → results show → pick one → form pre-fills → save → redirects to edit page → film appears in list.
- iTunes paste: paste an Apple TV URL like `https://tv.apple.com/us/movie/example/umc.cmc.id1234567890` → form pre-fills.
- Manual: click "Enter manually" → fill all required fields → save → redirect to edit.
- Edit page: change title → save → list reflects change.
- Retire modal: click Retire → confirm → film list shows retired badge.
- `/admin/users` — search by handle, email, UUID all work.
- `/admin/users/new` — create user → redirect to detail page → user appears in list.
- Delete test user (fresh-created, never signed in) → fast-path modal → delete.
- Delete established user (if you have one) — typed-confirmation path fires; button stays disabled until handle typed exactly.

Kill dev server.

- [ ] **Step 4: Typecheck + build**

```bash
cd app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: typecheck silent, build succeeds.

- [ ] **Step 5: Deploy to Vercel from the worktree root**

```bash
cd /home/cthulhulemon/film_goblin/.worktrees/admin
mkdir -p .vercel
cp /home/cthulhulemon/film_goblin/.vercel/project.json .vercel/
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx vercel deploy --prod --yes 2>&1 | tee /tmp/admin-deploy.log
```

**Do not deploy from `.worktrees/admin/app`** — that creates a junk project per the documented Vercel gotcha in CLAUDE.md.

Apply the migration against production Supabase (via Supabase Studio SQL editor or `cd db && DATABASE_URL=... npm run migrate`) **before** exercising admin writes.

- [ ] **Step 6: iPhone / production smoke**

Visit the deploy URL printed in the log. Sign in as the admin account. Confirm:
- Admin link appears in dropdown.
- `/admin/films` and `/admin/users` render.
- At least one "Add film" via iTunes search persists.

- [ ] **Step 7: Finalize**

Invoke `superpowers:finishing-a-development-branch` to merge `feat/admin-dashboard` to master.

---

## Execution order

Tasks 1 → 2 → 3 must run in order (migration → worker helper → service-role client provide the primitives everyone else uses).

Tasks 4, 5, 6, 7 can run in any order after 3 — each is self-contained.

Tasks 8, 9 should run after 4 (server actions need `requireAdmin`; list page needs nothing beyond DB access).

Task 10 depends on 9 (form uses server action types). 11 depends on 9. 12 depends on 10 and 11. 13 depends on 10.

Task 14 depends on 3 (service-role client). Tasks 15, 16 depend on 14.

Task 17 depends on 1 (migration must define the policy before the test can exercise it).

Task 18 runs last.

Subagent-driven execution: dispatch in numeric order 1–18.

---

## Success criteria

Deployed. Admin with `staff.role = 'admin'` can:
- Add a film via iTunes search end-to-end in under 60 seconds from `/admin/films/new`.
- Add a manual film (no iTunes ID); it persists with `tracking = false`.
- Edit a film; changes reflect on the public `/films` and `/film/[id]` pages.
- Retire a film; it disappears from public grids but its watchlist/list/review rows stay intact.
- Create a test user that can immediately sign in without email confirmation.
- Delete a test user; the auth and profile rows are gone; related rows cascade.

Non-admin authenticated user and anon user:
- `/admin` redirects.
- Any direct server-action call is rejected.
- Direct film writes via Supabase client are rejected by RLS.

No regressions on public surfaces (landing, feed, film detail, profile, settings, onboarding).
