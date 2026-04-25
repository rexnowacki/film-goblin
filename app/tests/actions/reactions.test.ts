import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _toggleReaction } from "../../lib/actions/reactions";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let userA: TestUser;
let userB: TestUser;
let filmId: string;
let activityId: string;

beforeAll(async () => {
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
  if (activityId) await adminClient().from("activity").delete().eq("id", activityId);
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

describe("_toggleReaction", () => {
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

  it("self-like blocked: throws 'cannot like own activity'", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(_toggleReaction(c as any, activityId)).rejects.toThrow(/cannot like own activity/i);
    const { data } = await adminClient()
      .from("activity_reactions")
      .select("*")
      .eq("activity_id", activityId)
      .eq("user_id", userA.id);
    expect(data).toHaveLength(0);
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
