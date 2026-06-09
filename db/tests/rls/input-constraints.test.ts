import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

describe("input CHECK constraints", () => {
  it("rejects malformed usernames", async () => {
    const fx = await seedFixtures(db.client);
    for (const bad of ["Bad Name!", "a".repeat(25), ".", "..", "a.", ".a", "___", "._."]) {
      await beginAs(db.client, null, "service_role");
      try {
        await expect(
          db.client.query(`UPDATE profiles SET username = $2 WHERE id = $1`, [fx.userA.id, bad]),
        ).rejects.toThrow(/profiles_username_format/);
      } finally {
        await rollback(db.client);
      }
    }
  });

  it("rejects oversized display_name, bio, and avatar_url", async () => {
    const fx = await seedFixtures(db.client);
    for (const [column, len, constraint] of [
      ["display_name", 51, "profiles_display_name_len"],
      ["bio", 501, "profiles_bio_len"],
      ["avatar_url", 1001, "profiles_avatar_url_len"],
    ] as const) {
      await beginAs(db.client, null, "service_role");
      try {
        await expect(
          db.client.query(`UPDATE profiles SET ${column} = repeat('x', ${len}) WHERE id = $1`, [fx.userA.id]),
        ).rejects.toThrow(new RegExp(constraint));
      } finally {
        await rollback(db.client);
      }
    }
  });

  it("accepts boundary values", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `UPDATE profiles SET display_name = repeat('x', 50), bio = repeat('x', 500),
                avatar_url = repeat('x', 1000), username = repeat('a', 24)
          WHERE id = $1`,
        [fx.userA.id],
      );
      expect(r.rowCount).toBe(1);
    } finally {
      await rollback(db.client);
    }
  });

  it("rejects oversized watch notes, accepts 500", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      await expect(
        db.client.query(
          `INSERT INTO watched (user_id, film_id, note) VALUES ($1, $2, repeat('x', 501))`,
          [fx.userA.id, fx.filmId],
        ),
      ).rejects.toThrow(/watched_note_len/);
    } finally {
      await rollback(db.client);
    }

    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `INSERT INTO watched (user_id, film_id, note) VALUES ($1, $2, repeat('x', 500)) RETURNING id`,
        [fx.userA.id, fx.filmId],
      );
      expect(r.rowCount).toBe(1);
    } finally {
      await rollback(db.client);
    }
  });
});
