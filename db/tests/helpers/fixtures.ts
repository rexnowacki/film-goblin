import type { Client } from "pg";
import { randomUUID } from "node:crypto";

export interface TestUser {
  id: string;
  email: string;
  handle: string;
}

export interface Fixtures {
  userA: TestUser;
  userB: TestUser;
  userC: TestUser;
  staffS: TestUser;
  adminA: TestUser;
  filmId: string;
}

/**
 * Creates baseline fixtures used by most RLS tests. Runs with service-role
 * (bypasses RLS). Call once per test in a `beforeEach` or at the top of a test.
 */
export async function seedFixtures(client: Client): Promise<Fixtures> {
  const mk = (label: string): TestUser => ({
    id: randomUUID(),
    email: `${label}-${randomUUID().slice(0, 8)}@test.example`,
    handle: `${label}_${randomUUID().slice(0, 6)}`,
  });

  const userA = mk("a");
  const userB = mk("b");
  const userC = mk("c");
  const staffS = mk("s");
  const adminA = mk("admin");

  for (const u of [userA, userB, userC, staffS, adminA]) {
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u.id, u.email]);
    // Profiles row is normally created by a trigger (Task 15); until that migration is
    // applied, insert directly. After the trigger lands, this INSERT is redundant but harmless
    // because ON CONFLICT is added in that task's version of seedFixtures.
    await client.query(
      `INSERT INTO profiles (id, handle, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.handle, u.handle]
    );
  }

  await client.query(
    `INSERT INTO staff (user_id, role) VALUES ($1, 'reviewer')`,
    [staffS.id]
  );
  await client.query(
    `INSERT INTO staff (user_id, role) VALUES ($1, 'admin')`,
    [adminA.id]
  );

  // A seed film. Worker migrations already created `films`.
  const filmRes = await client.query<{ id: string }>(
    `INSERT INTO films (itunes_id, title, director, year)
     VALUES ($1, 'Test Film', 'Test Dir', 2024)
     RETURNING id`,
    [Math.floor(Math.random() * 1_000_000_000)]
  );

  return { userA, userB, userC, staffS, adminA, filmId: filmRes.rows[0].id };
}
