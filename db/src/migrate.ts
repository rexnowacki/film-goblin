import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";

export async function applyMigrations(client: Client, migrationsDir: string, opts?: { skip?: (filename: string) => boolean }): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (opts?.skip?.(file)) continue;
    const r = await client.query(`SELECT 1 FROM _migrations WHERE name = $1`, [file]);
    if (r.rowCount && r.rowCount > 0) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    // Wrap each migration + its tracking insert in a single transaction so a
    // partial failure leaves no half-applied state.
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    applied.push(file);
  }
  return applied;
}
