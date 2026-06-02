import { newDb, DataType } from "pg-mem";
import { applyMigrations } from "../../src/migrate.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations"
);

export async function makeTestDb(): Promise<{ client: Client; close: () => Promise<void> }> {
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
  // pg-mem has no advisory locks; shim them so runOnce's run-lock gate is a no-op
  // in single-connection tests (always acquirable). Real serialization is a
  // Postgres concern, exercised against the live DB, not pg-mem.
  mem.public.registerFunction({
    name: "pg_try_advisory_lock",
    args: [DataType.integer],
    returns: DataType.bool,
    implementation: () => true,
    impure: true,
  });
  mem.public.registerFunction({
    name: "pg_advisory_unlock",
    args: [DataType.integer],
    returns: DataType.bool,
    implementation: () => true,
    impure: true,
  });
  const { Client: PgMemClient } = mem.adapters.createPg();
  const client = new PgMemClient() as unknown as Client;
  await client.connect();
  await applyMigrations(client, MIGRATIONS_DIR);
  return {
    client,
    close: async () => { await client.end(); },
  };
}
