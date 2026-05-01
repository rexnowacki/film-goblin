import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTopRecommendedCovenMemberIds } from "@/lib/queries/recommendations";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let userC: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();
  userC = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 900000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
  if (userC?.id) await deleteTestUser(userC.id);
});

describe.skipIf(!hasEnv)("getTopRecommendedCovenMemberIds", () => {
  it("ranks coven members by recommendation count, descending", async () => {
    const admin = adminClient();
    await admin.from("activity").insert([
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userB.id } as never },
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userB.id } as never },
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userC.id } as never },
    ]);
    const ids = await getTopRecommendedCovenMemberIds(admin as never, userA.id);
    expect(ids).toEqual([userB.id, userC.id]);

    await admin.from("activity").delete().eq("actor_user_id", userA.id);
  });

  it("returns empty array for users who have never recommended", async () => {
    const admin = adminClient();
    const ids = await getTopRecommendedCovenMemberIds(admin as never, userA.id);
    expect(ids).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const admin = adminClient();
    await admin.from("activity").insert([
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userB.id } as never },
      { kind: "recommendation_sent", actor_user_id: userA.id, payload: { film_id: filmId, to_user_id: userC.id } as never },
    ]);
    const ids = await getTopRecommendedCovenMemberIds(admin as never, userA.id, 1);
    expect(ids).toHaveLength(1);

    await admin.from("activity").delete().eq("actor_user_id", userA.id);
  });
});
