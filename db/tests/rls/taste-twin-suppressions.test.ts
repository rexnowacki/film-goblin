import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit, rollback } from "../helpers/session.js";
import { seedFixtures, type Fixtures } from "../helpers/fixtures.js";
let db: TestDb; let fx: Fixtures;
beforeAll(async () => { db = await makeTestDb(); fx = await seedFixtures(db.client); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await beginAs(db.client, null, "service_role"); await db.client.query("DELETE FROM taste_twin_suppressions"); await commit(db.client); });
describe("RLS: taste_twin_suppressions", () => {
  it("isolates viewer-owned suppression rows", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query("INSERT INTO taste_twin_suppressions(viewer_id,candidate_id,suppressed_until) VALUES ($1,$2,now()+interval '90 days')", [fx.userA.id, fx.userB.id]);
    await commit(db.client);
    await beginAs(db.client, fx.userB.id, "authenticated");
    expect((await db.client.query("SELECT * FROM taste_twin_suppressions")).rows).toHaveLength(0);
    await expect(db.client.query("DELETE FROM taste_twin_suppressions WHERE viewer_id=$1", [fx.userA.id])).resolves.toBeTruthy();
    await commit(db.client);
  });
  it("rejects self-pairs, stale rows, and foreign ownership", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("INSERT INTO taste_twin_suppressions(viewer_id,candidate_id,suppressed_until) VALUES ($1,$1,now()+interval '1 day')", [fx.userA.id])).rejects.toThrow(); await rollback(db.client);
    await beginAs(db.client, fx.userA.id, "authenticated");
    await expect(db.client.query("INSERT INTO taste_twin_suppressions(viewer_id,candidate_id,suppressed_until) VALUES ($1,$2,now()-interval '1 day')", [fx.userA.id, fx.userB.id])).rejects.toThrow(); await rollback(db.client);
    await beginAs(db.client, fx.userB.id, "authenticated");
    await expect(db.client.query("INSERT INTO taste_twin_suppressions(viewer_id,candidate_id,suppressed_until) VALUES ($1,$2,now()+interval '1 day')", [fx.userA.id, fx.userB.id])).rejects.toThrow(); await rollback(db.client);
  });
});
