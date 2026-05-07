# Invite Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-gate signup behind multi-use invite codes (cap 5), with a settings UI for users to share their link and an admin panel to create/revoke codes.

**Architecture:** A `invite_codes` + `invite_uses` table pair in Postgres. A DB trigger auto-creates one code per new user. A `burn_invite_code` PL/pgSQL function provides race-safe use-count increment. The gate is a single `INVITE_GATE=1` env var in `signUp` — delete it to open signup without any code change.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role for all invite queries), TypeScript, `crypto.randomBytes` for server-side code generation.

---

## File Map

| File | New / Mod | Purpose |
|---|---|---|
| `db/migrations/0172_invite_codes.sql` | New | Tables, trigger, burn RPC, backfill |
| `app/lib/actions/invite-cookie.ts` | Mod | Add `readInviteCodeCookie`, `clearInviteCodeCookie` |
| `app/lib/queries/invite-codes.ts` | New | `getMyInviteCode`, `getAllInviteCodes` |
| `app/lib/actions/invite-codes.ts` | New | `peekInviteCode`, `burnInviteCode`, admin actions |
| `app/lib/actions/auth.ts` | Mod | Gate check in `signUp` |
| `app/app/invite/[code]/page.tsx` | New | Cookie-set + redirect page |
| `app/components/settings/InviteLinkSection.tsx` | New | Server component — shows link + usage |
| `app/components/settings/CopyInviteButton.tsx` | New | Client copy-to-clipboard button |
| `app/app/settings/page.tsx` | Mod | Render `InviteLinkSection` |
| `app/app/admin/invite-codes/page.tsx` | New | Admin list + create panel |
| `app/app/admin/invite-codes/InviteCodesClient.tsx` | New | Client: create form + revoke buttons |
| `app/app/admin/page.tsx` | Mod | Add Invite Codes tile |

---

### Task 1: DB Migration — tables, trigger, burn RPC, backfill

**Files:**
- Create: `db/migrations/0172_invite_codes.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- db/migrations/0172_invite_codes.sql

-- invite_codes: one row per shareable invite link
CREATE TABLE invite_codes (
  code             TEXT PRIMARY KEY,
  owner_user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label            TEXT,
  max_uses         INTEGER NOT NULL DEFAULT 5,
  use_count        INTEGER NOT NULL DEFAULT 0,
  revoked          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- invite_uses: one row per successful signup through an invite
CREATE TABLE invite_uses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL REFERENCES invite_codes(code),
  new_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create an invite code for every new profile
CREATE OR REPLACE FUNCTION create_invite_code_for_new_user()
RETURNS trigger AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    new_code := encode(gen_random_bytes(4), 'hex');
    BEGIN
      INSERT INTO invite_codes (code, owner_user_id, max_uses)
      VALUES (new_code, NEW.id, 5);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique invite code after 10 attempts';
      END IF;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_profile_insert_create_invite_code
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_invite_code_for_new_user();

-- RPC: race-safe burn — increments use_count and records the use atomically
CREATE OR REPLACE FUNCTION burn_invite_code(p_code TEXT, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE invite_codes
  SET use_count = use_count + 1
  WHERE code = p_code
    AND NOT revoked
    AND use_count < max_uses;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated > 0 THEN
    INSERT INTO invite_uses (code, new_user_id) VALUES (p_code, p_user_id);
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Backfill: give every existing profile an invite code
DO $$
DECLARE
  profile_rec RECORD;
  new_code    TEXT;
  attempts    INT;
BEGIN
  FOR profile_rec IN SELECT id FROM profiles LOOP
    IF NOT EXISTS (SELECT 1 FROM invite_codes WHERE owner_user_id = profile_rec.id) THEN
      attempts := 0;
      LOOP
        new_code := encode(gen_random_bytes(4), 'hex');
        BEGIN
          INSERT INTO invite_codes (code, owner_user_id, max_uses)
          VALUES (new_code, profile_rec.id, 5);
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          attempts := attempts + 1;
          IF attempts >= 10 THEN
            RAISE EXCEPTION 'Backfill: could not generate code for user %', profile_rec.id;
          END IF;
        END;
      END LOOP;
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply the migration to production**

From `db/`, with `DATABASE_URL` set (use the pooler URL from `passwords.txt`):

```bash
cd db && source ../app/.env.local && npm run migrate
```

Expected output: migration `0172_invite_codes.sql` listed as applied, no errors.

- [ ] **Step 3: Verify in Supabase dashboard**

Open the Supabase Table Editor. Confirm:
- `invite_codes` table exists with columns: `code`, `owner_user_id`, `label`, `max_uses`, `use_count`, `revoked`, `created_at`
- `invite_uses` table exists
- Every existing user profile has a row in `invite_codes`

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0172_invite_codes.sql
git commit -m "feat(db): invite_codes + invite_uses tables, trigger, burn RPC"
```

---

### Task 2: Invite cookie helpers

**Files:**
- Modify: `app/lib/actions/invite-cookie.ts`

The existing file manages `fg_invite` (referrer username). Add two helpers for the new `fg_invite_code` cookie (the code string itself).

- [ ] **Step 1: Add the two new helpers to the bottom of invite-cookie.ts**

Current file ends at line 30 (`clearInviteCookie`). Append:

```ts
// --- invite code cookie (fg_invite_code) ---
// Stores the raw invite code string while the user navigates from
// /invite/[code] to /auth/signup. Separate from fg_invite (referrer username).

const CODE_NAME = "fg_invite_code";

export async function readInviteCodeCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(CODE_NAME)?.value ?? null;
}

export async function setInviteCodeCookie(code: string): Promise<void> {
  const c = await cookies();
  c.set(CODE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 86400, // 24 hours
    path: "/",
  });
}

export async function clearInviteCodeCookie(): Promise<void> {
  const c = await cookies();
  c.delete(CODE_NAME);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/invite-cookie.ts
git commit -m "feat(invite): add fg_invite_code cookie helpers"
```

---

### Task 3: Query layer

**Files:**
- Create: `app/lib/queries/invite-codes.ts`

- [ ] **Step 1: Create the file**

```ts
// app/lib/queries/invite-codes.ts
import { serviceRoleClient } from "@/lib/supabase/service-role";

export interface InviteCodeRow {
  code: string;
  owner_user_id: string | null;
  label: string | null;
  max_uses: number;
  use_count: number;
  revoked: boolean;
  created_at: string;
}

export interface InviteCodeWithOwner extends InviteCodeRow {
  owner_username: string | null;
}

export async function getMyInviteCode(userId: string): Promise<InviteCodeRow | null> {
  const sr = serviceRoleClient();
  const { data, error } = await (sr.from("invite_codes") as any)
    .select("code, owner_user_id, label, max_uses, use_count, revoked, created_at")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getAllInviteCodes(): Promise<InviteCodeWithOwner[]> {
  const sr = serviceRoleClient();
  const { data: codes, error } = await (sr.from("invite_codes") as any)
    .select("code, owner_user_id, label, max_uses, use_count, revoked, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!codes?.length) return [];

  const ownerIds: string[] = [...new Set(
    (codes as InviteCodeRow[]).filter(c => c.owner_user_id).map(c => c.owner_user_id as string)
  )];

  let usernameMap = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profiles } = await sr
      .from("profiles")
      .select("id, username")
      .in("id", ownerIds);
    if (profiles) {
      usernameMap = new Map(profiles.map(p => [p.id, p.username]));
    }
  }

  return (codes as InviteCodeRow[]).map(c => ({
    ...c,
    owner_username: c.owner_user_id ? (usernameMap.get(c.owner_user_id) ?? null) : null,
  }));
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/queries/invite-codes.ts
git commit -m "feat(invite): query layer — getMyInviteCode, getAllInviteCodes"
```

---

### Task 4: Server actions

**Files:**
- Create: `app/lib/actions/invite-codes.ts`

- [ ] **Step 1: Create the file**

```ts
// app/lib/actions/invite-codes.ts
"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearInviteCodeCookie } from "@/lib/actions/invite-cookie";

// Used in signUp before user creation — SELECT only, no writes.
// Returns true if the code exists, is not revoked, and has remaining capacity.
export async function peekInviteCode(code: string | null): Promise<boolean> {
  if (!code) return false;
  const sr = serviceRoleClient();
  const { data } = await (sr.from("invite_codes") as any)
    .select("use_count, max_uses, revoked")
    .eq("code", code)
    .maybeSingle();
  if (!data) return false;
  return !data.revoked && data.use_count < data.max_uses;
}

// Used in signUp after user creation — race-safe increment via DB RPC.
// Clears the cookie regardless of outcome.
export async function burnInviteCode(code: string, newUserId: string): Promise<void> {
  await clearInviteCodeCookie();
  const sr = serviceRoleClient();
  await (sr as any).rpc("burn_invite_code", { p_code: code, p_user_id: newUserId });
}

// Admin: generate a new code with owner_user_id = null (batch/admin code).
export async function adminCreateInviteCode(
  formData: FormData
): Promise<{ code: string } | { error: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const label = String(formData.get("label") || "").trim() || null;
  const maxUses = Math.max(1, parseInt(String(formData.get("max_uses") || "5"), 10) || 5);
  const code = randomBytes(4).toString("hex");

  const sr = serviceRoleClient();
  const { error } = await (sr.from("invite_codes") as any).insert({
    code,
    owner_user_id: null,
    label,
    max_uses: maxUses,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/invite-codes");
  return { code };
}

// Admin: soft-revoke a code. Does not undo existing uses.
export async function adminRevokeInviteCode(
  code: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const sr = serviceRoleClient();
  const { error } = await (sr.from("invite_codes") as any)
    .update({ revoked: true })
    .eq("code", code);

  if (error) return { error: error.message };
  revalidatePath("/admin/invite-codes");
  return {};
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/actions/invite-codes.ts
git commit -m "feat(invite): server actions — peek, burn, adminCreate, adminRevoke"
```

---

### Task 5: Signup gate

**Files:**
- Modify: `app/lib/actions/auth.ts`

- [ ] **Step 1: Add imports at the top of auth.ts**

After the existing imports, add:

```ts
import { peekInviteCode, burnInviteCode } from "@/lib/actions/invite-codes";
import { readInviteCodeCookie } from "@/lib/actions/invite-cookie";
```

- [ ] **Step 2: Replace the `signUp` function**

Find the entire `signUp` function (lines ~48–95) and replace it with:

```ts
export async function signUp(formData: FormData): Promise<{ error?: string; info?: string; duplicate?: boolean }> {
  const password = String(formData.get("password") || "");
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);
  const invite = String(formData.get("invite") || "").trim().toLowerCase();

  if (!USERNAME_RE.test(username) || username.length > 24) {
    return { error: "Username: lowercase letters, numbers, dots, underscores only (max 24)." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  // Gate check — validate cookie before touching auth.users
  let inviteCode: string | null = null;
  if (process.env.INVITE_GATE === "1") {
    inviteCode = await readInviteCodeCookie();
    const isValid = await peekInviteCode(inviteCode);
    if (!isValid) return { error: "You need a valid invite link to join." };
  }

  const admin = serviceRoleClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "That username is already taken." };
  }

  const email = syntheticEmailFor(username);
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr) {
    const duplicate = createErr.message?.toLowerCase().includes("already") ?? false;
    return { error: friendlyError(createErr), duplicate };
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return { error: friendlyError(signInErr) };
  }

  // Burn invite after user is created — newUserId is now known
  if (process.env.INVITE_GATE === "1" && inviteCode && createData?.user?.id) {
    await burnInviteCode(inviteCode, createData.user.id);
  }

  if (invite) {
    try {
      await setInviteCookie(invite);
    } catch { /* cookie failure must never break signup */ }
  }
  redirect(target);
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/actions/auth.ts
git commit -m "feat(invite): gate check in signUp — INVITE_GATE=1 env flag"
```

---

### Task 6: Arrival page `/invite/[code]`

**Files:**
- Create: `app/app/invite/[code]/page.tsx`

This is a server page. For a valid code it sets the `fg_invite_code` cookie and redirects to `/auth/signup`. For an invalid code it shows an error.

- [ ] **Step 1: Create the page**

```tsx
// app/app/invite/[code]/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { setInviteCodeCookie } from "@/lib/actions/invite-cookie";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const sr = serviceRoleClient();
  const { data } = await (sr.from("invite_codes") as any)
    .select("use_count, max_uses, revoked")
    .eq("code", code)
    .maybeSingle();

  const valid = data && !data.revoked && data.use_count < data.max_uses;

  if (valid) {
    await setInviteCodeCookie(code);
    redirect("/auth/signup");
  }

  return (
    <main
      style={{
        background: "var(--bone)",
        color: "var(--void)",
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 40,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        style={{
          border: "3px solid var(--void)",
          padding: "clamp(24px, 6vw, 40px) clamp(20px, 5vw, 32px)",
          boxShadow: "var(--card-shadow-offset) var(--card-shadow-offset) 0 var(--blood)",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
        }}
        className="grain-light"
      >
        <div className="eyebrow" style={{ marginBottom: 12 }}>✦ Film Goblin</div>
        <h1
          className="display"
          style={{ fontSize: "clamp(32px, 7vw, 56px)", margin: "0 0 16px", lineHeight: 0.9 }}
        >
          Invite expired.
        </h1>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 1.5,
            opacity: 0.75,
            margin: "0 0 28px",
          }}
        >
          This invite link is no longer valid — it may have been used up or revoked.
          Ask the person who sent it to share a fresh one.
        </p>
        <Link href="/" className="btn btn-dark" style={{ textDecoration: "none" }}>
          ← Back to Film Goblin
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Verify manually**

Start the dev server (`cd app && npm run dev`). Visit `http://localhost:3000/invite/fakecode`. You should see the "Invite expired." error page with a back link.

- [ ] **Step 4: Commit**

```bash
git add 'app/app/invite/[code]/page.tsx'
git commit -m "feat(invite): /invite/[code] arrival page — set cookie + redirect or error"
```

---

### Task 7: Settings invite link section

**Files:**
- Create: `app/components/settings/CopyInviteButton.tsx`
- Create: `app/components/settings/InviteLinkSection.tsx`
- Modify: `app/app/settings/page.tsx`

- [ ] **Step 1: Create CopyInviteButton**

```tsx
// app/components/settings/CopyInviteButton.tsx
"use client";

import { useState } from "react";

export default function CopyInviteButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginTop: 10, flexWrap: "wrap" }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "9px 12px",
          background: "var(--void-2)",
          border: "1px solid #444",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--muted)",
          wordBreak: "break-all",
          lineHeight: 1.4,
        }}
      >
        {url}
      </div>
      <button
        type="button"
        onClick={copy}
        style={{
          flexShrink: 0,
          padding: "9px 16px",
          background: copied ? "var(--accent)" : "transparent",
          color: copied ? "var(--void)" : "var(--bone)",
          border: `2px solid ${copied ? "var(--accent)" : "var(--bone)"}`,
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s, border-color 0.15s",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create InviteLinkSection**

```tsx
// app/components/settings/InviteLinkSection.tsx
import { getMyInviteCode } from "@/lib/queries/invite-codes";
import CopyInviteButton from "@/components/settings/CopyInviteButton";

const BASE_URL = "https://film-goblin.vercel.app";

export default async function InviteLinkSection({ userId }: { userId: string }) {
  const code = await getMyInviteCode(userId);
  if (!code) return null;

  const url = `${BASE_URL}/invite/${code.code}`;
  const exhausted = code.use_count >= code.max_uses;

  return (
    <div style={{ marginTop: 40, borderTop: "1px solid #333", paddingTop: 24 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 10, color: "var(--accent)" }}>
        Your Invite Link
      </div>
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 13,
          margin: "0 0 4px",
          opacity: 0.75,
          lineHeight: 1.5,
        }}
      >
        Share this link to invite someone to Film Goblin.
      </p>
      <CopyInviteButton url={url} />
      <div
        style={{
          marginTop: 10,
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: exhausted ? "var(--blood)" : "var(--muted)",
        }}
      >
        {exhausted
          ? "All invites used — contact an admin for more slots."
          : `${code.use_count} of ${code.max_uses} used`}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into settings/page.tsx**

In `app/app/settings/page.tsx`, add the import after the existing imports:

```ts
import InviteLinkSection from "@/components/settings/InviteLinkSection";
```

Then in the JSX, add `<InviteLinkSection userId={user.id} />` between `<LanePicker>` and `<DeleteAccountSection>`:

```tsx
        <LanePicker
          initialLaneIds={initialLaneIds}
          vocab={{ subgenre: vocab.subgenre, tone: vocab.tone, theme: vocab.theme }}
        />
        <InviteLinkSection userId={user.id} />
        <DeleteAccountSection username={username} />
```

- [ ] **Step 4: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Verify manually**

Navigate to `http://localhost:3000/settings` (while signed in). You should see the "Your Invite Link" block with your code URL and a copy button, plus "0 of 5 used".

- [ ] **Step 6: Commit**

```bash
git add app/components/settings/CopyInviteButton.tsx app/components/settings/InviteLinkSection.tsx app/app/settings/page.tsx
git commit -m "feat(invite): settings invite link section — url + copy button + usage counter"
```

---

### Task 8: Admin page

**Files:**
- Create: `app/app/admin/invite-codes/InviteCodesClient.tsx`
- Create: `app/app/admin/invite-codes/page.tsx`
- Modify: `app/app/admin/page.tsx`

- [ ] **Step 1: Create InviteCodesClient (create form + revoke buttons)**

```tsx
// app/app/admin/invite-codes/InviteCodesClient.tsx
"use client";

import { useState, useTransition } from "react";
import { adminCreateInviteCode, adminRevokeInviteCode } from "@/lib/actions/invite-codes";
import type { InviteCodeWithOwner } from "@/lib/queries/invite-codes";

const BASE_URL = "https://film-goblin.vercel.app";

export function CreateInviteForm() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setResult(null);
    setError(null);
    startTransition(async () => {
      const res = await adminCreateInviteCode(formData);
      if ("error" in res) {
        setError(res.error);
      } else {
        setResult(`${BASE_URL}/invite/${res.code}`);
      }
    });
  }

  return (
    <div style={{ background: "var(--void-2)", border: "1px solid #444", padding: 20, maxWidth: 480 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 14, color: "var(--accent)" }}>Create Code</div>
      <form action={submit} style={{ display: "grid", gap: 12 }}>
        <label>
          <div className="caps" style={{ fontSize: 10, marginBottom: 5, color: "var(--muted)" }}>Label (optional)</div>
          <input
            name="label"
            type="text"
            placeholder="e.g. Discord drop"
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "var(--void)",
              border: "1px solid #555",
              color: "var(--bone)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </label>
        <label>
          <div className="caps" style={{ fontSize: 10, marginBottom: 5, color: "var(--muted)" }}>Max uses</div>
          <input
            name="max_uses"
            type="number"
            min={1}
            defaultValue={5}
            style={{
              width: 80,
              padding: "8px 10px",
              background: "var(--void)",
              border: "1px solid #555",
              color: "var(--bone)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
            }}
          />
        </label>
        {error && <div style={{ color: "var(--blood)", fontSize: 12, fontStyle: "italic" }}>{error}</div>}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-sm"
          style={{ justifySelf: "start" }}
        >
          {pending ? "Creating…" : "Create Code"}
        </button>
      </form>
      {result && (
        <div style={{ marginTop: 14, padding: 12, background: "var(--void)", border: "1px solid var(--accent)" }}>
          <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginBottom: 6 }}>New code ready:</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all", color: "var(--bone)" }}>
            {result}
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const res = await adminRevokeInviteCode(code);
      setState(res.error ? "error" : "done");
    });
  }

  if (state === "done") {
    return <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)" }}>Revoked</span>;
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={pending}
      className="btn btn-sm"
      style={{ background: "transparent", color: "var(--blood)", borderColor: "var(--blood)", fontSize: 10 }}
    >
      {state === "error" ? "Error" : pending ? "…" : "Revoke"}
    </button>
  );
}
```

- [ ] **Step 2: Create the admin page**

```tsx
// app/app/admin/invite-codes/page.tsx
import Link from "next/link";
import { getAllInviteCodes } from "@/lib/queries/invite-codes";
import { CreateInviteForm, RevokeButton } from "./InviteCodesClient";

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function AdminInviteCodesPage() {
  const codes = await getAllInviteCodes();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 28 }}>
        <Link href="/admin" style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
          ← Admin
        </Link>
        <h1 className="h-display" style={{ margin: 0 }}>Invite Codes</h1>
      </div>

      <CreateInviteForm />

      <div style={{ marginTop: 32, overflowX: "auto" }}>
        {codes.length === 0 ? (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>No codes yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-ui)", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #444", textAlign: "left" }}>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Code</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Owner</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Label</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Uses</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Created</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.code} style={{ borderBottom: "1px solid #2a2a2a", opacity: c.revoked ? 0.45 : 1 }}>
                  <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-mono)" }}>{c.code}</td>
                  <td style={{ padding: "8px 12px 8px 0", color: "var(--muted)" }}>
                    {c.owner_username ? `@${c.owner_username}` : "admin"}
                  </td>
                  <td style={{ padding: "8px 12px 8px 0", color: "var(--muted)", fontStyle: "italic" }}>{c.label ?? "—"}</td>
                  <td style={{ padding: "8px 12px 8px 0" }}>
                    <span style={{ color: c.use_count >= c.max_uses ? "var(--blood)" : "inherit" }}>
                      {c.use_count}/{c.max_uses}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px 8px 0", color: "var(--muted)" }}>{fmtDate(c.created_at)}</td>
                  <td style={{ padding: "8px 12px 8px 0" }}>
                    {c.revoked ? (
                      <span style={{ color: "var(--blood)", fontSize: 10 }}>Revoked</span>
                    ) : c.use_count >= c.max_uses ? (
                      <span style={{ color: "var(--muted)", fontSize: 10 }}>Exhausted</span>
                    ) : (
                      <span style={{ color: "var(--accent)", fontSize: 10 }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 0" }}>
                    {!c.revoked && <RevokeButton code={c.code} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the Invite Codes tile to admin/page.tsx**

In `app/app/admin/page.tsx`, add a tile after the Film Requests tile:

```tsx
<Tile href="/admin/invite-codes" title="Invite Codes" blurb="Create and revoke invite links. See who's used each code." />
```

- [ ] **Step 4: Typecheck**

```bash
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Verify manually**

Navigate to `http://localhost:3000/admin/invite-codes`. You should see:
- The "Create Code" form
- A table of all existing codes with owner usernames, use counts, and revoke buttons

- [ ] **Step 6: Commit**

```bash
git add 'app/app/admin/invite-codes/' app/app/admin/page.tsx
git commit -m "feat(invite): admin panel — create codes, revoke, usage table"
```

---

### Task 9: Enable the gate + deploy

**Files:** None — this is an operational step.

- [ ] **Step 1: Add INVITE_GATE to Vercel env**

```bash
npx vercel env add INVITE_GATE
```

When prompted: select **Production**, **Preview**, and **Development**. Value: `1`.

Or via Vercel dashboard: Project → Settings → Environment Variables → Add `INVITE_GATE` = `1` for all environments.

- [ ] **Step 2: Pull updated env to local**

```bash
npx vercel env pull app/.env.local --yes --environment=development
```

Verify `app/.env.local` now contains `INVITE_GATE=1`.

- [ ] **Step 3: Test the gate locally**

Start dev server (`cd app && npm run dev`).

a) Visit `http://localhost:3000/auth/signup` directly. Submit the form. You should see: "You need a valid invite link to join."

b) Visit `/invite/[a-valid-code-from-your-db]`. Should redirect to `/auth/signup`. Now submit the form — should succeed.

- [ ] **Step 4: Deploy**

From the repo root:

```bash
npx vercel deploy --prod --yes
```

- [ ] **Step 5: Smoke test on prod**

Visit `https://film-goblin.vercel.app/auth/signup` directly — should reject without an invite.
Visit `https://film-goblin.vercel.app/invite/[your-code]` — should redirect to signup and accept.

- [ ] **Step 6: Final commit (CLAUDE.md update)**

Update `CLAUDE.md` "Current state" section to note the invite gate is live.

```bash
git add CLAUDE.md
git commit -m "chore: update CLAUDE.md — invite gate live"
```

---

## Removing the gate later

When ready to open signup publicly:

1. Delete `INVITE_GATE` from Vercel env vars (all environments)
2. `npx vercel deploy --prod --yes`

No code changes, no migration. The `invite_codes` and `invite_uses` tables stay in place for historical data.
