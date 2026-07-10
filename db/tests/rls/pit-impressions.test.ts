import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let eventId: string;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM pit_impressions`);
  await db.client.query(`DELETE FROM feed_events`);
  const { rows } = await db.client.query(
    `INSERT INTO feed_events (event_type, film_id, copy, priority) VALUES ('price_drop', $1, 'test copy', 90) RETURNING id`,
    [fx.filmId],
  );
  eventId = rows[0].id;
  await commit(db.client);
});

describe("RLS: pit_impressions + record_pit_impressions RPC", () => {
  it("RPC inserts on first call and is a no-op on repeat (no counter, no error)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[eventId]]);
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[eventId]]);
    const { rows } = await db.client.query(
      `SELECT count(*)::int AS n FROM pit_impressions WHERE user_id = $1 AND event_id = $2`,
      [fx.userA.id, eventId],
    );
    await commit(db.client);
    expect(rows[0].n).toBe(1);
  });

  it("persists a shared digest key while the legacy one-argument RPC call remains NULL", async () => {
    const admin = db.client;
    await beginAs(admin, null, "service_role");
    const { rows: extraRows } = await admin.query(
      `INSERT INTO feed_events (event_type, film_id, copy, priority) VALUES ('now_free', $1, 'another', 85) RETURNING id`,
      [fx.filmId],
    );
    await commit(admin);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[], $2::text)`, [[eventId], "digest:now_free:2026-07-10:a,b"]);
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[extraRows[0].id]]);
    const { rows } = await db.client.query(
      `SELECT event_id, digest_key FROM pit_impressions ORDER BY event_id`,
    );
    await commit(db.client);

    expect(rows).toEqual(expect.arrayContaining([
      { event_id: eventId, digest_key: "digest:now_free:2026-07-10:a,b" },
      { event_id: extraRows[0].id, digest_key: null },
    ]));
  });

  it("users cannot see each other's impressions", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [[eventId]]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    try {
      const { rows } = await db.client.query(`SELECT * FROM pit_impressions`);
      expect(rows).toHaveLength(0);
    } finally { await rollback(db.client); }
  });

  it("direct INSERT is denied to authenticated (writes only via RPC)", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO pit_impressions (user_id, event_id) VALUES ($1, $2)`,
          [fx.userA.id, eventId],
        )
      ).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("unknown event ids are skipped, not errored", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [
      ["00000000-0000-0000-0000-000000000000", eventId],
    ]);
    const { rows } = await db.client.query(`SELECT event_id FROM pit_impressions`);
    await commit(db.client);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe(eventId);
  });

  it("a batch over 10 ids is rejected (returns without inserting)", async () => {
    const admin = db.client;
    await beginAs(admin, null, "service_role");
    const extraIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const { rows } = await admin.query(
        `INSERT INTO feed_events (event_type, film_id, copy, priority) VALUES ('price_drop', $1, 'x', 1) RETURNING id`,
        [fx.filmId],
      );
      extraIds.push(rows[0].id);
    }
    await commit(admin);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`SELECT record_pit_impressions($1::uuid[])`, [extraIds]);
    const { rows } = await db.client.query(`SELECT count(*)::int AS n FROM pit_impressions`);
    await commit(db.client);
    expect(rows[0].n).toBe(0);
  });
});
