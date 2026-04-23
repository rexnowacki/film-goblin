# Auth Polish — Design Spec

**Sub-project:** 7 (post-MVP polish).
**Status:** design.
**Predecessors:** sub-project 3 (Next.js app + email/password auth), sub-project 6 (logout UI).
**Successors:** none planned. This closes the known auth gaps.

## Goal

Ship the five auth improvements that the MVP skipped:

1. Google OAuth sign-in.
2. Forgotten password flow (request reset + set new password).
3. Change password from Settings while signed in.
4. Friendly error messages translating Supabase's raw strings.
5. Verified redirect-after-signin using `?redirect=` safely.

Ends when a user can sign in with Google, recover a forgotten
password, change their password from Settings, see a human-readable
error when credentials are wrong, and land back on the page they
tried to visit after signing in.

## Scope

- **In:** Google OAuth · forgot-password flow · change-password in
  Settings · friendly errors · redirect-after-signin (incl. safety
  check against open-redirect attacks) · one-off signup-to-signin
  nudge for duplicate emails.
- **Out:** Magic link · additional OAuth providers · custom email
  templates · MFA · sign-out-all-devices · delete-account · change-
  email · password-strength meter · show-password toggle · session
  list · CAPTCHA. All tracked in backlog.

## Architecture

No new schema, no new workspace package. Supabase's GoTrue handles
identities, sessions, and token exchange. We add surface wiring:

- Three new server actions in `app/lib/actions/auth.ts`:
  `signInWithGoogle`, `sendPasswordReset`, `resetPassword`.
- One new action in `app/lib/actions/profile.ts`: `changePassword`.
- One small helper module: `app/lib/auth/friendly-errors.ts`.
- Two new pages: `app/app/auth/forgot/page.tsx` and
  `app/app/auth/reset/page.tsx`.
- Two new components: `GoogleSignInButton.tsx`, plus a small
  ChangePassword section added to `SettingsForm.tsx`.
- Signin + signup pages add a Google button + "Forgot password?"
  link + hidden `redirect` input.
- Existing `app/app/api/auth/callback/route.ts` grows a `?next=`
  reader + profile-existence check to send Google users to
  `/onboarding` when new.

### External precursors (manual — Task 1 of the plan)

- Google Cloud Console project with OAuth consent screen + Web
  Client ID (+ secret). Authorized redirect URIs:
  `https://wktylpissdjinccbwzha.supabase.co/auth/v1/callback` and
  `http://127.0.0.1:54321/auth/v1/callback`.
- Supabase dashboard: paste Google client id + secret under
  Authentication → Providers → Google, enable. Confirm Site URL +
  Redirect URLs include `https://film-goblin.vercel.app/**` and
  `http://localhost:3000/**`.

## Feature: Google OAuth

New `signInWithGoogle(nextPath?: string)` action:

```ts
export async function signInWithGoogle(nextPath?: string): Promise<{ url: string }> {
  const origin = process.env.APP_BASE_URL || "https://film-goblin.vercel.app";
  const next = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/home";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) throw new Error(friendlyError(error));
  return { url: data.url };
}
```

The button is a Client Component:

```tsx
"use client";
import { signInWithGoogle } from "@/lib/actions/auth";
import { useSearchParams } from "next/navigation";

export default function GoogleSignInButton() {
  const params = useSearchParams();
  async function onClick() {
    const redirect = params.get("redirect") || undefined;
    const { url } = await signInWithGoogle(redirect);
    window.location.href = url;
  }
  return (
    <button type="button" onClick={onClick} className="btn btn-outline" style={{ width: "100%", justifyContent: "center", gap: 8 }}>
      <GoogleG /> Continue with Google
    </button>
  );
}
```

Button placed above the email field on both `/auth/signin` and
`/auth/signup`.

### Callback handling

`/api/auth/callback` already exchanges the OAuth code for a session.
Extend it:

```ts
const next = url.searchParams.get("next") || "/home";
const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

const supabase = await createClient();
await supabase.auth.exchangeCodeForSession(code);

const { data: { user } } = await supabase.auth.getUser();
if (user) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .single();
  // Heuristic: new accounts have a placeholder handle derived from
  // email-local-part by the 0110 trigger. If the handle still equals
  // that default, assume onboarding hasn't happened yet.
  if (!profile || profile.handle === user.email?.split("@")[0]) {
    return NextResponse.redirect(new URL("/onboarding", url));
  }
}
return NextResponse.redirect(new URL(safeNext, url));
```

## Feature: Forgotten password

### /auth/signin addition

Add a link below the password field:

```tsx
<div style={{ marginTop: 8 }}>
  <a href="/auth/forgot" style={{ color: "var(--accent-deep)", fontSize: 13, fontStyle: "italic", textDecoration: "underline" }}>
    Forgot password?
  </a>
</div>
```

### /auth/forgot/page.tsx (client component)

Single email input + submit. Calls `sendPasswordReset(formData)`.

```ts
export async function sendPasswordReset(formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get("email") || "").trim();
  const origin = String(formData.get("origin") || "");
  if (!email) return { message: "Enter your email." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset`,
  });
  // Don't leak whether the email exists.
  return { message: "If an account with that email exists, we've sent a reset link. Check your inbox." };
}
```

Intentionally returns the same message for hits and misses — no
email-enumeration oracle.

### /auth/reset/page.tsx (client component)

- On mount: Supabase's reset link carries a recovery token in the
  URL. The `@supabase/ssr` client auto-exchanges the token via
  `supabase.auth.exchangeCodeForSession`. If it fails, render a
  zine-styled error with a "Request a new link" button back to
  `/auth/forgot`.
- Render a "New password" + "Confirm new password" form.
- On submit: `resetPassword(formData)` action calls
  `supabase.auth.updateUser({ password })`. On success, redirect to
  `/home`.

```ts
export async function resetPassword(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  if (newPassword !== confirm) return { error: "Passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyError(error) };
  return { ok: true };
}
```

### Email delivery

Local dev: reset emails land in Mailpit at
http://127.0.0.1:54324. Hosted staging: Supabase sends via its
built-in transactional email (free tier rate-limited to ~2/hour per
email). We use Supabase's default template for now; custom styling
is backlog.

## Feature: Change password in Settings

New section on `/settings`, below the profile-edit form, above the
SP6-T1 Sign Out block:

- Current password (required).
- New password (required, min 6).
- Confirm new password.
- Submit: "Update Password".

Server action `changePassword(formData)` lives in
`app/lib/actions/profile.ts` (same file as the existing profile
editor):

```ts
export async function changePassword(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const currentPassword = String(formData.get("current_password") || "");
  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (newPassword.length < 6) return { error: "New password must be at least 6 characters." };
  if (newPassword !== confirm) return { error: "New passwords don't match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not signed in." };

  // OAuth-only user (no password identity): skip re-auth.
  const hasPasswordIdentity = (user.identities ?? []).some(i => i.provider === "email");
  if (hasPasswordIdentity) {
    const reauth = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reauth.error) return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyError(error) };
  return { ok: true };
}
```

### UX for OAuth-only users

If `user.identities` contains no `provider === "email"` entry, the
Settings section renders a different copy:

> "You signed up with Google. Set a password to also sign in with
> email."

In this state, only the "New password" + "Confirm" fields render
(no "Current password"), and the action skips re-auth.

## Feature: Friendly errors

`app/lib/auth/friendly-errors.ts`:

```ts
export function friendlyError(err: unknown): string {
  const msg = typeof err === "string" ? err : (err as any)?.message ?? String(err);
  const map: Record<string, string> = {
    "Invalid login credentials": "Email or password is incorrect.",
    "Email not confirmed": "Check your inbox — we sent a confirmation link when you signed up.",
    "User already registered": "An account with this email already exists. Sign in instead?",
    "Password should be at least 6 characters": "Password must be at least 6 characters.",
    "Password is known to be weak and easy to guess": "That password is too common. Try a stronger one.",
    "For security purposes, you can only request this once every 60 seconds": "Please wait a minute before requesting another email.",
    "New password should be different from the old password": "Pick a different password than the one you currently have.",
    "Email rate limit exceeded": "You've requested too many emails. Try again in a few minutes.",
  };
  return map[msg] ?? msg || "Something went wrong.";
}
```

Callers: signin action, signup action, sendPasswordReset,
resetPassword, changePassword. Unknown messages pass through; a
totally null/empty error falls back to "Something went wrong."

## Feature: Redirect-after-signin

### Middleware (unchanged)

`decideRedirect(null, "/home")` already produces
`{ target: "/auth/signin", preserveRedirect: true }`; the middleware
wrapper encodes the original path as `?redirect=%2Fhome`.

### Signin page + action

Signin page reads `?redirect=` from searchParams and renders it as
a hidden input:

```tsx
const params = useSearchParams();
const redirectTo = params.get("redirect") || "/home";
// ... inside the form:
<input type="hidden" name="redirect" value={redirectTo} />
```

The signin action:

```ts
export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const safeRedirect = redirectIn.startsWith("/") && !redirectIn.startsWith("//") ? redirectIn : "/home";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyError(error) };
  redirect(safeRedirect);
}
```

Same pattern for the signup action (redirects post-confirmation to
the intended target). For Google OAuth, the `?next=` parameter on
the OAuth kickoff URL carries the redirect through the provider
round trip.

### Safety check

`!redirectTo.startsWith("//")` rejects protocol-relative URLs that
would let `/auth/signin?redirect=//evil.com` send the user off-site.
Only same-origin absolute paths (starting with `/` and not `//`)
pass. The check is duplicated in three places (signin, signup,
Google action, callback `next`) — pulled into a small
`safeRedirect` helper to DRY.

### Duplicate-email nudge on signup

When the signup action gets "User already registered" from Supabase,
it returns `{ error: friendlyError(...) }` — the copy already says
"Sign in instead?" The signup page renders that error, and a small
inline link: "Go to sign-in →" that links to
`/auth/signin?email=<encoded>&redirect=<whatever>`. Signin page
pre-fills the email from `?email=`.

## Testing

### `app/tests/auth/friendly-errors.test.ts` (5 tests)

- Known Supabase message maps to friendly copy.
- Unknown message passes through unchanged.
- Error object with `.message` is unwrapped.
- Plain string input works.
- Null input yields generic fallback.

### `app/tests/actions/change-password.test.ts` (3 tests)

- Happy path: known password → change → new password works via
  signInWithPassword.
- Wrong current password returns `{error}` with "Current password
  is incorrect".
- New password too short returns error without calling Supabase.

### `app/tests/middleware.test.ts` (+1 test)

- `safeRedirect("//evil.com")` returns `/home` (or equivalent —
  depending on where the helper is extracted, the test targets
  either middleware or the helper module directly).

### Not automated

- Google OAuth round trip — requires a real Google account and
  browser interaction.
- Password reset email delivery — delegated to Supabase's mail
  infrastructure.
- Reset-page token exchange — Supabase URL shape is their API.
- Verified manually via deploy smoke.

### Manual smoke at deploy

1. Visit signin. Click "Continue with Google". New account lands
   on `/onboarding`. Existing account lands on `/home`.
2. Sign out. Visit signin. Click "Forgot password?". Enter email,
   submit. Receive reset email (Mailpit local / Resend hosted).
   Click link. Enter new password. Get signed in.
3. Change password from `/settings` with correct current. Sign
   out, sign back in with new password.
4. Visit `/home` while signed out. Redirected to
   `/auth/signin?redirect=%2Fhome`. Sign in. Land on `/home`.
5. Probe: sign in with `?redirect=//evil.com`. Land on `/home`
   (open-redirect rejected).
6. Sign up with existing email. See friendly error + go-to-signin
   link. Click link, email pre-filled.

## Environment / secrets

- **Google OAuth client ID** — stored in Supabase dashboard (not in
  env vars or git).
- **Google OAuth client secret** — stored in Supabase dashboard.
- No new env vars on Vercel. `APP_BASE_URL` (from SP5) already
  exists and is used by `signInWithGoogle`.

## Out of scope

- Magic link sign-in (backlog).
- Apple / GitHub / Discord OAuth (backlog; same pattern as Google).
- Custom Supabase email templates (backlog).
- Two-factor auth (backlog).
- Sign out all devices (backlog).
- Delete account (backlog).
- Change email (backlog).
- Password strength meter (backlog).
- Show password toggle (backlog).
- Session / device management (backlog).
- CAPTCHA (backlog).
- Account recovery via backup codes (backlog).

## Dependencies

- No new npm packages.
- No new DB migrations.
- One external setup (Google Cloud Console + Supabase dashboard
  provider config) done manually as Task 1.
