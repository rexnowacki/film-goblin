# Worker HTTP Cron Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `worker/src/worker.ts runOnce()` as a Vercel-Cron-invokable HTTP endpoint at `app/app/api/cron/refresh-prices/route.ts`, running daily in production and manually triggerable with a bearer-secret locally.

**Architecture:** Convert the repo to an npm workspace so the Next.js app can import the worker package directly. Single Route Handler checks `Authorization: Bearer ${CRON_SECRET}`, opens a `pg.Client` against `DATABASE_URL`, calls `runOnce(client, { maxFilms })`, returns the digest as JSON. One `vercel.json` with a `crons` entry; work capped per invocation via `MAX_FILMS_PER_RUN` env (default 100).

**Tech Stack:** npm workspaces · Next.js 15 Route Handlers · `pg` · `vercel.json` crons · Vitest module mocking

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` (root) | Modify | Declare `workspaces: ["app", "worker", "db"]` |
| `worker/package.json` | Modify | Add `exports: { ".": "./src/worker.ts" }` so app can import |
| `app/package.json` | Modify | Add `film-goblin-worker: "*"` dep |
| `app/next.config.mjs` | Modify | Add `transpilePackages: ["film-goblin-worker"]` |
| `app/app/api/cron/refresh-prices/route.ts` | Create | GET handler: auth → connect → runOnce → JSON |
| `app/tests/routes/cron-refresh-prices.test.ts` | Create | Unit tests for the auth gate + env checks |
| `app/vercel.json` | Create | Daily cron at 09:00 UTC |
| `app/.env.local.example` | Modify | Add commented `CRON_SECRET=dev-secret` line |

---

## Task 1: Convert repo to an npm workspace

**Files:**
- Modify: `package.json` (root)
- Modify: `worker/package.json`
- Modify: `app/package.json`

- [ ] **Step 1: Add workspaces to root package.json**

Open `/home/cthulhulemon/film_goblin/package.json`. Insert `"workspaces": ["app", "worker", "db"],` after the `"type": "module",` line. Final shape:

```json
{
  "name": "film-goblin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["app", "worker", "db"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Add `exports` to worker/package.json**

Open `/home/cthulhulemon/film_goblin/worker/package.json`. Add `"exports": { ".": "./src/worker.ts" },` after the `"type": "module",` line. The `name` is already `film-goblin-worker`. Final `exports` block:

```json
  "type": "module",
  "exports": {
    ".": "./src/worker.ts"
  },
```

Leave everything else in that file alone.

- [ ] **Step 3: Add film-goblin-worker dep to app/package.json**

Open `/home/cthulhulemon/film_goblin/app/package.json`. Add `"film-goblin-worker": "*",` inside `"dependencies"`, and `"pg": "^8.13.1"` + `"@sentry/node": "^8.47.0"` since the route handler will import both directly. Final `dependencies` block:

```json
  "dependencies": {
    "@supabase/ssr": "^0.10.2",
    "@supabase/supabase-js": "^2.46.1",
    "@sentry/node": "^8.47.0",
    "film-goblin-worker": "*",
    "next": "^15.1.3",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

And add `"@types/pg": "^8.11.10"` to `devDependencies`:

```json
  "devDependencies": {
    "@types/node": "^20.17.10",
    "@types/pg": "^8.11.10",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "dotenv": "^16.4.7"
  }
```

- [ ] **Step 4: Reinstall dependencies under workspace layout**

The existing per-package `node_modules/` directories will be replaced. Remove them first to force a clean hoist:

```
cd /home/cthulhulemon/film_goblin
rm -rf node_modules app/node_modules worker/node_modules db/node_modules package-lock.json app/package-lock.json worker/package-lock.json db/package-lock.json
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install
```

Expected: one root-level `package-lock.json`, one root-level `node_modules/` with hoisted deps, and a symlink `node_modules/film-goblin-worker -> ../worker`.

Verify the symlink:
```
ls -la node_modules/film-goblin-worker
```
Expected: a symlink pointing to `../worker`.

- [ ] **Step 5: Sanity check all three packages still run their test suites**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test --workspace worker
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test --workspace db
```

Expected: worker's 43 tests pass, db's smoke suite passes. (The app's tests need local Supabase up; skip those here.)

- [ ] **Step 6: Commit**

```
git add package.json worker/package.json app/package.json package-lock.json
git rm -f app/package-lock.json worker/package-lock.json db/package-lock.json 2>/dev/null || true
git commit -m "chore: convert repo to npm workspaces

Adds workspaces: [app, worker, db] at the root. worker/package.json
exports src/worker.ts so app/ can import runOnce via the package name.
app/ picks up film-goblin-worker as a dep plus pg + @sentry/node so
the forthcoming cron route can talk to Postgres and report errors.

The per-package lockfiles are retired; one root lockfile hoists all
three packages' deps."
```

---

## Task 2: Wire up Next.js transpilePackages

**Files:**
- Modify: `app/next.config.mjs`

- [ ] **Step 1: Add transpilePackages to next config**

Overwrite `/home/cthulhulemon/film_goblin/app/next.config.mjs` with:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["film-goblin-worker"],
};

export default nextConfig;
```

- [ ] **Step 2: Verify Next still builds**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: build succeeds. No new routes yet; this just proves the workspace setup doesn't break the existing app build.

If the build fails with a `Cannot find module 'film-goblin-worker'` or similar workspace-resolution error, re-verify Task 1 Step 4's `node_modules/film-goblin-worker` symlink.

- [ ] **Step 3: Commit**

```
git add app/next.config.mjs
git commit -m "chore(app): transpilePackages for film-goblin-worker

Lets Next.js bundle the worker's raw TypeScript directly instead of
requiring a separate tsc build step. Edits in worker/src/ land
immediately in both next dev and vercel --prod."
```

---

## Task 3: Write the failing route handler test

**Files:**
- Create: `app/tests/routes/cron-refresh-prices.test.ts`

- [ ] **Step 1: Write the test**

Create `/home/cthulhulemon/film_goblin/app/tests/routes/cron-refresh-prices.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted mocks — constructed before the route module loads.
const connectMock = vi.fn();
const endMock = vi.fn();
const clientCtor = vi.fn(() => ({ connect: connectMock, end: endMock }));
const runOnceMock = vi.fn();

vi.mock("pg", () => ({
  default: { Client: clientCtor },
  Client: clientCtor,
}));

vi.mock("film-goblin-worker", () => ({
  runOnce: runOnceMock,
}));

// Import AFTER the mocks are registered.
const { GET } = await import("../../app/api/cron/refresh-prices/route");

function makeRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost:3000/api/cron/refresh-prices", { headers });
}

describe("GET /api/cron/refresh-prices", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://fake/test";
    delete process.env.MAX_FILMS_PER_RUN;
    connectMock.mockReset().mockResolvedValue(undefined);
    endMock.mockReset().mockResolvedValue(undefined);
    clientCtor.mockClear();
    runOnceMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(clientCtor).not.toHaveBeenCalled();
    expect(runOnceMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer does not match CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runOnceMock).not.toHaveBeenCalled();
  });

  it("returns 500 when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/DATABASE_URL/);
  });

  it("connects, runs the pipeline, and returns the digest snapshot on success", async () => {
    runOnceMock.mockResolvedValue({
      render: () => "films_refreshed=3 price_changes=1",
      snapshot: () => ({
        films_refreshed: 3,
        price_changes: 1,
        alerts_fired: 0,
        parse_failures: 0,
        unavailable_marked: 0,
        parse_failure_ids: [],
      }),
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(clientCtor).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(runOnceMock).toHaveBeenCalledTimes(1);
    const [, opts] = runOnceMock.mock.calls[0];
    expect(opts).toEqual({ maxFilms: 100 });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.digest.films_refreshed).toBe(3);
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("honors MAX_FILMS_PER_RUN when set", async () => {
    process.env.MAX_FILMS_PER_RUN = "25";
    runOnceMock.mockResolvedValue({
      render: () => "films_refreshed=0",
      snapshot: () => ({
        films_refreshed: 0,
        price_changes: 0,
        alerts_fired: 0,
        parse_failures: 0,
        unavailable_marked: 0,
        parse_failure_ids: [],
      }),
    });

    await GET(makeRequest("Bearer test-secret"));
    const [, opts] = runOnceMock.mock.calls[0];
    expect(opts).toEqual({ maxFilms: 25 });
  });

  it("returns 500 and ends the client when runOnce throws", async () => {
    runOnceMock.mockRejectedValue(new Error("pipeline boom"));

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/pipeline boom/);
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/routes/cron-refresh-prices.test.ts
```

Expected: `Cannot find module` error because `app/api/cron/refresh-prices/route.ts` doesn't exist yet.

- [ ] **Step 3: Commit the failing test**

```
git add app/tests/routes/cron-refresh-prices.test.ts
git commit -m "test(app): cron refresh-prices route handler — failing"
```

---

## Task 4: Implement the route handler

**Files:**
- Create: `app/app/api/cron/refresh-prices/route.ts`

- [ ] **Step 1: Create the route handler**

Create `/home/cthulhulemon/film_goblin/app/app/api/cron/refresh-prices/route.ts`:

```typescript
import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { runOnce } from "film-goblin-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900; // 15 min on Vercel Pro; harmless on Hobby.

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 500 },
    );
  }

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 100;
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const digest = await runOnce(client, { maxFilms });
    console.log(digest.render());
    return NextResponse.json({ ok: true, digest: digest.snapshot() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron refresh-prices failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
```

- [ ] **Step 2: Run the test to verify it passes**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/routes/cron-refresh-prices.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Typecheck + full app test suite + build**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build
```

Expected: typecheck clean, 22 tests pass (16 prior + 6 new), build succeeds with `/api/cron/refresh-prices` in the route table.

- [ ] **Step 4: Commit**

```
git add app/app/api/cron/refresh-prices/route.ts
git commit -m "feat(app): cron route handler for worker refresh-prices

GET /api/cron/refresh-prices. Checks Authorization: Bearer CRON_SECRET,
opens a pg.Client against DATABASE_URL, calls runOnce with maxFilms
(default 100, tunable via MAX_FILMS_PER_RUN env), logs the digest, and
returns { ok: true, digest: snapshot } as JSON. Captures errors to
Sentry when SENTRY_DSN is configured. Force-dynamic + nodejs runtime
so Vercel doesn't try to statically pre-render it."
```

---

## Task 5: Vercel cron config + env example

**Files:**
- Create: `app/vercel.json`
- Modify: `app/.env.local.example`

- [ ] **Step 1: Create app/vercel.json**

Create `/home/cthulhulemon/film_goblin/app/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/refresh-prices", "schedule": "0 9 * * *" }
  ]
}
```

`0 9 * * *` = every day at 09:00 UTC.

- [ ] **Step 2: Add CRON_SECRET to .env.local.example**

Read the current `.env.local.example`, then append the cron vars. Open `/home/cthulhulemon/film_goblin/app/.env.local.example`, add the following block at the end:

```
# Cron endpoint shared secret. Must match the Authorization: Bearer
# value Vercel injects on scheduled invocations. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=dev-secret

# Postgres connection string used by the cron endpoint. Usually the
# same URI as the Supabase session-pooler. For local dev, point at the
# supabase-start stack: postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL=

# Optional: cap films processed per invocation. Defaults to 100.
# MAX_FILMS_PER_RUN=100
```

- [ ] **Step 3: Commit**

```
git add app/vercel.json app/.env.local.example
git commit -m "feat(app): vercel daily cron + env example for refresh-prices

vercel.json schedules /api/cron/refresh-prices at 09:00 UTC every day
(the minimum cadence Vercel Hobby supports). .env.local.example gains
CRON_SECRET, DATABASE_URL, and an optional MAX_FILMS_PER_RUN comment
so fresh checkouts know what the endpoint needs."
```

---

## Task 6: Local end-to-end smoke

**Files:** none (verification only)

- [ ] **Step 1: Start local Supabase + apply grants**

Confirm the local stack is running with migrations + grants applied (per `app/README.md`):

```
supabase status --workdir /home/cthulhulemon/film_goblin
```

If it's down: `supabase start --workdir /home/cthulhulemon/film_goblin`. If migrations haven't been applied since the last reset, apply worker + db migrations and run the grants script in `/tmp/grants-local.sh` (same one used for sub-project 3's tests).

- [ ] **Step 2: Set local CRON_SECRET + DATABASE_URL**

Ensure `/home/cthulhulemon/film_goblin/app/.env.local` contains a `CRON_SECRET` and `DATABASE_URL`. If not, add:

```
CRON_SECRET=dev-secret
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

- [ ] **Step 3: Start Next.js dev server in one terminal**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Wait for `Ready in XXX ms`.

- [ ] **Step 4: Hit the endpoint from another terminal**

```
curl -i -H 'Authorization: Bearer dev-secret' http://localhost:3000/api/cron/refresh-prices
```

Expected: `HTTP/1.1 200 OK`, body like:
```json
{"ok":true,"digest":{"films_refreshed":100,"price_changes":N,"alerts_fired":0,...}}
```

`films_refreshed` should be between 1 and 100 depending on how many films in local DB have non-null `itunes_id` and are marked `tracking=true`.

Also verify auth rejection:
```
curl -i http://localhost:3000/api/cron/refresh-prices
curl -i -H 'Authorization: Bearer wrong' http://localhost:3000/api/cron/refresh-prices
```

Both expected: `HTTP/1.1 401 Unauthorized`.

- [ ] **Step 5: Stop the dev server**

Ctrl-C the `npm run dev` terminal.

- [ ] **Step 6: No commit**

This task is verification only; no files changed.

---

## Task 7: Deploy to Vercel staging + configure env

**Files:** none committed in this task (env values stay out of git)

- [ ] **Step 1: Generate a production CRON_SECRET**

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Save the output — you'll paste it in the next step.

- [ ] **Step 2: Add env vars to the film-goblin Vercel project**

From `/home/cthulhulemon/film_goblin/app`:

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH printf '%s' '<the-secret-from-step-1>' | vercel env add CRON_SECRET production
```

Then DATABASE_URL (URL-encode the staging Supabase password — see sub-project 3's `/tmp/migrate-staging.sh` for the encoder):

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node -e "console.log(encodeURIComponent('xaW\$AEMcY3cvv#K'))"
```

Take the encoded value and construct the URL:
```
postgresql://postgres.wktylpissdjinccbwzha:<encoded>@aws-1-us-west-1.pooler.supabase.com:5432/postgres
```

Add it:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH printf '%s' '<the-url>' | vercel env add DATABASE_URL production
```

Optional:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH printf '%s' '100' | vercel env add MAX_FILMS_PER_RUN production
```

- [ ] **Step 3: Deploy**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel --prod
```

Expected: `Production: https://film-goblin-XXX-skulldrinker.vercel.app` + `Aliased: https://film-goblin.vercel.app` in the output.

- [ ] **Step 4: Smoke test the deployed endpoint**

```
curl -i -H 'Authorization: Bearer <the-secret-from-step-1>' https://film-goblin.vercel.app/api/cron/refresh-prices
```

Expected: 200 with a JSON digest. May take 60–120 seconds (100 films worth of iTunes lookups + DB writes).

Verify a few new rows landed in staging:
```
cat > /tmp/verify-prices.sh <<'BASH'
#!/bin/bash
ENCODED_PASS=$(node -e "console.log(encodeURIComponent('xaW\$AEMcY3cvv#K'))")
export DATABASE_URL="postgresql://postgres.wktylpissdjinccbwzha:${ENCODED_PASS}@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH
node -e "const{Client}=require('/home/cthulhulemon/film_goblin/worker/node_modules/pg');const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});c.connect().then(()=>c.query('SELECT COUNT(*) FROM price_history WHERE captured_at > now() - interval ''10 minutes''')).then(r=>{console.log(r.rows[0]);c.end()}).catch(e=>{console.error(e.message);process.exit(1)})"
BASH
bash /tmp/verify-prices.sh
```

Expected: `count > 0` meaning rows were inserted in the last 10 minutes.

Also verify 401:
```
curl -i https://film-goblin.vercel.app/api/cron/refresh-prices
```
Expected: 401.

- [ ] **Step 5: Confirm Vercel scheduled the cron**

Visit https://vercel.com/skulldrinker/film-goblin/settings/cron-jobs (or the dashboard's Cron Jobs tab). Should show one job at `/api/cron/refresh-prices` scheduled daily at 09:00 UTC.

- [ ] **Step 6: No commit**

Env values live in Vercel, not git. Verify `git status` is clean.

---

## Self-Review

**Spec coverage:**

- § Architecture (npm workspace) → Tasks 1–2 ✓
- § Architecture (route handler) → Task 4 ✓
- § Architecture (Digest shape) → Route handler uses existing `digest.snapshot()` directly; no new method needed (the spec called for `toJSON()` but `snapshot()` already returns the same object). Plan reflects this ✓
- § Schedule and configuration (vercel.json) → Task 5 ✓
- § Environment variables → Tasks 5 (.env example) + 7 (Vercel production) ✓
- § Timeout strategy → Covered by `maxFilms: 100` default in Task 4 + `maxDuration = 900` export ✓
- § Failure semantics → Task 4's try/catch/finally ✓
- § Testing strategy (1) Unit test → Tasks 3–4 ✓
- § Testing strategy (2) No new pipeline tests → deliberately omitted ✓
- § Testing strategy (3) Manual smoke → Tasks 6 (local) + 7 (staging) ✓
- § Out of scope items not implemented → verified none crept in ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" strings. Each step has concrete commands, code, and expected output.

**Type consistency:** `Digest.snapshot()` is the existing method returning `DigestSnapshot`. Test's mock returns a matching shape. Route handler calls `digest.snapshot()`, body surfaces `digest.snapshot()`. Consistent across Tasks 3 and 4.

**Deviation from spec:** Spec mentioned adding `Digest.toJSON()`; plan uses the existing `Digest.snapshot()` since it already returns the same data. No new method to write. Self-review caught this as a simplification, not a gap.

---
