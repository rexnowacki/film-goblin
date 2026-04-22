import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _updateProfile } from "../../lib/actions/profile";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => { user = await createTestUser(); });
afterAll(async () => { await deleteTestUser(user.id); });

describe("actions/profile", () => {
  it("updateProfile changes handle and bio", async () => {
    const c = await signedInClient(user.email, user.password);
    await _updateProfile(c, { handle: "newhandle", bio: "a new bio" });
    const { data } = await adminClient().from("profiles").select("*").eq("id", user.id).single();
    expect(data?.handle).toBe("newhandle");
    expect(data?.bio).toBe("a new bio");
  });
});
