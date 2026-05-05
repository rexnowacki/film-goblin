import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _completeOnboarding } from "../../lib/actions/onboarding";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let user: TestUser;
let starterUser: TestUser;
let filmA: string;
let filmB: string;
let tagId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  [user, starterUser] = await Promise.all([createTestUser(), createTestUser()]);
  const admin = adminClient();
  const [a, b] = await Promise.all([
    admin.from("films").insert({ itunes_id: 9_000_000 + Math.floor(Math.random() * 9_000_000), title: "A", director: "D", year: 2024 }).select("id").single(),
    admin.from("films").insert({ itunes_id: 9_000_000 + Math.floor(Math.random() * 9_000_000), title: "B", director: "D", year: 2024 }).select("id").single(),
  ]);
  filmA = a.data!.id;
  filmB = b.data!.id;
  const tag = await admin.from("tags").select("id").limit(1).single();
  tagId = tag.data!.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("watchlists").delete().eq("user_id", user.id);
  await admin.from("follows").delete().eq("follower_user_id", user.id);
  await admin.from("films").delete().in("id", [filmA, filmB]);
  await deleteTestUser(user.id);
  await deleteTestUser(starterUser.id);
});

describe.skipIf(!hasEnv)("actions/onboarding", () => {
  it("sets username, lane_tag_ids, null max_price_usd watchlists, and follows", async () => {
    if (!hasEnv) return;
    const c = await signedInClient(user.email, user.password);
    await _completeOnboarding(c, {
      username: "moss.witch",
      watchlistFilmIds: [filmA, filmB],
      laneTagIds: [tagId],
      starterFollowIds: [starterUser.id],
    });

    const admin = adminClient();
    const p = await admin.from("profiles").select("username, broadcast_watchlist_adds, onboarded_at, lane_tag_ids").eq("id", user.id).single();
    expect(p.data?.username).toBe("moss.witch");
    expect(p.data?.broadcast_watchlist_adds).toBe(true);
    expect(p.data?.onboarded_at).not.toBeNull();
    expect(p.data?.lane_tag_ids).toContain(tagId);

    const wl = await admin.from("watchlists").select("film_id, max_price_usd").eq("user_id", user.id);
    expect(wl.data).toHaveLength(2);
    expect(wl.data!.every(w => w.max_price_usd === null)).toBe(true);

    const follows = await admin.from("follows").select("followed_user_id").eq("follower_user_id", user.id);
    expect(follows.data?.map(f => f.followed_user_id)).toContain(starterUser.id);
  });

  it("empty arrays still complete successfully", async () => {
    if (!hasEnv) return;
    const user2 = await createTestUser();
    try {
      const c = await signedInClient(user2.email, user2.password);
      await _completeOnboarding(c, {
        username: `u${Date.now()}`,
        watchlistFilmIds: [],
        laneTagIds: [],
        starterFollowIds: [],
      });
      const admin = adminClient();
      const p = await admin.from("profiles").select("onboarded_at").eq("id", user2.id).single();
      expect(p.data?.onboarded_at).not.toBeNull();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
