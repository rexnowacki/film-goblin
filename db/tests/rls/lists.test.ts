import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

async function makeList(db: TestDb, ownerId: string, isPublic: boolean): Promise<string> {
  await beginAs(db.client, null, "service_role");
  const r = await db.client.query<{ id: string }>(
    `INSERT INTO lists (owner_user_id, title, is_public) VALUES ($1, 'T', $2) RETURNING id`,
    [ownerId, isPublic]
  );
  await commit(db.client);
  return r.rows[0].id;
}

describe("RLS: lists", () => {
  it("A can create their own public list", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'My List') RETURNING id`,
        [fx.userA.id]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("A cannot create a list owned by B", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO lists (owner_user_id, title) VALUES ($1, 'Hacked')`,
          [fx.userB.id]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("B can read A's public list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM lists WHERE id = $1`, [listId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot read A's private list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM lists WHERE id = $1`, [listId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("A can read their own private list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT id FROM lists WHERE id = $1`, [listId]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });
});

describe("RLS: list_films", () => {
  it("A can add a film to their own list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0) RETURNING list_id`,
        [listId, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot add a film to A's list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0)`,
          [listId, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("films in a private list are hidden from other users", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO list_films (list_id, film_id, position) VALUES ($1, $2, 0)`, [listId, fx.filmId]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM list_films WHERE list_id = $1`, [listId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});

describe("RLS: list_subscriptions", () => {
  it("B can subscribe to A's public list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userB.id, listId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("B cannot subscribe to A's private list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, false);
    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2)`,
          [fx.userB.id, listId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("A can see who subscribed to their list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2)`, [fx.userB.id, listId]);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT user_id FROM list_subscriptions WHERE list_id = $1`, [listId]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].user_id).toBe(fx.userB.id);
    } finally { await rollback(db.client); }
  });

  it("C cannot see who subscribed to A's list", async () => {
    const fx = await seedFixtures(db.client);
    const listId = await makeList(db, fx.userA.id, true);
    await beginAs(db.client, null, "service_role");
    await db.client.query(`INSERT INTO list_subscriptions (user_id, list_id) VALUES ($1, $2)`, [fx.userB.id, listId]);
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT user_id FROM list_subscriptions WHERE list_id = $1`, [listId]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });
});
