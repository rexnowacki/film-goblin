# Site Settings (invite-gate toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins toggle invite gating at runtime from a new `/admin/site-settings` page, backed by a DB setting instead of the `INVITE_GATE` env var.

**Architecture:** A generic key-value `site_settings` table (RLS on, service-role only) holds `invite_gate`. `signUp` reads it once per request (fail-closed → gated). A new admin module exposes a read helper (no admin guard, used by `signUp`) and an admin-guarded write action driving a toggle UI.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + service-role client), TypeScript, Vitest. Run app commands from `app/`. Node 20 (prefix `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`).

**Branch:** `feature/site-settings` (already created and checked out).

**Spec:** `docs/superpowers/specs/2026-05-28-site-settings-design.md`

**Conventions followed:**
- Server actions: `"use server"`, private `_fn(client, …)` + public wrapper (see `app/lib/actions/CLAUDE.md`).
- `site_settings` is not in `lib/supabase/types.ts`, so all access uses the `(sr as any)` cast, mirroring `app/lib/actions/invite-codes.ts`. No type regen required.
- Admin actions call `requireAdminUser`/`requireAdmin` then `serviceRoleClient()`.

---

### Task 1: Migration — `site_settings` table

**Files:**
- Create: `db/migrations/0192_site_settings.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 0192_site_settings.sql
-- Generic key-value store for runtime-mutable, site-wide settings.
-- First setting: invite_gate (replaces the INVITE_GATE env var).
-- Access is service-role only: RLS is enabled with NO policies, matching the
-- lockdown style of mig 0189. The signup gate read and the admin toggle both
-- go through the service-role client.

create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;

-- Seed the invite gate ON so production behavior is unchanged at deploy time.
insert into public.site_settings (key, value)
values ('invite_gate', 'true'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/0192_site_settings.sql
git commit -m "feat(db): add site_settings table seeded with invite_gate"
```

Note: the migration is applied to the real database during rollout (root CLAUDE.md pooler procedure), not in this task. Unit tests in later tasks inject a fake client and need no DB.

---

### Task 2: Read helper + unit tests (TDD)

**Files:**
- Create: `app/lib/actions/admin/site-settings.ts`
- Test: `app/tests/actions/site-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/actions/site-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { _readSettingBool } from "@/lib/actions/admin/site-settings";

// Minimal fake of the Supabase query chain used by _readSettingBool:
//   client.from(table).select(cols).eq(col, val).maybeSingle()
function fakeClient(result: { data: { value: unknown } | null; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  } as never;
}

describe("_readSettingBool", () => {
  it("returns the fallback when the row is missing", async () => {
    expect(await _readSettingBool(fakeClient({ data: null, error: null }), "invite_gate", true)).toBe(true);
    expect(await _readSettingBool(fakeClient({ data: null, error: null }), "invite_gate", false)).toBe(false);
  });

  it("returns the fallback when the query errors", async () => {
    const c = fakeClient({ data: null, error: { message: "boom" } });
    expect(await _readSettingBool(c, "invite_gate", true)).toBe(true);
  });

  it("returns true for a present JSON true value", async () => {
    const c = fakeClient({ data: { value: true }, error: null });
    expect(await _readSettingBool(c, "invite_gate", false)).toBe(true);
  });

  it("returns false for a present JSON false value", async () => {
    const c = fakeClient({ data: { value: false }, error: null });
    expect(await _readSettingBool(c, "invite_gate", true)).toBe(false);
  });

  it("treats non-boolean values as not-enabled", async () => {
    const c = fakeClient({ data: { value: "true" }, error: null });
    expect(await _readSettingBool(c, "invite_gate", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- site-settings`
Expected: FAIL — `_readSettingBool` is not exported / module does not exist.

- [ ] **Step 3: Create the module with the read helper**

Create `app/lib/actions/admin/site-settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdminUser } from "@/lib/auth/require-admin";

const TABLE = "site_settings";

// Minimal client shape the read path needs. Lets tests inject a fake without
// standing up real Supabase. Module-local on purpose (a "use server" file may
// only export async functions).
type ReaderClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }>;
      };
    };
  };
};

// Private read: never throws. Returns `fallback` on missing row or any error,
// and only treats a JSON boolean `true` as enabled.
export async function _readSettingBool(
  client: ReaderClient,
  key: string,
  fallback: boolean,
): Promise<boolean> {
  try {
    const { data, error } = await client.from(TABLE).select("value").eq("key", key).maybeSingle();
    if (error || !data) return fallback;
    return data.value === true;
  } catch {
    return fallback;
  }
}

export async function readSettingBool(key: string, fallback: boolean): Promise<boolean> {
  const sr = serviceRoleClient() as unknown as ReaderClient;
  return _readSettingBool(sr, key, fallback);
}

// Used by signUp before the user is authenticated. No admin guard — it reveals
// only a single boolean. Fail-closed: defaults to gated (true).
export async function isInviteGateEnabled(): Promise<boolean> {
  return readSettingBool("invite_gate", true);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- site-settings`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
cd .. && git add app/lib/actions/admin/site-settings.ts app/tests/actions/site-settings.test.ts
git commit -m "feat: site_settings read helper (fail-closed invite gate)"
```

Expected: typecheck clean.

---

### Task 3: Admin write action + page read

**Files:**
- Modify: `app/lib/actions/admin/site-settings.ts`

- [ ] **Step 1: Append the write action and page read to the module**

Add to the bottom of `app/lib/actions/admin/site-settings.ts`:

```ts
// Module-private upsert. `client` is the service-role client (cast to any
// because `site_settings` is not yet in lib/supabase/types.ts).
async function writeSetting(
  client: ReturnType<typeof serviceRoleClient>,
  key: string,
  value: unknown,
  userId: string,
): Promise<void> {
  await (client as any).from(TABLE).upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: "key" },
  );
}

// Admin action: flip the invite gate. Throws NotAdminError for non-admins.
export async function setInviteGate(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);
  await writeSetting(serviceRoleClient(), "invite_gate", enabled, user.id);
  revalidatePath("/admin/site-settings");
}

// Read for the admin page: current value + when it last changed.
export async function getInviteGateSetting(): Promise<{ enabled: boolean; updatedAt: string | null }> {
  const sr = serviceRoleClient();
  const { data } = await (sr as any)
    .from(TABLE)
    .select("value, updated_at")
    .eq("key", "invite_gate")
    .maybeSingle();
  if (!data) return { enabled: true, updatedAt: null };
  return { enabled: data.value === true, updatedAt: data.updated_at ?? null };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean. (The read-helper unit tests still pass — unchanged.)

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/admin/site-settings.ts
git commit -m "feat: site_settings admin write action + page read"
```

---

### Task 4: Wire `signUp` to the DB setting

**Files:**
- Modify: `app/lib/actions/auth.ts`

- [ ] **Step 1: Add the import**

In `app/lib/actions/auth.ts`, add to the import block near the top (after the existing `@/lib/actions/invite-cookie` import on line 10):

```ts
import { isInviteGateEnabled } from "@/lib/actions/admin/site-settings";
```

- [ ] **Step 2: Read the gate once, replace the first env check**

Replace this block (currently around lines 64-70):

```ts
  // Gate check — validate cookie before touching auth.users
  let inviteCode: string | null = null;
  if (process.env.INVITE_GATE === "1") {
    inviteCode = await readInviteCodeCookie();
    const isValid = await peekInviteCode(inviteCode);
    if (!isValid) return { error: "You need a valid invite link to join." };
  }
```

with:

```ts
  // Gate check — validate cookie before touching auth.users. The gate is a
  // runtime DB setting (site_settings.invite_gate); read once and reuse below
  // so a mid-request toggle can't make the two checks disagree.
  const gateEnabled = await isInviteGateEnabled();
  let inviteCode: string | null = null;
  if (gateEnabled) {
    inviteCode = await readInviteCodeCookie();
    const isValid = await peekInviteCode(inviteCode);
    if (!isValid) return { error: "You need a valid invite link to join." };
  }
```

- [ ] **Step 3: Replace the second env check (the burn)**

Replace this line (currently around line 101):

```ts
  if (process.env.INVITE_GATE === "1" && inviteCode && createData?.user?.id) {
```

with:

```ts
  if (gateEnabled && inviteCode && createData?.user?.id) {
```

- [ ] **Step 4: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean. Confirm no remaining references: `grep -n "INVITE_GATE" app/lib/actions/auth.ts` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add app/lib/actions/auth.ts
git commit -m "feat: signUp reads invite gate from site_settings, not env"
```

---

### Task 5: Admin UI — Site Settings page + tile

**Files:**
- Create: `app/app/admin/site-settings/page.tsx`
- Create: `app/app/admin/site-settings/SiteSettingsClient.tsx`
- Modify: `app/app/admin/page.tsx`

- [ ] **Step 1: Create the Server Component page**

Create `app/app/admin/site-settings/page.tsx`:

```tsx
import { getInviteGateSetting } from "@/lib/actions/admin/site-settings";
import SiteSettingsClient from "./SiteSettingsClient";

export default async function SiteSettingsPage() {
  const { enabled, updatedAt } = await getInviteGateSetting();
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Site Settings</h1>
      <SiteSettingsClient enabled={enabled} updatedAt={updatedAt} />
    </div>
  );
}
```

- [ ] **Step 2: Create the client toggle**

Create `app/app/admin/site-settings/SiteSettingsClient.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { setInviteGate } from "@/lib/actions/admin/site-settings";

export default function SiteSettingsClient({
  enabled,
  updatedAt,
}: {
  enabled: boolean;
  updatedAt: string | null;
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(null);
    setOn(next); // optimistic
    startTransition(async () => {
      try {
        await setInviteGate(next);
      } catch {
        setOn(!next); // revert on failure
        setError("Couldn't save. Try again.");
      }
    });
  }

  return (
    <div
      style={{
        padding: 22,
        border: "2px solid var(--bone)",
        background: "var(--void-2)",
        maxWidth: 520,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="head" style={{ fontSize: 22, marginBottom: 4 }}>Invite gating</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, opacity: 0.8 }}>
            When on, new signups require a valid invite link.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Invite gating"
          disabled={pending}
          onClick={toggle}
          style={{
            position: "relative",
            width: 54,
            height: 30,
            flexShrink: 0,
            borderRadius: 999,
            border: "2px solid var(--bone)",
            background: on ? "var(--accent)" : "var(--void-3)",
            cursor: pending ? "wait" : "pointer",
            transition: "background 120ms ease",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: on ? 26 : 2,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "var(--bone)",
              transition: "left 120ms ease",
            }}
          />
        </button>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
        Status: <strong>{on ? "ON — invite required" : "OFF — open signup"}</strong>
        {updatedAt ? <> · last changed {new Date(updatedAt).toLocaleString()}</> : null}
      </div>

      {error ? (
        <div style={{ marginTop: 10, color: "var(--danger)", fontSize: 13 }}>{error}</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Add the admin-home tile**

In `app/app/admin/page.tsx`, add this line inside the tile grid, after the Invite Codes tile (line 14):

```tsx
        <Tile href="/admin/site-settings" title="Site Settings" blurb="Toggle site-wide controls like invite gating." />
```

- [ ] **Step 4: Typecheck**

Run: `cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/app/admin/site-settings/page.tsx app/app/admin/site-settings/SiteSettingsClient.tsx app/app/admin/page.tsx
git commit -m "feat: admin Site Settings page with invite-gate toggle"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full app test suite + typecheck**

Run:
```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: all tests PASS (including the 5 new `_readSettingBool` tests), typecheck clean.

- [ ] **Step 2: Confirm the env var is fully unwired**

Run: `grep -rn "INVITE_GATE" app --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: no results.

Manual verification at `/admin/site-settings` and deletion of the Vercel `INVITE_GATE` env var happen during deploy/rollout (see spec "Deployment / rollout").

---

## Self-review

- **Spec coverage:** key-value table + RLS no-policies + seed (Task 1) ✓; read helper fail-closed + `isInviteGateEnabled` no guard (Task 2) ✓; write action `setInviteGate` + `getInviteGateSetting` built on internals (Task 3) ✓; `signUp` reads DB once, both env checks replaced (Task 4) ✓; admin page + client toggle + home tile (Task 5) ✓; tests for fail-closed/present-value (Task 2) ✓; uncached reads (no cache wrappers anywhere) ✓; `(sr as any)` cast / no type regen ✓; out-of-scope items untouched ✓.
- **Placeholders:** none — full code and exact commands throughout.
- **Type consistency:** `_readSettingBool(client, key, fallback)`, `readSettingBool(key, fallback)`, `isInviteGateEnabled()`, `setInviteGate(enabled)`, `getInviteGateSetting() -> { enabled, updatedAt }` used identically across definition and call sites (auth.ts, page.tsx, client). `ReaderClient` shape matches the fake in the test. Table constant `TABLE = "site_settings"` used everywhere.
