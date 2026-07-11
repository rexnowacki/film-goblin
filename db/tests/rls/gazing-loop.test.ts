import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestDb, type TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";
let db: TestDb;
beforeAll(async () => { db = await makeTestDb(); }); afterAll(async () => { await db.close(); });
async function home(host: string, film: string, broadcast = false) { const r = await db.client.query<{id:string}>(`INSERT INTO gazing_invites(token,created_by,film_id,film_title,starts_at,broadcast,venue_kind,timezone_label) VALUES($1,$2,$3,'Test Film',now()+interval '2 days',$4,'home','America/Phoenix') RETURNING id`, [`home-${randomUUID()}`,host,film,broadcast]); return r.rows[0].id; }
describe("gazing loop RLS and state", () => {
  it("explicit invitees can read and RSVP while unrelated users cannot", async () => {
    const fx=await seedFixtures(db.client); await beginAs(db.client,null,"service_role"); const id=await home(fx.userA.id,fx.filmId); await db.client.query("INSERT INTO gazing_invitees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); expect((await db.client.query("SELECT location_note FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(1); await db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userC.id,"authenticated"); expect((await db.client.query("SELECT * FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(0); await expect(db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userC.id])).rejects.toThrow(); await rollback(db.client);
  });
  it("keeps private-token RSVP server-mediated without widening direct table access", async () => {
    const fx=await seedFixtures(db.client); await beginAs(db.client,null,"service_role"); const id=await home(fx.userA.id,fx.filmId); await commit(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); expect((await db.client.query("SELECT id FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(0); await expect(db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id])).rejects.toThrow(); await rollback(db.client);
    await beginAs(db.client,null,"service_role"); await db.client.query("INSERT INTO gazing_invitees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); expect((await db.client.query("SELECT id FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(1); await db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userC.id,"authenticated"); expect((await db.client.query("SELECT id FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(0); await expect(db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userC.id])).rejects.toThrow(); await rollback(db.client);
  });
  it("broadcast visibility requires an actual coven edge in either direction", async () => {
    const fx=await seedFixtures(db.client); await beginAs(db.client,null,"service_role"); const id=await home(fx.userA.id,fx.filmId,true); const a=fx.userA.id<fx.userB.id?fx.userA.id:fx.userB.id; const b=fx.userA.id<fx.userB.id?fx.userB.id:fx.userA.id; await db.client.query("INSERT INTO coven_members(user_a_id,user_b_id) VALUES($1,$2)",[a,b]); await commit(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); expect((await db.client.query("SELECT id FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(1); await commit(db.client);
    await beginAs(db.client,fx.userC.id,"authenticated"); expect((await db.client.query("SELECT id FROM gazing_invites WHERE id=$1",[id])).rowCount).toBe(0); await commit(db.client);
  });
  it("only host closes and only attendee confirms self; closed rows never reopen", async () => {
    const fx=await seedFixtures(db.client); await beginAs(db.client,null,"service_role"); const id=await home(fx.userA.id,fx.filmId); await db.client.query("INSERT INTO gazing_invitees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); await db.client.query("UPDATE gazing_attendees SET attended_at=now() WHERE invite_id=$1 AND user_id=$2",[id,fx.userB.id]); const denied=await db.client.query("UPDATE gazing_invites SET status='cancelled',closed_at=now(),closed_by=$1 WHERE id=$2",[fx.userB.id,id]);expect(denied.rowCount).toBe(0); await commit(db.client);
    await beginAs(db.client,fx.userA.id,"authenticated"); await db.client.query("UPDATE gazing_invites SET status='happened',closed_at=now(),closed_by=$1 WHERE id=$2",[fx.userA.id,id]); await expect(db.client.query("UPDATE gazing_invites SET status='scheduled',closed_at=NULL,closed_by=NULL WHERE id=$1",[id])).rejects.toThrow(); await rollback(db.client);
  });
  it("keeps cancelled history but rejects a new RSVP", async () => {
    const fx=await seedFixtures(db.client); await beginAs(db.client,null,"service_role"); const id=await home(fx.userA.id,fx.filmId); await db.client.query("INSERT INTO gazing_invitees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userA.id,"authenticated"); await db.client.query("UPDATE gazing_invites SET status='cancelled',closed_at=now(),closed_by=$1 WHERE id=$2",[fx.userA.id,id]); await commit(db.client);
    // A bearer claim may race immediately behind cancellation. Even if the
    // server-side claim lands, the viewer-scoped attendee INSERT stays denied.
    await beginAs(db.client,null,"service_role"); await db.client.query("INSERT INTO gazing_invitees(invite_id,user_id) VALUES($1,$2)",[id,fx.userC.id]); await commit(db.client);
    await beginAs(db.client,fx.userC.id,"authenticated"); await expect(db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userC.id])).rejects.toThrow(); await rollback(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); const updated=await db.client.query("UPDATE gazing_attendees SET attended_at=now() WHERE invite_id=$1 AND user_id=$2",[id,fx.userB.id]); await rollback(db.client); expect(updated.rowCount).toBe(0);
    await beginAs(db.client,fx.userB.id,"authenticated"); const deleted=await db.client.query("DELETE FROM gazing_attendees WHERE invite_id=$1 AND user_id=$2",[id,fx.userB.id]); await rollback(db.client); expect(deleted.rowCount).toBe(0);
    await beginAs(db.client,null,"service_role"); const invite=await db.client.query("SELECT status FROM gazing_invites WHERE id=$1",[id]); const attendee=await db.client.query("SELECT user_id FROM gazing_attendees WHERE invite_id=$1 AND user_id=$2",[id,fx.userB.id]); await commit(db.client);
    expect(invite.rows[0]?.status).toBe("cancelled"); expect(attendee.rowCount).toBe(1);
  });
  it("allows happened attendance confirmation but preserves the RSVP rows", async () => {
    const fx=await seedFixtures(db.client); await beginAs(db.client,null,"service_role"); const id=await home(fx.userA.id,fx.filmId); await db.client.query("INSERT INTO gazing_invitees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await db.client.query("INSERT INTO gazing_attendees(invite_id,user_id) VALUES($1,$2)",[id,fx.userB.id]); await commit(db.client);
    await beginAs(db.client,fx.userA.id,"authenticated"); await db.client.query("UPDATE gazing_invites SET status='happened',closed_at=now(),closed_by=$1 WHERE id=$2",[fx.userA.id,id]); await db.client.query("INSERT INTO gazing_attendees(invite_id,user_id,attended_at) VALUES($1,$2,now())",[id,fx.userA.id]); await commit(db.client);
    await beginAs(db.client,fx.userB.id,"authenticated"); const confirmed=await db.client.query("UPDATE gazing_attendees SET attended_at=now() WHERE invite_id=$1 AND user_id=$2",[id,fx.userB.id]); const deleted=await db.client.query("DELETE FROM gazing_attendees WHERE invite_id=$1 AND user_id=$2",[id,fx.userB.id]); await commit(db.client);
    expect(confirmed.rowCount).toBe(1); expect(deleted.rowCount).toBe(0);
    await beginAs(db.client,null,"service_role"); const history=await db.client.query("SELECT user_id,attended_at FROM gazing_attendees WHERE invite_id=$1 ORDER BY user_id",[id]); await commit(db.client); expect(history.rowCount).toBe(2); expect(history.rows.every(row=>row.attended_at!=null)).toBe(true);
  });
});
