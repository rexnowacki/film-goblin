import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback, commit } from "../helpers/session.js";
import { seedFixtures, type Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query("DELETE FROM product_events");
  await commit(db.client);
});

function event(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "11111111-1111-4111-8111-111111111111",
    event_name: "session_started",
    session_id: "22222222-2222-4222-8222-222222222222",
    path: "/home",
    properties: { entry_source: "direct" },
    occurred_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("RLS: product_events + record_product_events", () => {
  it("records a valid batch once and makes retries idempotent", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    const first = await db.client.query("SELECT record_product_events($1::jsonb) AS n", [JSON.stringify([event()])]);
    const retry = await db.client.query("SELECT record_product_events($1::jsonb) AS n", [JSON.stringify([event()])]);
    expect(first.rows[0].n).toBe(1);
    expect(retry.rows[0].n).toBe(0);
    await commit(db.client);
  });

  it("users see only their own events while service role sees all", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify([event()])]);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    const hidden = await db.client.query("SELECT * FROM product_events");
    expect(hidden.rows).toHaveLength(0);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const all = await db.client.query("SELECT * FROM product_events");
    expect(all.rows).toHaveLength(1);
    await commit(db.client);
  });

  it.each(["INSERT", "UPDATE", "DELETE"])("denies direct %s", async operation => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      const query = operation === "INSERT"
        ? "INSERT INTO product_events (id,user_id,session_id,event_name,occurred_at) VALUES (gen_random_uuid(),$1,gen_random_uuid(),'session_started',now())"
        : operation === "UPDATE"
          ? "UPDATE product_events SET path='/x'"
          : "DELETE FROM product_events";
      await expect(db.client.query(query, operation === "INSERT" ? [fx.userA.id] : [])).rejects.toThrow();
    } finally { await rollback(db.client); }
  });

  it("rejects unauthenticated, unknown, oversized, stale, and unsafe events", async () => {
    await beginAs(db.client, null, "anon");
    await expect(db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify([event()])])).rejects.toThrow();
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify([event({ event_name: "made_up" })])])).rejects.toThrow();
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify(Array.from({ length: 21 }, (_, i) => event({ event_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })))])).rejects.toThrow();
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify([event({ occurred_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })])])).rejects.toThrow();
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify([event({ properties: { note: "private" } })])])).rejects.toThrow();
    await rollback(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("SELECT record_product_events($1::jsonb)", [JSON.stringify([event({ properties: { entry_source: { nested: true } } })])])).rejects.toThrow();
    await rollback(db.client);
  });
});
