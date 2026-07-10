import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit, rollback } from "../helpers/session.js";
import { seedFixtures, type Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => { db = await makeTestDb(); fx = await seedFixtures(db.client); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query("DELETE FROM return_contract_deferrals");
  await commit(db.client);
});

describe("RLS: return_contract_deferrals", () => {
  it("lets an owner create, read, update, and delete only their deferral", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query("INSERT INTO return_contract_deferrals(user_id,contract_key,deferred_until) VALUES ($1,'recommendation:1',now()+interval '1 hour')", [fx.userA.id]);
    expect((await db.client.query("SELECT contract_key FROM return_contract_deferrals")).rows).toHaveLength(1);
    await db.client.query("UPDATE return_contract_deferrals SET deferred_until=now()+interval '2 hours'");
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    expect((await db.client.query("SELECT * FROM return_contract_deferrals")).rows).toHaveLength(0);
    await expect(db.client.query("INSERT INTO return_contract_deferrals(user_id,contract_key,deferred_until) VALUES ($1,'stolen',now()+interval '1 hour')", [fx.userA.id])).rejects.toThrow();
    await rollback(db.client);
  });

  it("rejects stale and oversized keys while service role can aggregate", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("INSERT INTO return_contract_deferrals(user_id,contract_key,deferred_until) VALUES ($1,'bad',now()-interval '1 second')", [fx.userA.id])).rejects.toThrow();
    await rollback(db.client);

    await beginAs(db.client, null, "service_role");
    await db.client.query("INSERT INTO return_contract_deferrals(user_id,contract_key,deferred_until) VALUES ($1,'ok',now()+interval '1 hour')", [fx.userA.id]);
    expect((await db.client.query("SELECT * FROM return_contract_deferrals")).rows).toHaveLength(1);
    await commit(db.client);
  });
});
