import { describe, it, expect } from "vitest";
import { changePassword } from "../../lib/actions/profile";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

describe("actions/profile/changePassword", () => {
  it("returns an error when new password is too short", async () => {
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abc", confirm: "abc" }));
    expect(res.error).toMatch(/8 characters/i);
  });

  it("returns an error when new and confirm don't match", async () => {
    const res = await changePassword(fd({ current_password: "whatever", new_password: "abcdefgh", confirm: "ghijklmn" }));
    expect(res.error).toMatch(/don't match/i);
  });
});
