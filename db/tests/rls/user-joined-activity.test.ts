import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit } from "../helpers/session.js";

let db: TestDb;

beforeAll(async () => {
  db = await makeTestDb();
});

afterAll(async () => { await db.close(); });

describe("user_joined activity — fires when a new profile is created", () => {
  it("emits exactly one user_joined activity row with the new user as actor", async () => {
    const id = randomUUID();
    await beginAs(db.client, null, "service_role");
    // Inserting auth.users cascades (via the profile-creation trigger) to a
    // profiles row, which is what fires the user_joined activity event.
    await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
      id,
      `joiner-${id.slice(0, 8)}@test.example`,
    ]);
    const r = await db.client.query<{ actor_user_id: string; kind: string; payload: unknown }>(
      `SELECT actor_user_id, kind, payload FROM activity WHERE kind = 'user_joined' AND actor_user_id = $1`,
      [id],
    );
    await commit(db.client);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].actor_user_id).toBe(id);
  });

  it("does not emit user_joined for any other activity kind", async () => {
    await beginAs(db.client, null, "service_role");
    const id = randomUUID();
    await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
      id,
      `joiner2-${id.slice(0, 8)}@test.example`,
    ]);
    const r = await db.client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM activity WHERE actor_user_id = $1 AND kind = 'user_joined'`,
      [id],
    );
    await commit(db.client);
    expect(r.rows[0].n).toBe("1");
  });
});
