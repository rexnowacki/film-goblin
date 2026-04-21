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
  // pg-mem throws on unknown extensions, so register pgcrypto and supply gen_random_uuid.
  mem.registerExtension("pgcrypto", (schema) => {
    schema.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      implementation: () => randomUUID(),
      impure: true,
    });
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
  // Also strip RLS statements (ENABLE ROW LEVEL SECURITY, CREATE POLICY) — pg-mem doesn't
  // support them and the smoke test only checks DDL shape, not policy enforcement.
  for (const f of listSqlFiles(DB_MIGRATIONS)) {
    if (f.includes("_trigger")) continue;
    const raw = readFileSync(join(DB_MIGRATIONS, f), "utf8");
    const stripped = raw
      .split(/;\s*\n/)
      .filter(stmt => !/ALTER\s+TABLE\s+\S+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(stmt))
      .filter(stmt => !/CREATE\s+POLICY\b/i.test(stmt))
      .join(";\n");
    if (stripped.trim()) await client.query(stripped);
  }

  return { client, close: async () => { await client.end(); } };
}
