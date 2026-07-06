import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _subscribeToPush, _unsubscribeFromPush } from "../../lib/actions/push";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
});

afterAll(async () => {
  if (!hasEnv) return;
  if (userA?.id) {
    await adminClient().from("push_subscriptions").delete().eq("user_id", userA.id);
    await deleteTestUser(userA.id);
  }
});

beforeEach(async () => {
  if (!hasEnv) return;
  await adminClient().from("push_subscriptions").delete().eq("user_id", userA.id);
});

const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "test-p256dh", auth: "test-auth" },
});

describe.skipIf(!hasEnv)("actions/push", () => {
  it("subscribe inserts a row; resubscribe with same endpoint replaces it", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const svc = adminClient();
    await _subscribeToPush(c as any, svc as any, sub("https://push.example/int-1"), "vitest");
    await _subscribeToPush(c as any, svc as any, sub("https://push.example/int-1"), "vitest");
    const { data } = await adminClient()
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", "https://push.example/int-1");
    expect(data).toHaveLength(1);
  });

  it("rejects a non-https endpoint", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(
      _subscribeToPush(c as any, adminClient() as any, sub("http://insecure.example/x"), "vitest"),
    ).rejects.toThrow(/https/i);
  });

  it("unsubscribe deletes the row", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _subscribeToPush(c as any, adminClient() as any, sub("https://push.example/int-2"), "vitest");
    await _unsubscribeFromPush(c as any, "https://push.example/int-2");
    const { data } = await adminClient()
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", "https://push.example/int-2");
    expect(data).toHaveLength(0);
  });

  it("subscribe throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(
      _subscribeToPush(anon as any, adminClient() as any, sub("https://push.example/int-3"), "vitest"),
    ).rejects.toThrow(/unauthenticated/i);
  });
});
