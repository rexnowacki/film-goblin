import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "../helpers/testcontainers.js";
import { beginAs, commit, rollback } from "../helpers/session.js";
import { seedFixtures, type Fixtures } from "../helpers/fixtures.js";

let db: TestDb;
let fx: Fixtures;
let itunesSequence = 8_000_000_000;

beforeAll(async () => {
  db = await makeTestDb();
  fx = await seedFixtures(db.client);
}, 120_000);

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await beginAs(db.client, null, "service_role");
  await db.client.query(`DELETE FROM watched`);
  await db.client.query(`DELETE FROM user_badges`);
  await db.client.query(`DELETE FROM badges WHERE created_by IS NOT NULL`);
  await commit(db.client);
});

async function createFilm(director: string, title = "Badge Test Film"): Promise<string> {
  const { rows } = await db.client.query<{ id: string }>(
    `INSERT INTO films (itunes_id, title, director, year)
     VALUES ($1, $2, $3, 2026)
     RETURNING id`,
    [itunesSequence++, `${title} ${itunesSequence}`, director],
  );
  return rows[0].id;
}

async function createBadge(
  kind: "watch_log_count" | "distinct_film_count" | "director_distinct_film_count",
  threshold: number,
  active = true,
): Promise<string> {
  const slug = `test-${randomUUID()}`;
  const { rows } = await db.client.query<{ id: string }>(
    `INSERT INTO badges
       (slug, name, description, image_url, condition_kind, threshold, is_active, created_by)
     VALUES ($1, 'Test Relic', 'A bounded test achievement.', '/badges/fresh-blood.svg', $2, $3, $4, $5)
     RETURNING id`,
    [slug, kind, threshold, active, fx.adminA.id],
  );
  return rows[0].id;
}

async function logWatch(userId: string, filmId: string, count = 1): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await db.client.query(
      `INSERT INTO watched (user_id, film_id, watched_at) VALUES ($1, $2, CURRENT_DATE)`,
      [userId, filmId],
    );
  }
}

async function backendPid(client: Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>(`SELECT pg_backend_pid()::int AS pid`);
  return rows[0].pid;
}

async function expectAdvisoryWait(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await db.client.query<{ wait_event_type: string | null; wait_event: string | null }>(
      `SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1`,
      [pid],
    );
    if (rows[0]?.wait_event_type === "Lock" && rows[0]?.wait_event === "advisory") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`backend ${pid} did not wait on the badge advisory lock`);
}

async function expectDenied(
  role: "anon" | "authenticated",
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await beginAs(db.client, userId, role);
  try {
    await expect(db.client.query(sql, params)).rejects.toThrow();
  } finally {
    await rollback(db.client);
  }
}

describe("achievement badge schema and award engine", () => {
  it("seeds four watch-log milestones and one three-film director relic", async () => {
    const { rows } = await db.client.query(
      `SELECT slug, condition_kind::text AS condition_kind, threshold, image_url
       FROM badges WHERE created_by IS NULL ORDER BY threshold, slug`,
    );
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "fresh-blood", condition_kind: "watch_log_count", threshold: 25 }),
      expect.objectContaining({ slug: "deep-cut", condition_kind: "watch_log_count", threshold: 50 }),
      expect.objectContaining({ slug: "midnight-glutton", condition_kind: "watch_log_count", threshold: 75 }),
      expect.objectContaining({ slug: "century-beast", condition_kind: "watch_log_count", threshold: 100 }),
      expect.objectContaining({ slug: "auteurs-familiar", condition_kind: "director_distinct_film_count", threshold: 3 }),
    ]));
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => String(row.image_url).endsWith(".svg"))).toBe(true);
  });

  it("awards the 25-log milestone exactly once across later watches and re-evaluation", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, fx.filmId, 24);
    let result = await db.client.query(
      `SELECT 1 FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'fresh-blood'`,
      [fx.userA.id],
    );
    expect(result.rowCount).toBe(0);

    await logWatch(fx.userA.id, fx.filmId);
    await logWatch(fx.userA.id, fx.filmId);
    await commit(db.client);

    result = await db.client.query(
      `SELECT ub.evidence FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'fresh-blood'`,
      [fx.userA.id],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].evidence).toMatchObject({
      condition_kind: "watch_log_count",
      threshold: 25,
      observed_count: 25,
    });

    const reevaluated = await db.client.query<{ awarded: number }>(
      `SELECT evaluate_badges_for_user($1, NULL)::int AS awarded`,
      [fx.userA.id],
    );
    expect(reevaluated.rows[0].awarded).toBe(0);
  });

  it("counts rewatches for diary milestones but not distinct-film conditions", async () => {
    const logBadge = await createBadge("watch_log_count", 3);
    const distinctBadge = await createBadge("distinct_film_count", 3);
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, fx.filmId, 3);
    await commit(db.client);

    const { rows } = await db.client.query<{ badge_id: string }>(
      `SELECT badge_id FROM user_badges WHERE user_id = $1 AND badge_id = ANY($2::uuid[])`,
      [fx.userA.id, [logBadge, distinctBadge]],
    );
    expect(rows.map((row) => row.badge_id)).toEqual([logBadge]);
  });

  it("normalizes director case and whitespace while counting distinct films", async () => {
    const films = await Promise.all([
      createFilm("  Jane   Doe  "),
      createFilm("jane doe"),
      createFilm("JANE DOE"),
    ]);
    await beginAs(db.client, fx.userA.id, "authenticated");
    for (const filmId of films) await logWatch(fx.userA.id, filmId);
    await commit(db.client);

    const { rows } = await db.client.query(
      `SELECT ub.evidence FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'auteurs-familiar'`,
      [fx.userA.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].evidence).toMatchObject({
      observed_count: 3,
      normalized_director: "jane doe",
    });
  });

  it("does not award the director relic for blank directors or one repeated film", async () => {
    const blankFilms = await Promise.all([createFilm("\t"), createFilm("\n"), createFilm(" \t ")]);
    await beginAs(db.client, fx.userA.id, "authenticated");
    for (const filmId of blankFilms) await logWatch(fx.userA.id, filmId);
    await logWatch(fx.userA.id, fx.filmId, 3);
    await commit(db.client);

    const result = await db.client.query(
      `SELECT 1 FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'auteurs-familiar'`,
      [fx.userA.id],
    );
    expect(result.rowCount).toBe(0);
  });

  it("reevaluates existing watchers when a film director is corrected", async () => {
    const first = await createFilm("Mara Voss");
    const second = await createFilm("MARA VOSS");
    const corrected = await createFilm("Someone Else");
    await beginAs(db.client, fx.userA.id, "authenticated");
    for (const filmId of [first, second, corrected]) await logWatch(fx.userA.id, filmId);
    await commit(db.client);

    await db.client.query(`UPDATE films SET director = '  mara   voss ' WHERE id = $1`, [corrected]);
    const result = await db.client.query(
      `SELECT 1 FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'auteurs-familiar'`,
      [fx.userA.id],
    );
    expect(result.rowCount).toBe(1);
  });

  it("backfills a newly inserted active definition and ignores inactive definitions", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, fx.filmId, 4);
    await commit(db.client);

    const activeBadge = await createBadge("watch_log_count", 4);
    const inactiveBadge = await createBadge("watch_log_count", 5, false);
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, fx.filmId, 2);
    await commit(db.client);

    const { rows } = await db.client.query<{ badge_id: string }>(
      `SELECT badge_id FROM user_badges WHERE user_id = $1 AND badge_id = ANY($2::uuid[])`,
      [fx.userA.id, [activeBadge, inactiveBadge]],
    );
    expect(rows.map((row) => row.badge_id)).toEqual([activeBadge]);
  });

  it("serializes concurrent boundary inserts so the milestone cannot be missed or duplicated", async () => {
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, fx.filmId, 23);
    await commit(db.client);

    const first = new Client({ connectionString: db.connectionString });
    const second = new Client({ connectionString: db.connectionString });
    await Promise.all([first.connect(), second.connect()]);
    try {
      const secondPid = await backendPid(second);
      await beginAs(first, fx.userA.id, "authenticated");
      await beginAs(second, fx.userA.id, "authenticated");
      await first.query(`INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`, [fx.userA.id, fx.filmId]);

      const secondInsert = second.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.filmId],
      );
      await expectAdvisoryWait(secondPid);

      await commit(first);
      await secondInsert;
      await commit(second);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    const { rows } = await db.client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'fresh-blood'`,
      [fx.userA.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("serializes different-user writes so bulk transactions cannot form lock-order deadlocks", async () => {
    const first = new Client({ connectionString: db.connectionString });
    const second = new Client({ connectionString: db.connectionString });
    await Promise.all([first.connect(), second.connect()]);
    try {
      const secondPid = await backendPid(second);
      await beginAs(first, null, "service_role");
      await beginAs(second, null, "service_role");
      await first.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.filmId],
      );

      const secondInsert = second.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userB.id, fx.filmId],
      );
      await expectAdvisoryWait(secondPid);
      await commit(first);
      await secondInsert;
      await commit(second);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    const { rows } = await db.client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM watched WHERE user_id = ANY($1::uuid[])`,
      [[fx.userA.id, fx.userB.id]],
    );
    expect(rows[0].n).toBe(2);
  });

  it("serializes a new definition against an uncommitted qualifying watch", async () => {
    const watchClient = new Client({ connectionString: db.connectionString });
    const badgeClient = new Client({ connectionString: db.connectionString });
    await Promise.all([watchClient.connect(), badgeClient.connect()]);
    const badgeId = randomUUID();
    try {
      const badgePid = await backendPid(badgeClient);
      await beginAs(watchClient, fx.userA.id, "authenticated");
      await watchClient.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userA.id, fx.filmId],
      );

      await beginAs(badgeClient, null, "service_role");
      const badgeInsert = badgeClient.query(
        `INSERT INTO badges
           (id, slug, name, description, image_url, condition_kind, threshold, created_by)
         VALUES ($1, $2, 'Concurrent Relic', 'Backfill must see the pending watch.',
           '/badges/fresh-blood.svg', 'distinct_film_count', 1, $3)`,
        [badgeId, `test-${randomUUID()}`, fx.adminA.id],
      );
      await expectAdvisoryWait(badgePid);

      await commit(watchClient);
      await badgeInsert;
      await commit(badgeClient);
    } finally {
      await Promise.all([watchClient.end(), badgeClient.end()]);
    }

    const result = await db.client.query(
      `SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2`,
      [fx.userA.id, badgeId],
    );
    expect(result.rowCount).toBe(1);
  });

  it("serializes a director correction against an uncommitted watch", async () => {
    const first = await createFilm("Rhea Vale");
    const second = await createFilm("RHEA VALE");
    const corrected = await createFilm("Another Director");
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, first);
    await logWatch(fx.userA.id, second);
    await commit(db.client);

    const watchClient = new Client({ connectionString: db.connectionString });
    const filmClient = new Client({ connectionString: db.connectionString });
    await Promise.all([watchClient.connect(), filmClient.connect()]);
    try {
      const filmPid = await backendPid(filmClient);
      await beginAs(watchClient, fx.userA.id, "authenticated");
      await watchClient.query(
        `INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`,
        [fx.userA.id, corrected],
      );

      await beginAs(filmClient, null, "service_role");
      const directorUpdate = filmClient.query(
        `UPDATE films SET director = ' rhea   vale ' WHERE id = $1`,
        [corrected],
      );
      await expectAdvisoryWait(filmPid);

      await commit(watchClient);
      await directorUpdate;
      await commit(filmClient);
    } finally {
      await Promise.all([watchClient.end(), filmClient.end()]);
    }

    const result = await db.client.query(
      `SELECT 1 FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1 AND b.slug = 'auteurs-familiar'`,
      [fx.userA.id],
    );
    expect(result.rowCount).toBe(1);
  });

  it("exposes public trophy columns but withholds authorship, evidence, and every client write", async () => {
    const badgeId = await createBadge("watch_log_count", 1);
    await beginAs(db.client, fx.userA.id, "authenticated");
    await logWatch(fx.userA.id, fx.filmId);
    await commit(db.client);

    await beginAs(db.client, null, "anon");
    const definitions = await db.client.query(`SELECT id, slug, name, description, image_url FROM badges`);
    const awards = await db.client.query(`SELECT user_id, badge_id, awarded_at FROM user_badges`);
    expect(definitions.rowCount).toBeGreaterThan(0);
    expect(awards.rows).toEqual(expect.arrayContaining([expect.objectContaining({ badge_id: badgeId })]));
    await expect(db.client.query(`SELECT created_by FROM badges`)).rejects.toThrow();
    await rollback(db.client);

    await expectDenied("anon", null, `SELECT evidence FROM user_badges`);
    await expectDenied("authenticated", fx.userA.id, `SELECT created_by FROM badges`);
    await expectDenied("authenticated", fx.userA.id, `SELECT evidence FROM user_badges`);
    await expectDenied("authenticated", fx.userA.id,
      `INSERT INTO badges (slug, name, description, image_url, condition_kind, threshold)
       VALUES ('forged', 'Forged', 'Not allowed.', '/x.svg', 'watch_log_count', 1)`);
    await expectDenied("authenticated", fx.userA.id,
      `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)`,
      [fx.userA.id, badgeId]);
    await expectDenied("anon", null,
      `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)`,
      [fx.userA.id, badgeId]);
    await expectDenied("authenticated", fx.userA.id,
      `UPDATE badges SET name = name WHERE id = $1`, [badgeId]);
    await expectDenied("authenticated", fx.userA.id,
      `DELETE FROM badges WHERE id = $1`, [badgeId]);
    await expectDenied("authenticated", fx.userA.id,
      `UPDATE user_badges SET awarded_at = awarded_at WHERE badge_id = $1`, [badgeId]);
    await expectDenied("authenticated", fx.userA.id,
      `DELETE FROM user_badges WHERE badge_id = $1`, [badgeId]);
  });

  it("denies evaluator RPCs to clients while allowing service-role recovery", async () => {
    await expectDenied("authenticated", fx.userA.id,
      `SELECT evaluate_badges_for_user($1, NULL)`, [fx.userA.id]);
    await expectDenied("anon", null,
      `SELECT evaluate_badges_for_all_users(NULL)`);

    await beginAs(db.client, null, "service_role");
    const { rows } = await db.client.query<{ awarded: number }>(
      `SELECT evaluate_badges_for_all_users(NULL)::int AS awarded`,
    );
    await commit(db.client);
    expect(rows[0].awarded).toBe(0);
  });

  it("cascades awards when an account is deleted", async () => {
    const userId = randomUUID();
    await db.client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [userId, `${userId}@test.example`]);
    const badgeId = await createBadge("watch_log_count", 1);
    await db.client.query(`INSERT INTO watched (user_id, film_id) VALUES ($1, $2)`, [userId, fx.filmId]);
    let result = await db.client.query(`SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2`, [userId, badgeId]);
    expect(result.rowCount).toBe(1);

    await db.client.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
    result = await db.client.query(`SELECT 1 FROM user_badges WHERE user_id = $1`, [userId]);
    expect(result.rowCount).toBe(0);
  });
});
