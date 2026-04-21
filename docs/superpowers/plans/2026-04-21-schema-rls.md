# Database Schema + RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sub-project-2 schema, RLS policies, and triggers as numbered SQL migrations under `db/migrations/`, with a testcontainers-backed RLS test suite that exercises every policy against a real Postgres instance.

**Architecture:** New `db/` package at repo root with its own `package.json`. Migrations start at `0100_*` to leave numeric space above the worker's existing `0001–0003`. Tests run in two layers: pg-mem for fast DDL smoke (Layer 1, optional, skips triggers), testcontainers-backed real Postgres for RLS + trigger verification (Layer 2, required). Test setup applies the worker's existing migrations first, then an `auth-mock.sql` helper that mimics Supabase's `auth` schema, then sub-project-2's migrations — the same order prod will see.

**Tech Stack:** TypeScript · Node 20 · Vitest · pg (node-postgres) · pg-mem v3 · `@testcontainers/postgresql` · `tsx` · `dotenv`

---

## File Structure

```
db/
├── package.json                                # separate package; its own deps
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── README.md
├── migrations/
│   ├── 0100_drop_watchlists_stub.sql          # drops worker's watchlists + price_alerts stubs
│   ├── 0101_profiles.sql                       # profiles table + RLS + lower(handle) unique idx
│   ├── 0102_staff.sql                          # staff table + RLS
│   ├── 0103_follows.sql                        # follows + RLS
│   ├── 0104_coven.sql                          # coven_requests + coven_members + RLS
│   ├── 0105_watchlists.sql                     # real watchlists + price_alerts + RLS
│   ├── 0106_lists.sql                          # lists + list_films + list_subscriptions + RLS
│   ├── 0107_reviews.sql                        # reviews + RLS
│   ├── 0108_recommendations.sql                # recommendations + RLS
│   ├── 0109_activity.sql                       # activity + RLS
│   ├── 0110_profile_trigger.sql                # auth.users → profiles bootstrap
│   ├── 0111_coven_trigger.sql                  # coven_requests accept → coven_members + activity
│   ├── 0112_activity_triggers.sql              # lists/list_films/recs/watchlists → activity
│   └── 0113_review_trigger.sql                 # review draft→published → activity
├── src/
│   └── migrate.ts                              # applyMigrations() — twin of worker's version
├── scripts/
│   └── run-migrate.ts                          # CLI to apply against DATABASE_URL
└── tests/
    ├── helpers/
    │   ├── auth-mock.sql                       # minimal auth schema for test env
    │   ├── pg-mem.ts                           # fast smoke-test helper (Layer 1)
    │   ├── testcontainers.ts                   # Docker-backed Postgres (Layer 2)
    │   ├── session.ts                          # setSessionAs(client, userId, role)
    │   └── fixtures.ts                         # userA, userB, staffS, seed film
    ├── migrations.smoke.test.ts                # Layer 1
    ├── rls/
    │   ├── profiles.test.ts
    │   ├── staff.test.ts
    │   ├── follows.test.ts
    │   ├── coven.test.ts
    │   ├── watchlists.test.ts
    │   ├── lists.test.ts
    │   ├── reviews.test.ts
    │   ├── recommendations.test.ts
    │   └── activity.test.ts
    └── triggers.test.ts                        # all four trigger verifications
```

---

## Task 1: Scaffold the db/ package

**Files:**
- Create: `db/package.json`
- Create: `db/tsconfig.json`
- Create: `db/vitest.config.ts`
- Create: `db/.env.example`
- Create: `db/.gitignore`
- Create: `db/src/index.ts` (placeholder)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "film-goblin-db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run tests/migrations.smoke.test.ts",
    "test:rls": "vitest run tests/rls tests/triggers.test.ts",
    "test:all": "vitest run",
    "typecheck": "tsc --noEmit",
    "migrate": "tsx scripts/run-migrate.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.16.0",
    "@types/node": "^20.17.10",
    "@types/pg": "^8.11.10",
    "pg-mem": "^3.0.4",
    "testcontainers": "^10.16.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "scripts/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
```

Testcontainers cold-start can take a few seconds; 30s per test + 60s per hook gives headroom.

- [ ] **Step 4: Write .env.example and .gitignore**

`db/.env.example`:
```
DATABASE_URL=postgres://user:pass@localhost:5432/filmgoblin
```

`db/.gitignore`:
```
node_modules
.env
dist
coverage
```

- [ ] **Step 5: Write placeholder src/index.ts**

```typescript
// Film Goblin database package — migrations + schema tests.
export const DB_PACKAGE_VERSION = "0.1.0";
```

- [ ] **Step 6: Install and typecheck**

Run from `db/`:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install && npm run typecheck
```
Expected: `typecheck` exits 0.

- [ ] **Step 7: Commit**

```
git add db/package.json db/tsconfig.json db/vitest.config.ts db/.env.example db/.gitignore db/src/index.ts db/package-lock.json
git commit -m "chore(db): scaffold db package with TypeScript + Vitest"
```

---

## Task 2: Migration runner library and CLI

**Files:**
- Create: `db/src/migrate.ts`
- Create: `db/scripts/run-migrate.ts`

- [ ] **Step 1: Write migrate.ts**

`db/src/migrate.ts`:
```typescript
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";

export async function applyMigrations(client: Client, migrationsDir: string): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const r = await client.query(`SELECT 1 FROM _migrations WHERE name = $1`, [file]);
    if (r.rowCount && r.rowCount > 0) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query(sql);
    await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
    applied.push(file);
  }
  return applied;
}
```

This is intentionally a near-duplicate of `worker/src/migrate.ts`. Having two packages share one `_migrations` table in Postgres is fine — the numeric ranges (0001–0003 worker, 0100+ db) don't collide. Shared helper code across packages isn't worth an npm workspace for 20 lines.

- [ ] **Step 2: Write CLI runner**

`db/scripts/run-migrate.ts`:
```typescript
import "dotenv/config";
import { Client } from "pg";
import { applyMigrations } from "../src/migrate.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const applied = await applyMigrations(client, MIGRATIONS_DIR);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```
git add db/src/migrate.ts db/scripts/run-migrate.ts
git commit -m "feat(db): migration runner library and CLI"
```

---

## Task 3: pg-mem Layer 1 smoke test helper

**Files:**
- Create: `db/tests/helpers/pg-mem.ts`
- Create: `db/tests/migrations.smoke.test.ts`

- [ ] **Step 1: Write pg-mem helper**

`db/tests/helpers/pg-mem.ts`:
```typescript
import { newDb, DataType } from "pg-mem";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Client } from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_MIGRATIONS = join(HERE, "..", "..", "..", "worker", "migrations");
const DB_MIGRATIONS = join(HERE, "..", "..", "migrations");

const AUTH_STUB_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid;
$$;
`;

function listSqlFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
}

export async function makeSmokeDb(): Promise<{ client: Client; close: () => Promise<void> }> {
  const mem = newDb();
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });
  const { Client: PgMemClient } = mem.adapters.createPg();
  const client = new PgMemClient() as unknown as Client;
  await client.connect();

  // auth stub so FK references resolve
  await client.query(AUTH_STUB_SQL);

  // Apply worker migrations (films, price_history, watchlists stub)
  for (const f of listSqlFiles(WORKER_MIGRATIONS)) {
    await client.query(readFileSync(join(WORKER_MIGRATIONS, f), "utf8"));
  }

  // Apply db migrations EXCEPT trigger files (pg-mem can't parse SECURITY DEFINER reliably).
  for (const f of listSqlFiles(DB_MIGRATIONS)) {
    if (f.includes("_trigger")) continue;
    await client.query(readFileSync(join(DB_MIGRATIONS, f), "utf8"));
  }

  return { client, close: async () => { await client.end(); } };
}
```

- [ ] **Step 2: Write the failing smoke test**

`db/tests/migrations.smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { makeSmokeDb } from "./helpers/pg-mem.js";

describe("migration smoke (pg-mem, DDL only)", () => {
  it("creates every expected table after applying worker + db migrations", async () => {
    const { client, close } = await makeSmokeDb();
    try {
      const r = await client.query(
        `SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_schema IN ('public') ORDER BY table_name`
      );
      const names = r.rows.map((row: { table_name: string }) => row.table_name);
      expect(names).toEqual(expect.arrayContaining([
        "_migrations",
        "films",
        "price_history",
        "profiles",
        "staff",
        "follows",
        "coven_requests",
        "coven_members",
        "watchlists",
        "price_alerts",
        "lists",
        "list_films",
        "list_subscriptions",
        "reviews",
        "recommendations",
        "activity",
      ]));
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: FAIL because `db/migrations/` is empty — the helper's SQL-file read will find nothing, and tables from sub-project 2 won't exist.

- [ ] **Step 4: Commit**

```
git add db/tests/helpers/pg-mem.ts db/tests/migrations.smoke.test.ts
git commit -m "test(db): pg-mem layer-1 smoke helper and migration test"
```

This test stays RED until migrations are added in later tasks. That's intentional — each migration task re-runs it and watches it go greener.

---

## Task 4: Testcontainers Layer 2 test foundation

**Files:**
- Create: `db/tests/helpers/auth-mock.sql`
- Create: `db/tests/helpers/testcontainers.ts`
- Create: `db/tests/helpers/session.ts`
- Create: `db/tests/helpers/fixtures.ts`

- [ ] **Step 1: Write auth-mock.sql**

`db/tests/helpers/auth-mock.sql`:
```sql
-- Test-only mock of Supabase's auth schema. Real Supabase ships this as part of
-- its platform; our tests reproduce just enough to make RLS policies evaluable.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id          uuid PRIMARY KEY,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$;

-- Roles Supabase defines. Must exist before RLS policies that reference them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO anon, authenticated, service_role;
```

- [ ] **Step 2: Write testcontainers helper**

`db/tests/helpers/testcontainers.ts`:
```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyMigrations } from "../../src/migrate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTH_MOCK = join(HERE, "auth-mock.sql");
const WORKER_MIGRATIONS = join(HERE, "..", "..", "..", "worker", "migrations");
const DB_MIGRATIONS = join(HERE, "..", "..", "migrations");

export interface TestDb {
  client: Client;
  container: StartedPostgreSqlContainer;
  connectionString: string;
  close: () => Promise<void>;
}

export async function makeTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionString = container.getConnectionUri();
  const client = new Client({ connectionString });
  await client.connect();

  // auth schema mock (Supabase provides this in real use)
  await client.query(readFileSync(AUTH_MOCK, "utf8"));

  // Worker migrations first — same order prod will run
  for (const f of readdirSync(WORKER_MIGRATIONS).filter(f => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(join(WORKER_MIGRATIONS, f), "utf8"));
  }

  // Then our migrations via the applyMigrations runner so _migrations gets populated
  await applyMigrations(client, DB_MIGRATIONS);

  // Allow cross-schema access for test roles (they need to read everything the policies permit)
  await client.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;`);
  await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);

  return {
    client,
    container,
    connectionString,
    close: async () => { await client.end(); await container.stop(); },
  };
}
```

- [ ] **Step 3: Write session helper**

`db/tests/helpers/session.ts`:
```typescript
import type { Client } from "pg";

/**
 * Switches the current connection to run as a specific user. Combines SET ROLE
 * (so privileges match the `authenticated` role) with a JWT claim (so auth.uid()
 * returns the right value). Use within a BEGIN/COMMIT to ensure SET LOCAL semantics.
 */
export async function beginAs(
  client: Client,
  userId: string | null,
  role: "anon" | "authenticated" | "service_role" = "authenticated"
): Promise<void> {
  await client.query("BEGIN");
  await client.query(`SET LOCAL ROLE ${role}`);
  if (userId) {
    await client.query(`SET LOCAL request.jwt.claim.sub TO '${userId}'`);
  } else {
    await client.query(`SET LOCAL request.jwt.claim.sub TO ''`);
  }
  await client.query(`SET LOCAL request.jwt.claim.role TO '${role}'`);
}

export async function rollback(client: Client): Promise<void> {
  await client.query("ROLLBACK");
}

export async function commit(client: Client): Promise<void> {
  await client.query("COMMIT");
}
```

Each RLS test wraps its work in `beginAs(...)` / `rollback(...)`. The ROLLBACK between tests keeps the DB clean without recreating the container.

- [ ] **Step 4: Write fixtures helper**

`db/tests/helpers/fixtures.ts`:
```typescript
import type { Client } from "pg";
import { randomUUID } from "node:crypto";

export interface TestUser {
  id: string;
  email: string;
  handle: string;
}

export interface Fixtures {
  userA: TestUser;
  userB: TestUser;
  userC: TestUser;
  staffS: TestUser;
  adminA: TestUser;
  filmId: string;
}

/**
 * Creates baseline fixtures used by most RLS tests. Runs with service-role
 * (bypasses RLS). Call once per test in a `beforeEach` or at the top of a test.
 */
export async function seedFixtures(client: Client): Promise<Fixtures> {
  const mk = (label: string): TestUser => ({
    id: randomUUID(),
    email: `${label}-${randomUUID().slice(0, 8)}@test.example`,
    handle: `${label}_${randomUUID().slice(0, 6)}`,
  });

  const userA = mk("a");
  const userB = mk("b");
  const userC = mk("c");
  const staffS = mk("s");
  const adminA = mk("admin");

  for (const u of [userA, userB, userC, staffS, adminA]) {
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u.id, u.email]);
    // Profiles row is normally created by a trigger (Task 16); until that migration is
    // applied, insert directly. After the trigger lands, this INSERT is redundant but harmless
    // because ON CONFLICT is added in that task's version of seedFixtures.
    await client.query(
      `INSERT INTO profiles (id, handle, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.handle, u.handle]
    );
  }

  await client.query(
    `INSERT INTO staff (user_id, role) VALUES ($1, 'reviewer')`,
    [staffS.id]
  );
  await client.query(
    `INSERT INTO staff (user_id, role) VALUES ($1, 'admin')`,
    [adminA.id]
  );

  // A seed film. Worker migrations already created `films`.
  const filmRes = await client.query<{ id: string }>(
    `INSERT INTO films (itunes_id, title, director, year)
     VALUES ($1, 'Test Film', 'Test Dir', 2024)
     RETURNING id`,
    [Math.floor(Math.random() * 1_000_000_000)]
  );

  return { userA, userB, userC, staffS, adminA, filmId: filmRes.rows[0].id };
}
```

- [ ] **Step 5: Typecheck**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```
git add db/tests/helpers/
git commit -m "test(db): testcontainers harness, auth mock, session helper, fixtures"
```

---

## Task 5: Migration 0100 — drop worker's watchlists + price_alerts stubs

**Files:**
- Create: `db/migrations/0100_drop_watchlists_stub.sql`

- [ ] **Step 1: Write the migration**

`db/migrations/0100_drop_watchlists_stub.sql`:
```sql
-- Drops the stubbed watchlists + price_alerts created by worker migration 0003.
-- Real versions with proper FKs to auth.users are recreated in 0105_watchlists.sql.

DROP TABLE IF EXISTS price_alerts;
DROP TABLE IF EXISTS watchlists;
```

- [ ] **Step 2: Run smoke test**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: still FAILS (profiles/staff/etc still missing) but 0100 applies without error. If it throws before reaching the assertion, the migration has a syntax bug.

- [ ] **Step 3: Commit**

```
git add db/migrations/0100_drop_watchlists_stub.sql
git commit -m "feat(db): drop worker's watchlists + price_alerts stubs"
```

---

## Task 6: profiles table, RLS, and tests

**Files:**
- Create: `db/migrations/0101_profiles.sql`
- Create: `db/tests/rls/profiles.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0101_profiles.sql`:
```sql
CREATE TABLE profiles (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle                    TEXT NOT NULL,
  display_name              TEXT NOT NULL,
  bio                       TEXT NOT NULL DEFAULT '',
  avatar_url                TEXT NOT NULL DEFAULT '',
  broadcast_watchlist_adds  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_handle_lower_idx ON profiles (lower(handle));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Read: anyone (including anon) can see any profile
CREATE POLICY profiles_read ON profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- Update: only the profile owner, and only on mutable columns
CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert/delete: no client policy. Inserts happen via the bootstrap trigger
-- (Task 16) or service-role; deletes cascade from auth.users.
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/profiles.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: profiles", () => {
  it("anyone can read any profile", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM profiles WHERE id = $1`, [fx.userB.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("anonymous can also read profiles", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM profiles WHERE id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user can update their own profile's display_name", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET display_name = 'changed' WHERE id = $1 RETURNING display_name`,
        [fx.userA.id]
      );
      expect(r.rows[0].display_name).toBe("changed");
    } finally { await rollback(db.client); }
  });

  it("user cannot update another user's profile", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET display_name = 'hacked' WHERE id = $1 RETURNING display_name`,
        [fx.userB.id]
      );
      // RLS makes the UPDATE match zero rows rather than throw
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("anon cannot update profiles", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(
          `UPDATE profiles SET display_name = 'x' WHERE id = $1`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("authenticated cannot directly INSERT a profile (no insert policy)", async () => {
    await beginAs(db.client, null, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO profiles (id, handle, display_name) VALUES (gen_random_uuid(), 'x', 'X')`
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("handle uniqueness is case-insensitive", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      // Direct service-role insert to test the unique index — it bypasses RLS
      await expect(
        db.client.query(
          `INSERT INTO profiles (id, handle, display_name)
           VALUES (gen_random_uuid(), $1, 'Clash')`,
          [fx.userA.handle.toUpperCase()]
        )
      ).rejects.toThrow(/unique/i);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/profiles.test.ts`
Expected: all 7 tests PASS. The first run spins Docker Postgres (~5–10s); subsequent runs reuse the image and are faster.

Also run the smoke test:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Still fails (tables from later migrations missing) but with fewer missing.

- [ ] **Step 4: Commit**

```
git add db/migrations/0101_profiles.sql db/tests/rls/profiles.test.ts
git commit -m "feat(db): profiles table with RLS and case-insensitive handle"
```

---

## Task 7: staff table, RLS, and tests

**Files:**
- Create: `db/migrations/0102_staff.sql`
- Create: `db/tests/rls/staff.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0102_staff.sql`:
```sql
CREATE TYPE staff_role AS ENUM ('reviewer', 'admin');

CREATE TABLE staff (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        staff_role NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Read: anyone; UI shows staff badges
CREATE POLICY staff_read ON staff
  FOR SELECT TO anon, authenticated
  USING (true);

-- No client write policies. Staff are provisioned via service-role.
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/staff.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: staff", () => {
  it("anyone can read staff rows", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT user_id, role FROM staff WHERE user_id = $1`, [fx.staffS.id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].role).toBe("reviewer");
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot insert into staff", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO staff (user_id, role) VALUES ($1, 'reviewer')`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("service-role CAN insert into staff", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      // userC isn't staff yet in fixtures
      const r = await db.client.query(
        `INSERT INTO staff (user_id, role) VALUES ($1, 'reviewer') RETURNING role`,
        [fx.userC.id]
      );
      expect(r.rows[0].role).toBe("reviewer");
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/staff.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0102_staff.sql db/tests/rls/staff.test.ts
git commit -m "feat(db): staff table with role enum and RLS"
```

---

## Task 8: follows table, RLS, and tests

**Files:**
- Create: `db/migrations/0103_follows.sql`
- Create: `db/tests/rls/follows.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0103_follows.sql`:
```sql
CREATE TABLE follows (
  follower_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id <> followed_user_id)
);

CREATE INDEX follows_followed_user_id_idx ON follows (followed_user_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_read ON follows
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY follows_insert ON follows
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_user_id);

-- Either party can delete: follower unfollows, followed soft-blocks
CREATE POLICY follows_delete ON follows
  FOR DELETE TO authenticated
  USING (auth.uid() IN (follower_user_id, followed_user_id));
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/follows.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: follows", () => {
  it("A can follow B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2) RETURNING follower_user_id`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rows[0].follower_user_id).toBe(fx.userA.id);
    } finally { await rollback(db.client); }
  });

  it("A cannot insert a follow with someone else as the follower", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.userC.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("A can unfollow B", async () => {
    const fx = await seedFixtures(db.client);
    // Seed a follow via service-role
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `DELETE FROM follows WHERE follower_user_id = $1 AND followed_user_id = $2 RETURNING follower_user_id`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B can force-unfollow A (soft block)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await rollback(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `DELETE FROM follows WHERE follower_user_id = $1 AND followed_user_id = $2 RETURNING follower_user_id`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("C cannot delete a follow between A and B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await rollback(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(
        `DELETE FROM follows WHERE follower_user_id = $1 AND followed_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("self-follow is rejected by CHECK constraint", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO follows (follower_user_id, followed_user_id) VALUES ($1, $1)`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/follows.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0103_follows.sql db/tests/rls/follows.test.ts
git commit -m "feat(db): follows table with RLS"
```

---

## Task 9: coven tables, RLS, and tests

**Files:**
- Create: `db/migrations/0104_coven.sql`
- Create: `db/tests/rls/coven.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0104_coven.sql`:
```sql
CREATE TYPE coven_request_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE coven_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        coven_request_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  UNIQUE (from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX coven_requests_to_user_id_idx ON coven_requests (to_user_id) WHERE status = 'pending';

CREATE TABLE coven_members (
  user_a_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

ALTER TABLE coven_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE coven_members ENABLE ROW LEVEL SECURITY;

-- Requests: only the two parties see them
CREATE POLICY coven_requests_read ON coven_requests
  FOR SELECT TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id));

CREATE POLICY coven_requests_insert ON coven_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id AND status = 'pending');

-- Only recipient can update, only status + responded_at, only from pending
CREATE POLICY coven_requests_update ON coven_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = to_user_id AND status = 'pending')
  WITH CHECK (auth.uid() = to_user_id AND status IN ('accepted', 'declined'));

CREATE POLICY coven_requests_delete ON coven_requests
  FOR DELETE TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id));

-- Members: anyone can read (public close-coven graph)
CREATE POLICY coven_members_read ON coven_members
  FOR SELECT TO anon, authenticated
  USING (true);

-- No client write policies on coven_members — only the trigger (Task 17) inserts
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/coven.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: coven_requests", () => {
  it("A can send a coven request to B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING status`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rows[0].status).toBe("pending");
    } finally { await rollback(db.client); }
  });

  it("C cannot see a request between A and B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await rollback(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT * FROM coven_requests WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("B can accept A's request", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await rollback(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE coven_requests SET status = 'accepted', responded_at = now()
         WHERE from_user_id = $1 AND to_user_id = $2 RETURNING status`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rows[0].status).toBe("accepted");
    } finally { await rollback(db.client); }
  });

  it("A cannot accept their own request", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.userB.id]);
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE coven_requests SET status = 'accepted' WHERE from_user_id = $1 AND to_user_id = $2 RETURNING status`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("self-request is rejected", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $1)`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("anyone can read coven_members", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const lo = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
    const hi = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
    await db.client.query(`INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`, [lo, hi]);
    await rollback(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM coven_members WHERE user_a_id = $1`, [lo]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("client cannot directly insert into coven_members", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const lo = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
      const hi = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
      await expect(
        db.client.query(`INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`, [lo, hi])
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/coven.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0104_coven.sql db/tests/rls/coven.test.ts
git commit -m "feat(db): coven requests and members with RLS"
```

---

## Task 10: watchlists + price_alerts (real, replacing stub)

**Files:**
- Create: `db/migrations/0105_watchlists.sql`
- Create: `db/tests/rls/watchlists.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0105_watchlists.sql`:
```sql
-- Real watchlists + price_alerts, replacing the stub dropped in 0100.

CREATE TABLE watchlists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id           UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  max_price_usd     NUMERIC(6,2),
  last_alerted_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, film_id)
);

CREATE INDEX watchlists_film_id_idx ON watchlists (film_id);

CREATE TABLE price_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  old_price_usd   NUMERIC(6,2) NOT NULL,
  new_price_usd   NUMERIC(6,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX price_alerts_watchlist_id_idx ON price_alerts (watchlist_id);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Watchlists are private to the owner
CREATE POLICY watchlists_read ON watchlists
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY watchlists_insert ON watchlists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watchlists_update ON watchlists
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY watchlists_delete ON watchlists
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Alerts are readable only by the watchlist owner
CREATE POLICY price_alerts_read ON price_alerts
  FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT user_id FROM watchlists WHERE id = watchlist_id));

-- No client write policies on price_alerts — only the worker (service-role) inserts
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/watchlists.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: watchlists + price_alerts", () => {
  it("A can add a film to their own watchlist", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO watchlists (user_id, film_id, max_price_usd) VALUES ($1, $2, 6.00) RETURNING id`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("A cannot read B's watchlist", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`, [fx.userB.id, fx.filmId]);
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM watchlists WHERE user_id = $1`, [fx.userB.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("A cannot insert a watchlist row for B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("A can read their own alert", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const wl = await db.client.query<{ id: string }>(
      `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    await db.client.query(
      `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 4.99)`,
      [wl.rows[0].id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM price_alerts WHERE watchlist_id = $1`, [wl.rows[0].id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot read A's alerts", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const wl = await db.client.query<{ id: string }>(
      `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    await db.client.query(
      `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 4.99)`,
      [wl.rows[0].id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM price_alerts WHERE watchlist_id = $1`, [wl.rows[0].id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("authenticated client cannot INSERT into price_alerts (worker-only)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const wl = await db.client.query<{ id: string }>(
      `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
      [fx.userA.id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd) VALUES ($1, $2, 9.99, 4.99)`,
          [wl.rows[0].id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/watchlists.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0105_watchlists.sql db/tests/rls/watchlists.test.ts
git commit -m "feat(db): real watchlists + price_alerts with RLS"
```

---

## Task 11: lists, list_films, list_subscriptions

**Files:**
- Create: `db/migrations/0106_lists.sql`
- Create: `db/tests/rls/lists.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0106_lists.sql`:
```sql
CREATE TABLE lists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  is_official     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lists_owner_user_id_idx ON lists (owner_user_id);
CREATE INDEX lists_is_public_idx ON lists (is_public) WHERE is_public = TRUE;

CREATE TABLE list_films (
  list_id         UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, film_id)
);

CREATE INDEX list_films_list_id_position_idx ON list_films (list_id, position);

CREATE TABLE list_subscriptions (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id         UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);

CREATE INDEX list_subscriptions_list_id_idx ON list_subscriptions (list_id);

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_films ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_subscriptions ENABLE ROW LEVEL SECURITY;

-- Lists: public visible to all, private visible to owner
CREATE POLICY lists_read ON lists
  FOR SELECT TO anon, authenticated
  USING (is_public OR auth.uid() = owner_user_id);

CREATE POLICY lists_insert ON lists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY lists_update ON lists
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY lists_delete ON lists
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_user_id);

-- list_films: inherit list visibility
CREATE POLICY list_films_read ON list_films
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_films.list_id
      AND (lists.is_public OR lists.owner_user_id = auth.uid())
  ));

CREATE POLICY list_films_write ON list_films
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_films.list_id AND lists.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_films.list_id AND lists.owner_user_id = auth.uid()
  ));

-- list_subscriptions: owner sees subscribers; subscribers see own subs; subscribe requires public list
CREATE POLICY list_subscriptions_read ON list_subscriptions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT owner_user_id FROM lists WHERE id = list_id)
  );

CREATE POLICY list_subscriptions_insert ON list_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM lists WHERE id = list_id AND is_public = TRUE)
  );

CREATE POLICY list_subscriptions_delete ON list_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/lists.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

async function makeList(db: TestDb, ownerId: string, isPublic: boolean): Promise<string> {
  await beginAs(db.client, null, "service_role");
  const r = await db.client.query<{ id: string }>(
    `INSERT INTO lists (owner_user_id, title, is_public) VALUES ($1, 'T', $2) RETURNING id`,
    [ownerId, isPublic]
  );
  await rollback(db.client);
  return r.rows[0].id;
}

describe("RLS: lists", () => {
  it("A can create their own public list", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'My List') RETURNING id`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("A cannot create a list owned by B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'Hacked')`,
          [fx.userB.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("B can read A's public list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM lists WHERE id = $1`, [listId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot read A's private list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM lists WHERE id = $1`, [listId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("A can read their own private list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM lists WHERE id = $1`, [listId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});

describe("RLS: list_films", () => {
  it("A can add a film to their own list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0) RETURNING list_id`,
        [listId, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot add a film to A's list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0)`,
          [listId, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("films in a private list are hidden from other users", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0)`, [listId, fx.filmId]);
    await rollback(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM list_films WHERE list_id = $1`, [listId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});

describe("RLS: list_subscriptions", () => {
  it("B can subscribe to A's public list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userB.id, listId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot subscribe to A's private list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2)`,
          [fx.userB.id, listId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("A can see who subscribed to their list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2)`, [fx.userB.id, listId]);
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT user_id FROM list_subscriptions WHERE list_id = $1`, [listId]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].user_id).toBe(fx.userB.id);
    } finally { await rollback(db.client); }
  });

  it("C cannot see who subscribed to A's list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2)`, [fx.userB.id, listId]);
    await rollback(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT user_id FROM list_subscriptions WHERE list_id = $1`, [listId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/lists.test.ts`
Expected: 12 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0106_lists.sql db/tests/rls/lists.test.ts
git commit -m "feat(db): lists, list_films, list_subscriptions with RLS"
```

---

## Task 12: reviews (staff-only) with draft/published

**Files:**
- Create: `db/migrations/0107_reviews.sql`
- Create: `db/tests/rls/reviews.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0107_reviews.sql`:
```sql
CREATE TYPE review_status AS ENUM ('draft', 'published');

CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  author_user_id  UUID NOT NULL REFERENCES staff(user_id) ON DELETE RESTRICT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  pullquote       TEXT NOT NULL DEFAULT '',
  status          review_status NOT NULL DEFAULT 'draft',
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reviews_film_id_idx ON reviews (film_id) WHERE status = 'published';
CREATE INDEX reviews_author_idx ON reviews (author_user_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Read: published is world-visible; drafts only visible to their author (staff)
CREATE POLICY reviews_read_published ON reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY reviews_read_own_drafts ON reviews
  FOR SELECT TO authenticated
  USING (
    status = 'draft'
    AND author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  );

-- Insert/update: author is staff and acts as themselves
CREATE POLICY reviews_insert ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY reviews_update ON reviews
  FOR UPDATE TO authenticated
  USING (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  )
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid())
  );

-- Delete: admins only
CREATE POLICY reviews_delete ON reviews
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin'));
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/reviews.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: reviews", () => {
  it("staff can create a draft review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B') RETURNING status`,
        [fx.filmId, fx.staffS.id]
      );
      expect(r.rows[0].status).toBe("draft");
    } finally { await rollback(db.client); }
  });

  it("non-staff cannot create a review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
          [fx.filmId, fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("anyone can read a published review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
       VALUES ($1, $2, 'T', 'B', 'published', now())`,
      [fx.filmId, fx.staffS.id]
    );
    await rollback(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM reviews WHERE film_id = $1`, [fx.filmId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("anonymous cannot see drafts", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
      [fx.filmId, fx.staffS.id]
    );
    await rollback(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM reviews WHERE film_id = $1`, [fx.filmId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("author can see their own draft", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
      [fx.filmId, fx.staffS.id]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT status FROM reviews WHERE film_id = $1`, [fx.filmId]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].status).toBe("draft");
    } finally { await rollback(db.client); }
  });

  it("other staff cannot see another staff's draft", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
      [fx.filmId, fx.staffS.id]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM reviews WHERE film_id = $1 AND status = 'draft'`, [fx.filmId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("admin can delete any review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
       VALUES ($1, $2, 'T', 'B', 'published', now()) RETURNING id`,
      [fx.filmId, fx.staffS.id]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM reviews WHERE id = $1 RETURNING id`, [r.rows[0].id]);
      expect(d.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("non-admin staff cannot delete a review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
       VALUES ($1, $2, 'T', 'B', 'published', now()) RETURNING id`,
      [fx.filmId, fx.staffS.id]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM reviews WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/reviews.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0107_reviews.sql db/tests/rls/reviews.test.ts
git commit -m "feat(db): staff-authored reviews with draft/published RLS"
```

---

## Task 13: recommendations with public-broadcast semantics

**Files:**
- Create: `db/migrations/0108_recommendations.sql`
- Create: `db/tests/rls/recommendations.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0108_recommendations.sql`:
```sql
CREATE TABLE recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  film_id         UUID NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  note            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX recommendations_from_user_id_idx ON recommendations (from_user_id);
CREATE INDEX recommendations_to_user_id_idx ON recommendations (to_user_id);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY recommendations_read ON recommendations
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY recommendations_insert ON recommendations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id AND from_user_id <> to_user_id);

CREATE POLICY recommendations_delete ON recommendations
  FOR DELETE TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id));
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/recommendations.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: recommendations", () => {
  it("A can recommend a film to B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO recommendations (from_user_id, to_user_id, film_id, note) VALUES ($1, $2, $3, 'watch this') RETURNING id`,
        [fx.userA.id, fx.userB.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("A cannot forge a rec as coming from B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3)`,
          [fx.userB.id, fx.userC.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("anyone can read a recommendation", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3)`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM recommendations WHERE from_user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("sender can delete their own rec", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3) RETURNING id`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM recommendations WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("recipient can delete a rec (dismiss)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3) RETURNING id`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM recommendations WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("uninvolved user cannot delete someone else's rec", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3) RETURNING id`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM recommendations WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("self-recommendation is rejected", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $1, $2)`,
          [fx.userA.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/recommendations.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 4: Commit**

```
git add db/migrations/0108_recommendations.sql db/tests/rls/recommendations.test.ts
git commit -m "feat(db): recommendations with public-broadcast RLS"
```

---

## Task 14: activity table

**Files:**
- Create: `db/migrations/0109_activity.sql`
- Create: `db/tests/rls/activity.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0109_activity.sql`:
```sql
CREATE TYPE activity_kind AS ENUM (
  'review_published',
  'recommendation_sent',
  'watchlist_added',
  'list_created',
  'list_film_added',
  'coven_joined'
);

CREATE TABLE activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            activity_kind NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_actor_user_id_created_at_idx ON activity (actor_user_id, created_at DESC);
CREATE INDEX activity_created_at_idx ON activity (created_at DESC);

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- Read: anyone. Privacy is at the source tables — we only insert events already public.
CREATE POLICY activity_read ON activity
  FOR SELECT TO anon, authenticated
  USING (true);

-- No client insert/update/delete policies — only triggers (SECURITY DEFINER) and service-role write
```

- [ ] **Step 2: Write the RLS test**

`db/tests/rls/activity.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: activity", () => {
  it("anyone can read activity rows", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO activity (actor_user_id, kind, payload) VALUES ($1, 'list_created', '{"list_id":"abc"}'::jsonb)`,
      [fx.userA.id]
    );
    await rollback(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM activity WHERE actor_user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot directly INSERT activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO activity (actor_user_id, kind) VALUES ($1, 'list_created')`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot UPDATE activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO activity (actor_user_id, kind) VALUES ($1, 'list_created') RETURNING id`,
      [fx.userA.id]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const u = await db.client.query(
        `UPDATE activity SET kind = 'review_published' WHERE id = $1`,
        [r.rows[0].id]
      );
      expect(u.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("authenticated user cannot DELETE activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO activity (actor_user_id, kind) VALUES ($1, 'list_created') RETURNING id`,
      [fx.userA.id]
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM activity WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/rls/activity.test.ts`
Expected: 4 tests PASS.

Also, re-run the smoke test:
```
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: now PASSES. All 16 tables exist.

- [ ] **Step 4: Commit**

```
git add db/migrations/0109_activity.sql db/tests/rls/activity.test.ts
git commit -m "feat(db): activity feed table with public read, trigger-only write"
```

---

## Task 15: Profile bootstrap trigger

**Files:**
- Create: `db/migrations/0110_profile_trigger.sql`
- Create: `db/tests/triggers.test.ts`

- [ ] **Step 1: Write the migration**

`db/migrations/0110_profile_trigger.sql`:
```sql
-- Bootstrap: when auth.users gets a new row, create a matching profiles row.
-- Uses SECURITY DEFINER to bypass RLS on profiles (which has no insert policy).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_handle TEXT;
  final_handle TEXT;
  suffix INTEGER := 0;
BEGIN
  -- Derive handle from email local-part, lowercased, alphanumeric only
  base_handle := regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g');
  IF base_handle = '' THEN
    base_handle := 'goblin';
  END IF;
  final_handle := base_handle;

  -- De-dup by suffix if colliding on lower(handle) index
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(handle) = lower(final_handle)) LOOP
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, handle, display_name)
  VALUES (NEW.id, final_handle, final_handle);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();
```

- [ ] **Step 2: Write the trigger test**

`db/tests/triggers.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "./helpers/testcontainers.js";
import { beginAs, rollback } from "./helpers/session.js";
import { seedFixtures } from "./helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("trigger: auth.users → profiles bootstrap", () => {
  it("creates a matching profiles row with a unique handle", async () => {
    const id = randomUUID();
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'goblin@test.example')`, [id]);
      const r = await db.client.query(`SELECT handle FROM profiles WHERE id = $1`, [id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].handle).toMatch(/^goblin/);
    } finally { await rollback(db.client); }
  });

  it("de-duplicates handles by suffix", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      const a = randomUUID(), b = randomUUID();
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@test.example')`, [a]);
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@other.example')`, [b]);
      const r = await db.client.query(
        `SELECT lower(handle) AS h FROM profiles WHERE id IN ($1, $2) ORDER BY handle`, [a, b]
      );
      const handles = r.rows.map((x: any) => x.h);
      expect(handles).toContain("alice");
      expect(handles.some((h: string) => /^alice\d+$/.test(h))).toBe(true);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run the trigger test**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/triggers.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 4: Update fixtures.ts to rely on trigger**

Open `db/tests/helpers/fixtures.ts` and change the profile insert block to let the trigger do the work:

Replace:
```typescript
  for (const u of [userA, userB, userC, staffS, adminA]) {
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u.id, u.email]);
    await client.query(
      `INSERT INTO profiles (id, handle, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.handle, u.handle]
    );
  }
```

With:
```typescript
  for (const u of [userA, userB, userC, staffS, adminA]) {
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u.id, u.email]);
    // Trigger created a row already; overwrite handle/display_name with test values so tests are deterministic
    await client.query(
      `UPDATE profiles SET handle = $2, display_name = $3 WHERE id = $1`,
      [u.id, u.handle, u.handle]
    );
  }
```

- [ ] **Step 5: Re-run all tests to confirm fixtures still work**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all`
Expected: all prior RLS tests + 2 trigger tests pass.

- [ ] **Step 6: Commit**

```
git add db/migrations/0110_profile_trigger.sql db/tests/triggers.test.ts db/tests/helpers/fixtures.ts
git commit -m "feat(db): auth.users → profiles bootstrap trigger"
```

---

## Task 16: Coven accept trigger

**Files:**
- Create: `db/migrations/0111_coven_trigger.sql`
- Modify: `db/tests/triggers.test.ts` (append)

- [ ] **Step 1: Write the migration**

`db/migrations/0111_coven_trigger.sql`:
```sql
-- When a coven_request goes from 'pending' to 'accepted', insert into coven_members
-- with canonicalized pair, and emit two 'coven_joined' activity events (one per member).

CREATE OR REPLACE FUNCTION public.handle_coven_request_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lo UUID;
  hi UUID;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    lo := LEAST(NEW.from_user_id, NEW.to_user_id);
    hi := GREATEST(NEW.from_user_id, NEW.to_user_id);

    INSERT INTO public.coven_members (user_a_id, user_b_id)
    VALUES (lo, hi)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.from_user_id, 'coven_joined', jsonb_build_object('other_user_id', NEW.to_user_id));
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.to_user_id, 'coven_joined', jsonb_build_object('other_user_id', NEW.from_user_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_coven_request_accepted
AFTER UPDATE ON coven_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_coven_request_accepted();
```

- [ ] **Step 2: Append the trigger test**

Append to `db/tests/triggers.test.ts`:
```typescript
describe("trigger: coven_requests accept → coven_members + activity", () => {
  it("inserts coven_members with canonicalized pair on accept", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(
        `INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.userB.id]
      );
      await db.client.query(
        `UPDATE coven_requests SET status = 'accepted', responded_at = now()
         WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      const lo = fx.userA.id < fx.userB.id ? fx.userA.id : fx.userB.id;
      const hi = fx.userA.id < fx.userB.id ? fx.userB.id : fx.userA.id;
      const r = await db.client.query(
        `SELECT user_a_id, user_b_id FROM coven_members WHERE user_a_id = $1 AND user_b_id = $2`,
        [lo, hi]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("emits exactly two 'coven_joined' activity rows on accept", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`, [fx.userA.id, fx.userB.id]);
      await db.client.query(
        `UPDATE coven_requests SET status = 'accepted' WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      const r = await db.client.query(
        `SELECT actor_user_id FROM activity WHERE kind = 'coven_joined' AND actor_user_id IN ($1, $2)`,
        [fx.userA.id, fx.userB.id]
      );
      expect(r.rowCount).toBe(2);
    } finally { await rollback(db.client); }
  });

  it("does NOT emit on decline", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO coven_requests (from_user_id, to_user_id) VALUES ($1, $2)`, [fx.userA.id, fx.userB.id]);
      await db.client.query(
        `UPDATE coven_requests SET status = 'declined' WHERE from_user_id = $1 AND to_user_id = $2`,
        [fx.userA.id, fx.userB.id]
      );
      const members = await db.client.query(
        `SELECT count(*)::int AS n FROM coven_members`
      );
      const activityRows = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE kind = 'coven_joined'`
      );
      expect(members.rows[0].n).toBe(0);
      expect(activityRows.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run trigger tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/triggers.test.ts`
Expected: 5 tests PASS (2 from Task 15 + 3 new).

- [ ] **Step 4: Commit**

```
git add db/migrations/0111_coven_trigger.sql db/tests/triggers.test.ts
git commit -m "feat(db): coven-accept trigger emits members + activity"
```

---

## Task 17: Activity fan-out triggers

**Files:**
- Create: `db/migrations/0112_activity_triggers.sql`
- Modify: `db/tests/triggers.test.ts` (append)

- [ ] **Step 1: Write the migration**

`db/migrations/0112_activity_triggers.sql`:
```sql
-- Fan-out triggers: source-table inserts → activity rows.

-- lists insert → list_created
CREATE OR REPLACE FUNCTION public.activity_on_list_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (NEW.owner_user_id, 'list_created', jsonb_build_object('list_id', NEW.id, 'title', NEW.title));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_list_insert
AFTER INSERT ON lists
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_list_insert();

-- list_films insert → list_film_added (actor is list owner)
CREATE OR REPLACE FUNCTION public.activity_on_list_film_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  owner UUID;
BEGIN
  SELECT owner_user_id INTO owner FROM public.lists WHERE id = NEW.list_id;
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (owner, 'list_film_added', jsonb_build_object('list_id', NEW.list_id, 'film_id', NEW.film_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_list_film_insert
AFTER INSERT ON list_films
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_list_film_insert();

-- recommendations insert → recommendation_sent
CREATE OR REPLACE FUNCTION public.activity_on_recommendation_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (
    NEW.from_user_id,
    'recommendation_sent',
    jsonb_build_object('film_id', NEW.film_id, 'to_user_id', NEW.to_user_id, 'note', NEW.note)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_recommendation_insert
AFTER INSERT ON recommendations
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_recommendation_insert();

-- watchlists insert → watchlist_added (only if user's profile has broadcast_watchlist_adds = TRUE)
CREATE OR REPLACE FUNCTION public.activity_on_watchlist_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  broadcast BOOLEAN;
BEGIN
  SELECT broadcast_watchlist_adds INTO broadcast FROM public.profiles WHERE id = NEW.user_id;
  IF broadcast IS TRUE THEN
    INSERT INTO public.activity (actor_user_id, kind, payload)
    VALUES (NEW.user_id, 'watchlist_added', jsonb_build_object('film_id', NEW.film_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_watchlist_insert
AFTER INSERT ON watchlists
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_watchlist_insert();
```

- [ ] **Step 2: Append trigger tests**

Append to `db/tests/triggers.test.ts`:
```typescript
describe("trigger: activity fan-out", () => {
  it("lists insert emits list_created activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'Grimoire') RETURNING id`,
        [fx.userA.id]
      );
      const a = await db.client.query(
        `SELECT kind, payload FROM activity WHERE actor_user_id = $1`, [fx.userA.id]
      );
      expect(a.rowCount).toBe(1);
      expect(a.rows[0].kind).toBe("list_created");
      expect(a.rows[0].payload.list_id).toBe(r.rows[0].id);
    } finally { await rollback(db.client); }
  });

  it("list_films insert emits list_film_added with list owner as actor", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const list = await db.client.query<{ id: string }>(
        `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'G') RETURNING id`, [fx.userA.id]
      );
      await db.client.query(
        `INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0)`,
        [list.rows[0].id, fx.filmId]
      );
      const r = await db.client.query(
        `SELECT actor_user_id FROM activity WHERE kind = 'list_film_added'`
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].actor_user_id).toBe(fx.userA.id);
    } finally { await rollback(db.client); }
  });

  it("recommendations insert emits recommendation_sent", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(
        `INSERT INTO recommendations (from_user_id, to_user_id, film_id, note) VALUES ($1, $2, $3, 'rec')`,
        [fx.userA.id, fx.userB.id, fx.filmId]
      );
      const r = await db.client.query(
        `SELECT kind, payload FROM activity WHERE actor_user_id = $1 AND kind = 'recommendation_sent'`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].payload.to_user_id).toBe(fx.userB.id);
    } finally { await rollback(db.client); }
  });

  it("watchlist insert with broadcast=false does NOT emit activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      // broadcast defaults to FALSE
      await db.client.query(`INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`, [fx.userA.id, fx.filmId]);
      const r = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE actor_user_id = $1 AND kind = 'watchlist_added'`,
        [fx.userA.id]
      );
      expect(r.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("watchlist insert with broadcast=true emits activity", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`UPDATE profiles SET broadcast_watchlist_adds = TRUE WHERE id = $1`, [fx.userA.id]);
      await db.client.query(`INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2)`, [fx.userA.id, fx.filmId]);
      const r = await db.client.query(
        `SELECT kind, payload FROM activity WHERE actor_user_id = $1 AND kind = 'watchlist_added'`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].payload.film_id).toBe(fx.filmId);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run trigger tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/triggers.test.ts`
Expected: 10 tests PASS (5 prior + 5 new).

- [ ] **Step 4: Commit**

```
git add db/migrations/0112_activity_triggers.sql db/tests/triggers.test.ts
git commit -m "feat(db): activity fan-out triggers for lists, recs, watchlist-broadcast"
```

---

## Task 18: Review publish trigger

**Files:**
- Create: `db/migrations/0113_review_trigger.sql`
- Modify: `db/tests/triggers.test.ts` (append)

- [ ] **Step 1: Write the migration**

`db/migrations/0113_review_trigger.sql`:
```sql
-- Fires exactly once: when a review's status transitions from 'draft' to 'published'.
-- Uses NEW.published_at as the activity timestamp (not created_at), because the
-- published moment is what the feed cares about.

CREATE OR REPLACE FUNCTION public.activity_on_review_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'published' THEN
    INSERT INTO public.activity (actor_user_id, kind, payload, created_at)
    VALUES (
      NEW.author_user_id,
      'review_published',
      jsonb_build_object('review_id', NEW.id, 'film_id', NEW.film_id, 'title', NEW.title),
      COALESCE(NEW.published_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_review_published
AFTER UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_review_published();
```

- [ ] **Step 2: Append trigger tests**

Append to `db/tests/triggers.test.ts`:
```typescript
describe("trigger: review draft→published", () => {
  it("emits review_published activity on transition", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B') RETURNING id`,
        [fx.filmId, fx.staffS.id]
      );
      // No activity yet (draft insert)
      const a1 = await db.client.query(
        `SELECT count(*)::int AS n FROM activity WHERE kind = 'review_published'`
      );
      expect(a1.rows[0].n).toBe(0);

      await db.client.query(
        `UPDATE reviews SET status = 'published', published_at = now() WHERE id = $1`,
        [r.rows[0].id]
      );

      const a2 = await db.client.query(
        `SELECT actor_user_id, payload FROM activity WHERE kind = 'review_published'`
      );
      expect(a2.rowCount).toBe(1);
      expect(a2.rows[0].actor_user_id).toBe(fx.staffS.id);
      expect(a2.rows[0].payload.review_id).toBe(r.rows[0].id);
    } finally { await rollback(db.client); }
  });

  it("does NOT emit when updating a draft (status stays draft)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B') RETURNING id`,
        [fx.filmId, fx.staffS.id]
      );
      await db.client.query(`UPDATE reviews SET body = 'edited' WHERE id = $1`, [r.rows[0].id]);
      const a = await db.client.query(`SELECT count(*)::int AS n FROM activity WHERE kind = 'review_published'`);
      expect(a.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("does NOT emit when editing an already-published review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query<{ id: string }>(
        `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
         VALUES ($1, $2, 'T', 'B', 'published', now()) RETURNING id`,
        [fx.filmId, fx.staffS.id]
      );
      // Initial published insert doesn't fire the trigger (UPDATE trigger, not INSERT)
      await db.client.query(`UPDATE reviews SET body = 'edited' WHERE id = $1`, [r.rows[0].id]);
      const a = await db.client.query(`SELECT count(*)::int AS n FROM activity WHERE kind = 'review_published'`);
      expect(a.rows[0].n).toBe(0);
    } finally { await rollback(db.client); }
  });
});
```

- [ ] **Step 3: Run trigger tests**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:rls -- tests/triggers.test.ts`
Expected: 13 tests PASS (10 prior + 3 new).

- [ ] **Step 4: Commit**

```
git add db/migrations/0113_review_trigger.sql db/tests/triggers.test.ts
git commit -m "feat(db): review draft→published trigger emits activity"
```

---

## Task 19: README and final verification

**Files:**
- Create: `db/README.md`

- [ ] **Step 1: Write README.md**

`db/README.md`:
```markdown
# Film Goblin — Database Package

Owns the sub-project-2 schema: full user/profile, social graph, watchlists
(real, replacing the worker's stub), lists, editorial reviews, recommendations,
and activity feed — plus RLS policies and triggers.

Implements the spec at `../docs/superpowers/specs/2026-04-21-schema-rls-design.md`.

## Setup

Requires Node 20 (pinned via repo-root `.nvmrc`) and Docker (for the RLS test
suite — testcontainers spins up a real Postgres 16).

```
cd db
npm install
cp .env.example .env          # fill in DATABASE_URL
npm run migrate               # apply migrations 0100+
```

## Migrations

Numbered from `0100` to leave space above the worker's `0001–0003`. The
worker and this package share one `_migrations` tracking table in Postgres.
In production, apply worker migrations first, then sub-project-2 migrations.

To apply in sequence against a real DB:

```
cd worker && npm run migrate
cd ../db && npm run migrate
```

The first sub-project-2 migration (`0100_drop_watchlists_stub.sql`) drops the
worker's stubbed `watchlists` and `price_alerts`. They're recreated in
`0105_watchlists.sql` with proper FK constraints to `auth.users`.

## Tests

Two layers:

- `npm test` — Layer 1, pg-mem smoke test. Fast (<1s). Verifies DDL parses and
  every expected table exists. Skips trigger migrations (pg-mem doesn't support
  `SECURITY DEFINER`).
- `npm run test:rls` — Layer 2, testcontainers + real Postgres. Exercises every
  RLS policy with user-scoped JWTs, plus every trigger. ~10s cold, ~3s warm.
  Required in CI.
- `npm run test:all` — both.

### How RLS tests work

Each test runs inside `BEGIN; SET LOCAL ROLE ...; SET LOCAL request.jwt.claim.sub TO ...;`
and rolls back. Sessions mimic Supabase's JWT-claim mechanism without actually
signing JWTs — the test helper writes the claim directly to the session.

A test-only `auth-mock.sql` creates the `auth` schema, `auth.users` table,
and `auth.uid()` / `auth.role()` functions that our RLS policies reference.
In production, Supabase provides these; the mock exists solely so RLS policies
are evaluable against a plain Postgres container.

## What this package does NOT do

- **Host any app code.** The Next.js scaffold is sub-project 3.
- **Own notification delivery state.** The `recommendations` and `price_alerts`
  tables are producers; the consumer pipeline (email, push) is sub-project 5.
- **Wire up realtime subscriptions.** The `activity` table is shape-ready for
  Supabase realtime; filter-by-follow-graph logic lands in sub-project 6.
- **Build on top of the existing Vite prototype in `../src/`.** That's
  prototype-stage UI against mocked data; this package runs against a real DB.

## Worker coordination

`worker/src/db.ts` connects to the same Postgres instance via `DATABASE_URL`.
When this package's migrations replace the worker's `watchlists` / `price_alerts`
stubs, the worker's code continues to work unchanged because:
- Column names and types remain identical
- The worker uses service-role credentials, which bypass RLS

The only behavior change: the real `watchlists` now requires `user_id` to exist
in `auth.users` (FK). The worker's integration tests (pg-mem + stub) still pass
because they apply the stub, not this package's migrations.
```

- [ ] **Step 2: Final verification — full test suite**

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run test:all`
Expected: smoke + every RLS test + every trigger test PASS.

Run from `db/`: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run typecheck`
Expected: exit 0.

Also verify the worker's tests still pass after our changes to the shared schema space:
```
cd ../worker && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test
```
Expected: 43/43 passing (worker uses its own migrations in its own pg-mem environment; our changes don't affect it).

- [ ] **Step 3: Spec walkthrough**

Open `../docs/superpowers/specs/2026-04-21-schema-rls-design.md` and confirm each section maps to code:

- Entity list (11 tables) → `db/migrations/0100–0109`.
- RLS policies per table → the same migrations, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` statements.
- Triggers (4 responsibilities) → `0110` (profile), `0111` (coven), `0112` (activity fan-out), `0113` (review publish).
- `broadcast_watchlist_adds` column → in `0101_profiles.sql` and gated by `0112`.
- `lower(handle)` unique index → in `0101_profiles.sql`.
- Follow soft-block semantics → `0103_follows.sql` delete policy.
- Canonicalized coven pair → `0104_coven.sql` CHECK constraint, `0111` LEAST/GREATEST.
- Test layers (1 = pg-mem, 2 = testcontainers + real PG) → `tests/migrations.smoke.test.ts`, `tests/rls/*`, `tests/triggers.test.ts`.

- [ ] **Step 4: Commit the README and any incidental fixes**

```
git add db/README.md
git commit -m "docs(db): README with setup, migrations, and test-layer explanation"
```

If the spec walkthrough found any gaps, fix them and commit each separately. If no gaps:

```
git status
```
Expected: working tree clean.

---

## Self-review notes

- **Spec coverage:** every normative spec item maps to a task. Section-by-section walk in Task 19 proves it.
- **Deferred items the spec calls out explicitly:** profile visibility tiers, comment threads, user reviews, multi-region pricing, DMs, list collaborators. None implemented here, consistent with spec.
- **Tests layered as the spec described:** pg-mem (Layer 1) for DDL smoke, testcontainers (Layer 2) for RLS + triggers. pg-mem is explicitly limited to non-trigger migrations because it doesn't support `SECURITY DEFINER`.
- **Shared `_migrations` table:** the worker and db packages both track against this; the numeric ranges don't collide (`0001–0003` worker, `0100+` db).
- **`auth-mock.sql` is test-only.** Production uses Supabase's real `auth` schema. The mock's role definitions (`anon`, `authenticated`, `service_role`) are the same names Supabase uses, so policies written against them port 1:1.
