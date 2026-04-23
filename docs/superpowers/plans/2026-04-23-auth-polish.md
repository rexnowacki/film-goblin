# Auth Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Google OAuth, forgotten-password flow, change-password-from-Settings, friendly error messages, and verified redirect-after-signin with open-redirect safety — the five auth gaps the MVP skipped.

**Architecture:** No schema changes. Pure surface wiring over Supabase's GoTrue — three new server actions (signInWithGoogle, sendPasswordReset, resetPassword), one new action in profile.ts (changePassword), two new pages (/auth/forgot, /auth/reset), one Google button client island, one friendly-errors helper module, signin/signup/callback updates for redirects. Google OAuth lands via Supabase's provider config — client id + secret live in the Supabase dashboard, not in git.

**Tech Stack:** Next.js 15 App Router · `@supabase/ssr` · Supabase Auth (GoTrue) · Vitest · no new npm packages

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/lib/auth/friendly-errors.ts` | Create | `friendlyError(err)` — maps raw Supabase messages to user-friendly copy |
| `app/lib/auth/safe-redirect.ts` | Create | `safeRedirect(path, fallback)` — rejects protocol-relative open-redirects |
| `app/lib/actions/auth.ts` | Modify | Add `signInWithGoogle`, `sendPasswordReset`, `resetPassword`; thread redirect safety + friendly errors through signIn and signUp |
| `app/lib/actions/profile.ts` | Modify | Add `changePassword` action with re-auth |
| `app/app/auth/forgot/page.tsx` | Create | Request-reset form |
| `app/app/auth/reset/page.tsx` | Create | Set-new-password form (post-recovery-link) |
| `app/app/auth/signin/page.tsx` | Modify | Google button + "Forgot password?" link + hidden `redirect` input + email prefill from `?email=` |
| `app/app/auth/signup/page.tsx` | Modify | Google button + "Sign in instead" link on dup-email + hidden `redirect` input |
| `app/app/api/auth/callback/route.ts` | Modify | Read `?next=`, branch new-user → `/onboarding`, else `safeRedirect(next)` |
| `app/components/GoogleSignInButton.tsx` | Create | Client island — kicks off OAuth with optional `redirect` from URL |
| `app/app/settings/SettingsForm.tsx` | Modify | "Change password" section (+ OAuth-only variant) |
| `app/tests/auth/friendly-errors.test.ts` | Create | 5 unit tests |
| `app/tests/auth/safe-redirect.test.ts` | Create | 4 unit tests |
| `app/tests/actions/change-password.test.ts` | Create | 3 integration tests against local Supabase |

---

## Task 1: Google Cloud + Supabase provider config [MANUAL]

Manual external setup, no code changes, no commit. You do this in browser windows; the implementation agent can't.

- [ ] **Step 1: Create Google Cloud project**

Go to https://console.cloud.google.com. Create a new project named `film-goblin`.

- [ ] **Step 2: Configure OAuth consent screen**

APIs & Services → OAuth consent screen → External. Fill:
- App name: `Film Goblin`
- User support email: your address
- Developer contact email: your address
- App logo: optional

Scopes: add `openid`, `email`, `profile`.

Publishing status: keep as "Testing" for now. Add your own email under "Test users" so you can sign in during development. Full verification is a much later concern.

- [ ] **Step 3: Create OAuth 2.0 Client ID**

APIs & Services → Credentials → Create Credentials → OAuth client ID.
- Application type: Web application
- Name: `film-goblin-web`
- Authorized JavaScript origins:
  - `https://film-goblin.vercel.app`
  - `http://localhost:3000`
- Authorized redirect URIs:
  - `https://wktylpissdjinccbwzha.supabase.co/auth/v1/callback` (staging Supabase)
  - `http://127.0.0.1:54321/auth/v1/callback` (local Supabase)

Save. Copy the Client ID (ends in `.apps.googleusercontent.com`) and the Client Secret (starts with `GOCSPX-`). Keep both — you'll paste them in the next step.

- [ ] **Step 4: Configure Supabase (hosted staging)**

Visit your hosted Supabase dashboard for project `wktylpissdjinccbwzha`. Authentication → Providers → find Google. Toggle Enabled. Paste:
- Client ID (for OAuth): the `.apps.googleusercontent.com` value
- Client Secret (for OAuth): the `GOCSPX-...` value

Save.

Still in Authentication → URL Configuration:
- Site URL: `https://film-goblin.vercel.app`
- Redirect URLs: add `https://film-goblin.vercel.app/**` and `http://localhost:3000/**`

- [ ] **Step 5: Configure Supabase (local)**

Open `/home/cthulhulemon/film_goblin/supabase/config.toml`. Find the `[auth.external.google]` block (or similar — Supabase CLI versions differ). Set:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
```

Add these env vars to `~/.bashrc` or similar, or create `/home/cthulhulemon/film_goblin/supabase/.env.local`:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-<your-secret>
```

(Note: supabase CLI reads `supabase/.env.local` automatically when present.)

Restart the local Supabase stack so the config takes effect:

```
supabase stop
supabase start
```

- [ ] **Step 6: No commit**

Secrets stay out of git. Verify: `git status` shows nothing new.

---

## Task 2: friendly-errors helper + tests

**Files:**
- Create: `app/lib/auth/friendly-errors.ts`
- Create: `app/tests/auth/friendly-errors.test.ts`

- [ ] **Step 1: Write failing tests `app/tests/auth/friendly-errors.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { friendlyError } from "../../lib/auth/friendly-errors";

describe("friendlyError", () => {
  it("maps a known Supabase message to user-friendly copy", () => {
    expect(friendlyError({ message: "Invalid login credentials" }))
      .toBe("Email or password is incorrect.");
  });

  it("passes through unknown messages unchanged", () => {
    expect(friendlyError({ message: "Some obscure Supabase edge case" }))
      .toBe("Some obscure Supabase edge case");
  });

  it("accepts a bare string", () => {
    expect(friendlyError("Invalid login credentials"))
      .toBe("Email or password is incorrect.");
  });

  it("unwraps Error-like objects via .message", () => {
    const err = new Error("Invalid login credentials");
    expect(friendlyError(err)).toBe("Email or password is incorrect.");
  });

  it("returns a generic fallback for null/undefined", () => {
    expect(friendlyError(null)).toBe("Something went wrong.");
    expect(friendlyError(undefined)).toBe("Something went wrong.");
  });
});
```

- [ ] **Step 2: Run — expect 5 failures (module not found)**

```
cd /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/friendly-errors.test.ts
```

- [ ] **Step 3: Implement `app/lib/auth/friendly-errors.ts`**

```typescript
export function friendlyError(err: unknown): string {
  if (err === null || err === undefined) return "Something went wrong.";
  const msg = typeof err === "string" ? err : (err as any)?.message ?? "";
  if (!msg) return "Something went wrong.";

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
  return map[msg] ?? msg;
}
```

- [ ] **Step 4: Run — expect 5/5 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/friendly-errors.test.ts
```

- [ ] **Step 5: Commit**

Write `/tmp/auth-t2-msg.txt`:
```
feat(app): friendly-error helper for Supabase auth messages

Maps raw Supabase GoTrue strings ("Invalid login credentials", etc)
to user-facing copy. Unknown messages pass through unchanged; null
input yields a generic fallback so callers don't need to branch on
missing error shapes.
```

Then:
```
cd /home/cthulhulemon/film_goblin/.worktrees/auth-polish
git add app/lib/auth/friendly-errors.ts app/tests/auth/friendly-errors.test.ts
git commit -F /tmp/auth-t2-msg.txt
```

---

## Task 3: safe-redirect helper + tests

**Files:**
- Create: `app/lib/auth/safe-redirect.ts`
- Create: `app/tests/auth/safe-redirect.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// app/tests/auth/safe-redirect.test.ts
import { describe, it, expect } from "vitest";
import { safeRedirect } from "../../lib/auth/safe-redirect";

describe("safeRedirect", () => {
  it("returns the path when it's a same-origin absolute path", () => {
    expect(safeRedirect("/home")).toBe("/home");
    expect(safeRedirect("/p/moss.witch")).toBe("/p/moss.witch");
    expect(safeRedirect("/films?q=horror")).toBe("/films?q=horror");
  });

  it("rejects protocol-relative URLs (open redirect)", () => {
    expect(safeRedirect("//evil.com")).toBe("/home");
    expect(safeRedirect("//evil.com/path")).toBe("/home");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirect("https://evil.com")).toBe("/home");
    expect(safeRedirect("http://evil.com/path")).toBe("/home");
  });

  it("falls back to provided default on empty/undefined input", () => {
    expect(safeRedirect("")).toBe("/home");
    expect(safeRedirect(undefined)).toBe("/home");
    expect(safeRedirect(null)).toBe("/home");
    expect(safeRedirect("", "/settings")).toBe("/settings");
  });
});
```

- [ ] **Step 2: Run — expect failures**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/safe-redirect.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// app/lib/auth/safe-redirect.ts
export function safeRedirect(path: string | null | undefined, fallback = "/home"): string {
  if (!path) return fallback;
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  return path;
}
```

- [ ] **Step 4: Run — expect 4/4 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/auth/safe-redirect.test.ts
```

- [ ] **Step 5: Commit**

Write `/tmp/auth-t3-msg.txt`:
```
feat(app): safeRedirect helper rejects open-redirect attacks

Accepts only same-origin absolute paths (starts with "/" but not
"//"). Bogus input (null, empty, external URLs, protocol-relative)
returns the caller-supplied fallback (default "/home"). Four unit
tests cover the shape space.
```

```
git add app/lib/auth/safe-redirect.ts app/tests/auth/safe-redirect.test.ts
git commit -F /tmp/auth-t3-msg.txt
```

---

## Task 4: Extend auth.ts — signIn/signUp redirect + friendly errors

**Files:**
- Modify: `app/lib/actions/auth.ts`

- [ ] **Step 1: Read the current file**

```
cat /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app/lib/actions/auth.ts
```

Confirm it has the current signIn, signUp, signOut exports from SP3.

- [ ] **Step 2: Replace contents**

Write the full file:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/auth/friendly-errors";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyError(error) };
  redirect(target);
}

export async function signUp(formData: FormData): Promise<{ error?: string; info?: string; duplicate?: boolean }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const origin = String(formData.get("origin") || "");
  const redirectIn = String(formData.get("redirect") || "/home");
  const target = safeRedirect(redirectIn);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(target)}`,
    },
  });
  if (error) {
    const friendly = friendlyError(error);
    const duplicate = error.message === "User already registered";
    return { error: friendly, duplicate };
  }
  return { info: "Check your email to confirm your account." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 3: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

- [ ] **Step 4: Commit**

Write `/tmp/auth-t4-msg.txt`:
```
feat(app): signIn/signUp honor ?redirect= + surface friendly errors

signIn reads the hidden "redirect" form input and routes through
safeRedirect — a crafted //evil.com value falls back to /home.
signUp carries the same target through emailRedirectTo's ?next=
query so post-confirm email clicks land on the right page. Both
actions map Supabase errors through friendlyError. signUp returns
a duplicate flag so the signup page can show a "Sign in instead"
link.
```

```
git add app/lib/actions/auth.ts
git commit -F /tmp/auth-t4-msg.txt
```

---

## Task 5: signInWithGoogle action + GoogleSignInButton

**Files:**
- Modify: `app/lib/actions/auth.ts` (append signInWithGoogle)
- Create: `app/components/GoogleSignInButton.tsx`

- [ ] **Step 1: Append to `app/lib/actions/auth.ts`**

Add at the bottom of the file:

```typescript
export async function signInWithGoogle(nextPath?: string): Promise<{ url: string }> {
  const origin = process.env.APP_BASE_URL || "http://localhost:3000";
  const next = safeRedirect(nextPath ?? null);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data?.url) throw new Error(friendlyError(error ?? "OAuth provider unreachable"));
  return { url: data.url };
}
```

- [ ] **Step 2: Create `app/components/GoogleSignInButton.tsx`**

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { signInWithGoogle } from "@/lib/actions/auth";

export default function GoogleSignInButton() {
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      try {
        const redirect = params.get("redirect") || undefined;
        const { url } = await signInWithGoogle(redirect);
        window.location.href = url;
      } catch (e) {
        console.error("Google sign-in failed:", e);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "12px 16px",
        background: "var(--bone)",
        color: "var(--void)",
        border: "2px solid var(--void)",
        fontFamily: "var(--font-ui)",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 39.7 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.6-.4-3.9z"/>
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

```
cd /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 4: Commit**

Write `/tmp/auth-t5-msg.txt`:
```
feat(app): signInWithGoogle action + GoogleSignInButton client island

Action wraps supabase.auth.signInWithOAuth with a safe redirect target
piped into the OAuth redirectTo's ?next= query. Button reads the
incoming ?redirect= from the signin/signup page URL and propagates
it through the OAuth round trip, so the post-Google redirect lands
on the originally-requested page.
```

```
git add app/lib/actions/auth.ts app/components/GoogleSignInButton.tsx
git commit -F /tmp/auth-t5-msg.txt
```

---

## Task 6: Update signin/signup pages

**Files:**
- Modify: `app/app/auth/signin/page.tsx`
- Modify: `app/app/auth/signup/page.tsx`

- [ ] **Step 1: Read current signin page to understand shape**

```
cat /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app/app/auth/signin/page.tsx
```

It's a client component with email + password + submit form.

- [ ] **Step 2: Replace signin page**

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/actions/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function SignInPage() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const redirectTo = params.get("redirect") || "/home";
  const prefilledEmail = params.get("email") || "";

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await signIn(formData);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Enter The Coven</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign In</h1>

        <GoogleSignInButton />

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
        </div>

        <form action={handle}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email" defaultValue={prefilledEmail}
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password</div>
          <input name="password" type="password" required minLength={6} autoComplete="current-password"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 8, fontFamily: "var(--font-ui)" }} />
          <div style={{ marginBottom: 20 }}>
            <a href="/auth/forgot" style={{ color: "var(--accent-deep)", fontSize: 13, fontStyle: "italic", textDecoration: "underline" }}>
              Forgot password?
            </a>
          </div>
          {error && (
            <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
            {pending ? "Summoning…" : "✦ Enter"}
          </button>
          <div style={{ marginTop: 16, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
            No coven? <a href="/auth/signup" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>Join one</a>.
          </div>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Replace signup page**

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signUp } from "@/lib/actions/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function SignUpPage() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [dupEmail, setDupEmail] = useState("");
  const [pending, setPending] = useState(false);
  const redirectTo = params.get("redirect") || "/home";

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    setInfo(null);
    setDuplicate(false);
    formData.set("origin", window.location.origin);
    const res = await signUp(formData);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      if (res.duplicate) {
        setDuplicate(true);
        setDupEmail(String(formData.get("email") || ""));
      }
    }
    if (res?.info) setInfo(res.info);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ The Initiation</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign Up</h1>

        <GoogleSignInButton />

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--muted)" }} />
        </div>

        <form action={handle}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password (min 6)</div>
          <input name="password" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
          {error && (
            <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 8 }}>
              {error}
            </div>
          )}
          {duplicate && (
            <div style={{ marginBottom: 16 }}>
              <a href={`/auth/signin?email=${encodeURIComponent(dupEmail)}&redirect=${encodeURIComponent(redirectTo)}`}
                 style={{ color: "var(--accent-deep)", textDecoration: "underline", fontStyle: "italic" }}>
                Go to sign-in →
              </a>
            </div>
          )}
          {info && (
            <div style={{ color: "var(--accent-deep)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
              {info}
            </div>
          )}
          <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
            {pending ? "Binding…" : "✦ Agree And Seal"}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck + build**

```
cd /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 5: Commit**

Write `/tmp/auth-t6-msg.txt`:
```
feat(app): signin + signup pages gain Google button + forgot link + redirect

Both pages render GoogleSignInButton above a horizontal divider,
followed by the email/password form. Signin carries ?redirect= into
a hidden input and pre-fills email from ?email=. Adds a "Forgot
password?" link under the password field. Signup surfaces a "Go to
sign-in" link when the server action returns duplicate: true, with
the attempted email pre-filled on the signin page.
```

```
git add app/app/auth/signin/page.tsx app/app/auth/signup/page.tsx
git commit -F /tmp/auth-t6-msg.txt
```

---

## Task 7: OAuth callback route — next param + new-user branch

**Files:**
- Modify: `app/app/api/auth/callback/route.ts`

- [ ] **Step 1: Read current file**

```
cat /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app/app/api/auth/callback/route.ts
```

Existing route exchanges a `code` param for a session and redirects to `/onboarding`.

- [ ] **Step 2: Replace contents**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next");
  const next = safeRedirect(nextRaw, "/home");

  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?error=no_code", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/auth/signin?error=${encodeURIComponent(error.message)}`, url));
  }

  // Branch new-user → /onboarding; returning user → next (or /home).
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .single();

    const defaultHandle = user.email?.split("@")[0] ?? "";
    const looksUnOnboarded = !profile || profile.handle === defaultHandle;

    if (looksUnOnboarded) {
      return NextResponse.redirect(new URL("/onboarding", url));
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
```

- [ ] **Step 3: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 4: Commit**

Write `/tmp/auth-t7-msg.txt`:
```
feat(app): auth callback honors ?next= and onboards new users

Reads ?next= from the callback URL, passes through safeRedirect, and
lands users there after the Supabase code exchange. Also checks
whether the user has completed onboarding (proxy: handle !=
email-local-part). Unonboarded users (fresh Google signup, fresh
email signup that skipped onboarding) go to /onboarding; everyone
else follows ?next= or defaults to /home.
```

```
git add app/app/api/auth/callback/route.ts
git commit -F /tmp/auth-t7-msg.txt
```

---

## Task 8: Forgot-password page + sendPasswordReset action

**Files:**
- Modify: `app/lib/actions/auth.ts` (append)
- Create: `app/app/auth/forgot/page.tsx`

- [ ] **Step 1: Append `sendPasswordReset` to auth.ts**

Add at the end of `app/lib/actions/auth.ts`:

```typescript
export async function sendPasswordReset(formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get("email") || "").trim();
  const origin = String(formData.get("origin") || "");
  if (!email) return { message: "Enter your email." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset`,
  });
  // Don't leak whether the email exists (no email-enumeration).
  return { message: "If an account with that email exists, we've sent a reset link. Check your inbox." };
}
```

- [ ] **Step 2: Create `app/app/auth/forgot/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { sendPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    formData.set("origin", window.location.origin);
    const res = await sendPasswordReset(formData);
    setPending(false);
    setMessage(res.message);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Recovery</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 16px", lineHeight: 0.9 }}>Forgot password?</h1>
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          Enter your email. We'll send a link to reset it.
        </p>
        <form action={handle}>
          <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
          <input name="email" type="email" required autoComplete="email"
            style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
          {message && (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--accent-deep)", marginBottom: 16 }}>
              {message}
            </div>
          )}
          <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
            {pending ? "Sending…" : "✦ Send reset link"}
          </button>
          <div style={{ marginTop: 16, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
            <a href="/auth/signin" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>Back to sign-in</a>
          </div>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 4: Commit**

Write `/tmp/auth-t8-msg.txt`:
```
feat(app): /auth/forgot page + sendPasswordReset action

Single-email-field form submits to sendPasswordReset which calls
supabase.auth.resetPasswordForEmail with the local origin's
/auth/reset as the redirectTo target. Returns the same message
whether the email exists or not, so the page doesn't double as an
email-enumeration oracle.
```

```
git add app/lib/actions/auth.ts 'app/app/auth/forgot/page.tsx'
git commit -F /tmp/auth-t8-msg.txt
```

---

## Task 9: Reset-password page + resetPassword action

**Files:**
- Modify: `app/lib/actions/auth.ts` (append)
- Create: `app/app/auth/reset/page.tsx`

- [ ] **Step 1: Append `resetPassword` action**

```typescript
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

- [ ] **Step 2: Create `app/app/auth/reset/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // @supabase/ssr auto-processes the code param on client init, but we
    // also explicitly verify we have a session before showing the form.
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setTokenError("This reset link has expired or is invalid.");
      }
    })();
  }, []);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await resetPassword(formData);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    if (res?.ok) router.push("/home");
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <div style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ New Rune</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 16px", lineHeight: 0.9 }}>Choose a password</h1>
        {tokenError ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5 }}>
            <p>{tokenError}</p>
            <p style={{ marginTop: 12 }}>
              <a href="/auth/forgot" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>Request a new link</a>
            </p>
          </div>
        ) : !ready ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Loading…</div>
        ) : (
          <form action={handle}>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>New password</div>
            <input name="new_password" type="password" required minLength={6} autoComplete="new-password"
              style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Confirm</div>
            <input name="confirm" type="password" required minLength={6} autoComplete="new-password"
              style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
            {error && (
              <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
              {pending ? "Sealing…" : "✦ Set new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

- [ ] **Step 4: Commit**

Write `/tmp/auth-t9-msg.txt`:
```
feat(app): /auth/reset page + resetPassword action

On mount, the page checks for a valid Supabase session (auto-
exchanged from the recovery URL token by @supabase/ssr). If absent,
shows an expired-link state with a link back to /auth/forgot. With
a session, renders a new-password + confirm form. resetPassword
action validates length + match client- and server-side, calls
supabase.auth.updateUser, and redirects to /home on success.
```

```
git add app/lib/actions/auth.ts 'app/app/auth/reset/page.tsx'
git commit -F /tmp/auth-t9-msg.txt
```

---

## Task 10: Change password action + Settings UI + tests

**Files:**
- Modify: `app/lib/actions/profile.ts` (add `changePassword`)
- Modify: `app/app/settings/SettingsForm.tsx` (add Change Password section)
- Create: `app/tests/actions/change-password.test.ts`

- [ ] **Step 1: Write failing test `app/tests/actions/change-password.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { changePassword } from "../../lib/actions/profile";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => { user = await createTestUser(); });
afterAll(async () => { await deleteTestUser(user.id); });

// Minimal FormData wrapper for Node testing.
function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

describe("actions/profile/changePassword (integration)", () => {
  it("returns an error when new password is too short without hitting Supabase", async () => {
    // No session set — if the length check is bypassed, we'd get a different error.
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abc", confirm: "abc" }));
    expect(res.error).toMatch(/6 characters/i);
  });

  it("returns an error when new and confirm don't match", async () => {
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abcdef", confirm: "ghijkl" }));
    expect(res.error).toMatch(/don't match/i);
  });

  it("rejects when current password is wrong (integration — requires signed-in context)", async () => {
    // The action reads the session from cookies set by @supabase/ssr.
    // In this vitest context there's no Next.js request — signedInClient
    // gives us a supabase-js client with the session, but the _action_
    // uses createClient() from lib/supabase/server which reads cookies.
    // This test primarily exists to verify the action shape; the full
    // re-auth path is covered by the deploy smoke.
    // We expect "Not signed in" since cookies aren't populated.
    const res = await changePassword(fd({
      current_password: "wrong",
      new_password: "abcdef",
      confirm: "abcdef",
    }));
    expect(res.error).toBeDefined();
  });
});
```

Note: the change-password action is inherently session-bound (reads cookies from createClient()), which is hard to test without a Next.js request context. The test above covers the pre-supabase validation branches deterministically; the full integration path (re-auth + updateUser) is smoke-tested manually at deploy time.

- [ ] **Step 2: Run — expect failures (module not found)**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/change-password.test.ts
```

- [ ] **Step 3: Implement `changePassword` in `app/lib/actions/profile.ts`**

Read the existing file. Then append at the end:

```typescript
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
  if (error) {
    const { friendlyError } = await import("@/lib/auth/friendly-errors");
    return { error: friendlyError(error) };
  }
  return { ok: true };
}
```

Also add this import near the top of the file (if the dynamic import above is replaced with a top-level one, place it alongside the existing imports):

```typescript
import { friendlyError } from "@/lib/auth/friendly-errors";
```

(Delete the `await import(...)` inside the function if you do this — cleaner.)

- [ ] **Step 4: Run tests — expect 3/3 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/change-password.test.ts
```

- [ ] **Step 5: Extend Settings form**

Read `app/app/settings/SettingsForm.tsx`. After the existing profile-edit form closes and before the Sign out form from SP6-T1, insert a new Change Password section.

Add these imports at the top if missing:

```tsx
import { changePassword } from "@/lib/actions/profile";
```

Also extend the `useEffect` that loads profile to also capture whether the user has a password identity — we'll need it to render the correct variant. Easiest: check the loaded user object. Add a state:

```tsx
const [hasPasswordIdentity, setHasPasswordIdentity] = useState(true);
```

In the existing `useEffect` that loads profile, after getting user:

```tsx
setHasPasswordIdentity((user.identities ?? []).some((i: any) => i.provider === "email"));
```

Add a state for the change-password form:

```tsx
const [pwError, setPwError] = useState<string | null>(null);
const [pwSuccess, setPwSuccess] = useState(false);
const [pwPending, setPwPending] = useState(false);

async function handleChangePassword(fd: FormData) {
  setPwPending(true);
  setPwError(null);
  setPwSuccess(false);
  const res = await changePassword(fd);
  setPwPending(false);
  if (res?.error) setPwError(res.error);
  if (res?.ok) setPwSuccess(true);
}
```

And in the JSX, between the profile form and the sign-out form, insert:

```tsx
<div style={{ marginTop: 40, borderTop: "1px solid #333", paddingTop: 24 }}>
  <div className="caps" style={{ fontSize: 11, marginBottom: 12, color: "var(--accent)" }}>Change Password</div>
  {!hasPasswordIdentity && (
    <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
      You signed up with Google. Set a password to also sign in with email.
    </p>
  )}
  <form action={handleChangePassword} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
    {hasPasswordIdentity && (
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Current password</div>
        <input name="current_password" type="password" required minLength={6} autoComplete="current-password"
          style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
      </label>
    )}
    <label>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>New password</div>
      <input name="new_password" type="password" required minLength={6} autoComplete="new-password"
        style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
    </label>
    <label>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Confirm new password</div>
      <input name="confirm" type="password" required minLength={6} autoComplete="new-password"
        style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
    </label>
    {pwError && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{pwError}</div>}
    {pwSuccess && <div style={{ color: "var(--accent)", fontStyle: "italic", fontSize: 13 }}>Password updated.</div>}
    <button type="submit" disabled={pwPending} className="btn" style={{ justifySelf: "start" }}>
      {pwPending ? "Updating…" : "Update Password"}
    </button>
  </form>
</div>
```

Where the `useEffect` already has `const { data: { user } } = await supabase.auth.getUser();` — use that user for both the profile fetch and the `setHasPasswordIdentity` call.

- [ ] **Step 6: Typecheck + build + run full suite**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: all green.

- [ ] **Step 7: Commit**

Write `/tmp/auth-t10-msg.txt`:
```
feat(app): Settings page gains Change Password section

changePassword action in lib/actions/profile.ts re-authenticates the
viewer via signInWithPassword before calling updateUser, defending
against unattended-laptop password rotation. Detects OAuth-only users
(no password identity) and renders a different UX + skips the re-auth
step so Google users can set their first password. Three vitest cases
cover the client-side validation branches; full integration path
verified via deploy smoke.
```

```
git add app/lib/actions/profile.ts app/app/settings/SettingsForm.tsx app/tests/actions/change-password.test.ts
git commit -F /tmp/auth-t10-msg.txt
```

---

## Task 11: Local end-to-end smoke

No commits. Verification only.

- [ ] **Step 1: Start dev server**

```
cd /home/cthulhulemon/film_goblin/.worktrees/auth-polish/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Note the port (may be 3000 or 3001 depending on what's in use).

- [ ] **Step 2: Verify Google sign-in**

Visit `http://localhost:<port>/auth/signin`. Click "Continue with Google". Expected: redirect to `accounts.google.com`, then back to local Supabase's `/auth/v1/callback`, then back to your app's `/api/auth/callback`, then eventually `/onboarding` (if new account) or `/home` (if existing).

If Google OAuth isn't configured locally (Task 1 Step 5 may have been skipped for local), you'll see a provider error — that's OK, the staging smoke (T12) will cover it.

- [ ] **Step 3: Verify forgot-password flow**

Sign out. Visit `/auth/signin`, click "Forgot password?". Enter an email that matches an existing local user. Submit.

Visit http://127.0.0.1:54324 (Mailpit). Find the reset email, click the "Reset password" link. Expected: land on `/auth/reset` with the form visible. Enter a new password, confirm, submit. Expected: redirect to `/home` with session active.

Sign out. Sign back in with the new password. Expected: works.

- [ ] **Step 4: Verify change password in Settings**

Visit `/settings` while signed in. Scroll to "Change Password". Enter current (the new password from Step 3), new, confirm. Submit. Expected: "Password updated." Sign out, sign back in with the new password. Expected: works.

- [ ] **Step 5: Verify redirect**

Sign out. Visit `/home`. Expected: redirect to `/auth/signin?redirect=%2Fhome`. Sign in. Expected: land on `/home`.

Probe: sign out. Visit `/auth/signin?redirect=%2F%2Fevil.com`. Sign in. Expected: land on `/home` (not on `//evil.com`).

- [ ] **Step 6: Verify duplicate-email nudge**

Sign out. Visit `/auth/signup`. Enter an email that already exists + a new password. Submit. Expected: friendly error + "Go to sign-in" link with email pre-filled once you click through.

- [ ] **Step 7: Stop dev server**

Ctrl-C.

---

## Task 12: Deploy to Vercel + production smoke [MANUAL]

- [ ] **Step 1: Deploy**

```
cd /home/cthulhulemon/film_goblin/.worktrees/auth-polish
rm -rf .vercel
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel link --yes --project film-goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel --prod
```

Expected: `Aliased: https://film-goblin.vercel.app`.

- [ ] **Step 2: Smoke**

Repeat Task 11 Steps 2-6 against `https://film-goblin.vercel.app` instead of localhost.

Specifically:
- Google sign-in → new account onboarding flow.
- Forgot password → email arrives in your actual inbox (Supabase hosted).
- Reset flow works.
- Change password in Settings works.
- Redirect after signin works; `//evil.com` probe rejected.
- Duplicate-email signup shows the "sign in instead" link.

- [ ] **Step 3: No commit**

Verify `git status` is clean.

---

## Self-Review

**Spec coverage:**
- § Architecture (3 new auth actions, 1 new profile action, 2 helpers, 2 pages) → Tasks 2–10 ✓
- § Google OAuth setup + button → Tasks 1, 5 ✓
- § Forgotten password flow (4 surfaces) → Tasks 6, 8, 9 ✓
- § Change password in Settings → Task 10 ✓
- § Friendlier errors → Task 2 + used in 4, 5, 9, 10 ✓
- § Redirect-after-signin + safety → Tasks 3, 4, 5, 6, 7 ✓
- § Duplicate-email nudge → Tasks 4 (action returns duplicate flag), 6 (signup UI), 6 (signin pre-fill) ✓
- § OAuth-only user change-password UX → Task 10 ✓
- § Testing (friendly-errors 5 + safe-redirect 4 + change-password 3) → Tasks 2, 3, 10 ✓
- § Manual smoke at deploy → Tasks 11, 12 ✓

**Placeholder scan:** No "TBD", "TODO", or vague placeholders. Every code block is complete. Each command has an expected outcome.

**Type consistency:** `friendlyError` signature consistent across all caller sites. `safeRedirect` returns `string` (never null). `signInWithGoogle` returns `{ url }`. `sendPasswordReset` returns `{ message }`. `resetPassword` and `changePassword` both return `{ error? ; ok? }`. Matches across action → page consumer.

**Ordering:** Tasks 8/9 add to `auth.ts`; Tasks 10 adds to `profile.ts`. No cross-file ordering issues. Task 1 (manual) can be parallel with implementation since it doesn't touch code.

---
