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
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM feed_events`);
  await commit(db.client);
});

describe("RLS: feed_events", () => {
  it("service role can INSERT", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'The pit now holds 250 films. The hoard grows.', 50)`
    );
    await commit(db.client);
  });

  it("anon can SELECT", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'x', 50)`
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`SELECT * FROM feed_events`);
      expect(r.rowCount).toBe(1);
    } finally { await rollback(db.client); }
  });

  it("authenticated can SELECT but cannot INSERT", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(db.client.query(
        `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'x', 50)`
      )).rejects.toThrow();
    } finally { await rollback(db.client); }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const r = await db.client.query(`SELECT * FROM feed_events`);
      expect(r.rowCount).toBe(0); // empty table — but the SELECT itself must not error
    } finally { await rollback(db.client); }
  });

  it("anon cannot DELETE", async () => {
    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO feed_events (event_type, copy, priority) VALUES ('milestone', 'x', 50)`
    );
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const r = await db.client.query(`DELETE FROM feed_events`);
      expect(r.rowCount).toBe(0); // RLS: silently affects 0 rows
    } finally { await rollback(db.client); }
  });
});
