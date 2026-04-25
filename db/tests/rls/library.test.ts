import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  // Reset library + coven edges between tests via service_role.
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM library`);
  await db.client.query(`DELETE FROM coven_members`);
  // Also reset broadcast_library to default TRUE for each user.
  await db.client.query(`UPDATE profiles SET broadcast_library = TRUE`);
  await commit(db.client);
});

// Helper: insert a coven_members edge respecting the (user_a < user_b) invariant.
async function bond(client: typeof db.client, x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await client.query(
    `INSERT INTO coven_members (user_a_id, user_b_id) VALUES ($1, $2)`,
    [a, b]
  );
}

describe("RLS: library", () => {
  it("anon SELECT is denied — returns 0 rows even when rows exist", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM library`);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner SELECT own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=TRUE — SELECT allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("coven mate with broadcast=FALSE — SELECT denied", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await bond(db.client, fx.userA.id, fx.userB.id);
    await db.client.query(
      `UPDATE profiles SET broadcast_library = FALSE WHERE id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("non-coven user — SELECT denied even with broadcast=TRUE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    // No coven edge between userA and userC.
    await commit(db.client);

    await beginAs(db.client, fx.userC.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM library WHERE user_id = $1`, [fx.userA.id]);
      expect(r.rowCount).toBe(0);
    } finally { await rollback(db.client); }
  });

  it("owner INSERT own row — allowed", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(
        `INSERT INTO library (user_id, film_id) VALUES ($1, $2) RETURNING user_id`,
        [fx.userA.id, fx.filmId]
      );
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("INSERT with spoofed user_id — denied", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
          [fx.userB.id, fx.filmId]
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("owner DELETE own row — allowed", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM library WHERE user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(1);
  });

  it("non-owner DELETE — no-op (RLS filters out the row)", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO library (user_id, film_id) VALUES ($1, $2)`,
      [fx.userA.id, fx.filmId]
    );
    await commit(db.client);

    // userB tries to delete userA's row. Bonded coven; broadcast=TRUE means
    // userB CAN see the row (SELECT) but the DELETE policy is owner-only.
    await bond(db.client, fx.userA.id, fx.userB.id);
    await beginAs(db.client, fx.userB.id, "authenticated");
    const del = await db.client.query(
      `DELETE FROM library WHERE user_id = $1`,
      [fx.userA.id]
    );
    await commit(db.client);
    expect(del.rowCount).toBe(0);

    // Confirm row still exists via service_role.
    await beginAs(db.client, null, "service_role");
    const remaining = await db.client.query(
      `SELECT user_id FROM library`
    );
    await commit(db.client);
    expect(remaining.rowCount).toBe(1);
  });
});
