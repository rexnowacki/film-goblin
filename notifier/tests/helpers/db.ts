import { DataType, newDb } from "pg-mem";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const WORKER_MIGRATIONS = join(REPO_ROOT, "worker", "migrations");
const DB_MIGRATIONS = join(REPO_ROOT, "db", "migrations");

function listSqlFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
}

// Removes / strips DDL pg-mem can't handle:
//   - plpgsql function bodies (SECURITY DEFINER triggers, etc.)
//   - CREATE/DROP TRIGGER (no functions left to call)
//   - RLS (ENABLE ROW LEVEL SECURITY, CREATE/DROP POLICY)
//   - GRANT / REVOKE (no role machinery)
//   - CREATE/DROP VIEW (correlated subquery views fail to parse; tests don't read views)
function stripUnsupported(sql: string): string {
  let out = sql.replace(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi, "");
  out = out.replace(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b[\s\S]*?;/gi, "");
  out = out.replace(/DROP\s+TRIGGER\b[\s\S]*?;/gi, "");
  return out
    .split(/;\s*\n/)
    .filter(s => !/ALTER\s+TABLE\s+\S+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(s))
    .filter(s => !/CREATE\s+POLICY\b/i.test(s))
    .filter(s => !/DROP\s+POLICY\b/i.test(s))
    .filter(s => !/^\s*GRANT\b/im.test(s))
    .filter(s => !/^\s*REVOKE\b/im.test(s))
    .filter(s => !/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/i.test(s))
    .filter(s => !/DROP\s+VIEW\b/i.test(s))
    .join(";\n");
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
  mem.public.registerFunction({
    name: "char_length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string | null) => (s == null ? null : s.length),
  });

  mem.public.none(`CREATE SCHEMA IF NOT EXISTS auth`);
  mem.public.none(`
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  mem.public.none(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULL::uuid;
    $$;
  `);

  // Worker migrations (films, price_history). Skip the watchlists stub —
  // db/0100 drops it on the real path; here we want db/0105 to own the table.
  for (const f of listSqlFiles(WORKER_MIGRATIONS)) {
    if (f.includes("watchlists_stub")) continue;
    mem.public.none(readFileSync(join(WORKER_MIGRATIONS, f), "utf8"));
  }

  // db migrations, all of them, generic strip pass.
  for (const f of listSqlFiles(DB_MIGRATIONS)) {
    if (f.includes("avatars_bucket")) continue; // pg-mem has no Supabase storage schema
    if (f.includes("backfill")) continue;       // correlated-subquery UPDATE FROMs pg-mem can't run
    let raw = readFileSync(join(DB_MIGRATIONS, f), "utf8");
    // pg-mem doesn't update index expressions when a column is renamed, so
    // a subsequent DROP INDEX referencing the old column errors with
    // "Column not found". Pre-drop the index before the rename runs.
    if (f === "0137_rename_handle_to_username.sql") {
      raw = `DROP INDEX IF EXISTS profiles_handle_lower_idx;\n${raw}`;
    }
    const stripped = stripUnsupported(raw);
    // pg-mem chokes on comment-only blocks ("Unexpected end of input") — skip
    // files where strip leaves nothing executable.
    const codeOnly = stripped
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*/g, "")
      .trim();
    if (!codeOnly) continue;
    try {
      mem.public.none(stripped);
    } catch (err) {
      throw new Error(`notifier setupTestDb: db/migrations/${f} failed: ${(err as Error).message}`);
    }
  }

  const { Client } = mem.adapters.createPg();
  const client = new Client() as unknown as Client;
  await client.connect();
  return { client, cleanup: async () => { await client.end(); } };
}
