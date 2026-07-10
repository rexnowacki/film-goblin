import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db.close(); });

async function makeInvite(client: TestDb["client"], hostId: string, filmId: string, participantId?:string): Promise<string> {
  if(participantId&&participantId!==hostId){const a=hostId<participantId?hostId:participantId;const b=hostId<participantId?participantId:hostId;await client.query("INSERT INTO coven_members(user_a_id,user_b_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[a,b]);}
  const r = await client.query<{ id: string }>(
    `INSERT INTO gazing_invites
       (token, created_by, film_id, film_title, theater_name, starts_at, tickets_url, format_label, broadcast)
     VALUES ($1, $2, $3, 'Test Film', 'The Loft Cinema', now() + interval '2 days', 'https://loftcinema.org/film/x/', '70mm', true)
     RETURNING id`,
    [`tok-${randomUUID().slice(0, 12)}`, hostId, filmId],
  );
  return r.rows[0].id;
}

describe("gazing_attendees - RSVP triggers + RLS", () => {
  it("insert fans out a gazing_attending activity and a gazing_rsvp notification to the host", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId,fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const act = await db.client.query<{ actor_user_id: string; payload: { invite_id: string; film_id: string; token: string; to_user_id: string } }>(
      `SELECT actor_user_id, payload FROM activity WHERE kind = 'gazing_attending' AND actor_user_id = $1`,
      [fx.userB.id],
    );
    const notif = await db.client.query<{ user_id: string; actor_user_id: string; payload: { film_id: string; token: string } }>(
      `SELECT user_id, actor_user_id, payload FROM notifications WHERE kind = 'gazing_rsvp' AND user_id = $1`,
      [fx.userA.id],
    );
    await commit(db.client);

    expect(act.rowCount).toBe(1);
    expect(act.rows[0].payload.invite_id).toBe(inviteId);
    expect(act.rows[0].payload.film_id).toBe(fx.filmId);
    expect(act.rows[0].payload.to_user_id).toBe(fx.userA.id);
    expect(typeof act.rows[0].payload.token).toBe("string");

    expect(notif.rowCount).toBe(1);
    expect(notif.rows[0].actor_user_id).toBe(fx.userB.id);
    expect(notif.rows[0].payload.film_id).toBe(fx.filmId);
  });

  it("delete retracts the activity but leaves the host notification", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId,fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]);
    await db.client.query(`DELETE FROM gazing_attendees WHERE invite_id = $1 AND user_id = $2`, [inviteId, fx.userB.id]);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const act = await db.client.query(`SELECT 1 FROM activity WHERE kind = 'gazing_attending' AND actor_user_id = $1`, [fx.userB.id]);
    const notif = await db.client.query(`SELECT 1 FROM notifications WHERE kind = 'gazing_rsvp' AND user_id = $1`, [fx.userA.id]);
    await commit(db.client);

    expect(act.rowCount).toBe(0);
    expect(notif.rowCount).toBe(1);
  });

  it("does not notify when the host RSVPs their own invite", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId);
    await commit(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userA.id]);
    await commit(db.client);

    await beginAs(db.client, null, "service_role");
    const notif = await db.client.query(`SELECT 1 FROM notifications WHERE kind = 'gazing_rsvp' AND user_id = $1`, [fx.userA.id]);
    await commit(db.client);
    expect(notif.rowCount).toBe(0);
  });

  it("a user cannot RSVP as someone else", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId,fx.userB.id);
    await commit(db.client);

    await beginAs(db.client, fx.userB.id, "authenticated");
    await expect(
      db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userC.id]),
    ).rejects.toThrow();
    await rollback(db.client);
  });

  it("blocks duplicate RSVPs", async () => {
    const fx = await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    const inviteId = await makeInvite(db.client, fx.userA.id, fx.filmId,fx.userB.id);
    await db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]);
    await expect(
      db.client.query(`INSERT INTO gazing_attendees (invite_id, user_id) VALUES ($1, $2)`, [inviteId, fx.userB.id]),
    ).rejects.toThrow();
    await rollback(db.client);
  });
});
