import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let subgenreTagId: string;
let toneTagId: string;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);

  await beginAs(db.client, null, "service_role");
  const sg = await db.client.query<{ id: string }>(
    `SELECT id FROM tags WHERE name = 'folk horror' AND type = 'subgenre' LIMIT 1`,
  );
  subgenreTagId = sg.rows[0].id;
  const t = await db.client.query<{ id: string }>(
    `SELECT id FROM tags WHERE name = 'fever dream' AND type = 'tone' LIMIT 1`,
  );
  toneTagId = t.rows[0].id;
  await commit(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM film_tags`);
  await commit(db.client);
});

describe("RLS: tags + film_tags", () => {
  it("anon SELECT on tags returns the seeded canonical rows by facet", async () => {
    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query<{ type: string; count: string }>(
        `SELECT type, count(*)::text AS count FROM tags GROUP BY type ORDER BY type`,
      );
      const byType = Object.fromEntries(r.rows.map(row => [row.type, Number(row.count)]));
      expect(byType.subgenre).toBe(24);
      expect(byType.subject).toBe(17);
      expect(byType.tone).toBe(16);
      expect(byType.theme).toBe(21);
      expect(byType.setting).toBe(6);
      expect(byType.content).toBe(4);
      // Spot-check the v2 add: breakup horror is in themes.
      const bh = await db.client.query<{ count: string }>(
        `SELECT count(*)::text FROM tags WHERE name = 'breakup horror' AND type = 'theme'`,
      );
      expect(Number(bh.rows[0].count)).toBe(1);
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
      [tmpFilmId, subgenreTagId, toneTagId],
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
      `INSERT INTO tags (name, type) VALUES ('throwaway-tone', 'tone') RETURNING id`,
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

  describe("v2 schema — positional + horror_adjacent", () => {
    it("rejects two is_primary=TRUE rows for the same film", async () => {
      await beginAs(db.client, null, "service_role");
      try {
        const sgB = await db.client.query<{ id: string }>(
          `SELECT id FROM tags WHERE name = 'gothic' AND type = 'subgenre' LIMIT 1`,
        );
        await db.client.query(
          `INSERT INTO film_tags (film_id, tag_id, position, is_primary)
           VALUES ($1, $2, 1, true)`,
          [fx.filmId, subgenreTagId],
        );
        await expect(
          db.client.query(
            `INSERT INTO film_tags (film_id, tag_id, position, is_primary)
             VALUES ($1, $2, 5, true)`,
            [fx.filmId, sgB.rows[0].id],
          ),
        ).rejects.toThrow(/film_tags_one_primary_per_film/);
      } finally { await rollback(db.client); }
    });

    it("allows multiple is_primary=FALSE rows per film", async () => {
      await beginAs(db.client, null, "service_role");
      try {
        const tone1 = await db.client.query<{ id: string }>(
          `SELECT id FROM tags WHERE name = 'fever dream' AND type = 'tone' LIMIT 1`,
        );
        const tone2 = await db.client.query<{ id: string }>(
          `SELECT id FROM tags WHERE name = 'bleak' AND type = 'tone' LIMIT 1`,
        );
        await db.client.query(
          `INSERT INTO film_tags (film_id, tag_id, position, is_primary)
           VALUES ($1, $2, 1, true), ($1, $3, 2, false), ($1, $4, 3, false)`,
          [fx.filmId, subgenreTagId, tone1.rows[0].id, tone2.rows[0].id],
        );
        const r = await db.client.query<{ count: string }>(
          `SELECT count(*)::text FROM film_tags WHERE film_id = $1`,
          [fx.filmId],
        );
        expect(Number(r.rows[0].count)).toBe(3);
      } finally { await rollback(db.client); }
    });

    it("composite PK rejects duplicate (film_id, tag_id) regardless of position", async () => {
      await beginAs(db.client, null, "service_role");
      try {
        const tone = await db.client.query<{ id: string }>(
          `SELECT id FROM tags WHERE name = 'fever dream' AND type = 'tone' LIMIT 1`,
        );
        await db.client.query(
          `INSERT INTO film_tags (film_id, tag_id, position) VALUES ($1, $2, 2)`,
          [fx.filmId, tone.rows[0].id],
        );
        await expect(
          db.client.query(
            `INSERT INTO film_tags (film_id, tag_id, position) VALUES ($1, $2, 5)`,
            [fx.filmId, tone.rows[0].id],
          ),
        ).rejects.toThrow();
      } finally { await rollback(db.client); }
    });

    it("CHECK constraint rejects unknown tag types", async () => {
      await beginAs(db.client, null, "service_role");
      try {
        await expect(
          db.client.query(
            `INSERT INTO tags (name, type) VALUES ('test-bogus', 'fake-facet')`,
          ),
        ).rejects.toThrow(/tags_type_check/);
      } finally { await rollback(db.client); }
    });

    it("films.horror_adjacent defaults FALSE and accepts updates via service-role", async () => {
      await beginAs(db.client, null, "service_role");
      try {
        const before = await db.client.query<{ horror_adjacent: boolean }>(
          `SELECT horror_adjacent FROM films WHERE id = $1`,
          [fx.filmId],
        );
        expect(before.rows[0].horror_adjacent).toBe(false);
        await db.client.query(
          `UPDATE films SET horror_adjacent = true WHERE id = $1`,
          [fx.filmId],
        );
        const after = await db.client.query<{ horror_adjacent: boolean }>(
          `SELECT horror_adjacent FROM films WHERE id = $1`,
          [fx.filmId],
        );
        expect(after.rows[0].horror_adjacent).toBe(true);
      } finally { await rollback(db.client); }
    });
  });
});
