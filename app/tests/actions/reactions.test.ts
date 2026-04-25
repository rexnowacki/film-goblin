import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _toggleReaction } from "../../lib/actions/reactions";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let filmId: string;
let activityId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 700000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;

  // Activity authored by userA.
  const act = await admin
    .from("activity")
    .insert({ kind: "watchlist_added", actor_user_id: userA.id, payload: { film_id: filmId } as never })
    .select("id")
    .single();
  if (act.error || !act.data) throw act.error;
  activityId = act.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (activityId) await adminClient().from("activity").delete().eq("id", activityId);
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

describe.skipIf(!hasEnv)("_toggleReaction", () => {
  it("toggle-on: returns { liked: true } and inserts a row", async () => {
    const c = await signedInClient(userB.email, userB.password);
    const res = await _toggleReaction(c as any, activityId);
    expect(res).toEqual({ liked: true });

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(1);

    await adminClient().from("activity_reactions").delete().eq("activity_id", activityId).eq("user_id", userB.id);
  });

  it("toggle-off: a second call removes the row and returns { liked: false }", async () => {
    const c = await signedInClient(userB.email, userB.password);
    await _toggleReaction(c as any, activityId);
    const res = await _toggleReaction(c as any, activityId);
    expect(res).toEqual({ liked: false });

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(0);
  });

  it("self-like allowed: userA can like own activity (uniformity)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const res = await _toggleReaction(c as any, activityId);
    expect(res).toEqual({ liked: true });

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userA.id);
    expect(data).toHaveLength(1);

    await adminClient().from("activity_reactions").delete().eq("activity_id", activityId).eq("user_id", userA.id);
  });

  it("unauthenticated: throws 'unauthenticated'", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_toggleReaction(anon as any, activityId)).rejects.toThrow(/unauthenticated/i);
  });

  it("concurrent toggle-on: end state is exactly one row (23505 race swallowed)", async () => {
    const c = await signedInClient(userB.email, userB.password);
    await Promise.all([_toggleReaction(c as any, activityId), _toggleReaction(c as any, activityId)]);

    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(1);

    await adminClient().from("activity_reactions").delete().eq("activity_id", activityId).eq("user_id", userB.id);
  });
});
