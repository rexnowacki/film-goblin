import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

describe("RLS: internal invite and cron tables", () => {
  it("anon cannot read invite codes or cron locks", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, null, "service_role");
    await db.client.query(
      `INSERT INTO cron_locks (key, locked_until) VALUES ('test-lock', now() + interval '5 minutes')`,
    );
    await db.client.query(
      `INSERT INTO app_rate_limits (user_id, key, window_start, count)
       VALUES ($1, 'test-limit', current_date, 1)`,
      [fx.userA.id],
    );
    await rollback(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const codes = await db.client.query(`SELECT code FROM invite_codes WHERE owner_user_id = $1`, [fx.userA.id]);
      expect(codes.rowCount).toBe(0);

      const locks = await db.client.query(`SELECT key FROM cron_locks WHERE key = 'test-lock'`);
      expect(locks.rowCount).toBe(0);

      const limits = await db.client.query(`SELECT key FROM app_rate_limits WHERE user_id = $1`, [fx.userA.id]);
      expect(limits.rowCount).toBe(0);
    } finally {
      await rollback(db.client);
    }
  });

  it("authenticated users cannot mutate invite codes or cron locks", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(
          `INSERT INTO invite_codes (code, owner_user_id, max_uses)
           VALUES ('client-code', $1, 5)`,
          [fx.userA.id],
        ),
      ).rejects.toThrow();

      await expect(
        db.client.query(
          `INSERT INTO cron_locks (key, locked_until)
           VALUES ('client-lock', now() + interval '5 minutes')`,
        ),
      ).rejects.toThrow();

      await expect(
        db.client.query(
          `INSERT INTO app_rate_limits (user_id, key, window_start, count)
           VALUES ($1, 'client-limit', current_date, 1)`,
          [fx.userA.id],
        ),
      ).rejects.toThrow();
    } finally {
      await rollback(db.client);
    }
  });

  it("anon and authenticated users cannot execute internal SECURITY DEFINER RPCs", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`SELECT public.acquire_cron_lock('client-lock', now() + interval '5 minutes')`),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`SELECT public.burn_invite_code('missing-code', $1)`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`SELECT public.consume_app_rate_limit($1, 'client-limit', 3, current_date)`, [fx.userA.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }
  });

  it("service_role can still read tables and execute internal RPCs", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, null, "service_role");
    try {
      const codes = await db.client.query(`SELECT code FROM invite_codes WHERE owner_user_id = $1`, [fx.userA.id]);
      expect(codes.rowCount).toBe(1);

      const lock = await db.client.query(
        `SELECT public.acquire_cron_lock('service-lock', now() + interval '5 minutes') AS acquired`,
      );
      expect(lock.rows[0].acquired).toBe(true);

      const limit = await db.client.query(
        `SELECT * FROM public.consume_app_rate_limit($1, 'service-limit', 3, current_date)`,
        [fx.userA.id],
      );
      expect(limit.rows[0].allowed).toBe(true);
    } finally {
      await rollback(db.client);
    }
  });
});
