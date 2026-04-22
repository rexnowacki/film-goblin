# Next.js App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Next.js 15 App Router application at `app/` that ports 7 of the prototype's routes against real Supabase data with email+password auth, deployed to Vercel against a hosted-staging Supabase project. Ends when a fresh browser can sign up → onboard → add to watchlist → reload and see it persisted, at the production URL.

**Architecture:** New `app/` package parallel to `worker/` and `db/`. Next.js 15 App Router with hybrid Server Components (SEO-critical routes) + Client Components (interactive surfaces). Supabase Auth for identity, `@supabase/ssr` for cookie-based session management, RLS as the sole authorization layer. Styling is `src/styles.css` copied verbatim — no Tailwind. Local dev uses Supabase CLI's Docker-compose stack; a separate hosted-staging project is the Vercel target.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · `@supabase/ssr` + `@supabase/supabase-js` · Supabase CLI · Vitest · tsx

**Note on a spec deviation:** The spec described action tests using testcontainers (`db/tests/helpers/testcontainers.ts`). That approach is incompatible with `supabase-js`, which routes all queries through PostgREST (not raw `pg`). This plan uses the local Supabase stack (`supabase start`) as the test fixture — real auth, real RLS, real PostgREST. Tests wrap each action in an impl function that accepts a pre-authenticated Supabase client so the tests don't need to mock Next.js's `next/headers` cookie API.

---

## File Structure

```
app/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── next-env.d.ts                      # Next.js-managed, auto-created
├── .env.local.example
├── .env.local                         # gitignored; filled manually
├── .gitignore
├── middleware.ts                      # Supabase session refresh + route guards
├── README.md
├── app/
│   ├── layout.tsx                     # root layout, imports globals.css, Google Fonts
│   ├── globals.css                    # verbatim copy of src/styles.css
│   ├── page.tsx                       # / = Landing (server, redirects to /home if authed)
│   ├── onboarding/page.tsx            # 5-chapter ritual (client)
│   ├── home/page.tsx                  # authed feed (server + client islands)
│   ├── film/[id]/page.tsx             # film detail (server, SEO)
│   ├── films/page.tsx                 # archive + search (server + client search island)
│   ├── lists/page.tsx                 # grimoires browse + subscribe
│   ├── settings/page.tsx              # profile + oath (client; other tabs "coming soon")
│   ├── auth/
│   │   ├── signin/page.tsx            # email+password sign in (client)
│   │   └── signup/page.tsx            # email+password sign up (client)
│   └── api/auth/callback/route.ts     # exchanges email-confirm code → session
├── components/
│   ├── FilmPoster.tsx
│   ├── PriceDrop.tsx
│   ├── Stars.tsx
│   ├── Avatar.tsx
│   ├── HalftoneBar.tsx
│   ├── TopNav.tsx                     # auth-aware
│   ├── WatchlistButton.tsx            # client island
│   ├── RecommendModal.tsx             # client island
│   ├── SubscribeButton.tsx            # client island
│   └── FeedTabs.tsx                   # client island (home page)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                  # createServerClient() for RSC/Server Actions
│   │   ├── client.ts                  # createBrowserClient() for client islands
│   │   └── types.ts                   # generated: `supabase gen types typescript --local`
│   ├── queries/
│   │   ├── films.ts
│   │   ├── watchlists.ts
│   │   ├── lists.ts
│   │   ├── profiles.ts
│   │   ├── activity.ts
│   │   └── reviews.ts
│   └── actions/
│       ├── auth.ts
│       ├── watchlists.ts
│       ├── lists.ts
│       ├── onboarding.ts
│       ├── profile.ts
│       └── recommendations.ts
└── tests/
    ├── helpers/
    │   ├── supabase.ts                # createAuthedClient(email, password) helper
    │   └── users.ts                   # createTestUser / deleteTestUser via admin client
    ├── actions/
    │   ├── auth.test.ts
    │   ├── watchlists.test.ts
    │   ├── lists.test.ts
    │   ├── onboarding.test.ts
    │   ├── profile.test.ts
    │   └── recommendations.test.ts
    └── middleware.test.ts

supabase/                              # Supabase CLI artifacts (repo root)
└── config.toml                        # created by `supabase init`

.github/workflows/
└── ci.yml                             # typecheck + build + tests across all packages
```

---

## Task 1: Scaffold the app/ package

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/next.config.mjs`
- Create: `app/.env.local.example`
- Create: `app/.gitignore`
- Create: `app/app/layout.tsx`
- Create: `app/app/globals.css` (copy of `src/styles.css`)
- Create: `app/app/page.tsx` (placeholder: `<h1>Film Goblin</h1>`)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "film-goblin-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "gen:types": "supabase gen types typescript --local > lib/supabase/types.ts"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.46.1",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.17.10",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "dotenv": "^16.4.7"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 4: Write .env.local.example and .gitignore**

`app/.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase start` output>

# Test-only (set by CI; ignored by Next.js runtime):
TEST_SUPABASE_SERVICE_ROLE_KEY=<from `supabase start` output>
```

`app/.gitignore`:
```
node_modules
.next
out
.env.local
.env*.local
coverage
next-env.d.ts
```

- [ ] **Step 5: Copy styles.css to globals.css**

Run:
```
cp src/styles.css app/app/globals.css
```

- [ ] **Step 6: Write root layout**

`app/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Film Goblin — A Field Guide To Cheap Movies",
  description: "Hunt price drops on Apple TV movies. Join the coven.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik+Wet+Paint&family=Rubik+Glitch&family=Bungee&family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Sans:wght@400;500;700;900&family=IBM+Plex+Serif:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write placeholder page**

`app/app/page.tsx`:
```tsx
export default function LandingPage() {
  return (
    <main className="container-wide" style={{ padding: 48 }}>
      <h1 className="display" style={{ fontSize: 120 }}>Film Goblin</h1>
      <p className="head">Scaffold running.</p>
    </main>
  );
}
```

- [ ] **Step 8: Install and verify build**

Run from `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install && npm run build
```
Expected: build completes, `.next/` directory created, no errors.

- [ ] **Step 9: Commit**

```
git add app/package.json app/tsconfig.json app/next.config.mjs app/.env.local.example app/.gitignore app/app/layout.tsx app/app/globals.css app/app/page.tsx app/package-lock.json
git commit -m "chore(app): scaffold Next.js 15 package with styles.css verbatim"
```

---

## Task 2: Supabase CLI local stack + migrations

**Files:**
- Create: `supabase/config.toml` (generated by `supabase init`)
- Create/modify: `app/.env.local`

- [ ] **Step 1: Install Supabase CLI**

Follow Supabase's official install docs: https://supabase.com/docs/guides/local-development/cli/getting-started

Common paths:
- macOS: `brew install supabase/tap/supabase`
- Linux (no Homebrew): download the latest release binary from https://github.com/supabase/cli/releases and drop it on PATH.
- Cross-platform: `npm i -g supabase` (works but slower than native binary).

Verify: `supabase --version` prints a version.

- [ ] **Step 2: Initialize Supabase project**

From repo root:
```
supabase init
```
Expected: creates `supabase/config.toml`. The default config.toml is fine for MVP.

- [ ] **Step 3: Start the local stack**

```
supabase start
```
Expected: Docker pulls ~6 images (one-time, ~2 min). Prints API URL (http://127.0.0.1:54321), Studio URL (http://127.0.0.1:54323), anon key, service_role key, DB URL.

Note the **anon key** and **service_role key** from the output — you'll paste them into `.env.local` next.

- [ ] **Step 4: Apply worker + db migrations against the local stack**

Grab the local DB URL from `supabase start` output (looks like `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

```
cd worker
echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres" > .env
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate

cd ../db
echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres" > .env
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Expected: worker applies 0001–0003, db applies 0100–0113.

- [ ] **Step 5: Write app/.env.local**

Paste the actual values from `supabase start` output. Example:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...long-string...
TEST_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...long-string...
```

`.env.local` is gitignored; only `.env.local.example` gets committed.

- [ ] **Step 6: Verify Next.js app can load env vars**

```
cd app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Visit http://localhost:3000 — placeholder landing should render. Stop the dev server (Ctrl+C).

- [ ] **Step 7: Commit**

```
git add supabase/config.toml
git commit -m "chore: supabase CLI init for local dev stack"
```

Note: `supabase/.branches/`, `supabase/.temp/`, and similar are gitignored by Supabase's default `supabase/.gitignore` (auto-created).

---

## Task 3: Hosted staging Supabase project + migrations applied

**This is a manual task.** The engineer does it via the Supabase web dashboard and CLI. The plan documents the required steps.

**Files:** none committed in this task (credentials stay out of git).

- [ ] **Step 1: Create the hosted project**

Go to https://supabase.com/dashboard/new. Create a new project:
- Name: `film-goblin-staging`
- Region: closest to you
- Database password: generate a strong one; save in a password manager

Wait ~2 min for provisioning.

- [ ] **Step 2: Grab the connection string**

Project Settings → Database → Connection string → URI. Copy the `postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres` URL.

- [ ] **Step 3: Apply worker + db migrations against staging**

```
cd worker && DATABASE_URL="<staging-uri>" PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
cd ../db && DATABASE_URL="<staging-uri>" PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Expected: all 17 migrations apply cleanly (worker 0001-0003, db 0100-0113).

- [ ] **Step 4: Capture staging URL + anon key**

Project Settings → API:
- Project URL: `https://<ref>.supabase.co`
- `anon` public key
- `service_role` key (keep private; password manager only)

Save URL + anon key for use in Vercel env vars (Task 19).

- [ ] **Step 5: Add Site URLs for auth redirects**

Project Settings → Authentication → URL Configuration:
- Site URL: `http://localhost:3000` (for now; Vercel URL added in Task 19)
- Additional redirect URLs: `http://localhost:3000/api/auth/callback`

No commit. This is ops-only.

---

## Task 4: Supabase client wiring (server + browser)

**Files:**
- Create: `app/lib/supabase/server.ts`
- Create: `app/lib/supabase/client.ts`
- Create: `app/lib/supabase/types.ts` (generated)

- [ ] **Step 1: Write server.ts**

`app/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot set cookies; middleware handles session refresh.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 2: Write client.ts**

`app/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Generate types.ts**

From `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run gen:types
```

Expected: `app/lib/supabase/types.ts` now contains `Database` type with all tables/columns/enums from the local Supabase DB. File is several hundred lines of generated TS.

- [ ] **Step 4: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```
git add app/lib/supabase/server.ts app/lib/supabase/client.ts app/lib/supabase/types.ts
git commit -m "feat(app): supabase server + browser clients with generated types"
```

---

## Task 5: Middleware with session refresh + route guards

**Files:**
- Create: `app/middleware.ts`
- Create: `app/tests/middleware.test.ts`
- Create: `app/vitest.config.ts`

- [ ] **Step 1: Write vitest.config.ts**

`app/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 2: Write middleware.ts**

`app/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/films",
  "/lists",
  "/auth/signin",
  "/auth/signup",
  "/api/auth/callback",
];
const AUTH_PAGES = ["/auth/signin", "/auth/signup"];
const AUTH_REQUIRED = ["/home", "/onboarding", "/settings"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Auth-required routes: redirect to signin
  if (!user && AUTH_REQUIRED.some(p => path.startsWith(p))) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/auth/signin";
    redirect.searchParams.set("redirect", path);
    return NextResponse.redirect(redirect);
  }

  // Landing: redirect authed users to /home
  if (user && path === "/") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/home";
    return NextResponse.redirect(redirect);
  }

  // Auth pages: redirect authed users to /home
  if (user && AUTH_PAGES.includes(path)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/home";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 3: Write the middleware test**

Middleware is pure redirect logic given a `NextRequest` and a Supabase user. We test by importing the redirect-decision helper directly. Refactor: extract the decision logic into a separate function.

Add this to `app/middleware.ts` (above the `middleware` function, export it):

```typescript
export function decideRedirect(
  user: { id: string } | null,
  path: string
): { target: string; preserveRedirect: boolean } | null {
  if (!user && AUTH_REQUIRED.some(p => path.startsWith(p))) {
    return { target: "/auth/signin", preserveRedirect: true };
  }
  if (user && path === "/") {
    return { target: "/home", preserveRedirect: false };
  }
  if (user && AUTH_PAGES.includes(path)) {
    return { target: "/home", preserveRedirect: false };
  }
  return null;
}
```

Update the `middleware` function to call `decideRedirect` instead of duplicating the logic (optional refactor; the test is what matters).

`app/tests/middleware.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { decideRedirect } from "../middleware";

describe("middleware decideRedirect", () => {
  it("unauth visit to /home redirects to /auth/signin with preserved path", () => {
    const r = decideRedirect(null, "/home");
    expect(r).toEqual({ target: "/auth/signin", preserveRedirect: true });
  });

  it("unauth visit to /settings redirects to /auth/signin", () => {
    const r = decideRedirect(null, "/settings");
    expect(r?.target).toBe("/auth/signin");
  });

  it("authed visit to / redirects to /home", () => {
    const r = decideRedirect({ id: "u1" }, "/");
    expect(r).toEqual({ target: "/home", preserveRedirect: false });
  });

  it("authed visit to /auth/signin redirects to /home", () => {
    const r = decideRedirect({ id: "u1" }, "/auth/signin");
    expect(r?.target).toBe("/home");
  });

  it("unauth visit to /films is allowed (public route)", () => {
    expect(decideRedirect(null, "/films")).toBeNull();
  });

  it("authed visit to /home is allowed", () => {
    expect(decideRedirect({ id: "u1" }, "/home")).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```
git add app/middleware.ts app/tests/middleware.test.ts app/vitest.config.ts
git commit -m "feat(app): middleware with session refresh and route guards"
```

---

## Task 6: Port visual-primitive components to TSX

**Files:**
- Create: `app/components/FilmPoster.tsx`
- Create: `app/components/PriceDrop.tsx`
- Create: `app/components/Stars.tsx`
- Create: `app/components/Avatar.tsx`
- Create: `app/components/HalftoneBar.tsx`

- [ ] **Step 1: Copy each component from src/components/*.jsx**

For each file: read `src/components/<Name>.jsx`, copy to `app/components/<Name>.tsx`, add TypeScript prop types.

Example — `app/components/Avatar.tsx`:
```tsx
interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
}

export default function Avatar({ name, color, size = 28 }: AvatarProps) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = color || ["#ff2d88", "#f5d300", "#d93a2e", "#3a5f3a", "#7a4e9e", "#ff6a1f"][name.length % 6];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size,
      background: hue,
      color: "var(--void)",
      fontFamily: "var(--font-ui)",
      fontWeight: 900,
      fontSize: size * 0.42,
      letterSpacing: "0.04em",
      border: "2px solid var(--void)",
      borderRadius: "50%",
      flexShrink: 0,
    }}>
      {initials}
    </span>
  );
}
```

Apply the same pattern to `FilmPoster.tsx` (interface `FilmPosterProps` with `film: Film`, `size?: "xs"|"sm"|"md"|"lg"|"xl"`, `className?: string`, `style?: React.CSSProperties`), `PriceDrop.tsx`, `Stars.tsx`, `HalftoneBar.tsx`.

For `FilmPoster`, the `Film` type: define it inline or import from a shared place. For MVP, define it in `app/components/FilmPoster.tsx`:

```tsx
export interface Film {
  id: string;
  title: string;
  director: string;
  year: number;
  bg?: string;
  fg?: string;
  accent?: string;
  shape?: "triangle" | "circle" | "bars" | "eye" | "cross" | "skull";
  titleFont?: "display" | "head";
  case?: "upper" | "lower";
  titleBg?: string;
  halftoneOpacity?: number;
}
```

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```
git add app/components/FilmPoster.tsx app/components/PriceDrop.tsx app/components/Stars.tsx app/components/Avatar.tsx app/components/HalftoneBar.tsx
git commit -m "feat(app): port visual primitive components to TSX"
```

---

## Task 7: Auth-aware TopNav

**Files:**
- Create: `app/components/TopNav.tsx`

- [ ] **Step 1: Write TopNav.tsx**

TopNav is a server component that reads the user session and renders either the signed-in nav or the signed-out nav.

`app/components/TopNav.tsx`:
```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Avatar from "./Avatar";

interface TopNavProps {
  current?: string;
}

export default async function TopNav({ current }: TopNavProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const items = user
    ? [
        { id: "home", label: "Home", href: "/home" },
        { id: "films", label: "Films", href: "/films" },
        { id: "lists", label: "Lists", href: "/lists" },
        { id: "settings", label: "Settings", href: "/settings" },
      ]
    : [
        { id: "films", label: "Films", href: "/films" },
        { id: "lists", label: "Lists", href: "/lists" },
      ];

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link href={user ? "/home" : "/"} style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, color: "var(--bone)", textDecoration: "none" }}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </Link>
          <nav style={{ display: "flex", gap: 22 }}>
            {items.map(it => (
              <Link key={it.id} href={it.href} className="caps" style={{
                fontSize: 11,
                color: current === it.id ? "var(--accent)" : "var(--bone)",
                borderBottom: current === it.id ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: 4,
                textDecoration: "none",
              }}>{it.label}</Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {user ? (
            <Link href="/settings" style={{ cursor: "pointer" }}>
              <Avatar name={user.email ?? "You Goblin"} color="var(--accent)" size={34} />
            </Link>
          ) : (
            <Link href="/auth/signin" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```
git add app/components/TopNav.tsx
git commit -m "feat(app): auth-aware TopNav server component"
```

---

## Task 8: Query modules for films and lists + Landing page

**Files:**
- Create: `app/lib/queries/films.ts`
- Create: `app/lib/queries/lists.ts`
- Modify: `app/app/page.tsx` (replace placeholder with full landing)

- [ ] **Step 1: Write queries/films.ts**

`app/lib/queries/films.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getLandingMarquee(client: Client) {
  const { data, error } = await client
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, itunes_url")
    .eq("tracking", true)
    .eq("available", true)
    .order("last_priced_at", { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function getFilm(client: Client, id: string) {
  const { data, error } = await client
    .from("films")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getFilms(client: Client, opts: { q?: string; limit?: number } = {}) {
  let query = client
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, artwork_url")
    .eq("tracking", true)
    .eq("available", true)
    .order("year", { ascending: false })
    .limit(opts.limit ?? 60);
  if (opts.q && opts.q.trim()) {
    query = query.or(`title.ilike.%${opts.q}%,director.ilike.%${opts.q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getLatestPriceHistory(client: Client, filmId: string, days = 180) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await client
    .from("price_history")
    .select("price_usd, hd_price_usd, is_sale, captured_at")
    .eq("film_id", filmId)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Write queries/lists.ts**

`app/lib/queries/lists.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getFeaturedGrimoires(client: Client) {
  const { data, error } = await client
    .from("lists")
    .select("id, owner_user_id, title, description, is_public, is_official, created_at")
    .eq("is_public", true)
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(4);
  if (error) throw error;
  return data ?? [];
}

export async function getPublicLists(client: Client) {
  const { data, error } = await client
    .from("lists")
    .select("id, owner_user_id, title, description, is_public, is_official, created_at")
    .eq("is_public", true)
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return data ?? [];
}

export async function getList(client: Client, id: string) {
  const { data, error } = await client
    .from("lists")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getMySubscribedLists(client: Client, userId: string) {
  const { data, error } = await client
    .from("list_subscriptions")
    .select("list_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(r => r.list_id);
}
```

- [ ] **Step 3: Port Landing page**

Open `src/pages/LandingPage.jsx` as reference. Port it to `app/app/page.tsx` as a Server Component, replacing mocked imports with the query functions above.

`app/app/page.tsx`:
```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLandingMarquee } from "@/lib/queries/films";
import { getFeaturedGrimoires } from "@/lib/queries/lists";
import FilmPoster from "@/components/FilmPoster";
import PriceDrop from "@/components/PriceDrop";
import HalftoneBar from "@/components/HalftoneBar";

export default async function LandingPage() {
  const supabase = await createClient();
  const [marqueeFilms, featuredLists] = await Promise.all([
    getLandingMarquee(supabase),
    getFeaturedGrimoires(supabase),
  ]);

  // Double the marquee for seamless loop
  const marqueeStrip = [...marqueeFilms, ...marqueeFilms];

  return (
    <div style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", fontFamily: "var(--font-ui)" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "2px solid var(--void)", background: "var(--bone)", position: "relative" }} className="grain-light">
        <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Film <span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <span className="eyebrow" style={{ marginLeft: 6, opacity: 0.6 }}>Est. 2026 · Issue nº1</span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <Link href="/films" className="caps" style={{ fontSize: 12, textDecoration: "none", color: "var(--void)" }}>Films</Link>
            <Link href="/lists" className="caps" style={{ fontSize: 12, textDecoration: "none", color: "var(--void)" }}>Lists</Link>
            <Link href="/auth/signin" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>Sign In</Link>
          </div>
        </div>
      </div>

      {/* HERO */}
      <section style={{ borderBottom: "2px solid var(--void)", position: "relative", overflow: "hidden" }} className="grain-light">
        <div className="container-wide" style={{ padding: "48px 32px 32px", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, alignItems: "stretch" }}>
            <div>
              <div className="stamp" style={{ background: "var(--void)", color: "var(--yellow)", borderColor: "var(--void)", marginBottom: 20 }}>
                ✦ A Field Guide To Cheap Movies ✦
              </div>
              <h1 className="display" style={{ fontSize: "clamp(80px, 11vw, 180px)", margin: 0, color: "var(--void)", lineHeight: 0.82, letterSpacing: "-0.02em" }}>
                FILM
                <br />
                <span style={{ color: "var(--accent)", position: "relative", display: "inline-block" }}>GOBLIN</span>
              </h1>
              <p className="head" style={{ fontSize: 30, lineHeight: 1.12, margin: "28px 0 12px", maxWidth: 560 }}>
                A covenant of cinephiles, hunting cheap movies on Apple TV.
              </p>
              <p style={{ fontSize: 16, maxWidth: 520, lineHeight: 1.5, margin: "0 0 28px" }}>
                Scry the marketplace. Summon a deal when a film drops in price. Recommend it to a friend before the moon wanes.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link href="/auth/signup" className="btn btn-lg" style={{ textDecoration: "none" }}>✦ Join The Coven</Link>
                <Link href="/films" className="btn btn-outline btn-lg" style={{ textDecoration: "none" }}>Browse Films</Link>
              </div>
            </div>
            <div style={{ position: "relative", minHeight: 560 }}>
              {marqueeFilms.slice(0, 3).map((f, i) => (
                <div key={f.id} style={{
                  position: "absolute",
                  top: i === 0 ? 20 : i === 1 ? 180 : "auto",
                  right: i === 0 ? 40 : i === 2 ? 0 : "auto",
                  left: i === 1 ? 0 : "auto",
                  bottom: i === 2 ? 20 : "auto",
                  transform: `rotate(${[-4, 3, 5][i]}deg)`,
                }}>
                  <FilmPoster film={f} size={i === 0 ? "lg" : "md"} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ height: 18, background: "var(--void)", color: "var(--accent)", position: "relative" }}>
          <HalftoneBar color="currentColor" height={18} />
        </div>
      </section>

      {/* MARQUEE */}
      <section style={{ background: "var(--void)", color: "var(--bone)", borderBottom: "2px solid var(--void)", padding: "40px 0", overflow: "hidden" }}>
        <div className="container-wide" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 6 }}>Chapter I</div>
          <h2 className="display" style={{ fontSize: 72, margin: 0, lineHeight: 0.9 }}>
            Deals, Fresh <span style={{ color: "var(--accent)", fontStyle: "italic" }}>From The Pit</span>
          </h2>
        </div>
        <div style={{ overflow: "hidden", padding: "20px 0", position: "relative" }}>
          <div className="marquee" style={{ gap: 24 }}>
            {marqueeStrip.map((f, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                <FilmPoster film={f} size="md" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GRIMOIRES */}
      <section style={{ background: "var(--bone)", color: "var(--void)", padding: "72px 0", borderBottom: "2px solid var(--void)" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>Chapter II</div>
          <h2 className="display" style={{ fontSize: 80, margin: "0 0 40px", lineHeight: 0.88 }}>
            The Curated <em style={{ color: "var(--accent)" }}>Grimoires</em>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {featuredLists.map((list, i) => (
              <div key={list.id} style={{
                background: "var(--void)",
                color: "var(--bone)",
                border: "2px solid var(--void)",
                boxShadow: "5px 5px 0 var(--void)",
                padding: 28,
                transform: `rotate(${[-1.5, 0.5, -0.8, 1.2][i]}deg)`,
                minHeight: 280,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}>
                {list.is_official && <span className="stamp">✦ Official</span>}
                <div className="display" style={{ fontSize: list.title.length > 20 ? 28 : 40, lineHeight: 0.92 }}>
                  {list.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: success.

- [ ] **Step 5: Manual visual check**

`supabase start` must be running with migrations applied + some seeded films. If `films` is empty, the marquee and hero show nothing — that's fine for this task, as long as the page renders without errors.

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```
Visit http://localhost:3000. Page should render with zine styling. Stop dev server.

- [ ] **Step 6: Commit**

```
git add app/lib/queries/films.ts app/lib/queries/lists.ts app/app/page.tsx
git commit -m "feat(app): landing page server-rendered against supabase"
```

---

## Task 9: Auth actions + signin/signup pages + callback route

**Files:**
- Create: `app/lib/actions/auth.ts`
- Create: `app/app/auth/signin/page.tsx`
- Create: `app/app/auth/signup/page.tsx`
- Create: `app/app/api/auth/callback/route.ts`

- [ ] **Step 1: Write actions/auth.ts**

`app/lib/actions/auth.ts`:
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/home");
}

export async function signUp(formData: FormData): Promise<{ error?: string; info?: string }> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const origin = String(formData.get("origin") || "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/api/auth/callback` },
  });
  if (error) return { error: error.message };
  return { info: "Check your email to confirm your account." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 2: Write signin page**

`app/app/auth/signin/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { signIn } from "@/lib/actions/auth";

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await signIn(formData);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <form action={handle} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Enter The Coven</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign In</h1>
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
        <input name="email" type="email" required autoComplete="email"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password</div>
        <input name="password" type="password" required minLength={6} autoComplete="current-password"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
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
    </main>
  );
}
```

- [ ] **Step 3: Write signup page**

`app/app/auth/signup/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { signUp } from "@/lib/actions/auth";

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handle(formData: FormData) {
    setPending(true);
    setError(null);
    setInfo(null);
    formData.set("origin", window.location.origin);
    const res = await signUp(formData);
    setPending(false);
    if (res?.error) setError(res.error);
    if (res?.info) setInfo(res.info);
  }

  return (
    <main style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", display: "grid", placeItems: "center", padding: 40 }}>
      <form action={handle} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)", padding: "40px 32px",
        boxShadow: "12px 12px 0 var(--accent)",
        transform: "rotate(-0.5deg)",
        maxWidth: 420, width: "100%",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ The Initiation</div>
        <h1 className="display" style={{ fontSize: 48, margin: "0 0 24px", lineHeight: 0.9 }}>Sign Up</h1>
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Email</div>
        <input name="email" type="email" required autoComplete="email"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 16, fontFamily: "var(--font-ui)" }} />
        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Password (min 6)</div>
        <input name="password" type="password" required minLength={6} autoComplete="new-password"
          style={{ width: "100%", border: "2px solid var(--void)", padding: "12px 14px", marginBottom: 20, fontFamily: "var(--font-ui)" }} />
        {error && (
          <div style={{ color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginBottom: 16 }}>
            {error}
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
    </main>
  );
}
```

- [ ] **Step 4: Write the callback route**

`app/app/api/auth/callback/route.ts`:
```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?error=no_code", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/auth/signin?error=${encodeURIComponent(error.message)}`, url));
  }
  return NextResponse.redirect(new URL("/onboarding", url));
}
```

- [ ] **Step 5: Build and typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: success.

- [ ] **Step 6: Commit**

```
git add app/lib/actions/auth.ts app/app/auth app/app/api
git commit -m "feat(app): email+password auth with signup/signin/callback"
```

---

## Task 10: Test helpers + actions/watchlists.ts + its test

**Files:**
- Create: `app/tests/helpers/supabase.ts`
- Create: `app/tests/helpers/users.ts`
- Create: `app/lib/actions/watchlists.ts`
- Create: `app/lib/queries/watchlists.ts`
- Create: `app/tests/actions/watchlists.test.ts`

- [ ] **Step 1: Write test helpers**

`app/tests/helpers/users.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import "dotenv/config";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createTestUser(): Promise<TestUser> {
  const admin = adminClient();
  const email = `test-${randomUUID()}@test.example`;
  const password = `pass${randomUUID().slice(0, 12)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message ?? "no user");
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(id);
}
```

`app/tests/helpers/supabase.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}
```

- [ ] **Step 2: Write queries/watchlists.ts**

`app/lib/queries/watchlists.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getMyWatchlist(client: Client) {
  const { data, error } = await client
    .from("watchlists")
    .select("id, film_id, max_price_usd, last_alerted_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function isOnWatchlist(client: Client, filmId: string): Promise<boolean> {
  const { data, error } = await client
    .from("watchlists")
    .select("id")
    .eq("film_id", filmId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}
```

- [ ] **Step 3: Write actions/watchlists.ts**

Note the export of `_addToWatchlist` / `_removeFromWatchlist` with a client parameter — for test injection. The public actions are thin wrappers that read the session.

`app/lib/actions/watchlists.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _addToWatchlist(
  client: Client,
  filmId: string,
  maxPriceUsd?: number
): Promise<{ id: string }> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { data, error } = await client
    .from("watchlists")
    .insert({
      user_id: user.id,
      film_id: filmId,
      max_price_usd: maxPriceUsd ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function _removeFromWatchlist(
  client: Client,
  filmId: string
): Promise<void> {
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) throw new Error("unauthenticated");
  const { error } = await client
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("film_id", filmId);
  if (error) throw error;
}

export async function addToWatchlist(filmId: string, maxPriceUsd?: number) {
  const supabase = await createClient();
  const result = await _addToWatchlist(supabase, filmId, maxPriceUsd);
  revalidatePath("/home");
  revalidatePath(`/film/${filmId}`);
  return result;
}

export async function removeFromWatchlist(filmId: string) {
  const supabase = await createClient();
  await _removeFromWatchlist(supabase, filmId);
  revalidatePath("/home");
  revalidatePath(`/film/${filmId}`);
}
```

- [ ] **Step 4: Write the action test**

`app/tests/actions/watchlists.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _addToWatchlist, _removeFromWatchlist } from "../../lib/actions/watchlists";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;
let filmId: string;

beforeAll(async () => {
  user = await createTestUser();
  const admin = adminClient();
  const { data, error } = await admin
    .from("films")
    .insert({ itunes_id: 900000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (error || !data) throw error;
  filmId = data.id;
});

afterAll(async () => {
  if (user?.id) await deleteTestUser(user.id);
  if (filmId) {
    await adminClient().from("films").delete().eq("id", filmId);
  }
});

describe("actions/watchlists", () => {
  it("addToWatchlist inserts a row owned by the caller", async () => {
    const c = await signedInClient(user.email, user.password);
    const { id } = await _addToWatchlist(c, filmId, 6.00);
    expect(id).toBeTruthy();

    const admin = adminClient();
    const { data } = await admin.from("watchlists").select("*").eq("id", id).single();
    expect(data?.user_id).toBe(user.id);
    expect(data?.film_id).toBe(filmId);
    expect(Number(data?.max_price_usd)).toBe(6.00);
  });

  it("removeFromWatchlist deletes the caller's row", async () => {
    const c = await signedInClient(user.email, user.password);
    // ensure a row exists
    await _addToWatchlist(c, filmId);
    await _removeFromWatchlist(c, filmId);
    const admin = adminClient();
    const { data } = await admin.from("watchlists").select("id").eq("user_id", user.id).eq("film_id", filmId);
    expect(data).toHaveLength(0);
  });

  it("cannot add to watchlist when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await expect(_addToWatchlist(anon, filmId)).rejects.toThrow(/unauthenticated/i);
  });
});
```

- [ ] **Step 5: Run tests**

Ensure `supabase start` is running. From `app/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/watchlists.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```
git add app/tests/helpers app/lib/queries/watchlists.ts app/lib/actions/watchlists.ts app/tests/actions/watchlists.test.ts
git commit -m "feat(app): watchlist actions + queries with tests"
```

---

## Task 11: actions/recommendations.ts + test

**Files:**
- Create: `app/lib/actions/recommendations.ts`
- Create: `app/tests/actions/recommendations.test.ts`

- [ ] **Step 1: Write actions/recommendations.ts**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _recommendFilm(
  client: Client,
  filmId: string,
  toUserId: string,
  note: string
): Promise<{ id: string }> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  if (user.id === toUserId) throw new Error("cannot recommend to self");

  const { data, error } = await client
    .from("recommendations")
    .insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      film_id: filmId,
      note: note ?? "",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function recommendFilm(filmId: string, toUserId: string, note: string) {
  const supabase = await createClient();
  const res = await _recommendFilm(supabase, filmId, toUserId, note);
  revalidatePath("/home");
  return res;
}
```

- [ ] **Step 2: Write the test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _recommendFilm } from "../../lib/actions/recommendations";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let sender: TestUser;
let receiver: TestUser;
let filmId: string;

beforeAll(async () => {
  sender = await createTestUser();
  receiver = await createTestUser();
  const admin = adminClient();
  const { data } = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "R", director: "D", year: 2024 })
    .select("id")
    .single();
  if (!data) throw new Error("film insert failed");
  filmId = data.id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("recommendations").delete().eq("film_id", filmId);
  await admin.from("films").delete().eq("id", filmId);
  await deleteTestUser(sender.id);
  await deleteTestUser(receiver.id);
});

describe("actions/recommendations", () => {
  it("sender can recommend a film to a recipient", async () => {
    const c = await signedInClient(sender.email, sender.password);
    const { id } = await _recommendFilm(c, filmId, receiver.id, "watch this");
    expect(id).toBeTruthy();

    const admin = adminClient();
    const { data } = await admin.from("recommendations").select("*").eq("id", id).single();
    expect(data?.from_user_id).toBe(sender.id);
    expect(data?.to_user_id).toBe(receiver.id);
    expect(data?.note).toBe("watch this");
  });

  it("rejects self-recommendation", async () => {
    const c = await signedInClient(sender.email, sender.password);
    await expect(_recommendFilm(c, filmId, sender.id, "")).rejects.toThrow(/self/i);
  });
});
```

- [ ] **Step 3: Run tests**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/recommendations.test.ts
```
Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

```
git add app/lib/actions/recommendations.ts app/tests/actions/recommendations.test.ts
git commit -m "feat(app): recommend-film action with test"
```

---

## Task 12: queries/reviews.ts + queries/activity.ts + queries/profiles.ts

**Files:**
- Create: `app/lib/queries/reviews.ts`
- Create: `app/lib/queries/activity.ts`
- Create: `app/lib/queries/profiles.ts`

- [ ] **Step 1: Write queries/reviews.ts**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getPublishedReviewsForFilm(client: Client, filmId: string) {
  const { data, error } = await client
    .from("reviews")
    .select("id, title, body, pullquote, published_at, author_user_id, profiles!reviews_author_user_id_fkey(handle, display_name, avatar_url)")
    .eq("film_id", filmId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Write queries/activity.ts**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getFeed(client: Client, limit = 50) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];

  // "Activity from users I follow" — RLS on activity is public, but we filter
  // client-side by subquery against follows.
  const { data: follows, error: fErr } = await client
    .from("follows")
    .select("followed_user_id")
    .eq("follower_user_id", user.id);
  if (fErr) throw fErr;
  const followedIds = (follows ?? []).map(f => f.followed_user_id);
  if (followedIds.length === 0) return [];

  const { data, error } = await client
    .from("activity")
    .select("id, actor_user_id, kind, payload, created_at")
    .in("actor_user_id", followedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 3: Write queries/profiles.ts**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export async function getMyProfile(client: Client) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileByHandle(client: Client, handle: string) {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .ilike("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Typecheck**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```
git add app/lib/queries/reviews.ts app/lib/queries/activity.ts app/lib/queries/profiles.ts
git commit -m "feat(app): queries for reviews, activity, profiles"
```

---

## Task 13: Film detail page + client islands

**Files:**
- Create: `app/app/film/[id]/page.tsx`
- Create: `app/components/WatchlistButton.tsx`
- Create: `app/components/RecommendModal.tsx`

- [ ] **Step 1: Write WatchlistButton (client island)**

`app/components/WatchlistButton.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/watchlists";

interface Props {
  filmId: string;
  initialOnList: boolean;
}

export default function WatchlistButton({ filmId, initialOnList }: Props) {
  const [onList, setOnList] = useState(initialOnList);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (onList) {
          await removeFromWatchlist(filmId);
          setOnList(false);
        } else {
          await addToWatchlist(filmId);
          setOnList(true);
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <button
      className="btn btn-outline btn-lg"
      onClick={toggle}
      disabled={pending}
      style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
    >
      {onList ? "✓ On Watchlist" : "+ Watchlist"}
    </button>
  );
}
```

- [ ] **Step 2: Write RecommendModal (client island) — stubbed for MVP**

`app/components/RecommendModal.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { recommendFilm } from "@/lib/actions/recommendations";

interface Props {
  filmId: string;
  filmTitle: string;
}

export default function RecommendModal({ filmId, filmTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [toHandle, setToHandle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  async function send(formData: FormData) {
    start(async () => {
      setError(null);
      try {
        // MVP: for simplicity, paste the recipient's UUID directly.
        // Full "pick a coven member" UI is a later task.
        const toUserId = String(formData.get("to_user_id") || "");
        const noteVal = String(formData.get("note") || "");
        await recommendFilm(filmId, toUserId, noteVal);
        setSent(true);
      } catch (e: any) {
        setError(e.message ?? String(e));
      }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-lg" onClick={() => setOpen(true)}>
        ✦ Recommend To A Friend
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(10,10,10,0.82)",
      display: "grid", placeItems: "center",
      zIndex: 100, padding: 20,
    }} onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)",
        boxShadow: "12px 12px 0 var(--accent)",
        maxWidth: 560, width: "100%",
        padding: "32px 32px 24px",
        transform: "rotate(-0.5deg)",
      }} className="grain-light">
        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Cast The Rune ✦</div>
        <h2 className="display" style={{ fontSize: 44, margin: "0 0 16px", lineHeight: 0.9 }}>
          Recommend <em style={{ color: "var(--accent)" }}>{filmTitle}</em>
        </h2>
        {sent ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Sent. They'll see it in their feed.</div>
        ) : (
          <form action={send}>
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>Recipient (user id)</div>
            <input name="to_user_id" required value={toHandle} onChange={e => setToHandle(e.target.value)}
              placeholder="paste their UUID (full picker lands in a later sub-project)"
              style={{ width: "100%", border: "2px solid var(--void)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, marginBottom: 14 }} />
            <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>A Whisper</div>
            <textarea name="note" value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="watch this one alone, with the lights off…"
              style={{ width: "100%", border: "2px solid var(--void)", padding: 10, fontFamily: "var(--font-serif)", fontSize: 14, marginBottom: 16, resize: "none" }} />
            {error && <div style={{ color: "var(--blood)", marginBottom: 12, fontStyle: "italic" }}>{error}</div>}
            <button type="submit" disabled={pending} className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
              {pending ? "Sealing…" : "✦ Seal & Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write film detail page**

`app/app/film/[id]/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { getFilm, getLatestPriceHistory } from "@/lib/queries/films";
import { isOnWatchlist } from "@/lib/queries/watchlists";
import { getPublishedReviewsForFilm } from "@/lib/queries/reviews";
import FilmPoster from "@/components/FilmPoster";
import Stars from "@/components/Stars";
import TopNav from "@/components/TopNav";
import WatchlistButton from "@/components/WatchlistButton";
import RecommendModal from "@/components/RecommendModal";

export default async function FilmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const film = await getFilm(supabase, id);
  const history = await getLatestPriceHistory(supabase, id, 180);
  const reviews = await getPublishedReviewsForFilm(supabase, id);
  const { data: { user } } = await supabase.auth.getUser();
  const onList = user ? await isOnWatchlist(supabase, id) : false;

  const currentPrice = history[history.length - 1]?.price_usd ?? 0;
  const maxPrice = history.reduce((max, p) => Math.max(max, Number(p.price_usd)), 0);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav />

      <section style={{
        background: "var(--void-2)", color: "var(--bone)",
        borderBottom: "3px solid var(--void)",
        position: "relative", overflow: "hidden",
      }}>
        <div className="container-wide" style={{ padding: "48px 32px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 48, alignItems: "start" }}>
          <div style={{ transform: "rotate(-2deg)" }}>
            <FilmPoster film={film as any} size="xl" />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, opacity: 0.8 }}>
              {film.genre_primary}
            </div>
            <h1 className="display" style={{ fontSize: "clamp(72px, 8vw, 128px)", margin: 0, lineHeight: 0.86 }}>
              {film.title}
            </h1>
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }} className="caps">
              <span>Dir. {film.director}</span>
              <span>·</span>
              <span>{film.year}</span>
              <span>·</span>
              <span>{film.runtime_min} min</span>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.35, margin: "28px 0", maxWidth: 620 }}>
              "{film.description}"
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {user && <WatchlistButton filmId={film.id} initialOnList={onList} />}
              {user && <RecommendModal filmId={film.id} filmTitle={film.title} />}
              {film.itunes_url && (
                <a href={film.itunes_url} target="_blank" rel="noreferrer" className="btn btn-lg">
                  Buy on Apple TV →
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--bone)", color: "var(--void)", padding: "48px 0", borderBottom: "3px solid var(--void)" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>The Price Scroll · 180 Days</div>
          <h3 className="display" style={{ fontSize: 44, margin: "0 0 20px", lineHeight: 0.9 }}>
            What it <em style={{ color: "var(--accent)", fontStyle: "italic" }}>has been worth</em>.
          </h3>
          {history.length > 0 ? (
            <div style={{ border: "2px solid var(--void)", padding: 16 }}>
              <svg viewBox="0 0 680 280" style={{ width: "100%", height: "auto", display: "block" }}>
                <path
                  d={history.map((p, i) => {
                    const x = 40 + (i / (history.length - 1)) * 620;
                    const y = 20 + (1 - (Number(p.price_usd) - 0) / maxPrice) * 230;
                    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                  }).join(" ")}
                  stroke="var(--void)" strokeWidth={2.5} fill="none"
                />
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 700 }}>
                <span>◆ Low ${Math.min(...history.map(p => Number(p.price_usd))).toFixed(2)}</span>
                <span>◆ High ${Math.max(...history.map(p => Number(p.price_usd))).toFixed(2)}</span>
                <span style={{ color: "var(--accent-deep)" }}>◆ Now ${Number(currentPrice).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              No price history yet. Check back after the first worker run.
            </div>
          )}
        </div>
      </section>

      <section style={{ background: "var(--void)", color: "var(--bone)", padding: "48px 0" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>Editorial Reviews</div>
          {reviews.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              No reviews yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {reviews.map(r => (
                <article key={r.id} style={{ background: "var(--void-2)", border: "1px solid #333", padding: 22 }}>
                  <h3 className="head" style={{ fontSize: 24, marginBottom: 8 }}>{r.title}</h3>
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.55 }}>{r.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```
git add app/components/WatchlistButton.tsx app/components/RecommendModal.tsx app/app/film
git commit -m "feat(app): film detail page with watchlist + recommend client islands"
```

---

## Task 14: Films archive page + client search

**Files:**
- Create: `app/components/FilmsSearch.tsx`
- Create: `app/app/films/page.tsx`

- [ ] **Step 1: Write FilmsSearch client component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export default function FilmsSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, start] = useTransition();

  function update(next: string) {
    setQ(next);
    start(() => {
      const p = new URLSearchParams(params);
      if (next) p.set("q", next);
      else p.delete("q");
      router.push(`/films?${p.toString()}`);
    });
  }

  return (
    <input
      value={q}
      onChange={e => update(e.target.value)}
      placeholder="Title, director, year, genre…"
      style={{
        flex: 1, background: "transparent", border: 0,
        fontFamily: "var(--font-serif)", fontSize: 20, padding: "12px 8px",
        color: "var(--void)", outline: "none",
      }}
    />
  );
}
```

- [ ] **Step 2: Write films page**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getFilms } from "@/lib/queries/films";
import TopNav from "@/components/TopNav";
import FilmPoster from "@/components/FilmPoster";
import FilmsSearch from "@/components/FilmsSearch";
import Link from "next/link";

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const films = await getFilms(supabase, { q });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="films" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter II · The Archive</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
            Every Film, <em style={{ color: "var(--accent)" }}>Indexed</em>.
          </h1>
          <div style={{ display: "flex", gap: 0, border: "3px solid var(--void)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)", marginTop: 24 }}>
            <span style={{ padding: "16px 18px", fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>✦</span>
            <FilmsSearch />
          </div>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          {films.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              No films match. The void returned nothing.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 20 }}>
              {films.map(f => (
                <Link key={f.id} href={`/film/${f.id}`} style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}>
                  <FilmPoster film={f as any} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                  <div style={{ marginTop: 10 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{f.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{f.year}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```
git add app/components/FilmsSearch.tsx app/app/films
git commit -m "feat(app): films archive with client search"
```

---

## Task 15: Lists actions + test + Lists page + Subscribe island

**Files:**
- Create: `app/lib/actions/lists.ts`
- Create: `app/tests/actions/lists.test.ts`
- Create: `app/components/SubscribeButton.tsx`
- Create: `app/app/lists/page.tsx`

- [ ] **Step 1: Write actions/lists.ts**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function _subscribeToList(client: Client, listId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("list_subscriptions")
    .insert({ user_id: user.id, list_id: listId });
  if (error) throw error;
}

export async function _unsubscribeFromList(client: Client, listId: string): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client
    .from("list_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("list_id", listId);
  if (error) throw error;
}

export async function subscribeToList(listId: string) {
  const c = await createClient();
  await _subscribeToList(c, listId);
  revalidatePath("/lists");
}

export async function unsubscribeFromList(listId: string) {
  const c = await createClient();
  await _unsubscribeFromList(c, listId);
  revalidatePath("/lists");
}
```

- [ ] **Step 2: Write the action test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _subscribeToList, _unsubscribeFromList } from "../../lib/actions/lists";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;
let publicListId: string;
let privateListId: string;
let ownerId: string;

beforeAll(async () => {
  user = await createTestUser();
  const owner = await createTestUser();
  ownerId = owner.id;
  const admin = adminClient();
  const pub = await admin.from("lists").insert({ owner_user_id: ownerId, title: "Public G", is_public: true }).select("id").single();
  const priv = await admin.from("lists").insert({ owner_user_id: ownerId, title: "Private G", is_public: false }).select("id").single();
  publicListId = pub.data!.id;
  privateListId = priv.data!.id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("list_subscriptions").delete().eq("user_id", user.id);
  await admin.from("lists").delete().in("id", [publicListId, privateListId]);
  await deleteTestUser(user.id);
  await deleteTestUser(ownerId);
});

describe("actions/lists", () => {
  it("can subscribe to a public list", async () => {
    const c = await signedInClient(user.email, user.password);
    await _subscribeToList(c, publicListId);
    const admin = adminClient();
    const { data } = await admin.from("list_subscriptions").select("*").eq("user_id", user.id).eq("list_id", publicListId);
    expect(data).toHaveLength(1);
  });

  it("cannot subscribe to a private list", async () => {
    const c = await signedInClient(user.email, user.password);
    await expect(_subscribeToList(c, privateListId)).rejects.toThrow();
  });

  it("can unsubscribe", async () => {
    const c = await signedInClient(user.email, user.password);
    // Already subscribed from prior test; remove
    await _unsubscribeFromList(c, publicListId);
    const admin = adminClient();
    const { data } = await admin.from("list_subscriptions").select("*").eq("user_id", user.id).eq("list_id", publicListId);
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Write SubscribeButton**

```tsx
"use client";

import { useState, useTransition } from "react";
import { subscribeToList, unsubscribeFromList } from "@/lib/actions/lists";

interface Props {
  listId: string;
  initialSubscribed: boolean;
  disabled?: boolean;
}

export default function SubscribeButton({ listId, initialSubscribed, disabled }: Props) {
  const [subbed, setSubbed] = useState(initialSubscribed);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (subbed) {
          await unsubscribeFromList(listId);
          setSubbed(false);
        } else {
          await subscribeToList(listId);
          setSubbed(true);
        }
      } catch (e) { console.error(e); }
    });
  }

  return (
    <button onClick={toggle} disabled={disabled || pending} className="caps" style={{
      background: subbed ? "var(--accent)" : "transparent",
      color: subbed ? "var(--accent-ink)" : "var(--bone)",
      border: "2px solid var(--accent)",
      padding: "6px 12px", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
    }}>
      {subbed ? "✓ Subscribed" : "+ Subscribe"}
    </button>
  );
}
```

- [ ] **Step 4: Write lists page**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getPublicLists, getMySubscribedLists } from "@/lib/queries/lists";
import TopNav from "@/components/TopNav";
import SubscribeButton from "@/components/SubscribeButton";

export default async function ListsPage() {
  const supabase = await createClient();
  const lists = await getPublicLists(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  const mySubs = user ? new Set(await getMySubscribedLists(supabase, user.id)) : new Set<string>();

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="lists" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "48px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter III · The Grimoires</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
            Curated<br /><em style={{ color: "var(--accent)" }}>Lists</em>
          </h1>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {lists.map((l) => (
              <div key={l.id} style={{ border: "2px solid var(--bone)", padding: 20 }}>
                {l.is_official && (
                  <span className="stamp" style={{ background: "var(--accent)", color: "var(--accent-ink)", marginBottom: 12, display: "inline-block" }}>
                    ✦ Official
                  </span>
                )}
                <div className="head" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 12 }}>{l.title}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
                  {l.description || "\u00A0"}
                </div>
                {user ? (
                  <SubscribeButton listId={l.id} initialSubscribed={mySubs.has(l.id)} />
                ) : (
                  <div className="caps" style={{ fontSize: 10, opacity: 0.6 }}>Sign in to subscribe</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/lists.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: 3 tests pass, build succeeds.

- [ ] **Step 6: Commit**

```
git add app/lib/actions/lists.ts app/tests/actions/lists.test.ts app/components/SubscribeButton.tsx app/app/lists
git commit -m "feat(app): lists page with subscribe action and tests"
```

---

## Task 16: Home page + FeedTabs client island

**Files:**
- Create: `app/components/FeedTabs.tsx`
- Create: `app/app/home/page.tsx`

- [ ] **Step 1: Write FeedTabs (client island)**

```tsx
"use client";

import { useState } from "react";

type Tab = "all" | "reviews" | "recs" | "lists";

export default function FeedTabs<T extends { kind: string }>({ items }: { items: T[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const filtered = items.filter(i => {
    if (tab === "all") return true;
    if (tab === "reviews") return i.kind === "review_published";
    if (tab === "recs") return i.kind === "recommendation_sent";
    if (tab === "lists") return i.kind === "list_created" || i.kind === "list_film_added";
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["all", "reviews", "recs", "lists"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className="caps" style={{
            background: tab === t ? "var(--accent)" : "transparent",
            color: tab === t ? "var(--accent-ink)" : "var(--muted)",
            border: "1px solid " + (tab === t ? "var(--accent)" : "#333"),
            padding: "6px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "var(--font-ui)", fontWeight: 700,
          }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
            No activity yet. Follow someone to see their feed.
          </div>
        ) : (
          filtered.map((item, i) => (
            <div key={i} style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: 12 }}>
              <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>{item.kind}</div>
              <pre style={{ fontSize: 12, color: "var(--bone)", whiteSpace: "pre-wrap" }}>{JSON.stringify(item, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

The activity rendering is deliberately minimal (JSON dump) — tying each `activity.kind` to a rich rendering is a follow-up in a later sub-project. MVP proves the plumbing.

- [ ] **Step 2: Write home page**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getFeed } from "@/lib/queries/activity";
import TopNav from "@/components/TopNav";
import FeedTabs from "@/components/FeedTabs";

export default async function HomePage() {
  const supabase = await createClient();
  const feed = await getFeed(supabase, 50);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="home" />

      <div className="container-wide" style={{ padding: 32, display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 32 }}>
        <aside>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Your Ledger</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Your watchlist and deals summary land here in a later sub-project.
          </div>
        </aside>
        <main>
          <h2 className="display" style={{ fontSize: 42, margin: "0 0 16px" }}>The Feed</h2>
          <FeedTabs items={feed as any} />
        </main>
        <aside>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Popular Grimoires</div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
            Lives in a later sub-project.
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```
git add app/components/FeedTabs.tsx app/app/home
git commit -m "feat(app): home page with activity feed tabs"
```

---

## Task 17: Onboarding page + completeOnboarding action + test

**Files:**
- Create: `app/lib/actions/onboarding.ts`
- Create: `app/tests/actions/onboarding.test.ts`
- Create: `app/app/onboarding/page.tsx`

- [ ] **Step 1: Write actions/onboarding.ts**

```typescript
"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface OnboardingPayload {
  handle: string;
  genres: string[];       // captured but not persisted in MVP (no genres table)
  storefronts: string[];  // captured but not persisted in MVP
  watchlistFilmIds: string[];
  followUserIds: string[];
  thresholdPct: number;   // 10–75
  broadcastWatchlistAdds: boolean;
}

export async function _completeOnboarding(client: Client, p: OnboardingPayload): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  // 1. Update the profile (trigger already created a default row)
  const { error: pErr } = await client
    .from("profiles")
    .update({
      handle: p.handle,
      display_name: p.handle,
      broadcast_watchlist_adds: p.broadcastWatchlistAdds,
    })
    .eq("id", user.id);
  if (pErr) throw pErr;

  // 2. Insert watchlists. For each film, compute max_price_usd as
  //    max_observed_price * (1 - thresholdPct/100). If no history, null.
  for (const filmId of p.watchlistFilmIds) {
    const { data: history } = await client
      .from("price_history")
      .select("price_usd")
      .eq("film_id", filmId)
      .order("captured_at", { ascending: false })
      .limit(1);
    const latest = history?.[0]?.price_usd ? Number(history[0].price_usd) : null;
    const maxPriceUsd = latest ? latest * (1 - p.thresholdPct / 100) : null;

    const { error: wErr } = await client
      .from("watchlists")
      .insert({
        user_id: user.id,
        film_id: filmId,
        max_price_usd: maxPriceUsd,
      });
    // Ignore unique-violation (23505) — user may have the film on list already
    if (wErr && wErr.code !== "23505") throw wErr;
  }

  // 3. Insert follows
  for (const followedId of p.followUserIds) {
    const { error: fErr } = await client
      .from("follows")
      .insert({ follower_user_id: user.id, followed_user_id: followedId });
    if (fErr && fErr.code !== "23505") throw fErr;
  }
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const c = await createClient();
  await _completeOnboarding(c, payload);
  redirect("/home");
}
```

- [ ] **Step 2: Write the test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _completeOnboarding } from "../../lib/actions/onboarding";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;
let filmA: string;
let filmB: string;
let otherUser: TestUser;

beforeAll(async () => {
  user = await createTestUser();
  otherUser = await createTestUser();
  const admin = adminClient();
  const a = await admin.from("films").insert({ itunes_id: 700000 + Math.floor(Math.random() * 10000), title: "A", director: "D", year: 2024 }).select("id").single();
  const b = await admin.from("films").insert({ itunes_id: 700000 + Math.floor(Math.random() * 10000), title: "B", director: "D", year: 2024 }).select("id").single();
  filmA = a.data!.id;
  filmB = b.data!.id;
  // Seed a price history for filmA so threshold calc has something
  await admin.from("price_history").insert({ film_id: filmA, price_usd: 9.99 });
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("watchlists").delete().eq("user_id", user.id);
  await admin.from("follows").delete().eq("follower_user_id", user.id);
  await admin.from("price_history").delete().eq("film_id", filmA);
  await admin.from("films").delete().in("id", [filmA, filmB]);
  await deleteTestUser(user.id);
  await deleteTestUser(otherUser.id);
});

describe("actions/onboarding", () => {
  it("completeOnboarding sets profile + inserts watchlists + follows", async () => {
    const c = await signedInClient(user.email, user.password);
    await _completeOnboarding(c, {
      handle: "moss.witch",
      genres: ["folk", "slow"],
      storefronts: ["appletv"],
      watchlistFilmIds: [filmA, filmB],
      followUserIds: [otherUser.id],
      thresholdPct: 30,
      broadcastWatchlistAdds: false,
    });

    const admin = adminClient();
    const p = await admin.from("profiles").select("*").eq("id", user.id).single();
    expect(p.data?.handle).toBe("moss.witch");

    const wl = await admin.from("watchlists").select("*").eq("user_id", user.id);
    expect(wl.data).toHaveLength(2);
    const filmAWl = wl.data!.find(w => w.film_id === filmA);
    // 9.99 * 0.7 = 6.993 ≈ 6.99 after storage coercion
    expect(Number(filmAWl!.max_price_usd)).toBeCloseTo(9.99 * 0.7, 1);

    const f = await admin.from("follows").select("*").eq("follower_user_id", user.id);
    expect(f.data).toHaveLength(1);
    expect(f.data![0].followed_user_id).toBe(otherUser.id);
  });
});
```

- [ ] **Step 3: Write onboarding page**

This is a big client component. Port the prototype's `src/pages/OnboardingFlow.jsx` into `app/app/onboarding/page.tsx` wholesale, adjusting:
- Import paths point at `@/components/FilmPoster`, `@/components/Avatar`.
- Data sources: the `GENRES`, `STORES` consts stay inlined. For films (Chapter III) and coven (Chapter IV), fetch via a Client Component pattern — call `createClient()` from `lib/supabase/client` in a `useEffect`.
- The final "Enter The Coven" button calls `completeOnboarding({ ... })` with the collected state.
- Remove any imports from `src/data.js` (doesn't exist in app/).

Detailed content: copy `src/pages/OnboardingFlow.jsx` to `app/app/onboarding/page.tsx`. Rename to `.tsx`. Add `"use client";` at top. Replace `onNavigate("home")` with `completeOnboarding(...)`. Replace `FILMS` / `USERS` imports with client-side Supabase fetches in `useEffect`.

This is a large port — roughly 600 lines of JSX. Keeping it in-plan verbatim would bloat this document. The engineer reads `src/pages/OnboardingFlow.jsx` as the reference, applies the adjustments above, and commits.

- [ ] **Step 4: Run tests + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/onboarding.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: test passes; build succeeds.

- [ ] **Step 5: Commit**

```
git add app/lib/actions/onboarding.ts app/tests/actions/onboarding.test.ts app/app/onboarding
git commit -m "feat(app): onboarding ritual with completeOnboarding action"
```

---

## Task 18: actions/profile.ts + test + Settings page

**Files:**
- Create: `app/lib/actions/profile.ts`
- Create: `app/tests/actions/profile.test.ts`
- Create: `app/app/settings/page.tsx`

- [ ] **Step 1: Write actions/profile.ts**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface ProfileFields {
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  broadcast_watchlist_adds?: boolean;
}

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { error } = await client.from("profiles").update(fields).eq("id", user.id);
  if (error) throw error;
}

export async function updateProfile(fields: ProfileFields) {
  const c = await createClient();
  await _updateProfile(c, fields);
  revalidatePath("/settings");
}
```

- [ ] **Step 2: Write the test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _updateProfile } from "../../lib/actions/profile";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => { user = await createTestUser(); });
afterAll(async () => { await deleteTestUser(user.id); });

describe("actions/profile", () => {
  it("updateProfile changes handle and bio", async () => {
    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { handle: "newhandle", bio: "a new bio" });
    const { data } = await adminClient().from("profiles").select("*").eq("id", user.id).single();
    expect(data?.handle).toBe("newhandle");
    expect(data?.bio).toBe("a new bio");
  });
});
```

- [ ] **Step 3: Write settings page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/actions/profile";

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      setLoading(false);
    })();
  }, []);

  async function save(fd: FormData) {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({
        handle: String(fd.get("handle")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
      });
      setSaved(true);
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!profile) return <div style={{ padding: 40 }}>Not signed in.</div>;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh", padding: 40 }}>
      <div className="container-wide">
        <h1 className="display" style={{ fontSize: 64, margin: "0 0 24px" }}>Settings</h1>
        <form action={save} style={{ display: "grid", gap: 16, maxWidth: 540 }}>
          <label>
            <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Handle</div>
            <input name="handle" defaultValue={profile.handle} required style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
          </label>
          <label>
            <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Display Name</div>
            <input name="display_name" defaultValue={profile.display_name} required style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
          </label>
          <label>
            <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Bio</div>
            <textarea name="bio" defaultValue={profile.bio} rows={4} style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)", fontFamily: "var(--font-serif)", fontStyle: "italic" }} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
            <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
          </label>
          <button type="submit" disabled={saving} className="btn">
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <div style={{ color: "var(--accent)", fontStyle: "italic" }}>Saved.</div>}
          <div style={{ borderTop: "1px solid #333", marginTop: 24, paddingTop: 24 }}>
            <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>Other Tabs</div>
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              Oath, Storefronts, Notifications, Coven & Privacy, Desanctify — coming in a later sub-project.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/profile.test.ts
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```
Expected: 1 test passes, build succeeds.

- [ ] **Step 5: Commit**

```
git add app/lib/actions/profile.ts app/tests/actions/profile.test.ts app/app/settings
git commit -m "feat(app): settings profile tab with test"
```

---

## Task 19: Vercel deploy + hosted staging wire-up

**Manual task.** Deployment is driven by the Vercel dashboard + CLI; the plan documents steps.

**Files:** no new files committed in this task (env vars live in Vercel; staging creds stay out of git).

- [ ] **Step 1: Install Vercel CLI**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm i -g vercel
vercel login
```

Use the same GitHub account that owns the repo (rexnowacki).

- [ ] **Step 2: Link the app**

From `app/`:
```
vercel link
```

Answer the prompts:
- Link to an existing project? No, create new
- Scope: rexnowacki
- Project name: film-goblin-app (or "film-goblin" — user preference)
- Root directory: `app` (Vercel needs to know we're not deploying from repo root)
- Modify settings? No (Next.js auto-detected)

- [ ] **Step 3: Set environment variables**

Pull the hosted-staging Supabase URL + anon key from Task 3.

```
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# paste: https://<ref>.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# paste: eyJhbGci...

# Repeat for preview and development if desired (optional)
```

Or via dashboard: Project Settings → Environment Variables.

- [ ] **Step 4: Add the Vercel URL to Supabase Site URLs**

Go to the hosted-staging Supabase project → Authentication → URL Configuration. Add:
- `https://<project>.vercel.app` to Site URL
- `https://<project>.vercel.app/api/auth/callback` to Additional Redirect URLs

Without this, confirm-email links break on the production deploy.

- [ ] **Step 5: Deploy**

```
vercel --prod
```

Wait ~90s. Vercel returns a URL like `https://film-goblin-app-xyz.vercel.app`.

- [ ] **Step 6: Smoke test the deployed URL**

Manual flow:
1. Visit the Vercel URL. Landing page renders (marquee may be empty if staging films table is empty — seed if needed via `cd worker && DATABASE_URL=<staging> npm run seed`).
2. Click "Join the Coven" → `/auth/signup`.
3. Enter a test email + password. Submit.
4. Check email for confirm link. Click it.
5. Land on `/onboarding`.
6. Walk through 5 chapters. Click "Enter The Coven".
7. Land on `/home`.
8. Click a film title from the grimoires or `/films`. Film detail page renders.
9. Click "+ Watchlist". Button flips to "✓ On Watchlist".
10. Reload. Watchlist state persists.
11. Sign out via settings → link back. Confirm session cleared.

If any step fails, debug via Vercel's logs tab and the Supabase Studio.

- [ ] **Step 7: Document the deploy URL**

Add a note to `app/README.md` (created in Task 20) with the staging URL and a link to the Vercel dashboard. No git commit yet — this ties into Task 20's README.

No direct commit for this task — the deploy is the deliverable. Verify `git status` is clean.

---

## Task 20: App README + CI workflow + final verification

**Files:**
- Create: `app/README.md`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write app README**

`app/README.md`:
```markdown
# Film Goblin — Next.js App

The user-facing application. Implements the spec at
`../docs/superpowers/specs/2026-04-21-nextjs-app-design.md`.

Seven MVP routes (Landing, Onboarding, Home, Film Detail, Films, Lists, Settings)
backed by Supabase Auth + the sub-project-2 schema. Styles come verbatim from
the prototype at `../src/styles.css`; no Tailwind.

## Local setup

Requires Node 20 (pinned via repo-root `.nvmrc`), Docker (for Supabase CLI),
and the Supabase CLI.

From repo root:

```
supabase start                          # spins up local Postgres, GoTrue, etc.
cd worker && npm run migrate            # apply 0001-0003
cd ../db && npm run migrate             # apply 0100-0113
cd ../app && cp .env.local.example .env.local
# paste the anon key + service_role key from `supabase start` output
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run typecheck` — tsc --noEmit
- `npm test` — Vitest (requires `supabase start` running)
- `npm run gen:types` — regenerate `lib/supabase/types.ts` from local DB

## Test prerequisites

Action tests use the local Supabase stack (`supabase start`). Set
`TEST_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to the service_role key
printed by `supabase start`.

## Manual test plan (MVP)

1. Sign up with fresh email + password
2. Check email; click confirm link
3. Land on /onboarding; walk 5 chapters; click "Enter The Coven"
4. Land on /home; see feed (empty unless you followed someone who has activity)
5. Visit /films; click a film; see detail
6. Click "+ Watchlist"; reload; confirm persists
7. Visit /settings; edit handle; save; reload; confirm persists
8. Sign out; confirm /home redirects to /auth/signin

## Deploy

Staging: https://<vercel-url> — deployed from `master`.

Supabase project: `film-goblin-staging`. URL and anon key live only in Vercel's
env vars and local `.env.local` (never in the repo).

## What this package does NOT do

- Host the price-tracking worker's cron endpoint (sub-project 4).
- Send notifications (sub-project 5).
- Deals page, Friends page, Alerts inbox, List Detail, Mobile showcase
  (later sub-projects).
```

- [ ] **Step 2: Write CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: worker/package-lock.json
      - run: npm ci
        working-directory: worker
      - run: npm test
        working-directory: worker
      - run: npm run typecheck
        working-directory: worker

  db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: db/package-lock.json
      - run: npm ci
        working-directory: db
      - run: npm test
        working-directory: db
      - run: npm run test:rls
        working-directory: db
      - run: npm run typecheck
        working-directory: db

  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - name: Get local Supabase keys
        id: supabase
        run: |
          KEYS=$(supabase status -o json)
          echo "anon_key=$(echo $KEYS | jq -r '.api.anon_key')" >> $GITHUB_OUTPUT
          echo "service_role_key=$(echo $KEYS | jq -r '.api.service_role_key')" >> $GITHUB_OUTPUT
          echo "url=$(echo $KEYS | jq -r '.api.url')" >> $GITHUB_OUTPUT
      - run: |
          cd worker && npm ci && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run migrate
          cd ../db && npm ci && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm run migrate
      - run: npm ci
        working-directory: app
      - env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ steps.supabase.outputs.url }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.anon_key }}
          TEST_SUPABASE_SERVICE_ROLE_KEY: ${{ steps.supabase.outputs.service_role_key }}
        run: npm test
        working-directory: app
      - env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ steps.supabase.outputs.url }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.anon_key }}
        run: npm run typecheck && npm run build
        working-directory: app
```

The `supabase/setup-cli@v1` action installs the CLI; `supabase start` spins up the Docker stack inside the runner.

- [ ] **Step 3: Run all tests locally one last time**

Ensure `supabase start` is running. From repo root:
```
cd worker && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
cd ../db && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all
cd ../app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
cd ../app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
cd ../app && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: all pass.

- [ ] **Step 4: Walk the spec**

Open `../docs/superpowers/specs/2026-04-21-nextjs-app-design.md` and verify:

- Seven MVP routes present → `app/app/{page,onboarding/page,home/page,film/[id]/page,films/page,lists/page,settings/page}.tsx` ✓
- Auth: signup/signin/callback → Task 9 ✓
- Middleware with redirects → Task 5 ✓
- Supabase server + browser clients → Task 4 ✓
- Styles from src/styles.css verbatim → Task 1 step 5 ✓
- Server components for SEO surfaces; client islands for interactive — matches per-route breakdown
- Vercel deploy working at staging URL → Task 19
- Tests: middleware + 5 action test files → Tasks 5, 10, 11, 15, 17, 18
- CI workflow present → Task 20
- Local Supabase stack + hosted staging → Tasks 2, 3

- [ ] **Step 5: Commit**

```
git add app/README.md .github/workflows/ci.yml
git commit -m "docs(app): README + CI workflow + final verification"
```

- [ ] **Step 6: Push**

```
git push
```

This triggers Vercel to rebuild and deploy (if linked in Task 19). The CI workflow also runs on GitHub. Watch for green checkmarks.

---

## Self-review notes

- **Spec coverage:** every normative spec item maps to a task (Task 20 step 4 walks the list).
- **Deviations acknowledged:** the spec said "testcontainers for action tests"; the plan uses local Supabase stack instead because testcontainers + pg can't test supabase-js's PostgREST-routed queries. Documented in the plan header.
- **Onboarding port is the biggest task** (Task 17 step 3 is hand-wavy because the ~600-line component ports verbatim from `src/pages/OnboardingFlow.jsx`). The engineer uses that file as the reference rather than re-including 600 lines in this plan.
- **Activity feed rendering is minimal** (raw JSON dump in Task 16's FeedTabs). A per-kind rich renderer is a follow-up, not an MVP requirement.
- **RecommendModal's recipient picker** is just a UUID paste box in MVP (Task 13). A proper "pick from coven" UI lands in sub-project 6.
- **Quiet hours + notification preferences** are captured in the onboarding form but not persisted in MVP — neither a DB column nor a consumer exists yet; sub-project 5 will add both.
