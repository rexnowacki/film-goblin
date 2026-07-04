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
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid;
$$;
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

function listSqlFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
}

export async function makeSmokeDb(): Promise<{ client: Client; close: () => Promise<void> }> {
  const mem = newDb();
  // pg-mem throws on unknown extensions, so register pgcrypto and supply gen_random_uuid.
  mem.registerExtension("pgcrypto", (schema) => {
    schema.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      implementation: () => randomUUID(),
      impure: true,
    });
  });
  // pg-mem doesn't ship char_length(text) — register it so CHECK constraints
  // like `char_length(body) BETWEEN 1 AND 140` parse during CREATE TABLE.
  mem.public.registerFunction({
    name: "char_length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string | null) => (s == null ? null : s.length),
  });
  const { Client: PgMemClient } = mem.adapters.createPg();
  const client = new PgMemClient() as unknown as Client;
  await client.connect();

  // auth stub so FK references resolve
  await client.query(AUTH_STUB_SQL);

  // Apply worker migrations (films, price_history) — skip the watchlists stub because
  // pg-mem's DROP TABLE doesn't release the primary key index name, so re-creating watchlists
  // in 0105 would fail with "watchlists_pkey already exists". The real watchlists table is
  // created by the db migrations after 0100_drop_watchlists_stub.sql cleans it up.
  for (const f of listSqlFiles(WORKER_MIGRATIONS)) {
    if (f.includes("watchlists_stub")) continue;
    await client.query(readFileSync(join(WORKER_MIGRATIONS, f), "utf8"));
  }

  // Apply db migrations EXCEPT trigger files (pg-mem can't parse SECURITY DEFINER reliably)
  // and storage bucket files (pg-mem has no Supabase `storage` schema).
  // Strip statements pg-mem can't handle and the smoke doesn't need:
  //   - RLS (ENABLE ROW LEVEL SECURITY, CREATE/DROP POLICY)
  //   - GRANT (no role machinery)
  //   - CREATE/DROP VIEW (films_with_stats uses correlated subqueries pg-mem can't execute;
  //     the smoke only asserts tables, not views)
  for (const f of listSqlFiles(DB_MIGRATIONS)) {
    if (f.includes("_trigger")) continue;
    if (f.includes("avatars_bucket")) continue;
    // Pure-DML backfills aren't DDL the smoke cares about, and pg-mem chokes on
    // their UPDATE … FROM (subquery) shape.
    if (f.includes("backfill")) continue;
    // Mig 0152 updates CHECK constraints on tags.type and reseeds with new types.
    // pg-mem's constraint enforcement is strict and doesn't handle constraint
    // modifications and subsequent INSERTs with new type values. Skip it — the smoke
    // only asserts table/column presence, not constraint behavior. RLS tests cover the real constraint.
    if (f === "0152_tagging_system_v2.sql") continue;
    // Skip migrations that depend on enum values added by ALTER TYPE (which pg-mem strips).
    // These are partial-index constraints that reference enum literals not present in pg-mem's
    // version of the enum. The smoke only asserts table presence, not index behavior.
    if (f === "0165_local_haunts_notification_guard.sql") continue;
    // Mig 0196 dedupes open price_alerts with a `DELETE … USING` row-value
    // comparison `(created_at, id) > (…)` that pg-mem's parser rejects. The smoke
    // only asserts table presence; the partial-index behavior is covered by the
    // worker pg-mem suite (which mirrors the same index) and the RLS suite.
    if (f === "0196_price_alerts_open_uniq.sql") continue;
    // Mig 0205 adds production data cleanup plus regex CHECK constraints.
    // pg-mem's schema state around the handle→username rename is not reliable
    // here; real Postgres behavior is covered by input-constraints.test.ts.
    if (f === "0205_input_check_constraints.sql") continue;
    const raw = readFileSync(join(DB_MIGRATIONS, f), "utf8");
    // pg-mem can't parse `LANGUAGE plpgsql SECURITY DEFINER` functions. Skip
    // any migration file that defines one — the smoke only asserts table
    // presence, so trigger files don't need to execute. Match the full phrase
    // so prose comments like "-- (SECURITY DEFINER)" don't trigger the skip.
    if (/LANGUAGE\s+(?:plpgsql|sql)\s+SECURITY\s+DEFINER/i.test(raw)) continue;
    // Strip plpgsql function bodies before splitting on ';' — dollar-quoted
    // bodies contain embedded semicolons that break the statement splitter.
    // pg-mem doesn't support LANGUAGE plpgsql at all (no interpreter registered).
    const withoutFunctions = raw.replace(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql[^;]*;/gi,
      ""
    );
    const stripped = withoutFunctions
      .split(/;\s*\n/)
      .filter(stmt => !/ALTER\s+TABLE\s+\S+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(stmt))
      .filter(stmt => !/CREATE\s+POLICY\b/i.test(stmt))
      .filter(stmt => !/DROP\s+POLICY\b/i.test(stmt))
      .filter(stmt => !/^\s*GRANT\b/im.test(stmt))
      .filter(stmt => !/CREATE\s+(OR\s+REPLACE\s+)?VIEW\b/i.test(stmt))
      .filter(stmt => !/DROP\s+VIEW\b/i.test(stmt))
      .filter(stmt => !/CREATE\s+TRIGGER\b/i.test(stmt))
      // pg-mem throws on unknown extensions; pg_net is Supabase infra.
      .filter(stmt => !/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_net\b/i.test(stmt))
      // pg-mem chokes on `DROP TRIGGER … ON tablename`; the smoke doesn't run
      // triggers anyway, so dropping is a no-op.
      .filter(stmt => !/DROP\s+TRIGGER\b/i.test(stmt))
      // Same story — functions defined via LANGUAGE plpgsql are skipped at
      // file scope, so stale DROP FUNCTION calls have nothing to act on.
      .filter(stmt => !/DROP\s+FUNCTION\b/i.test(stmt))
      .filter(stmt => !/ALTER\s+TYPE\b/i.test(stmt))
      // Realtime publications belong to Supabase infra, not the smoke schema.
      .filter(stmt => !/ALTER\s+PUBLICATION\b/i.test(stmt))
      // Remove statements that are only comments (no actual SQL keyword)
      .filter(stmt => /^\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|WITH|TRUNCATE)\b/im.test(stmt))
      .join(";\n");
    if (stripped.trim()) await client.query(stripped);
  }

  return { client, close: async () => { await client.end(); } };
}
