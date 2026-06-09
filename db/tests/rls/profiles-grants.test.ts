import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

describe("profiles column-level grants", () => {
  it("anon can read the public identity subset", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(
        `SELECT id, username, display_name, avatar_url, bio, role, created_at
           FROM profiles WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally {
      await rollback(db.client);
    }
  });

  it("anon cannot read private profile columns or select star", async () => {
    const fx = await seedFixtures(db.client);

    for (const sql of [
      `SELECT unsubscribe_token FROM profiles WHERE id = $1`,
      `SELECT email_price_drops FROM profiles WHERE id = $1`,
      `SELECT * FROM profiles WHERE id = $1`,
    ]) {
      await beginAs(db.client, null, "anon");
      try {
        await expect(db.client.query(sql, [fx.userA.id])).rejects.toThrow(/permission denied/i);
      } finally {
        await rollback(db.client);
      }
    }
  });

  it("authenticated cannot read unsubscribe_token", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`SELECT unsubscribe_token FROM profiles WHERE id = $1`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }
  });

  it("authenticated can read prefs and middleware gate columns", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `SELECT email_price_drops, onboarded_at, must_change_password
           FROM profiles WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally {
      await rollback(db.client);
    }
  });

  it("authenticated can update own bio but not must_change_password or role", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`UPDATE profiles SET bio = 'a new bio' WHERE id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally {
      await rollback(db.client);
    }

    for (const sql of [
      `UPDATE profiles SET must_change_password = false WHERE id = $1`,
      `UPDATE profiles SET role = 'witch' WHERE id = $1`,
    ]) {
      await beginAs(db.client, fx.userA.id, "authenticated");
      try {
        await expect(db.client.query(sql, [fx.userA.id])).rejects.toThrow(/permission denied/i);
      } finally {
        await rollback(db.client);
      }
    }
  });

  it("authenticated cannot insert or delete profiles rows", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO profiles (id, username, display_name) VALUES ($1, 'sneaky', 'Sneaky')`,
          [fx.userB.id],
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(`DELETE FROM profiles WHERE id = $1`, [fx.userA.id]))
        .rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }
  });

  it("service_role still reads every column", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `SELECT unsubscribe_token, must_change_password FROM profiles WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].unsubscribe_token).toBeTruthy();
    } finally {
      await rollback(db.client);
    }
  });
});
