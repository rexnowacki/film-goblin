import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "pg";
import { setupTestDb } from "./helpers/db.js";
import { sendDailyDigests } from "../src/index.js";

let client: Client;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const setup = await setupTestDb();
  client = setup.client;
  cleanup = setup.cleanup;
});

afterEach(async () => { await cleanup(); });

async function seedAlert(userId: string, email: string): Promise<string> {
  await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [userId, email]);
  await client.query(
    `INSERT INTO profiles (id, handle, display_name, email_notifications_enabled)
     VALUES ($1, $2, $2, TRUE)`,
    [userId, email.split("@")[0]],
  );
  const { rows: filmRows } = await client.query(
    `INSERT INTO films (itunes_id, title, director, year, runtime_min, artwork_url, itunes_url)
     VALUES ($1, 'A Film', 'A Director', 2024, 100, 'https://cdn/a.jpg', 'https://apple/a')
     RETURNING id`,
    [900000 + Math.floor(Math.random() * 100000)],
  );
  const filmId = filmRows[0].id;
  const { rows: wlRows } = await client.query(
    `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
    [userId, filmId],
  );
  const { rows: alertRows } = await client.query(
    `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd)
     VALUES ($1, $2, 9.99, 4.99) RETURNING id`,
    [wlRows[0].id, filmId],
  );
  return alertRows[0].id;
}

function fakeResend() {
  return {
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "fake" }, error: null }),
    },
  } as any;
}

describe("sendDailyDigests", () => {
  it("returns zeros when no pending alerts", async () => {
    const resend = fakeResend();
    const counters = await sendDailyDigests(client, resend, {
      from: "test@example.com",
      baseUrl: "https://app.example",
    });
    expect(counters).toEqual({ sent: 0, failed: 0, skipped: 0, failed_user_ids: [] });
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("sends one email and stamps notified_at on success", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const alertId = await seedAlert(userId, "u1@test.example");
    const resend = fakeResend();
    const counters = await sendDailyDigests(client, resend, {
      from: "test@example.com",
      baseUrl: "https://app.example",
    });
    expect(counters.sent).toBe(1);
    expect(counters.failed).toBe(0);
    expect(resend.emails.send).toHaveBeenCalledTimes(1);

    const { rows } = await client.query(
      `SELECT notified_at FROM price_alerts WHERE id = $1`,
      [alertId],
    );
    expect(rows[0].notified_at).not.toBeNull();
  });

  it("leaves notified_at NULL and increments failed when Resend rejects", async () => {
    const userId = "22222222-2222-2222-2222-222222222222";
    const alertId = await seedAlert(userId, "u2@test.example");
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      },
    } as any;
    const counters = await sendDailyDigests(client, resend, {
      from: "test@example.com",
      baseUrl: "https://app.example",
    });
    expect(counters.sent).toBe(0);
    expect(counters.failed).toBe(1);
    expect(counters.failed_user_ids).toEqual([userId]);

    const { rows } = await client.query(
      `SELECT notified_at FROM price_alerts WHERE id = $1`,
      [alertId],
    );
    expect(rows[0].notified_at).toBeNull();
  });
});
