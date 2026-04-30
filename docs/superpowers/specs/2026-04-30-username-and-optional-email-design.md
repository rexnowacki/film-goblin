# Username + optional email at signup — sub-project 21 design

**Date:** 2026-04-30
**Status:** in flight (PR 1 of 2 lands first)

## Problem

Two related friction points:

1. **Login is email-only.** Users have a `handle` (planned to rename: `username`) but cannot sign in with it. They have to remember which email they signed up with.
2. **Email is required at signup.** It's also email-confirmed via Supabase, which is friction we don't need yet — and not every user wants to give us an email at all. The original product intent is in-app notifications by default; email is an opt-in surface for users who want it for price-drop digests.

## Decision

Two PRs, sequenced:

### PR 1 — `refactor: rename handle → username` (mechanical)

`profiles.handle` becomes `profiles.username`. No behavior change. Reasons:

- `username` pairs more cleanly with `display_name` than `handle` does.
- "Handle" is Twitter-era jargon. Younger users mentally translate to "username" anyway.
- The auth login form in PR 2 will say "Username or email", which is universal phrasing.

Touches: migration `0137`, trigger `0136` (read `raw_user_meta_data->>'username'`), `app/lib/supabase/types.ts`, every server action / query / component referencing `.handle`, the route `app/p/[handle]` → `app/p/[username]`, copy strings ("Your Handle" → "Your Username"), tests.

The slug VALUE doesn't change — only the param name. So existing `/p/teethtony` URLs keep resolving.

### PR 2 — `feat: username-or-email login + optional email at signup`

**Signup form drops the email field entirely.** Username + display_name + password only. Server action generates a synthetic `<username>@noreply.film-goblin.app` email and calls `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, display_name } })` via the service-role client. The `on_auth_user` trigger reads metadata as before.

**Signin form: single "Username or email" identifier field.** Server action sniffs `@`; if present, treat as email and pass straight to `signInWithPassword`. Otherwise, service-role lookup `auth.users.email` joined on `profiles.username`, then `signInWithPassword({ email, password })`. Same error message either way ("Invalid credentials") — never leak whether a username exists.

**`profiles.email_added_at TIMESTAMPTZ NULL`** column tracks "is this a real email?". NULL = synthetic, set timestamp = real. Backfill existing rows with `email_added_at = created_at` since they all signed up under the old email-required flow. A trigger on `auth.users.email` change flips `email_added_at = now()` when the email transitions away from the `@noreply.film-goblin.app` domain.

**Notifier package** gains `AND email_added_at IS NOT NULL` to its candidate query so we never blast the synthetic noreply domain.

**`/settings`** detects `email_added_at IS NULL` and shows "Add email" in place of "Change email". On confirmed change, the trigger lifts the flag.

**Email verification skip:** toggle off "Confirm email" in the Supabase dashboard. Project-wide. Reversible. Synthetic-email users never get a confirm-link sent because we pass `email_confirm: true` via admin createUser anyway, but turning the dashboard toggle off keeps the path simple for OAuth + future direct password signups too. The auth callback gets simplified — confirm-email branch removed.

OAuth (Google) callback unchanged — those users always come in with a real email; the `auth.users.email` trigger sets `email_added_at` non-null since their email isn't `@noreply.film-goblin.app`.

## Why two PRs

The rename is mechanical and high-volume (~80 files touched). The auth changes are small but high-risk (broken login = nobody can use the app). Splitting them isolates blast radius:

- PR 1 typo / missed reference → "page renders wrong text", easy to spot in preview.
- PR 2 auth bug → "no one can sign in". Bisecting is much easier when this PR isn't tangled with the rename.

## Open follow-ups

- **Live username-availability check on signup** (carried from prior session's roadmap) — fits naturally on top of PR 2's signup form.
- **`/settings` username regex validation** — the existing follow-up; arguably folds into PR 1 since the column rename is the perfect time to also wire the validation.
- **301 redirects from old shaped URLs** — not needed; the column rename doesn't change URL slugs, only param names.
- **Notification preferences per-kind matrix** — out of scope here; lives on its own roadmap line.

## Migrations

- **0137** — `ALTER TABLE profiles RENAME COLUMN handle TO username`. Rename unique index + check constraint accordingly. Update the `0136` trigger function inline so it reads `raw_user_meta_data->>'username'`.
- **0138** — `ALTER TABLE profiles ADD COLUMN email_added_at TIMESTAMPTZ NULL`. Backfill `UPDATE profiles SET email_added_at = created_at`. Trigger on `auth.users` `BEFORE UPDATE OF email` flips the flag when transitioning out of the synthetic domain.
