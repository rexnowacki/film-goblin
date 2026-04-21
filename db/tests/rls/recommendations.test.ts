import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: recommendations", () => {
  it("A can recommend a film to B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO recommendations (from_user_id, to_user_id, film_id, note) VALUES ($1, $2, $3, 'watch this') RETURNING id`,
        [fx.userA.id, fx.userB.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("A cannot forge a rec as coming from B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3)`,
          [fx.userB.id, fx.userC.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("anyone can read a recommendation", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3)`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM recommendations WHERE from_user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("sender can delete their own rec", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3) RETURNING id`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM recommendations WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("recipient can delete a rec (dismiss)", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3) RETURNING id`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM recommendations WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("uninvolved user cannot delete someone else's rec", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $2, $3) RETURNING id`,
      [fx.userA.id, fx.userB.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM recommendations WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("self-recommendation is rejected", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO recommendations (from_user_id, to_user_id, film_id) VALUES ($1, $1, $2)`,
          [fx.userA.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });
});
