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
