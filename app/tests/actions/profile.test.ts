import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _updateProfile } from "../../lib/actions/profile";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let user: TestUser;

beforeAll(async () => { if (!hasEnv) return; user = await createTestUser(); });
afterAll(async () => { if (!hasEnv) return; await deleteTestUser(user.id); });

describe.skipIf(!hasEnv)("actions/profile", () => {
  it("updateProfile changes username and bio", async () => {
    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { username: "newhandle", bio: "a new bio" });
    const { data } = await adminClient().from("profiles").select("*").eq("id", user.id).single();
    expect(data?.username).toBe("newhandle");
    expect(data?.bio).toBe("a new bio");
  });

  it("re-enabling email notifications rotates the unsubscribe token", async () => {
    // Seed: user starts with all per-kind email flags off + a known token.
    const admin = adminClient();
    const before = await admin
      .from("profiles")
      .update({
        email_price_drops: false,
        email_coven_recs: false,
        email_comments: false,
        email_coven_invites: false,
      })
      .eq("id", user.id)
      .select("unsubscribe_token")
      .single();
    const tokenBefore = (before.data as any)?.unsubscribe_token as string;
    expect(tokenBefore).toBeTruthy();

    // Act: user flips price-drops back on.
    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { email_price_drops: true });

    // Assert: new token, old token no longer matches.
    const after = await admin
      .from("profiles")
      .select("unsubscribe_token, email_price_drops")
      .eq("id", user.id)
      .single();
    const tokenAfter = (after.data as any)?.unsubscribe_token as string;
    expect((after.data as any)?.email_price_drops).toBe(true);
    expect(tokenAfter).toBeTruthy();
    expect(tokenAfter).not.toBe(tokenBefore);
  });

  it("toggling a kind off without re-enable does NOT rotate the token", async () => {
    const admin = adminClient();
    await admin.from("profiles").update({ email_price_drops: true }).eq("id", user.id);
    const before = await admin
      .from("profiles").select("unsubscribe_token").eq("id", user.id).single();
    const tokenBefore = (before.data as any)?.unsubscribe_token as string;

    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { email_price_drops: false });

    const after = await admin
      .from("profiles").select("unsubscribe_token").eq("id", user.id).single();
    const tokenAfter = (after.data as any)?.unsubscribe_token as string;
    expect(tokenAfter).toBe(tokenBefore);
  });
});
