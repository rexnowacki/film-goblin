import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getFollowedActivity } from "@/lib/queries/followed-activity";
import type { Database } from "@/lib/supabase/types";

const hasEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasEnv)("getFollowedActivity", () => {
  let client: ReturnType<typeof createClient<Database>>;
  let viewer: string;
  let followedA: string;
  let unfollowed: string;
  let filmId: string;
  let activityFollowed: string;
  let activityUnfollowed: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const mkUser = async (name: string) => {
      const { data } = await client.auth.admin.createUser({
        email: `${name}-fa-test@filmgoblin.test`,
        password: "testpass123",
        email_confirm: true,
      });
      return data.user!.id;
    };
    [viewer, followedA, unfollowed] = await Promise.all([
      mkUser("viewer-fa"),
      mkUser("followed-fa"),
      mkUser("unfollowed-fa"),
    ]);
    await client.from("follows").insert({ follower_user_id: viewer, followed_user_id: followedA });

    const film = await client.from("films")
      .insert({ itunes_id: 888888 + Math.floor(Math.random() * 10000), title: "FA Film", director: "D", year: 2024 })
      .select("id").single();
    filmId = film.data!.id;

    const actA = await client.from("activity")
      .insert({ actor_user_id: followedA, kind: "watchlist_added", payload: { film_id: filmId } })
      .select("id").single();
    activityFollowed = actA.data!.id;

    const actU = await client.from("activity")
      .insert({ actor_user_id: unfollowed, kind: "watchlist_added", payload: { film_id: filmId } })
      .select("id").single();
    activityUnfollowed = actU.data!.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    const toDelete = [activityFollowed, activityUnfollowed].filter(Boolean);
    if (toDelete.length) await client.from("activity").delete().in("id", toDelete as string[]);
    await client.from("follows").delete().eq("follower_user_id", viewer);
    await client.from("films").delete().eq("id", filmId);
    await Promise.all([
      client.auth.admin.deleteUser(viewer),
      client.auth.admin.deleteUser(followedA),
      client.auth.admin.deleteUser(unfollowed),
    ]);
  });

  it("returns activity from followed users only", async () => {
    if (!hasEnv) return;
    const items = await getFollowedActivity(client, viewer);
    const ids = items.map(i => i.id);
    expect(ids).toContain(activityFollowed);
    expect(ids).not.toContain(activityUnfollowed);
  });

  it("returns empty array when viewer follows nobody", async () => {
    if (!hasEnv) return;
    const items = await getFollowedActivity(client, unfollowed);
    expect(items).toEqual([]);
  });

  it("returned items have actor and film enrichment", async () => {
    if (!hasEnv) return;
    const items = await getFollowedActivity(client, viewer);
    const item = items.find(i => i.id === activityFollowed);
    expect(item).toBeDefined();
    expect(item!.actor.id).toBe(followedA);
    if (item!.kind === "watchlist_added") {
      expect(item!.film.id).toBe(filmId);
    }
  });
});
