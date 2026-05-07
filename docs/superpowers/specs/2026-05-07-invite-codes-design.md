# Invite Codes — Design Spec

## Goal

Hard-gate signup behind invite codes for the initial launch cohort. Each code is multi-use with a fixed cap of 5. The gate is a single env flag (`INVITE_GATE=1`) that can be removed without a migration or code change.

## Data Model

### `invite_codes`

```sql
CREATE TABLE invite_codes (
  code             TEXT PRIMARY KEY,           -- 8-char url-safe slug
  owner_user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label            TEXT,                        -- admin annotation only
  max_uses         INTEGER NOT NULL DEFAULT 5,
  use_count        INTEGER NOT NULL DEFAULT 0,
  revoked          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `owner_user_id` is nullable — null means admin-created batch code.
- Each new user gets exactly one row auto-created here by a DB trigger on `profiles` insert.
- Code is an 8-character lowercase hex string generated in the trigger via `encode(gen_random_bytes(4), 'hex')` — always url-safe, no substitutions needed.

### `invite_uses`

```sql
CREATE TABLE invite_uses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL REFERENCES invite_codes(code),
  new_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Tracks who joined via which code. Used for admin visibility and future growth metrics.

### Auto-creation trigger

A `AFTER INSERT ON profiles` trigger calls a function that inserts one `invite_codes` row with `owner_user_id = NEW.id` and `max_uses = 5`. This fires for every new signup, including the first admin user (who must be seeded via the admin create-code UI or directly in DB before the gate is live).

## Invite Flow

### 1. Share link

User visits `/settings`. A server-fetched "Your Invite Link" block shows:
- Full URL: `https://film-goblin.vercel.app/invite/[code]`
- Copy-to-clipboard button (client component)
- `X of 5 used` counter in muted text
- If `use_count >= max_uses`: "All invites used — contact an admin for more slots."

### 2. Arrival at `/invite/[code]`

Server page. Validates the code:
- Code exists in `invite_codes`
- `revoked = false`
- `use_count < max_uses`

**Valid:** Sets `fg_invite_code` cookie (httpOnly, secure, sameSite=lax, maxAge=86400), redirects to `/auth/signup`.

**Invalid / exhausted:** Renders an error page ("This invite link is no longer valid.") with a link back to `/`.

The existing `fg_invite` cookie (referrer-username tracking) is a separate cookie and remains untouched.

### 3. Signup gate

In the `signUp` server action (`app/lib/actions/auth.ts`), order matters:

```ts
// 1. Gate check — before creating the user
if (process.env.INVITE_GATE === "1") {
  const code = await readInviteCodeCookie();
  const isValid = await peekInviteCode(code); // SELECT only, no write
  if (!isValid) return { error: "You need a valid invite link to join." };
}

// 2. Create the auth user (existing logic)
const { error: createErr } = await admin.auth.admin.createUser({ ... });
if (createErr) return { error: friendlyError(createErr) };

// 3. Burn the invite — after user exists so new_user_id is known
if (process.env.INVITE_GATE === "1") {
  await burnInviteCode(code, newUserId); // race-safe UPDATE + insert invite_use + clear cookie
}
```

`peekInviteCode(code)`: SELECT — returns true if code exists, not revoked, `use_count < max_uses`.

`burnInviteCode(code, newUserId)`:
1. `UPDATE invite_codes SET use_count = use_count + 1 WHERE code = $1 AND NOT revoked AND use_count < max_uses` — race-safe; if 0 rows updated the code was exhausted between peek and burn (extremely rare at this scale; user is in but not tracked — acceptable).
2. Inserts a row into `invite_uses` if UPDATE succeeded.
3. Clears the `fg_invite_code` cookie.

### 4. Gate removal

Remove `INVITE_GATE` from Vercel env vars → redeploy. The `if (process.env.INVITE_GATE === "1")` block is skipped. No migration, no code change. The tables stay in place for historical data.

## Settings UI

New `InviteLinkSection` server component rendered inside the `/settings` page layout, between existing form sections and the danger zone. Fetches `invite_codes` row where `owner_user_id = user.id`. If no row exists (edge case pre-trigger), renders nothing.

`CopyInviteButton` — `"use client"` child that handles `navigator.clipboard.writeText` and shows "Copied!" feedback.

## Admin Controls

### `/admin/invite-codes`

Two panels:

**Codes table** — all `invite_codes` rows joined to `profiles.username` on `owner_user_id`. Columns: code, owner (or "admin" if null), label, uses (`use_count / max_uses`), created, revoke button. Sorted by `created_at DESC`.

**Create code form** — label (optional text), max_uses (number input, default 5). On submit, generates a new code with `owner_user_id = null`. Shows the resulting link inline for copying.

**Revoke** — sets `revoked = true`. Does not delete the row or undo existing uses.

No per-user top-up UI — admin creates a new code and shares it directly.

## Files

### New
- `db/migrations/0172_invite_codes.sql` — tables + trigger
- `app/app/invite/[code]/page.tsx` — arrival/validation page
- `app/app/admin/invite-codes/page.tsx` — admin list + create
- `app/components/settings/InviteLinkSection.tsx` — server component
- `app/components/settings/CopyInviteButton.tsx` — client copy button
- `app/lib/queries/invite-codes.ts` — `getMyInviteCode`, `getAllInviteCodes`
- `app/lib/actions/invite-codes.ts` — `validateAndBurnInviteCode`, `adminCreateInviteCode`, `adminRevokeInviteCode`
- `app/lib/actions/invite-cookie.ts` additions — `readInviteCodeCookie`, `clearInviteCodeCookie` (new helpers alongside existing `fg_invite` helpers)

### Modified
- `app/lib/actions/auth.ts` — gate check in `signUp`
- `app/app/settings/page.tsx` — render `InviteLinkSection`
- `app/app/auth/signup/page.tsx` — show "invalid invite" error cleanly if gate rejects
- `app/middleware.ts` — add `/invite` to public routes (it's not auth-required)

## RLS

`invite_codes` and `invite_uses` are read/written exclusively via service-role or server actions — no direct client access needed. No RLS policies required (service-role bypasses RLS; all mutations go through server actions with session checks).
