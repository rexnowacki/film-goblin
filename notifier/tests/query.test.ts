import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "pg";
import { setupTestDb } from "./helpers/db.js";
import { findPendingDigests } from "../src/query.js";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

let client: Client;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const setup = await setupTestDb();
  client = setup.client;
  cleanup = setup.cleanup;
});

afterEach(async () => { await cleanup(); });

async function seedUser(id: string, email: string, opts: { enabled?: boolean; emailAddedAt?: Date | null } = {}) {
  await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, email]);
  await client.query(
    `INSERT INTO profiles (id, username, display_name, email_notifications_enabled, email_added_at)
     VALUES ($1, $2, $2, $3, $4)`,
    [id, email.split("@")[0], opts.enabled ?? true, opts.emailAddedAt === null ? null : (opts.emailAddedAt ?? new Date())],
  );
}

async function seedFilm(itunesId: number): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO films (itunes_id, title, director, year, runtime_min, genre_primary, artwork_url, itunes_url)
     VALUES ($1, 'The Test', 'A Director', 2024, 100, 'Horror', 'https://cdn/a.jpg', 'https://apple/f')
     RETURNING id`,
    [itunesId],
  );
  return rows[0].id;
}

async function seedWatchlistAndAlert(userId: string, filmId: string, opts: { notifiedAt?: Date } = {}): Promise<string> {
  const { rows: wlRows } = await client.query(
    `INSERT INTO watchlists (user_id, film_id) VALUES ($1, $2) RETURNING id`,
    [userId, filmId],
  );
  const wlId = wlRows[0].id;
  const { rows: alertRows } = await client.query(
    `INSERT INTO price_alerts (watchlist_id, film_id, old_price_usd, new_price_usd, notified_at)
     VALUES ($1, $2, 9.99, 4.99, $3) RETURNING id`,
    [wlId, filmId, opts.notifiedAt ?? null],
  );
  return alertRows[0].id;
}

describe("findPendingDigests", () => {
  it("returns no digests when no alerts exist", async () => {
    await seedUser(U1, "u1@test.example");
    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(0);
  });

  it("returns one digest with one alert for a single user", async () => {
    await seedUser(U1, "u1@test.example");
    const filmId = await seedFilm(100);
    await seedWatchlistAndAlert(U1, filmId);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(1);
    expect(digests[0].user.email).toBe("u1@test.example");
    expect(digests[0].alerts).toHaveLength(1);
    expect(digests[0].alerts[0].old_price_usd).toBe(9.99);
    expect(digests[0].alerts[0].new_price_usd).toBe(4.99);
    expect(digests[0].alerts[0].film.title).toBe("The Test");
  });

  it("groups multiple alerts for the same user into one digest", async () => {
    await seedUser(U1, "u1@test.example");
    const filmA = await seedFilm(101);
    const filmB = await seedFilm(102);
    await seedWatchlistAndAlert(U1, filmA);
    await seedWatchlistAndAlert(U1, filmB);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(1);
    expect(digests[0].alerts).toHaveLength(2);
  });

  it("excludes users with email_notifications_enabled = false", async () => {
    await seedUser(U1, "u1@test.example", { enabled: false });
    const filmId = await seedFilm(103);
    await seedWatchlistAndAlert(U1, filmId);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(0);
  });

  it("excludes alerts that already have notified_at set", async () => {
    await seedUser(U1, "u1@test.example");
    const filmId = await seedFilm(104);
    await seedWatchlistAndAlert(U1, filmId, { notifiedAt: new Date() });

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(0);
  });

  it("produces separate digests for different users", async () => {
    await seedUser(U1, "u1@test.example");
    await seedUser(U2, "u2@test.example");
    const filmA = await seedFilm(105);
    const filmB = await seedFilm(106);
    await seedWatchlistAndAlert(U1, filmA);
    await seedWatchlistAndAlert(U2, filmB);

    const digests = await findPendingDigests(client);
    expect(digests).toHaveLength(2);
    const byEmail = Object.fromEntries(digests.map(d => [d.user.email, d]));
    expect(byEmail["u1@test.example"].alerts).toHaveLength(1);
    expect(byEmail["u2@test.example"].alerts).toHaveLength(1);
  });
});
