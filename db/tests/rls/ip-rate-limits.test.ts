import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestDb, TestDb } from "../helpers/testcontainers.js";
import { beginAs, rollback } from "../helpers/session.js";
import { seedFixtures } from "../helpers/fixtures.js";

let db: TestDb;

beforeAll(async () => { db = await makeTestDb(); });
afterAll(async () => { await db?.close(); });

describe("app_ip_rate_limits + consume_ip_rate_limit", () => {
  it("anon and authenticated cannot read the table or execute the RPC", async () => {
    const fx = await seedFixtures(db.client);

    await beginAs(db.client, null, "anon");
    try {
      const rows = await db.client.query(`SELECT key FROM app_ip_rate_limits`);
      expect(rows.rowCount).toBe(0);
    } finally {
      await rollback(db.client);
    }

    await beginAs(db.client, null, "anon");
    try {
      await expect(
        db.client.query(`SELECT * FROM public.consume_ip_rate_limit('h', 'k', 3, '2026-06-09T14:15')`),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }

    await beginAs(db.client, fx.userA.id, "authenticated");
    try {
      await expect(
        db.client.query(`SELECT * FROM public.consume_ip_rate_limit('h', 'k', 3, '2026-06-09T14:15')`),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await rollback(db.client);
    }
  });

  it("service_role consumes up to the limit, then is denied; new subjects and windows reset", async () => {
    await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      for (let i = 1; i <= 3; i++) {
        const r = await db.client.query(
          `SELECT * FROM public.consume_ip_rate_limit('hash-1', 'signin-ip', 3, '2026-06-09T14:15')`,
        );
        expect(r.rows[0].allowed).toBe(true);
        expect(Number(r.rows[0].count)).toBe(i);
      }

      const denied = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('hash-1', 'signin-ip', 3, '2026-06-09T14:15')`,
      );
      expect(denied.rows[0].allowed).toBe(false);
      expect(Number(denied.rows[0].remaining)).toBe(0);

      const nextWindow = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('hash-1', 'signin-ip', 3, '2026-06-09T14:30')`,
      );
      expect(nextWindow.rows[0].allowed).toBe(true);

      const globalSubject = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('id:hash', 'signin-global', 3, '2026-06-09T14:15')`,
      );
      expect(globalSubject.rows[0].allowed).toBe(true);
    } finally {
      await rollback(db.client);
    }
  });

  it("rejects null or invalid inputs as not allowed", async () => {
    await seedFixtures(db.client);
    await beginAs(db.client, null, "service_role");
    try {
      const r = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit(NULL, 'k', 3, '2026-06-09T14:15')`,
      );
      expect(r.rows[0].allowed).toBe(false);

      const r2 = await db.client.query(
        `SELECT * FROM public.consume_ip_rate_limit('h', 'k', 0, '2026-06-09T14:15')`,
      );
      expect(r2.rows[0].allowed).toBe(false);
    } finally {
      await rollback(db.client);
    }
  });
});
