import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let subgenreTagId: string;
let vibeTagId: string;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);

  await beginAs(db.client, null, "service_role");
  const sg = await db.client.query<{ id: string }>(
    `SELECT id FROM tags WHERE name = 'witchcraft' AND type = 'subgenre' LIMIT 1`,
  );
  subgenreTagId = sg.rows[0].id;
  const v = await db.client.query<{ id: string }>(
    `SELECT id FROM tags WHERE name = 'occult' AND type = 'vibe' LIMIT 1`,
  );
  vibeTagId = v.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM film_tags`);
  await commit(db.client);
});

describe("RLS: tags + film_tags", () => {
  it("anon SELECT on tags returns the seeded canonical rows", async () => {
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query<{ count: string }>(
        `SELECT count(*)::text FROM tags WHERE type = 'subgenre'`,
      );
      expect(Number(r.rows[0].count)).toBe(18);
    } finally { await rollback(db.client); }
  });

  it("anon SELECT on film_tags after a service-role insert returns the row", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO film_tags (film_id, tag_id) VALUES ($1, $2)`,
      [fx.filmId, subgenreTagId],
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(
        `SELECT * FROM film_tags WHERE film_id = $1`,
        [fx.filmId],
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated INSERT into film_tags is denied (no GRANT)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO film_tags (film_id, tag_id) VALUES ($1, $2)`,
          [fx.filmId, subgenreTagId],
        ),
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("composite PK rejects duplicate inserts", async () => {
    await beginAs(db.client, null, "service_role");
    try {
      await db.client.query(
        `INSERT INTO film_tags (film_id, tag_id) VALUES ($1, $2)`,
        [fx.filmId, subgenreTagId],
      );
      await expect(
        db.client.query(
          `INSERT INTO film_tags (film_id, tag_id) VALUES ($1, $2)`,
          [fx.filmId, subgenreTagId],
        ),
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("ON DELETE CASCADE — deleting a film clears its film_tags rows", async () => {
    await beginAs(db.client, null, "service_role");
    const f = await db.client.query<{ id: string }>(
      `INSERT INTO films (itunes_id, title, director, year)
       VALUES ($1, 'Throwaway', 'Dir', 2024) RETURNING id`,
      [Math.floor(Math.random() * 1_000_000_000)],
    );
    const tmpFilmId = f.rows[0].id;
    await db.client.query(
      `INSERT INTO film_tags (film_id, tag_id) VALUES ($1, $2), ($1, $3)`,
      [tmpFilmId, subgenreTagId, vibeTagId],
    );
    await db.client.query(`DELETE FROM films WHERE id = $1`, [tmpFilmId]);
    const r = await db.client.query(
      `SELECT * FROM film_tags WHERE film_id = $1`,
      [tmpFilmId],
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });

  it("ON DELETE CASCADE — deleting a tag clears all film_tags referring to it", async () => {
    await beginAs(db.client, null, "service_role");
    const t = await db.client.query<{ id: string }>(
      `INSERT INTO tags (name, type) VALUES ('throwaway-vibe', 'vibe') RETURNING id`,
    );
    const tmpTagId = t.rows[0].id;
    await db.client.query(
      `INSERT INTO film_tags (film_id, tag_id) VALUES ($1, $2)`,
      [fx.filmId, tmpTagId],
    );
    await db.client.query(`DELETE FROM tags WHERE id = $1`, [tmpTagId]);
    const r = await db.client.query(
      `SELECT * FROM film_tags WHERE tag_id = $1`,
      [tmpTagId],
    );
    expect(r.rowCount).toBe(0);
    await commit(db.client);
  });
});
