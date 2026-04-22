import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

describe("RLS: reviews", () => {
  it("staff can create a draft review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B') RETURNING status`,
        [fx.filmId, fx.staffS.id]
      );
      expect(r.rows[0].status).toBe("draft");
    } finally { await rollback(db.client); }
  });

  it("non-staff cannot create a review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
          [fx.filmId, fx.userA.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("anyone can read a published review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
       VALUES ($1, $2, 'T', 'B', 'published', now())`,
      [fx.filmId, fx.staffS.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM reviews WHERE film_id = $1`, [fx.filmId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("anonymous cannot see drafts", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
      [fx.filmId, fx.staffS.id]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT id FROM reviews WHERE film_id = $1`, [fx.filmId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("author can see their own draft", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
      [fx.filmId, fx.staffS.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT status FROM reviews WHERE film_id = $1`, [fx.filmId]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].status).toBe("draft");
    } finally { await rollback(db.client); }
  });

  it("other staff cannot see another staff's draft", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO reviews (film_id, author_user_id, title, body) VALUES ($1, $2, 'T', 'B')`,
      [fx.filmId, fx.staffS.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM reviews WHERE film_id = $1 AND status = 'draft'`, [fx.filmId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("admin can delete any review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
       VALUES ($1, $2, 'T', 'B', 'published', now()) RETURNING id`,
      [fx.filmId, fx.staffS.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.adminA.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM reviews WHERE id = $1 RETURNING id`, [r.rows[0].id]);
      expect(d.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("non-admin staff cannot delete a review", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const r = await db.client.query<{ id: string }>(
      `INSERT INTO reviews (film_id, author_user_id, title, body, status, published_at)
       VALUES ($1, $2, 'T', 'B', 'published', now()) RETURNING id`,
      [fx.filmId, fx.staffS.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.staffS.id, "authenticated");
    try {
      const d = await db.client.query(`DELETE FROM reviews WHERE id = $1`, [r.rows[0].id]);
      expect(d.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});
