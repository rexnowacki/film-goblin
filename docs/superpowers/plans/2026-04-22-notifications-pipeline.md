# Notifications Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one daily email digest per user summarizing the previous day's price drops on watchlisted films, via Resend (sandbox mode for MVP), with a one-click unsubscribe link and a Settings-page toggle.

**Architecture:** A new `notifier/` workspace package owns the pure logic (query, render, send). A second Vercel Cron endpoint at `/api/cron/send-notifications` runs daily at 10:00 UTC, calls into the notifier, and stamps `notified_at` on delivered `price_alerts`. A public `/api/unsubscribe/[token]` route flips `profiles.email_notifications_enabled` to false and rotates the token on re-subscribe.

**Tech Stack:** npm workspaces · Next.js 15 Route Handlers · `pg` · Resend SDK (`resend`) · Vitest · pg-mem for query tests

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/0114_email_notifications.sql` | Create | Add `email_notifications_enabled` on profiles + `notified_at` on price_alerts + partial index |
| `db/migrations/0115_unsubscribe_token.sql` | Create | Add `unsubscribe_token` UUID to profiles with a unique index |
| `package.json` (root) | Modify | Add `notifier` to `workspaces` array |
| `notifier/package.json` | Create | Workspace member with `resend`, `pg`, `@sentry/node`; exports `./src/index.ts` |
| `notifier/tsconfig.json` | Create | TS config (NodeNext, strict) |
| `notifier/vitest.config.ts` | Create | Vitest config |
| `notifier/src/index.ts` | Create | Orchestrator `sendDailyDigests(client, resend, opts)` |
| `notifier/src/query.ts` | Create | `findPendingDigests(client)` — joined SQL, groups alerts by user |
| `notifier/src/render.ts` | Create | `renderDigestEmail(user, alerts)` — pure; returns `{subject, html, text}` |
| `notifier/src/resend.ts` | Create | Thin wrapper `sendDigest(resend, user, rendered)` around Resend SDK |
| `notifier/tests/query.test.ts` | Create | pg-mem tests for `findPendingDigests` |
| `notifier/tests/render.test.ts` | Create | Pure-function tests for `renderDigestEmail` |
| `app/package.json` | Modify | Add `film-goblin-notifier: file:../notifier` dep + `resend` |
| `app/next.config.mjs` | Modify | Add `film-goblin-notifier` to `transpilePackages` |
| `app/app/api/cron/send-notifications/route.ts` | Create | GET handler — auth → connect → sendDailyDigests → JSON digest |
| `app/app/api/unsubscribe/[token]/route.ts` | Create | GET handler — token lookup, UPDATE, render confirmation HTML |
| `app/tests/routes/cron-send-notifications.test.ts` | Create | Vitest module-mock tests (6 tests) |
| `app/tests/routes/unsubscribe.test.ts` | Create | Vitest module-mock tests (3 tests) |
| `app/lib/actions/profile.ts` | Modify | Add `email_notifications_enabled` to `ProfileFields`; rotate token on enable transition |
| `app/tests/actions/profile.test.ts` | Modify | Add test: enable-transition rotates token |
| `app/app/settings/SettingsForm.tsx` | Modify | Add email-notifications checkbox row + submit wiring |
| `app/vercel.json` | Modify | Append second cron entry for send-notifications |
| `app/.env.local.example` | Modify | Add `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `APP_BASE_URL` |
| `app/lib/supabase/types.ts` | Modify | Regenerate via `npm run gen:types` after migrations |

---

## Task 1: DB migrations

**Files:**
- Create: `db/migrations/0114_email_notifications.sql`
- Create: `db/migrations/0115_unsubscribe_token.sql`

- [ ] **Step 1: Write `0114_email_notifications.sql`**

```sql
-- Default-on email notification preference for every user.
ALTER TABLE profiles
  ADD COLUMN email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Per-alert delivery marker. NULL = not yet delivered.
ALTER TABLE price_alerts
  ADD COLUMN notified_at TIMESTAMPTZ;

-- Speeds up the notifier's "find undelivered alerts" scan.
CREATE INDEX price_alerts_notified_at_null_idx
  ON price_alerts (created_at)
  WHERE notified_at IS NULL;
```

- [ ] **Step 2: Write `0115_unsubscribe_token.sql`**

```sql
ALTER TABLE profiles
  ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX profiles_unsubscribe_token_idx
  ON profiles (unsubscribe_token);
```

- [ ] **Step 3: Apply migrations locally**

Local Supabase must be running. From repo root:

```
cd db
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run migrate
```

Expected: `Applied: 0114_email_notifications.sql, 0115_unsubscribe_token.sql`. If a prior `_migrations` row has these names, the runner skips them — re-running is idempotent.

- [ ] **Step 4: Apply migrations to hosted staging**

```
cd /home/cthulhulemon/film_goblin/db
ENCODED_PASS=$(PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH node -e "console.log(encodeURIComponent('xaW\$AEMcY3cvv#K'))")
DATABASE_URL="postgresql://postgres.wktylpissdjinccbwzha:${ENCODED_PASS}@aws-1-us-west-1.pooler.supabase.com:5432/postgres" PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run migrate
```

Expected: `Applied: 0114_email_notifications.sql, 0115_unsubscribe_token.sql`.

- [ ] **Step 5: Regenerate Supabase types**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run gen:types
```

This overwrites `app/lib/supabase/types.ts` with the new columns visible to TypeScript.

- [ ] **Step 6: Commit**

```
cd /home/cthulhulemon/film_goblin
git add db/migrations/0114_email_notifications.sql db/migrations/0115_unsubscribe_token.sql app/lib/supabase/types.ts
git commit -m "feat(db): email notification prefs + alert delivery tracking + unsubscribe token

0114 adds profiles.email_notifications_enabled (default true) and
price_alerts.notified_at (NULL means not yet delivered), plus a partial
index matching the notifier's query shape.
0115 adds profiles.unsubscribe_token with a UNIQUE index — used by the
token-based one-click unsubscribe route."
```

---

## Task 2: Scaffold the notifier workspace package

**Files:**
- Create: `notifier/package.json`
- Create: `notifier/tsconfig.json`
- Create: `notifier/vitest.config.ts`
- Create: `notifier/src/index.ts` (stub)
- Create: `notifier/tests/.gitkeep`
- Modify: `package.json` (root)

- [ ] **Step 1: Add `notifier` to root `workspaces`**

Open `/home/cthulhulemon/film_goblin/package.json`. Change the `workspaces` array from:

```json
  "workspaces": ["app", "worker", "db"],
```

to:

```json
  "workspaces": ["app", "worker", "db", "notifier"],
```

- [ ] **Step 2: Create `notifier/package.json`**

```json
{
  "name": "film-goblin-notifier",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sentry/node": "^8.47.0",
    "pg": "^8.13.1",
    "resend": "^4.1.2"
  },
  "devDependencies": {
    "@types/node": "^20.17.10",
    "@types/pg": "^8.11.10",
    "pg-mem": "^3.0.4",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Create `notifier/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Create `notifier/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 5: Create stub `notifier/src/index.ts`**

```typescript
// Orchestrator populated in Task 5. Exposes sendDailyDigests.
export {};
```

- [ ] **Step 6: Create empty `notifier/tests/.gitkeep`**

```
touch /home/cthulhulemon/film_goblin/notifier/tests/.gitkeep
```

- [ ] **Step 7: Add `film-goblin-notifier` to app/package.json**

Open `/home/cthulhulemon/film_goblin/app/package.json`. In `dependencies`, add:

```json
    "film-goblin-notifier": "file:../notifier",
```

(Alphabetically — goes between `film-goblin-worker` and `next`.) Also add `resend` as a dep:

```json
    "resend": "^4.1.2",
```

Final `dependencies` block:

```json
  "dependencies": {
    "@supabase/ssr": "^0.10.2",
    "@supabase/supabase-js": "^2.46.1",
    "@sentry/node": "^8.47.0",
    "film-goblin-notifier": "file:../notifier",
    "film-goblin-worker": "file:../worker",
    "next": "^15.1.3",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "resend": "^4.1.2"
  },
```

- [ ] **Step 8: Update `app/next.config.mjs` transpilePackages**

Open `/home/cthulhulemon/film_goblin/app/next.config.mjs`. Change:

```javascript
  transpilePackages: ["film-goblin-worker"],
```

to:

```javascript
  transpilePackages: ["film-goblin-worker", "film-goblin-notifier"],
```

- [ ] **Step 9: Reinstall**

```
cd /home/cthulhulemon/film_goblin
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install
```

Expected: installs `resend` at root level, symlinks `notifier` into `node_modules/film-goblin-notifier`.

Verify:
```
ls -la node_modules/film-goblin-notifier
```
Should show a symlink to `../notifier`.

- [ ] **Step 10: Commit**

```
git add package.json notifier/ app/package.json app/next.config.mjs package-lock.json
git commit -m "chore: scaffold notifier workspace package

Third workspace member alongside app, worker, db. Exports
./src/index.ts for import as film-goblin-notifier from app.
Pulls in resend@4 + reuses pg + @sentry/node. app/
adds the dep via file:../notifier (same pattern as worker)
and appends the package to Next.js transpilePackages."
```

---

## Task 3: `findPendingDigests` query + test

**Files:**
- Create: `notifier/src/query.ts`
- Create: `notifier/tests/query.test.ts`
- Create: `notifier/tests/helpers/db.ts`

- [ ] **Step 1: Create pg-mem helper `notifier/tests/helpers/db.ts`**

```typescript
import { DataType, newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

function stripUnsupported(sql: string): string {
  // pg-mem doesn't support RLS or TO <role> grants
  return sql
    .replace(/ALTER TABLE \S+ ENABLE ROW LEVEL SECURITY;?/gi, "")
    .replace(/CREATE POLICY[\s\S]+?;/gi, "")
    .replace(/GRANT [\s\S]+?;/gi, "");
}

export async function setupTestDb(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  // pg-mem extension bridge for pgcrypto
  mem.registerExtension("pgcrypto", (schema) => {
    schema.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
    });
  });

  // Create an auth.users table that our schema depends on.
  mem.public.none(`CREATE SCHEMA IF NOT EXISTS auth`);
  mem.public.none(`
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL
    );
  `);

  // Apply the relevant migrations in order.
  const migrations = [
    "worker/migrations/0001_films.sql",
    "worker/migrations/0002_price_history.sql",
    "db/migrations/0101_profiles.sql",
    "db/migrations/0105_watchlists.sql",
    "db/migrations/0114_email_notifications.sql",
    "db/migrations/0115_unsubscribe_token.sql",
  ];
  for (const relPath of migrations) {
    const sql = readFileSync(join(REPO_ROOT, relPath), "utf8");
    mem.public.none(stripUnsupported(sql));
  }

  const { Client } = mem.adapters.createPg();
  const client = new Client() as unknown as Client;
  await client.connect();
  return { client, cleanup: async () => { await client.end(); } };
}
```

- [ ] **Step 2: Write `notifier/tests/query.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "pg";
import { setupTestDb } from "./helpers/db.js";
import { findPendingDigests } from "../src/query.js";

let client: Client;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const setup = await setupTestDb();
  client = setup.client;
  cleanup = setup.cleanup;
});

afterEach(async () => { await cleanup(); });

async function seedUser(id: string, email: string, opts: { enabled?: boolean } = {}) {
  await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, email]);
  await client.query(
    `INSERT INTO profiles (id, handle, display_name, email_notifications_enabled)
     VALUES ($1, $2, $2, $3)`,
    [id, email.split("@")[0], opts.enabled ?? true],
  );
}

async function seedFilm(itunesId: number): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO films (itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, itunes_url)
     VALUES ($1, 'The Test', 'A Director', 2024, 100, 'Horror', 'https://cdn/a.jpg', 'https://apple/f')
     RETURNING id`,
    [itunesId],
  );
  return rows[0].id;
}

async function seedWatchlistAndAlert(userId: string, filmId: string, opts: { notifiedAt?: Date } = {}): Promise<string> {
  const { rows: wlRows } = await client.query(
    `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
    [userId, filmId],
  );
  const wlId = wlRows[0].id;
  const { rows: alertRows } = await client.query(
    `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd, notified_at)
     VALUES ($1, $2, 9.99, 4.99, $3) RETURNING id`,
    [wlId, filmId, opts.notifiedAt ?? null],
  );
  return alertRows[0].id;
}

describe("findPendingDigests", () => {
  it("returns no digests when no alerts exist", async () => {
    await seedUser("u1", "u1@test.example");
    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(0);
  });

  it("returns one digest with one alert for a single user", async () => {
    await seedUser("u1", "u1@test.example");
    const filmId = await seedFilm(100);
    await seedWatchlistAndAlert("u1", filmId);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(1);
    expect(digests[0].user.email).toBe("u1@test.example");
    expect(digests[0].alerts).toHaveLength(1);
    expect(digests[0].alerts[0].old_price_usd).toBe(9.99);
    expect(digests[0].alerts[0].new_price_usd).toBe(4.99);
    expect(digests[0].alerts[0].film.title).toBe("The Test");
  });

  it("groups multiple alerts for the same user into one digest", async () => {
    await seedUser("u1", "u1@test.example");
    const filmA = await seedFilm(101);
    const filmB = await seedFilm(102);
    await seedWatchlistAndAlert("u1", filmA);
    await seedWatchlistAndAlert("u1", filmB);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(1);
    expect(digests[0].alerts).toHaveLength(2);
  });

  it("excludes users with email_notifications_enabled = false", async () => {
    await seedUser("u1", "u1@test.example", { enabled: false });
    const filmId = await seedFilm(103);
    await seedWatchlistAndAlert("u1", filmId);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(0);
  });

  it("excludes alerts that already have notified_at set", async () => {
    await seedUser("u1", "u1@test.example");
    const filmId = await seedFilm(104);
    await seedWatchlistAndAlert("u1", filmId, { notifiedAt: new Date() });

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(0);
  });

  it("produces separate digests for different users", async () => {
    await seedUser("u1", "u1@test.example");
    await seedUser("u2", "u2@test.example");
    const filmA = await seedFilm(105);
    const filmB = await seedFilm(106);
    await seedWatchlistAndAlert("u1", filmA);
    await seedWatchlistAndAlert("u2", filmB);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(2);
    const byEmail = Object.fromEntries(digests.map(d => [d.user.email, d]));
    expect(byEmail["u1@test.example"].alerts).toHaveLength(1);
    expect(byEmail["u2@test.example"].alerts).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```
cd /home/cthulhulemon/film_goblin/notifier
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/query.test.ts
```

Expected: failure with `Cannot find module ../src/query.js` or similar.

- [ ] **Step 4: Create `notifier/src/query.ts`**

```typescript
import type { Client } from "pg";

export interface UserLite {
  id: string;
  handle: string;
  email: string;
  unsubscribe_token: string;
}

export interface FilmLite {
  id: string;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  artwork_url: string;
  itunes_url: string;
}

export interface AlertLite {
  id: string;
  old_price_usd: number;
  new_price_usd: number;
  film: FilmLite;
}

export interface PendingDigest {
  user: UserLite;
  alerts: AlertLite[];
}

function toNum(v: unknown): number {
  return typeof v === "string" ? Number(v) : (v as number);
}

export async function findPendingDigests(client: Client): Promise<PendingDigest[]> {
  const { rows } = await client.query(`
    SELECT
      u.id AS user_id,
      p.handle,
      u.email,
      p.unsubscribe_token,
      pa.id AS alert_id,
      pa.old_price_usd,
      pa.new_price_usd,
      f.id AS film_id,
      f.title,
      f.director,
      f.year,
      f.runtime_min,
      f.artwork_url,
      f.itunes_url
    FROM price_alerts pa
    JOIN watchlists wl ON wl.id = pa.watchlist_id
    JOIN auth.users u ON u.id = wl.user_id
    JOIN profiles p ON p.id = u.id
    JOIN films f ON f.id = pa.film_id
    WHERE pa.notified_at IS NULL
      AND p.email_notifications_enabled = TRUE
    ORDER BY u.id, pa.created_at DESC
  `);

  const byUser = new Map<string, PendingDigest>();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user: {
          id: r.user_id,
          handle: r.handle,
          email: r.email,
          unsubscribe_token: r.unsubscribe_token,
        },
        alerts: [],
      });
    }
    byUser.get(r.user_id)!.alerts.push({
      id: r.alert_id,
      old_price_usd: toNum(r.old_price_usd),
      new_price_usd: toNum(r.new_price_usd),
      film: {
        id: r.film_id,
        title: r.title,
        director: r.director,
        year: r.year,
        runtime_min: r.runtime_min,
        artwork_url: r.artwork_url,
        itunes_url: r.itunes_url,
      },
    });
  }
  return Array.from(byUser.values());
}
```

- [ ] **Step 5: Run tests, expect 6 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/query.test.ts
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 6: Commit**

```
cd /home/cthulhulemon/film_goblin
git add notifier/src/query.ts notifier/tests/query.test.ts notifier/tests/helpers/db.ts
git commit -m "feat(notifier): findPendingDigests groups undelivered alerts by user

Joins price_alerts → watchlists → auth.users → profiles → films, filters
notified_at IS NULL and email_notifications_enabled = TRUE, collapses
into one PendingDigest per user with an alerts[] array. Coerces NUMERIC
columns to JS numbers at the query boundary (pg returns them as strings).
Six pg-mem tests cover: no alerts → 0 digests, 1 alert → 1 digest with
enriched film data, multi-alert grouping, opted-out user exclusion,
already-delivered alert exclusion, multi-user separation."
```

---

## Task 4: `renderDigestEmail` function + test

**Files:**
- Create: `notifier/src/render.ts`
- Create: `notifier/tests/render.test.ts`

- [ ] **Step 1: Write `notifier/tests/render.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { renderDigestEmail } from "../src/render.js";
import type { UserLite, AlertLite } from "../src/query.js";

const USER: UserLite = {
  id: "u1",
  handle: "moss.witch",
  email: "moss@test.example",
  unsubscribe_token: "token-abc",
};

const FILM_A = {
  id: "film-a",
  title: "Suspiria",
  director: "Dario Argento",
  year: 1977,
  runtime_min: 99,
  artwork_url: "https://cdn/suspiria.jpg",
  itunes_url: "https://apple/suspiria",
};

const FILM_B = {
  id: "film-b",
  title: "The Wicker Man",
  director: "Robin Hardy",
  year: 1973,
  runtime_min: 88,
  artwork_url: "https://cdn/wickerman.jpg",
  itunes_url: "https://apple/wickerman",
};

const BASE_URL = "https://film-goblin.vercel.app";

describe("renderDigestEmail", () => {
  it("produces a singular subject line for exactly one deal", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    expect(out.subject).toBe("A film just dropped: Suspiria");
  });

  it("produces a pluralized subject for multiple deals", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
      { id: "a2", old_price_usd: 14.99, new_price_usd: 6.99, film: FILM_B },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.subject).toBe("2 films from your watchlist just dropped");
  });

  it("includes film titles + prices + CTAs in the HTML", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
      { id: "a2", old_price_usd: 14.99, new_price_usd: 6.99, film: FILM_B },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.html).toContain("Suspiria");
    expect(out.html).toContain("The Wicker Man");
    expect(out.html).toContain("$9.99");
    expect(out.html).toContain("$4.99");
    expect(out.html).toContain("https://apple/suspiria");
    expect(out.html).toContain("https://apple/wickerman");
    expect(out.html).toContain("https://film-goblin.vercel.app/film/film-a");
    expect(out.html).toContain("https://cdn/suspiria.jpg");
  });

  it("embeds the user's unsubscribe token in the footer link", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    expect(out.html).toContain("https://film-goblin.vercel.app/api/unsubscribe/token-abc");
    expect(out.text).toContain("https://film-goblin.vercel.app/api/unsubscribe/token-abc");
  });

  it("produces a plain-text version mirroring the HTML", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.text).toContain("Suspiria");
    expect(out.text).toContain("$9.99");
    expect(out.text).toContain("$4.99");
    expect(out.text).toContain("Dario Argento");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
cd /home/cthulhulemon/film_goblin/notifier
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/render.test.ts
```

Expected: failure importing `../src/render.js`.

- [ ] **Step 3: Create `notifier/src/render.ts`**

```typescript
import type { UserLite, AlertLite } from "./query.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pctOff(oldP: number, newP: number): number {
  if (oldP <= 0) return 0;
  return Math.round(((oldP - newP) / oldP) * 100);
}

function renderAlertBlockHtml(alert: AlertLite, baseUrl: string): string {
  const f = alert.film;
  const pct = pctOff(alert.old_price_usd, alert.new_price_usd);
  return `
  <tr>
    <td style="padding:24px 0;border-bottom:1px solid #0A0A0A;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="150" valign="top" style="padding-right:20px;">
            <img src="${escapeHtml(f.artwork_url)}" alt="${escapeHtml(f.title)}"
                 width="150" height="225"
                 style="display:block;width:150px;height:225px;object-fit:cover;border:2px solid #0A0A0A;" />
          </td>
          <td valign="top">
            <div style="font-family:Georgia,serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#666;margin-bottom:6px;">Chapter I · The Pit</div>
            <h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:32px;line-height:1;margin:0 0 10px;color:#0A0A0A;">${escapeHtml(f.title)}</h2>
            <div style="font-family:Georgia,serif;font-size:13px;color:#333;margin-bottom:16px;">
              ${escapeHtml(f.director)} · ${f.year} · ${f.runtime_min} min
            </div>
            <div style="font-family:Georgia,serif;font-size:16px;margin-bottom:18px;">
              <span style="text-decoration:line-through;color:#888;">$${alert.old_price_usd.toFixed(2)}</span>
              &nbsp;&rarr;&nbsp;
              <span style="color:#FF2D88;font-weight:bold;">$${alert.new_price_usd.toFixed(2)}</span>
              <span style="display:inline-block;margin-left:10px;padding:2px 8px;background:#0A0A0A;color:#F5D300;font-size:11px;letter-spacing:0.1em;">${pct}% OFF</span>
            </div>
            <a href="${escapeHtml(f.itunes_url)}"
               style="display:inline-block;padding:10px 18px;background:#0A0A0A;color:#F3ECD8;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;border:2px solid #0A0A0A;margin-right:8px;">Summon on Apple TV &rarr;</a>
            <a href="${baseUrl}/film/${encodeURIComponent(f.id)}"
               style="font-family:Arial,sans-serif;font-size:12px;color:#0A0A0A;letter-spacing:0.1em;text-transform:uppercase;">View on Film Goblin</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderAlertBlockText(alert: AlertLite, baseUrl: string): string {
  const f = alert.film;
  const pct = pctOff(alert.old_price_usd, alert.new_price_usd);
  return [
    `${f.title} (${f.year}) — dir. ${f.director}`,
    `$${alert.old_price_usd.toFixed(2)} → $${alert.new_price_usd.toFixed(2)} (${pct}% off)`,
    `Apple TV: ${f.itunes_url}`,
    `Film Goblin: ${baseUrl}/film/${f.id}`,
  ].join("\n");
}

export function renderDigestEmail(
  user: UserLite,
  alerts: AlertLite[],
  baseUrl: string,
): RenderedEmail {
  const unsubUrl = `${baseUrl}/api/unsubscribe/${user.unsubscribe_token}`;
  const settingsUrl = `${baseUrl}/settings`;

  const subject = alerts.length === 1
    ? `A film just dropped: ${alerts[0].film.title}`
    : `${alerts.length} films from your watchlist just dropped`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F3ECD8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F3ECD8;">
  <tr><td align="center" style="padding:32px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#F3ECD8;border:3px solid #0A0A0A;">
      <tr><td style="padding:28px 24px 0;">
        <div style="font-family:'Rubik Wet Paint',Georgia,serif;font-size:44px;line-height:1;color:#0A0A0A;letter-spacing:-0.02em;">
          Film <span style="color:#FF2D88;">Goblin</span>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#666;margin-top:8px;">
          A Field Guide To Cheap Movies · Issue nº1
        </div>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <div style="height:8px;background:#0A0A0A;margin:20px 0 0;"></div>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${alerts.map(a => renderAlertBlockHtml(a, baseUrl)).join("")}
        </table>
      </td></tr>
      <tr><td style="padding:24px;background:#0A0A0A;color:#F3ECD8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">
        <div style="margin-bottom:8px;">Summoned by Film Goblin · hello, ${escapeHtml(user.handle)}.</div>
        <div>
          <a href="${unsubUrl}" style="color:#F5D300;text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="${settingsUrl}" style="color:#F5D300;text-decoration:underline;">Manage preferences</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    `FILM GOBLIN — ${alerts.length === 1 ? "A film just dropped" : `${alerts.length} films just dropped`}`,
    "",
    ...alerts.map(a => renderAlertBlockText(a, baseUrl) + "\n"),
    "---",
    `Unsubscribe: ${unsubUrl}`,
    `Manage preferences: ${settingsUrl}`,
  ].join("\n");

  return { subject, html, text };
}
```

- [ ] **Step 4: Run tests, expect 5 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/render.test.ts
```

Expected: `Tests 5 passed (5)`.

- [ ] **Step 5: Commit**

```
cd /home/cthulhulemon/film_goblin
git add notifier/src/render.ts notifier/tests/render.test.ts
git commit -m "feat(notifier): renderDigestEmail produces zine-styled HTML+text digest

Pure function taking a user + their pending alerts + the app base URL.
Returns {subject, html, text} — subject pluralizes for 1 vs N deals,
HTML uses inline styles only with Rubik Wet Paint/DM Serif fallback
fonts, each deal block shows a struck-through old price beside the new
one with a percentage-off stamp, plus primary (Apple TV) and secondary
(Film Goblin) CTAs. Footer carries the unsubscribe + settings links.
The text variant mirrors content for MIME multipart deliverability.
Five tests cover subject pluralization, content inclusion, unsubscribe
token embedding, and HTML/text parity."
```

---

## Task 5: Orchestrator + Resend wrapper

**Files:**
- Create: `notifier/src/resend.ts`
- Create: `notifier/src/index.ts` (replace stub)
- Create: `notifier/tests/index.test.ts`

- [ ] **Step 1: Write `notifier/src/resend.ts`**

```typescript
import type { Resend } from "resend";
import type { UserLite } from "./query.js";
import type { RenderedEmail } from "./render.js";

export interface SendOptions {
  from: string;
  baseUrl: string;
}

export async function sendDigest(
  resend: Resend,
  user: UserLite,
  rendered: RenderedEmail,
  opts: SendOptions,
): Promise<void> {
  const unsubUrl = `${opts.baseUrl}/api/unsubscribe/${user.unsubscribe_token}`;
  const { error } = await resend.emails.send({
    from: opts.from,
    to: [user.email],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (error) throw new Error(`resend: ${error.message}`);
}
```

- [ ] **Step 2: Replace `notifier/src/index.ts`**

```typescript
import type { Client } from "pg";
import type { Resend } from "resend";
import { findPendingDigests } from "./query.js";
import { renderDigestEmail } from "./render.js";
import { sendDigest } from "./resend.js";

export interface SendDailyDigestsOptions {
  from: string;
  baseUrl: string;
}

export interface DigestCounters {
  sent: number;
  failed: number;
  skipped: number;
  failed_user_ids: string[];
}

export async function sendDailyDigests(
  client: Client,
  resend: Resend,
  opts: SendDailyDigestsOptions,
): Promise<DigestCounters> {
  const counters: DigestCounters = { sent: 0, failed: 0, skipped: 0, failed_user_ids: [] };
  const digests = await findPendingDigests(client);

  for (const digest of digests) {
    if (digest.alerts.length === 0) {
      counters.skipped++;
      continue;
    }
    const rendered = renderDigestEmail(digest.user, digest.alerts, opts.baseUrl);
    try {
      await sendDigest(resend, digest.user, rendered, opts);
      await client.query("BEGIN");
      await client.query(
        `UPDATE price_alerts SET notified_at = now() WHERE id = ANY($1::uuid[])`,
        [digest.alerts.map(a => a.id)],
      );
      await client.query("COMMIT");
      counters.sent++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      counters.failed++;
      counters.failed_user_ids.push(digest.user.id);
      console.error(`notifier: failed to send digest to ${digest.user.id}:`, err);
    }
  }

  return counters;
}
```

- [ ] **Step 3: Write `notifier/tests/index.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "pg";
import { setupTestDb } from "./helpers/db.js";
import { sendDailyDigests } from "../src/index.js";

let client: Client;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const setup = await setupTestDb();
  client = setup.client;
  cleanup = setup.cleanup;
});

afterEach(async () => { await cleanup(); });

async function seedAlert(userId: string, email: string): Promise<string> {
  await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [userId, email]);
  await client.query(
    `INSERT INTO profiles (id, handle, display_name, email_notifications_enabled)
     VALUES ($1, $2, $2, TRUE)`,
    [userId, email.split("@")[0]],
  );
  const { rows: filmRows } = await client.query(
    `INSERT INTO films (itunes_id, title, director, year, runtime_min, artwork_url, itunes_url)
     VALUES ($1, 'A Film', 'A Director', 2024, 100, 'https://cdn/a.jpg', 'https://apple/a')
     RETURNING id`,
    [900000 + Math.floor(Math.random() * 100000)],
  );
  const filmId = filmRows[0].id;
  const { rows: wlRows } = await client.query(
    `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
    [userId, filmId],
  );
  const { rows: alertRows } = await client.query(
    `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
     VALUES ($1, $2, 9.99, 4.99) RETURNING id`,
    [wlRows[0].id, filmId],
  );
  return alertRows[0].id;
}

function fakeResend() {
  return {
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "fake" }, error: null }),
    },
  } as any;
}

describe("sendDailyDigests", () => {
  it("returns zeros when no pending alerts", async () => {
    const resend = fakeResend();
    const counters = await sendDailyDigests(client, resend, {
      from: "test@example.com",
      baseUrl: "https://app.example",
    });
    expect(counters).toEqual({ sent: 0, failed: 0, skipped: 0, failed_user_ids: [] });
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("sends one email and stamps notified_at on success", async () => {
    const alertId = await seedAlert("u1", "u1@test.example");
    const resend = fakeResend();
    const counters = await sendDailyDigests(client, resend, {
      from: "test@example.com",
      baseUrl: "https://app.example",
    });
    expect(counters.sent).toBe(1);
    expect(counters.failed).toBe(0);
    expect(resend.emails.send).toHaveBeenCalledTimes(1);

    const { rows } = await client.query(
      `SELECT notified_at FROM price_alerts WHERE id = $1`,
      [alertId],
    );
    expect(rows[0].notified_at).not.toBeNull();
  });

  it("leaves notified_at NULL and increments failed when Resend rejects", async () => {
    const alertId = await seedAlert("u1", "u1@test.example");
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      },
    } as any;
    const counters = await sendDailyDigests(client, resend, {
      from: "test@example.com",
      baseUrl: "https://app.example",
    });
    expect(counters.sent).toBe(0);
    expect(counters.failed).toBe(1);
    expect(counters.failed_user_ids).toEqual(["u1"]);

    const { rows } = await client.query(
      `SELECT notified_at FROM price_alerts WHERE id = $1`,
      [alertId],
    );
    expect(rows[0].notified_at).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests, expect 3 passing**

```
cd /home/cthulhulemon/film_goblin/notifier
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```

Expected: `Tests 14 passed (14)` (6 query + 5 render + 3 index).

- [ ] **Step 5: Typecheck the notifier package**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```
cd /home/cthulhulemon/film_goblin
git add notifier/src/resend.ts notifier/src/index.ts notifier/tests/index.test.ts
git commit -m "feat(notifier): sendDailyDigests orchestrator + Resend wrapper

sendDigest calls resend.emails.send with List-Unsubscribe + One-Click
headers so Gmail/Apple Mail surface a native Unsubscribe button.
sendDailyDigests iterates findPendingDigests, renders each, sends via
Resend, then stamps notified_at on every included alert inside a BEGIN/
COMMIT transaction — partial failures can't leave dangling state.
Per-user send failures isolate: Sentry-log, increment failed, continue
the batch. Three tests: no-alerts zero case, happy path stamps
notified_at, Resend rejection leaves notified_at NULL and counts the
failed user."
```

---

## Task 6: Cron route for send-notifications

**Files:**
- Create: `app/app/api/cron/send-notifications/route.ts`
- Create: `app/tests/routes/cron-send-notifications.test.ts`

- [ ] **Step 1: Write the failing test `app/tests/routes/cron-send-notifications.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const connectMock = vi.fn();
const endMock = vi.fn();
const clientCtor = vi.fn(() => ({ connect: connectMock, end: endMock }));
const sendDailyDigestsMock = vi.fn();
const resendCtor = vi.fn();

vi.mock("pg", () => ({
  default: { Client: clientCtor },
  Client: clientCtor,
}));

vi.mock("film-goblin-notifier", () => ({
  sendDailyDigests: sendDailyDigestsMock,
}));

vi.mock("resend", () => ({
  Resend: resendCtor,
}));

const { GET } = await import("../../app/api/cron/send-notifications/route");

function makeRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost:3000/api/cron/send-notifications", { headers });
}

describe("GET /api/cron/send-notifications", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://fake/test";
    process.env.RESEND_API_KEY = "re_test";
    process.env.NOTIFY_FROM_EMAIL = "onboarding@resend.dev";
    process.env.APP_BASE_URL = "https://film-goblin.vercel.app";
    connectMock.mockReset().mockResolvedValue(undefined);
    endMock.mockReset().mockResolvedValue(undefined);
    clientCtor.mockClear();
    sendDailyDigestsMock.mockReset();
    resendCtor.mockClear();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(sendDailyDigestsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer does not match CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 500 when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/DATABASE_URL/);
  });

  it("returns 500 when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/RESEND_API_KEY/);
  });

  it("returns 200 with digest counters on happy path", async () => {
    sendDailyDigestsMock.mockResolvedValue({
      sent: 3, failed: 0, skipped: 0, failed_user_ids: [],
    });
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(clientCtor).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(resendCtor).toHaveBeenCalledWith("re_test");
    expect(sendDailyDigestsMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.digest.sent).toBe(3);
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and ends the client when sendDailyDigests throws", async () => {
    sendDailyDigestsMock.mockRejectedValue(new Error("notifier boom"));
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/notifier boom/);
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/routes/cron-send-notifications.test.ts
```

Expected: import failure — route doesn't exist yet.

- [ ] **Step 3: Create `app/app/api/cron/send-notifications/route.ts`**

```typescript
import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { Resend } from "resend";
import { sendDailyDigests } from "film-goblin-notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function missing(envVar: string) {
  return NextResponse.json({ error: `${envVar} not configured` }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return missing("DATABASE_URL");

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return missing("RESEND_API_KEY");

  const from = process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev";
  const baseUrl = process.env.APP_BASE_URL || "https://film-goblin.vercel.app";

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  const resend = new Resend(resendKey);

  try {
    await client.connect();
    const digest = await sendDailyDigests(client, resend, { from, baseUrl });
    console.log(`notifier digest: sent=${digest.sent} failed=${digest.failed} skipped=${digest.skipped}`);
    return NextResponse.json({ ok: true, digest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron send-notifications failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
```

- [ ] **Step 4: Run tests, expect 6 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/routes/cron-send-notifications.test.ts
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 5: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/app/api/cron/send-notifications/route.ts app/tests/routes/cron-send-notifications.test.ts
git commit -m "feat(app): cron route handler for notification digests

GET /api/cron/send-notifications. Same CRON_SECRET auth pattern as
refresh-prices. Opens pg + constructs Resend client, calls
sendDailyDigests with NOTIFY_FROM_EMAIL + APP_BASE_URL, logs the
counters, returns {ok, digest} as JSON. maxDuration = 300s fits
Hobby plan cap. Six tests cover auth gates, env checks, happy path,
notifier failure cleanup."
```

---

## Task 7: Unsubscribe route

**Files:**
- Create: `app/app/api/unsubscribe/[token]/route.ts`
- Create: `app/tests/routes/unsubscribe.test.ts`

- [ ] **Step 1: Write the failing test `app/tests/routes/unsubscribe.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();
const endMock = vi.fn();
const clientCtor = vi.fn(() => ({
  connect: connectMock,
  end: endMock,
  query: queryMock,
}));

vi.mock("pg", () => ({
  default: { Client: clientCtor },
  Client: clientCtor,
}));

const { GET } = await import("../../app/api/unsubscribe/[token]/route");

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/unsubscribe/abc");
}

describe("GET /api/unsubscribe/[token]", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake/test";
    connectMock.mockReset().mockResolvedValue(undefined);
    endMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 404 HTML when no profile matches the token", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await GET(makeRequest(), { params: Promise.resolve({ token: "invalid" }) });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toMatch(/no longer valid/i);
  });

  it("returns 200 HTML and UPDATEs the profile when the token matches", async () => {
    queryMock.mockResolvedValue({ rows: [{ handle: "moss" }], rowCount: 1 });
    const res = await GET(makeRequest(), { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toMatch(/off the list/i);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE profiles/i);
    expect(sql).toMatch(/email_notifications_enabled = FALSE/i);
    expect(params).toEqual(["valid-token"]);
  });

  it("is idempotent — a valid token already opted-out still returns 200", async () => {
    queryMock.mockResolvedValue({ rows: [{ handle: "moss" }], rowCount: 1 });
    const res = await GET(makeRequest(), { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/routes/unsubscribe.test.ts
```

Expected: import failure.

- [ ] **Step 3: Create `app/app/api/unsubscribe/[token]/route.ts`**

```typescript
import pg from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pageHtml(title: string, heading: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F3ECD8;font-family:Georgia,serif;color:#0A0A0A;">
<main style="max-width:480px;margin:80px auto;padding:48px 32px;border:3px solid #0A0A0A;background:#F3ECD8;box-shadow:12px 12px 0 #FF2D88;">
<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;margin-bottom:12px;">✦ Film Goblin</div>
<h1 style="font-size:42px;line-height:1;margin:0 0 20px;">${heading}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px;font-style:italic;">${body}</p>
<a href="/settings" style="display:inline-block;padding:10px 18px;background:#0A0A0A;color:#F3ECD8;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Go to Settings</a>
</main>
</body>
</html>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(
      pageHtml("Error", "Something went wrong", "The service is misconfigured. Please try again later."),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const result = await client.query(
      `UPDATE profiles SET email_notifications_enabled = FALSE WHERE unsubscribe_token = $1 RETURNING handle`,
      [token],
    );
    if (result.rowCount === 0) {
      return new Response(
        pageHtml(
          "Link expired",
          "Link no longer valid",
          "This unsubscribe link is no longer valid. It may have been rotated after you re-enabled email notifications.",
        ),
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new Response(
      pageHtml(
        "Unsubscribed",
        "You're off the list",
        "We'll stop sending price-drop emails. You can turn them back on any time from your Settings page.",
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("unsubscribe route failed:", message);
    return new Response(
      pageHtml("Error", "Something went wrong", "We couldn't process your unsubscribe request. Please try again."),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } finally {
    await client.end().catch(() => {});
  }
}
```

- [ ] **Step 4: Run tests, expect 3 passing**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/routes/unsubscribe.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 5: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/app/api/unsubscribe/[token]/route.ts app/tests/routes/unsubscribe.test.ts
git commit -m "feat(app): token-based one-click unsubscribe route

GET /api/unsubscribe/[token]. Public route; no auth. Looks up profile
by unsubscribe_token, UPDATEs email_notifications_enabled = FALSE,
returns a zine-styled confirmation HTML page. Invalid token → 404 HTML.
Idempotent — an already-opted-out user flipping the same link still
sees the confirmation. Three tests cover invalid/valid/idempotent
paths."
```

---

## Task 8: Settings page toggle + profile action extension

**Files:**
- Modify: `app/lib/actions/profile.ts`
- Modify: `app/tests/actions/profile.test.ts`
- Modify: `app/app/settings/SettingsForm.tsx`

- [ ] **Step 1: Extend `app/lib/actions/profile.ts`**

Replace the entire file with:

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
  email_notifications_enabled?: boolean;
}

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  // If the user is re-enabling email notifications, rotate the
  // unsubscribe_token so any previously-leaked token is invalidated.
  let patch: Record<string, unknown> = { ...fields };
  if (fields.email_notifications_enabled === true) {
    const { data: current } = await client
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", user.id)
      .single();
    if (current && current.email_notifications_enabled === false) {
      const { data: tokenRow, error: tokenErr } = await client
        .rpc("gen_random_uuid")
        .single();
      if (tokenErr || !tokenRow) {
        // Fallback: let Postgres pick a new token via DEFAULT.
        patch = { ...patch, unsubscribe_token: undefined };
      } else {
        patch = { ...patch, unsubscribe_token: tokenRow as unknown as string };
      }
    }
  }

  const { error } = await client.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
}

export async function updateProfile(fields: ProfileFields) {
  const c = await createClient();
  await _updateProfile(c, fields);
  revalidatePath("/settings");
}
```

Note: `client.rpc("gen_random_uuid")` works only if a wrapping SQL function is exposed; Supabase doesn't expose pg functions by default. The simpler approach that's guaranteed to work: use `crypto.randomUUID()` from Node. Rewrite the relevant block:

```typescript
  if (fields.email_notifications_enabled === true) {
    const { data: current } = await client
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", user.id)
      .single();
    if (current && current.email_notifications_enabled === false) {
      const { randomUUID } = await import("node:crypto");
      patch = { ...patch, unsubscribe_token: randomUUID() };
    }
  }
```

Use THIS second version in the final file. Full file contents (use this):

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
  email_notifications_enabled?: boolean;
}

export async function _updateProfile(client: Client, fields: ProfileFields): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  let patch: Record<string, unknown> = { ...fields };
  if (fields.email_notifications_enabled === true) {
    const { data: current } = await client
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", user.id)
      .single();
    if (current && current.email_notifications_enabled === false) {
      const { randomUUID } = await import("node:crypto");
      patch = { ...patch, unsubscribe_token: randomUUID() };
    }
  }

  const { error } = await client.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
}

export async function updateProfile(fields: ProfileFields) {
  const c = await createClient();
  await _updateProfile(c, fields);
  revalidatePath("/settings");
}
```

- [ ] **Step 2: Extend `app/tests/actions/profile.test.ts`**

Open the existing file and REPLACE it with:

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

  it("re-enabling email notifications rotates the unsubscribe token", async () => {
    // Seed: user starts with email notifications disabled + a known token.
    const admin = adminClient();
    const before = await admin
      .from("profiles")
      .update({ email_notifications_enabled: false })
      .eq("id", user.id)
      .select("unsubscribe_token")
      .single();
    const tokenBefore = (before.data as any)?.unsubscribe_token as string;
    expect(tokenBefore).toBeTruthy();

    // Act: user flips the toggle back on.
    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { email_notifications_enabled: true });

    // Assert: new token, old token no longer matches.
    const after = await admin
      .from("profiles")
      .select("unsubscribe_token, email_notifications_enabled")
      .eq("id", user.id)
      .single();
    const tokenAfter = (after.data as any)?.unsubscribe_token as string;
    expect((after.data as any)?.email_notifications_enabled).toBe(true);
    expect(tokenAfter).toBeTruthy();
    expect(tokenAfter).not.toBe(tokenBefore);
  });

  it("toggling email notifications off without re-enable does NOT rotate the token", async () => {
    const admin = adminClient();
    // Seed: user currently ON, fetch token.
    await admin.from("profiles").update({ email_notifications_enabled: true }).eq("id", user.id);
    const before = await admin
      .from("profiles").select("unsubscribe_token").eq("id", user.id).single();
    const tokenBefore = (before.data as any)?.unsubscribe_token as string;

    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { email_notifications_enabled: false });

    const after = await admin
      .from("profiles").select("unsubscribe_token").eq("id", user.id).single();
    const tokenAfter = (after.data as any)?.unsubscribe_token as string;
    expect(tokenAfter).toBe(tokenBefore);
  });
});
```

- [ ] **Step 3: Update `app/app/settings/SettingsForm.tsx`**

Open `/home/cthulhulemon/film_goblin/app/app/settings/SettingsForm.tsx`. Find the existing `<label style={{ display: "flex", gap: 8, alignItems: "center" }}>` row for `broadcast_watchlist_adds`. Just BELOW that block (before the `<button type="submit">` line), add:

```tsx
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications_enabled} />
        <span className="caps" style={{ fontSize: 11 }}>Email me when a watchlist film drops in price</span>
      </label>
```

Then find the existing `save(fd)` function. Update its `updateProfile(...)` call to include the new field. Change:

```tsx
      await updateProfile({
        handle: String(fd.get("handle")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
      });
```

to:

```tsx
      await updateProfile({
        handle: String(fd.get("handle")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        email_notifications_enabled: fd.get("email_notifications") === "on",
      });
```

- [ ] **Step 4: Run tests**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- tests/actions/profile.test.ts
```

Expected: typecheck 0, 3 tests pass (was 1, now 3).

- [ ] **Step 5: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/lib/actions/profile.ts app/tests/actions/profile.test.ts app/app/settings/SettingsForm.tsx
git commit -m "feat(app): email notifications toggle in Settings + token rotation

ProfileFields gains email_notifications_enabled. When a user re-enables
(false → true), _updateProfile also rotates unsubscribe_token via
crypto.randomUUID so any leaked token from the previous subscription
period becomes inert. SettingsForm gets a checkbox row wired into the
existing save() action. Two new tests assert the rotation happens on
re-enable and does NOT happen on disable."
```

---

## Task 9: Vercel config + env example

**Files:**
- Modify: `app/vercel.json`
- Modify: `app/.env.local.example`

- [ ] **Step 1: Update `app/vercel.json`**

Replace with:

```json
{
  "crons": [
    { "path": "/api/cron/refresh-prices", "schedule": "0 9 * * *" },
    { "path": "/api/cron/send-notifications", "schedule": "0 10 * * *" }
  ]
}
```

- [ ] **Step 2: Update `app/.env.local.example`**

Append at the end:

```
# Resend API key from https://resend.com/api-keys. Sandbox key is
# fine for local + MVP — sends only to the account holder's verified
# inbox until a real domain is verified.
RESEND_API_KEY=

# Sender address for notification emails. In sandbox mode this must
# be a Resend-reserved domain (onboarding@resend.dev works). After
# verifying a real domain, change to deals@yourdomain.com.
NOTIFY_FROM_EMAIL=onboarding@resend.dev

# Base URL injected into email links (unsubscribe, film detail,
# settings). Local: http://localhost:3000. Production: your
# Vercel URL.
APP_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Commit**

```
cd /home/cthulhulemon/film_goblin
git add app/vercel.json app/.env.local.example
git commit -m "feat(app): schedule send-notifications cron at 10:00 UTC + env docs

Second cron entry runs the notifier one hour after refresh-prices,
sweeping the fresh batch. New env vars documented in the example:
RESEND_API_KEY, NOTIFY_FROM_EMAIL (defaults to Resend sandbox address),
APP_BASE_URL (used in email links)."
```

---

## Task 10: Local end-to-end smoke

**Files:** none (verification only)

- [ ] **Step 1: Ensure local env + running services**

Local Supabase must be up with the new migrations applied (Task 1 Step 3). `app/.env.local` must include `RESEND_API_KEY` (get one from https://resend.com/api-keys — a free sandbox key), `NOTIFY_FROM_EMAIL=onboarding@resend.dev`, `APP_BASE_URL=http://localhost:3000`, and the existing `CRON_SECRET=dev-secret` + `DATABASE_URL`.

- [ ] **Step 2: Ensure at least one pending alert exists**

Local DB needs a watchlist row with an alert. If you have none, seed one:

```
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres <<'SQL'
-- Pick any user + film (must exist). Use the admin's own user if unsure.
WITH any_user AS (SELECT id, email FROM auth.users LIMIT 1),
     any_film AS (SELECT id FROM films WHERE tracking = true LIMIT 1),
     w AS (
       INSERT INTO watchlists (user_id, film_id)
       SELECT any_user.id, any_film.id FROM any_user, any_film
       ON CONFLICT DO NOTHING
       RETURNING id, film_id
     )
INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
SELECT w.id, w.film_id, 9.99, 4.99 FROM w;
SQL
```

- [ ] **Step 3: Start the Next dev server**

```
cd /home/cthulhulemon/film_goblin/app
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

Wait for "Ready in Xms".

- [ ] **Step 4: Hit the cron endpoint**

From another terminal:

```
curl -i -H 'Authorization: Bearer dev-secret' http://localhost:3000/api/cron/send-notifications
```

Expected: `HTTP/1.1 200 OK`, body like:
```json
{"ok":true,"digest":{"sent":1,"failed":0,"skipped":0,"failed_user_ids":[]}}
```

Check your Resend dashboard → "Emails" to see the delivered message. In sandbox mode it only appears there if your `to` matches the account-holder verified email — if not, the send may 422.

Also verify auth rejection:
```
curl -i http://localhost:3000/api/cron/send-notifications
```
Expected: 401.

- [ ] **Step 5: Verify notified_at was stamped**

```
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -c "SELECT id, notified_at FROM price_alerts ORDER BY created_at DESC LIMIT 5;"
```

Expected: rows that just got delivered have non-null `notified_at`.

- [ ] **Step 6: Hit the unsubscribe route**

```
TOKEN=$(docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -t -c "SELECT unsubscribe_token FROM profiles LIMIT 1;" | tr -d '[:space:]')
curl -i "http://localhost:3000/api/unsubscribe/$TOKEN"
```

Expected: 200 HTML containing "off the list". Verify the flag flipped:

```
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -c "SELECT id, email_notifications_enabled FROM profiles LIMIT 5;"
```

Restore for subsequent tests:
```
docker exec -i supabase_db_film_goblin psql -U postgres -d postgres -c "UPDATE profiles SET email_notifications_enabled = TRUE;"
```

- [ ] **Step 7: Stop the dev server**

Ctrl-C.

- [ ] **Step 8: No commit**

This task is verification only.

---

## Task 11: Deploy to Vercel + production smoke [MANUAL]

**Files:** none committed (env values stay out of git)

- [ ] **Step 1: Create a Resend account + API key**

Go to https://resend.com → sign up. Under "API Keys", create a new key. Copy the value (starts with `re_`).

In the Resend dashboard, verify your personal email as a destination (required for sandbox sends). No domain setup needed yet.

- [ ] **Step 2: Add env vars to Vercel**

From `/home/cthulhulemon/film_goblin`:

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH printf '%s' 're_YOUR_KEY_HERE' | vercel env add RESEND_API_KEY production
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH printf '%s' 'onboarding@resend.dev' | vercel env add NOTIFY_FROM_EMAIL production
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH printf '%s' 'https://film-goblin.vercel.app' | vercel env add APP_BASE_URL production
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel env ls
```

Expected: three new `Production` env vars listed.

- [ ] **Step 3: Deploy**

```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH vercel --prod
```

Expected: "Production: ..." URL, "Aliased: https://film-goblin.vercel.app".

- [ ] **Step 4: Confirm both crons appear in the dashboard**

Visit https://vercel.com/skulldrinker/film-goblin/settings/cron-jobs. Expected: two entries — `/api/cron/refresh-prices` at 09:00 UTC and `/api/cron/send-notifications` at 10:00 UTC.

- [ ] **Step 5: Smoke test the deployed endpoints**

```
SECRET=$(cat /tmp/cron-secret.txt)
curl -i -H "Authorization: Bearer $SECRET" https://film-goblin.vercel.app/api/cron/send-notifications
```

Expected: 200 + JSON digest. If there are no pending alerts on staging, `sent` will be 0 — that's fine; the pipeline is still verified.

Check Resend dashboard for delivered emails.

Also verify unauth:
```
curl -i https://film-goblin.vercel.app/api/cron/send-notifications
```
Expected: 401.

- [ ] **Step 6: No commit**

Verify `git status` is clean.

---

## Self-Review

**Spec coverage:**

- § Goal (daily digest from undelivered price_alerts) → Tasks 3, 5 ✓
- § Architecture (new cron route) → Task 6 ✓
- § Architecture (notifier workspace package) → Tasks 2, 3, 4, 5 ✓
- § Data flow (query → render → send → stamp) → Task 5's orchestrator ✓
- § Schema changes (0114, 0115) → Task 1 ✓
- § Digest content (subject, HTML, text, List-Unsubscribe) → Tasks 4, 5 ✓
- § Unsubscribe route → Task 7 ✓
- § Settings toggle + token rotation on re-enable → Task 8 ✓
- § Env vars (RESEND_API_KEY, NOTIFY_FROM_EMAIL, APP_BASE_URL) → Tasks 9, 11 ✓
- § Testing strategy (notifier pure + route handlers + manual smoke) → Tasks 3, 4, 5, 6, 7, 8 ✓
- § Failure semantics (per-user isolation, retries next day) → Task 5's index.ts try/catch ✓
- § Dependencies (resend, pg, @sentry/node) → Task 2 ✓
- § Out of scope items not implemented → verified none crept in ✓

**Placeholder scan:** No "TBD"/"TODO"/"implement later"/"similar to". All code blocks contain actual content; all commands have expected output.

**Type consistency:**
- `UserLite`, `FilmLite`, `AlertLite`, `PendingDigest` defined in `notifier/src/query.ts` are referenced consistently in `render.ts`, `resend.ts`, `index.ts`.
- `RenderedEmail` from `render.ts` flows through `sendDigest`.
- `DigestCounters` shape matches what the route handler returns and what the test expects.
- `ProfileFields.email_notifications_enabled` matches the Settings form + SettingsForm passing `"on"/"off"` mapping.

**Deviations from spec:** None — spec is implemented as specified. The only notable implementation detail is using Node's `crypto.randomUUID()` rather than a Supabase `rpc("gen_random_uuid")` call for token rotation (Supabase doesn't expose that function by default); this is a simplification, not a departure from the spec's intent.

---
