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

  // Then our migrations via the applyMigrations runner so _migrations gets populated.
  // Skip 0117_avatars_bucket — it references Supabase's `storage` schema which is only
  // provisioned on real Supabase, not on vanilla Postgres. RLS tests don't cover storage.
  await applyMigrations(client, DB_MIGRATIONS, {
    skip: f => f.includes("avatars_bucket"),
  });

  // Allow cross-schema access for test roles (they need to read everything the policies permit).
  // Mirror Supabase's real grant structure: anon gets SELECT only; authenticated gets full DML
  // (RLS policies then restrict which rows); service_role already has BYPASSRLS.
  await client.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;`);
  await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);

  return {
    client,
    container,
    connectionString,
    close: async () => { await client.end(); await container.stop(); },
  };
}
