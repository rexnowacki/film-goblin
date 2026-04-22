import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "./helpers/testcontainers.js";
import { beginAs, rollback, commit } from "./helpers/session.js";
import { seedFixtures } from "./helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("trigger: auth.users → profiles bootstrap", () => {
  it("creates a matching profiles row with a unique handle", async () => {
    const id = randomUUID();
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'goblin@test.example')`, [id]);
      const r = await db.client.query(`SELECT handle FROM profiles WHERE id = $1`, [id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].handle).toMatch(/^goblin/);
    } finally { await rollback(db.client); }
  });

  it("de-duplicates handles by suffix", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      const a = randomUUID(), b = randomUUID();
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@test.example')`, [a]);
      await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@other.example')`, [b]);
      const r = await db.client.query(
        `SELECT lower(handle) AS h FROM profiles WHERE id IN ($1, $2) ORDER BY handle`, [a, b]
      );
      const handles = r.rows.map((x: any) => x.h);
      expect(handles).toContain("alice");
      expect(handles.some((h: string) => /^alice\d+$/.test(h))).toBe(true);
    } finally { await rollback(db.client); }
  });
});
