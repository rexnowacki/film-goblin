# db/ — Schema Package

Canonical schema for Film Goblin. All migrations, RLS policies, triggers, and DB-side tests live here.

## Commands (run from `db/`)

```bash
npm test              # migrations smoke (pg-mem, fast, no RLS)
npm run test:rls      # RLS + trigger suite (testcontainers Postgres, real behavior)
npm run test:all      # both
npm run migrate       # apply db/migrations/*.sql against DATABASE_URL
npm run typecheck
```

`test:rls` requires Docker. It uses real Postgres so RLS, triggers, JSON aggregates, and plpgsql execute correctly. `test` (pg-mem) is fast but strips RLS, GRANT, and complex views — it only asserts table presence.

## ⚠️ Two `migrate` commands — they are NOT the same

- `db/ npm run migrate` — `db/migrations/0100_*` onward, the **canonical production schema**. Run this against Supabase.
- `worker/ npm run migrate` — `worker/migrations/`, the worker's legacy bootstrap schema. Only use this when setting up a fresh local worker DB from scratch.

## Migration numbering

Files are `0NNN_description.sql`, applied in lexicographic order. Number sequentially with no gaps. If two branches add the same number, the second to merge must renumber their migration and bump any references.

Prod DB is connected via the session-mode pooler (not direct connection — direct is IPv6-only and unreachable from this machine). See root CLAUDE.md "Gotchas" for the pooler connection string location.

## What pg-mem (`npm test`) strips

pg-mem cannot execute these constructs — the smoke test strips them before applying:

- `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` / `DROP POLICY`
- `GRANT` statements
- `CREATE VIEW` / `DROP VIEW` (correlated subqueries in `films_with_stats` fail)
- `CREATE TRIGGER` / `DROP TRIGGER`
- `ALTER TYPE` (enum changes)
- `ALTER PUBLICATION` (Supabase realtime, infra-level)
- Files containing `LANGUAGE plpgsql SECURITY DEFINER`
- Files with `backfill` in the filename
- Individual known-problematic migrations (see `db/tests/helpers/pg-mem.ts` for the full skip list)

If a new migration uses any of these constructs and pg-mem `npm test` starts failing, extend the strip filters in `db/tests/helpers/pg-mem.ts` — don't rewrite the migration.

**pg-mem 3.0.4 does NOT silently no-op `CREATE EXTENSION`** — it throws on unknown extensions. `db/tests/helpers/pg-mem.ts` registers `pgcrypto` manually with a `gen_random_uuid` shim.

## RLS test shape

New RLS test suites go in `db/tests/rls/`. Copy `library.test.ts` as the template:

```ts
beforeAll(async () => {
  db = await makeTestDb();        // testcontainers Postgres
  fx = await seedFixtures(db.client);  // creates userA/B/C + filmId
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  // Reset state via service_role between each test
  await beginAs(db.client, null, "service_role");
  await db.client.query("DELETE FROM my_table");
  await commit(db.client);
});
```

Use `beginAs(client, userId, role)` to switch Postgres session role. Use `bond(client, x, y)` to create `coven_members` edges — it swaps args to satisfy `user_a_id < user_b_id` automatically.

## `coven_members` invariant

Schema: `(user_a_id, user_b_id)` with `CHECK (user_a_id < user_b_id)`. The `bond()` helper handles this. When writing raw SQL to check membership, always check both directions:

```sql
(cm.user_a_id = $1 AND cm.user_b_id = $2)
OR (cm.user_a_id = $2 AND cm.user_b_id = $1)
```

## `films_with_stats` view

Defined as `DROP VIEW IF EXISTS … CREATE VIEW …` in each migration that touches it. New columns must be added at the END of the column list — app consumers use explicit column lists and won't break, but position-dependent tools might.
