import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _follow, _unfollow } from "../../lib/actions/follows";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  if (!hasEnv) return;
  alice = await createTestUser();
  bob = await createTestUser();
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("follows").delete().eq("follower_user_id", alice.id);
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
});

describe.skipIf(!hasEnv)("actions/follows", () => {
  it("follow inserts a row owned by the caller", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await _follow(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("follows").select("*")
      .eq("follower_user_id", alice.id).eq("followed_user_id", bob.id);
    expect(data).toHaveLength(1);
  });

  it("follow is idempotent", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await _follow(c, bob.id);
    await _follow(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("follows").select("*")
      .eq("follower_user_id", alice.id).eq("followed_user_id", bob.id);
    expect(data).toHaveLength(1);
  });

  it("unfollow deletes the row", async () => {
    const c = await signedInClient(alice.email, alice.password);
    await _follow(c, bob.id);
    await _unfollow(c, bob.id);
    const admin = adminClient();
    const { data } = await admin.from("follows").select("*")
      .eq("follower_user_id", alice.id).eq("followed_user_id", bob.id);
    expect(data).toHaveLength(0);
  });
});
