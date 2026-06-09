import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: profiles", () => {
  it("anyone can read any profile", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM profiles WHERE id = $1`, [fx.userB.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("anonymous can also read profiles", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM profiles WHERE id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("user can update their own profile's display_name", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET display_name = 'changed' WHERE id = $1 RETURNING display_name`,
        [fx.userA.id]
      );
      expect(r.rows[0].display_name).toBe("changed");
    } finally { await rollback(db.client); }
  });

  it("user cannot update another user's profile", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET display_name = 'hacked' WHERE id = $1 RETURNING display_name`,
        [fx.userB.id]
      );
      // RLS makes the UPDATE match zero rows rather than throw
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("anon cannot update profiles", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(
          `UPDATE profiles SET display_name = 'x' WHERE id = $1`,
          [fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("authenticated cannot directly INSERT a profile (no insert policy)", async () => {
    await beginAs(db.client, null, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO profiles (id, username, display_name) VALUES (gen_random_uuid(), 'x', 'X')`
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("user can update their own lane_tag_ids", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const tag = await db.client.query<{ id: string }>(
      `SELECT id FROM tags WHERE name = 'folk horror' AND type = 'subgenre' LIMIT 1`
    );
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query<{ lane_tag_ids: string[] }>(
        `UPDATE profiles SET lane_tag_ids = ARRAY[$1::uuid] WHERE id = $2 RETURNING lane_tag_ids`,
        [tag.rows[0].id, fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].lane_tag_ids).toEqual([tag.rows[0].id]);
    } finally { await rollback(db.client); }
  });

  it("user cannot update another user's lane_tag_ids", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET lane_tag_ids = ARRAY[]::uuid[] WHERE id = $1`,
        [fx.userB.id]
      );
      expect(r.rowCount).toBe(0); // RLS filters out the row
    } finally { await rollback(db.client); }
  });

  it("lane_tag_ids defaults to empty array on a fresh profile", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query<{ lane_tag_ids: string[] }>(
        `SELECT lane_tag_ids FROM profiles WHERE id = $1`,
        [fx.userA.id]
      );
      expect(r.rows[0].lane_tag_ids).toEqual([]);
    } finally { await rollback(db.client); }
  });

  it("username uniqueness is enforced", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      // Direct service-role insert to test the unique index — it bypasses RLS
      await expect(
        db.client.query(
          `INSERT INTO profiles (id, username, display_name)
           VALUES (gen_random_uuid(), $1, 'Clash')`,
          [fx.userA.username]
        )
      ).rejects.toThrow(/unique/i);
    } finally { await rollback(db.client); }
  });
});
