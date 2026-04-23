import { DataType, newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

function stripUnsupported(sql: string): string {
  return sql
    .replace(/ALTER TABLE \S+ ENABLE ROW LEVEL SECURITY;?/gi, "")
    .replace(/CREATE POLICY[\s\S]+?;/gi, "")
    .replace(/GRANT [\s\S]+?;/gi, "");
}

export async function setupTestDb(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const mem = newDb();

  mem.registerExtension("pgcrypto", (schema) => {
    schema.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
      impure: true,
    });
  });

  mem.public.none(`CREATE SCHEMA IF NOT EXISTS auth`);
  mem.public.none(`
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL
    );
  `);

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
