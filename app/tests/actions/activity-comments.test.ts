import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _addActivityComment, _deleteActivityComment } from "../../lib/actions/activity-comments";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

let alice: TestUser; // activity owner
let bob: TestUser;   // commenter
let carol: TestUser; // third-party
let filmId = "";
let activityId = "";

beforeAll(async () => {
  if (!hasEnv) return;
  alice = await createTestUser();
  bob = await createTestUser();
  carol = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ title: "Test Film", director: "T", year: 2026, artwork_url: "x", itunes_url: "y" })
    .select("id").single();
  filmId = (film.data as { id: string }).id;

  const act = await admin
    .from("activity")
    .insert({ actor_user_id: alice.id, kind: "watchlist_added", payload: { film_id: filmId } })
    .select("id").single();
  activityId = (act.data as { id: string }).id;
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("activity_comments" as never).delete().eq("activity_id", activityId);
  await admin.from("notifications").delete().eq("kind", "comment_on_activity");
  await admin.from("notifications").delete().eq("kind", "reply_on_comment");
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("activity").delete().eq("id", activityId);
  await admin.from("films").delete().eq("id", filmId);
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
  await deleteTestUser(carol.id);
});

describe.skipIf(!hasEnv)("actions/activity-comments", () => {
  it("addActivityComment happy path", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "banger");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comment.body).toBe("banger");
    expect(r.comment.user_id).toBe(bob.id);
  });

  it("rejects empty body before DB", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/empty/i);
  });

  it("rejects body > 140 chars before DB", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "x".repeat(141));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/140/);
  });

  it("author can delete own comment", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const add = await _addActivityComment(c, activityId, "mine");
    if (!add.ok) throw new Error("seed failed");
    const del = await _deleteActivityComment(c, add.comment.id);
    expect(del.ok).toBe(true);
  });

  it("activity owner can delete a non-own comment on their row", async () => {
    const cBob = await signedInClient(bob.email, bob.password);
    const add = await _addActivityComment(cBob, activityId, "theirs");
    if (!add.ok) throw new Error("seed failed");

    const cAlice = await signedInClient(alice.email, alice.password); // activity owner
    const del = await _deleteActivityComment(cAlice, add.comment.id);
    expect(del.ok).toBe(true);
  });

  it("third party cannot delete", async () => {
    const cBob = await signedInClient(bob.email, bob.password);
    const add = await _addActivityComment(cBob, activityId, "hands off");
    if (!add.ok) throw new Error("seed failed");

    const cCarol = await signedInClient(carol.email, carol.password);
    const del = await _deleteActivityComment(cCarol, add.comment.id);
    expect(del.ok).toBe(false);
  });

  it("_addActivityComment with parentId returns comment with parent_id set", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const parent = await _addActivityComment(c, activityId, "parent comment");
    if (!parent.ok) throw new Error("parent insert failed");

    const reply = await _addActivityComment(c, activityId, "reply body", parent.comment.id);
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.comment.parent_id).toBe(parent.comment.id);
    expect(reply.comment.reply_count).toBe(0);
  });

  it("_addActivityComment without parentId returns comment with parent_id null", async () => {
    const c = await signedInClient(bob.email, bob.password);
    const r = await _addActivityComment(c, activityId, "top-level");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comment.parent_id).toBeNull();
  });
});
