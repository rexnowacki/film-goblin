import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

async function insertInvite(client: TestDb["client"], userId: string, filmId: string, broadcast: boolean) {
  await client.query(
    `INSERT INTO gazing_invites
       (token, created_by, film_id, film_title, theater_name, starts_at, tickets_url, format_label, broadcast)
     VALUES ($1, $2, $3, 'Test Film', 'The Loft Cinema', now() + interval '2 days', 'https://loftcinema.org/film/x/', '70mm', $4)`,
    [`tok-${Math.random().toString(36).slice(2)}`, userId, filmId, broadcast],
  );
}

describe("gazing_invited activity — fires only when broadcast is true", () => {
  it("emits exactly one gazing_invited activity for a broadcast invite", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await insertInvite(db.client, fx.userA.id, fx.filmId, true);
    const r = await db.client.query<{ kind: string; payload: { film_id: string; token: string; theater_name: string; starts_at: string; format_label: string } }>(
      `SELECT kind, payload FROM activity WHERE kind = 'gazing_invited' AND actor_user_id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].payload.film_id).toBe(fx.filmId);
    expect(typeof r.rows[0].payload.token).toBe("string");
    expect(r.rows[0].payload.theater_name).toBe("The Loft Cinema");
    expect(r.rows[0].payload.format_label).toBe("70mm");
  });

  it("emits no activity for a non-broadcast (SMS) invite", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    await insertInvite(db.client, fx.userA.id, fx.filmId, false);
    const r = await db.client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM activity WHERE kind = 'gazing_invited' AND actor_user_id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);
    expect(r.rows[0].n).toBe("0");
  });
});
