import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _subscribeToList, _unsubscribeFromList } from "../../lib/actions/lists";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;
let publicListId: string;
let privateListId: string;
let ownerId: string;

beforeAll(async () => {
  user = await createTestUser();
  const owner = await createTestUser();
  ownerId = owner.id;
  const admin = adminClient();
  const pub = await admin.from("lists").insert({ owner_user_id: ownerId, title: "Public G", is_public: true }).select("id").single();
  const priv = await admin.from("lists").insert({ owner_user_id: ownerId, title: "Private G", is_public: false }).select("id").single();
  publicListId = pub.data!.id;
  privateListId = priv.data!.id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("list_subscriptions").delete().eq("user_id", user.id);
  await admin.from("lists").delete().in("id", [publicListId, privateListId]);
  await deleteTestUser(user.id);
  await deleteTestUser(ownerId);
});

describe("actions/lists", () => {
  it("can subscribe to a public list", async () => {
    const c = await signedInClient(user.email, user.password);
    await _subscribeToList(c, publicListId);
    const admin = adminClient();
    const { data } = await admin.from("list_subscriptions").select("*").eq("user_id", user.id).eq("list_id", publicListId);
    expect(data).toHaveLength(1);
  });

  it("cannot subscribe to a private list", async () => {
    const c = await signedInClient(user.email, user.password);
    await expect(_subscribeToList(c, privateListId)).rejects.toThrow();
  });

  it("can unsubscribe", async () => {
    const c = await signedInClient(user.email, user.password);
    // Already subscribed from prior test; remove
    await _unsubscribeFromList(c, publicListId);
    const admin = adminClient();
    const { data } = await admin.from("list_subscriptions").select("*").eq("user_id", user.id).eq("list_id", publicListId);
    expect(data).toHaveLength(0);
  });
});
