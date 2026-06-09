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

  // The broad test grants above mirror Supabase defaults for most tables, but
  // mig 0203 intentionally narrows profiles to column-level privileges. Reapply
  // those grants after the broad setup so RLS tests exercise the real contract.
  await client.query(`REVOKE ALL ON TABLE profiles FROM anon, authenticated;`);
  await client.query(`
    GRANT SELECT (id, username, display_name, avatar_url, bio, role, created_at)
      ON profiles TO anon
  `);
  await client.query(`
    GRANT SELECT (id, username, display_name, bio, avatar_url, broadcast_watchlist_adds,
      created_at, updated_at, broadcast_library, broadcast_watched, onboarded_at,
      email_added_at, email_price_drops, email_coven_recs, email_comments,
      email_coven_invites, role, notify_rate_reminders, notify_comment_likes,
      lane_tag_ids, discoverable, is_starter, starter_order, notify_film_requests,
      must_change_password)
      ON profiles TO authenticated
  `);
  await client.query(`
    GRANT UPDATE (username, display_name, bio, avatar_url, broadcast_watchlist_adds,
      broadcast_library, broadcast_watched, email_price_drops, email_coven_recs,
      email_comments, email_coven_invites, notify_rate_reminders, notify_comment_likes,
      notify_film_requests, discoverable, lane_tag_ids, onboarded_at, unsubscribe_token)
      ON profiles TO authenticated
  `);

  return {
    client,
    container,
    connectionString,
    close: async () => { await client.end(); await container.stop(); },
  };
}
