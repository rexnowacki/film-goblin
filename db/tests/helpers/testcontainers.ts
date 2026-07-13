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
  // Skip Storage-only migrations: Supabase provisions the `storage` schema, while
  // vanilla Postgres testcontainers do not. Storage is covered by app validation/
  // route contracts; table/function RLS remains real-Postgres tested here.
  await applyMigrations(client, DB_MIGRATIONS, {
    skip: f => f.includes("avatars_bucket") || f.includes("badge_images_bucket"),
  });

  // Allow cross-schema access for test roles (they need to read everything the policies permit).
  // Mirror Supabase's real grant structure: anon gets SELECT only; authenticated gets full DML
  // (RLS policies then restrict which rows); service_role already has BYPASSRLS.
  await client.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;`);
  await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);

  // Mig 0222 deliberately withholds definition authorship and award evidence.
  // Reapply its column grants after the broad test-harness bootstrap grant.
  await client.query(`REVOKE ALL ON TABLE badges, user_badges FROM anon, authenticated;`);
  await client.query(`
    GRANT SELECT (id, slug, name, description, image_url, condition_kind,
      threshold, is_active, created_at, updated_at)
      ON badges TO anon, authenticated
  `);
  await client.query(`
    GRANT SELECT (user_id, badge_id, awarded_at)
      ON user_badges TO anon, authenticated
  `);

  // Mig 0215 is RPC-only for writes. The broad authenticated DML grant above
  // models the Supabase default but would erase this feature's narrower grant.
  await client.query(`REVOKE ALL ON TABLE product_events FROM anon, authenticated;`);
  await client.query(`GRANT SELECT ON TABLE product_events TO authenticated;`);

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
