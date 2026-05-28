# Site Settings (admin) — invite-gate toggle

**Date:** 2026-05-28
**Status:** Approved
**Area:** `db/migrations/`, `app/lib/actions/`, `app/app/admin/`, `app/lib/actions/auth.ts`

## Problem

Invite gating (the hard signup gate) is controlled by the `INVITE_GATE=1`
environment variable, checked at runtime in the `signUp` server action
(`app/lib/actions/auth.ts`). Flipping it requires editing Vercel env and
redeploying. We want admins to toggle it from a UI, instantly, with no deploy —
and a place ("Site Settings") that can hold future toggles.

## Decision

Introduce a generic key-value `site_settings` table as the runtime source of
truth, with `invite_gate` as its first entry. Replace the env-var check in
`signUp` with a DB read. Add an admin "Site Settings" page with a toggle.

- **Source of truth:** DB only. The `INVITE_GATE` env var is removed from
  `signUp` and deleted from Vercel after deploy.
- **Fail-safe:** if the setting is missing or the read errors, signup stays
  **gated** (fail closed) — safer for a private app.
- **Initial value:** seed `invite_gate = true` so production behavior is
  unchanged at deploy time.
- **Extensible:** key-value shape means the next setting is a new row, not a
  schema change.

## Data model

Migration `db/migrations/0192_site_settings.sql`:

```sql
create table public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;
-- No policies: only the service role reads/writes this table. Matches the
-- lockdown style of other internal tables (see mig 0189).

insert into public.site_settings (key, value) values ('invite_gate', 'true'::jsonb)
  on conflict (key) do nothing;
```

## Read path

`app/lib/actions/admin/site-settings.ts`:

- Internal `readSettingBool(key, fallback)` — service-role SELECT of `value`;
  returns `value === true` when the row exists and is a JSON boolean; returns
  `fallback` on missing row or any error. (Uses `serviceRoleClient`; the
  `(sr as any)` cast mirrors `invite_codes.ts` to avoid blocking on a local
  type regen.)
- Exported `isInviteGateEnabled()` → `readSettingBool("invite_gate", true)`.
  **No admin guard** — `signUp` calls it before the user is authenticated, and
  it only reveals a single boolean.

In `app/lib/actions/auth.ts`, both occurrences of
`process.env.INVITE_GATE === "1"` (the gate check at line ~66 and the burn check
at line ~101) become `await isInviteGateEnabled()`. The value is read once near
the top of `signUp` into a local `const gateEnabled` and reused for both spots,
so a mid-request toggle can't make the two checks disagree.

## Write path

`app/lib/actions/admin/site-settings.ts`:

- Internal `writeSetting(key, value, userId)` — service-role upsert
  (`on conflict (key) do update`) setting `value`, `updated_at = now()`,
  `updated_by = userId`.
- Exported `setInviteGate(enabled: boolean)` admin action:
  1. `const supabase = await createClient(); const user = await requireAdminUser(supabase);`
  2. `await writeSetting("invite_gate", enabled, user.id);`
  3. `revalidatePath("/admin/site-settings");`

Also export a read for the admin page: `getInviteGateSetting()` returning
`{ enabled: boolean; updatedAt: string | null }` via service role (used by the
Server Component to render current state + "last changed").

## UI

- `app/app/admin/site-settings/page.tsx` — Server Component. Calls
  `getInviteGateSetting()`, renders the page heading and
  `<SiteSettingsClient enabled={...} updatedAt={...} />`. (The `/admin` layout
  already enforces `checkAdminAccess`, so no extra guard needed in the page.)
- `app/app/admin/site-settings/SiteSettingsClient.tsx` — `"use client"`. A
  labeled toggle switch ("Invite gating") with a one-line description
  ("When on, new signups require a valid invite link.") and a muted "Last
  changed <relative/absolute time>" line. On change it calls `setInviteGate`,
  shows a pending state, and reflects the result. Styling follows the existing
  admin component idiom (bone/void tokens, `head`/`eyebrow` classes).
- `app/app/admin/page.tsx` — add a tile:
  `<Tile href="/admin/site-settings" title="Site Settings" blurb="Toggle site-wide controls like invite gating." />`.

## Error handling

- Read helper: never throws; returns `fallback` (gated for invite_gate).
- `setInviteGate`: `requireAdminUser` throws `NotAdminError` for non-admins
  (consistent with other admin actions); the client surfaces a generic failure
  message and leaves the toggle in its prior state.

## Testing

`app/tests/actions/site-settings.test.ts`:

- `readSettingBool` returns `fallback` when the injected client yields no row.
- `readSettingBool` returns `fallback` when the injected client returns an error.
- `readSettingBool` returns `true`/`false` matching a present JSON boolean value.
- `isInviteGateEnabled` defaults to `true` (fail closed) on missing row.

To keep these unit-testable without real Supabase, `readSettingBool` takes an
injected client in its private form (per the actions private/public split);
the exported wrappers construct `serviceRoleClient()`.

Admin-guard behavior of `setInviteGate` is covered by the shared `requireAdmin`
tests; no need to re-test the guard here. Env-gated integration tests follow the
`hasEnv` + `if (!hasEnv) return` template if a live-DB test is added.

## Deployment / rollout

1. Apply migration 0192 to production DB (pooler, per root CLAUDE.md procedure).
2. Deploy app.
3. Verify the toggle works at `/admin/site-settings` and that signup still
   gates (seed is `true`).
4. Delete `INVITE_GATE` from Vercel env (no longer read). Optional cleanup —
   leaving it set has no effect since `signUp` no longer references it.

## Out of scope

- Additional settings beyond `invite_gate` (the table is ready for them).
- Per-user or per-coven settings.
- A settings audit log/history (we keep only last `updated_at`/`updated_by`).
- Caching layer (reads are uncached by design).
