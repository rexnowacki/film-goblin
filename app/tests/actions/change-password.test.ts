import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { changePassword } from "../../lib/actions/profile";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/users";

let user: TestUser;

beforeAll(async () => { user = await createTestUser(); });
afterAll(async () => { await deleteTestUser(user.id); });

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

describe("actions/profile/changePassword", () => {
  it("returns an error when new password is too short", async () => {
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abc", confirm: "abc" }));
    expect(res.error).toMatch(/6 characters/i);
  });

  it("returns an error when new and confirm don't match", async () => {
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abcdef", confirm: "ghijkl" }));
    expect(res.error).toMatch(/don't match/i);
  });

  it("returns an error when session is missing (integration shape check)", async () => {
    // Outside of a Next.js request context, createClient() cookies are empty,
    // so the action should surface "Not signed in."
    const res = await changePassword(fd({
      current_password: "wrong",
      new_password: "abcdef",
      confirm: "abcdef",
    }));
    expect(res.error).toBeDefined();
  });
});
