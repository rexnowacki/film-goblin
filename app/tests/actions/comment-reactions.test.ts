import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _toggleCommentReaction } from "../../lib/actions/comment-reactions";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let filmId: string;
let activityId: string;
let commentId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;

  const act = await admin
    .from("activity")
    .insert({ kind: "watchlist_added", actor_user_id: userA.id, payload: { film_id: filmId } as never })
    .select("id")
    .single();
  if (act.error || !act.data) throw act.error;
  activityId = act.data.id;

  const cm = await admin
    .from("activity_comments")
    .insert({ activity_id: activityId, user_id: userA.id, body: "first" })
    .select("id")
    .single();
  if (cm.error || !cm.data) throw cm.error;
  commentId = cm.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (commentId) await adminClient().from("activity_comments").delete().eq("id", commentId);
  if (activityId) await adminClient().from("activity").delete().eq("id", activityId);
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

describe.skipIf(!hasEnv)("_toggleCommentReaction", () => {
  it("toggle-on: returns { liked: true } and increments like_count", async () => {
    const c = await signedInClient(userB.email, userB.password);
    const res = await _toggleCommentReaction(c as never, commentId);
    expect(res).toEqual({ liked: true });

    const { data: rxRow } = await adminClient()
      .from("activity_comment_reactions")
      .select("user_id")
      .eq("comment_id", commentId)
      .eq("user_id", userB.id);
    expect(rxRow).toHaveLength(1);

    const { data: cmRow } = await adminClient()
      .from("activity_comments")
      .select("like_count")
      .eq("id", commentId)
      .single();
    expect(cmRow?.like_count).toBe(1);

    // cleanup for next test
    await adminClient().from("activity_comment_reactions").delete().eq("comment_id", commentId).eq("user_id", userB.id);
  });

  it("toggle-off: returns { liked: false } and decrements like_count", async () => {
    const c = await signedInClient(userB.email, userB.password);
    await _toggleCommentReaction(c as never, commentId);
    const res = await _toggleCommentReaction(c as never, commentId);
    expect(res).toEqual({ liked: false });

    const { data } = await adminClient()
      .from("activity_comment_reactions")
      .select("user_id")
      .eq("comment_id", commentId)
      .eq("user_id", userB.id);
    expect(data).toHaveLength(0);

    const { data: cmRow } = await adminClient()
      .from("activity_comments")
      .select("like_count")
      .eq("id", commentId)
      .single();
    expect(cmRow?.like_count).toBe(0);
  });
});
