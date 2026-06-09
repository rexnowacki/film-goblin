import { describe, it, expect } from "vitest";
import { _updateProfile } from "../../lib/actions/profile";

function stubClient(userId = "u-1") {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: () => { throw new Error("DB should not be reached"); },
  } as never;
}

describe("_updateProfile input validation", () => {
  it("rejects invalid usernames before DB writes", async () => {
    await expect(_updateProfile(stubClient(), { username: "Bad Name!" }))
      .rejects.toThrow(/username/i);
    await expect(_updateProfile(stubClient(), { username: ".dot" }))
      .rejects.toThrow(/username/i);
  });

  it("rejects a display name over 50 chars", async () => {
    await expect(_updateProfile(stubClient(), { display_name: "x".repeat(51) }))
      .rejects.toThrow(/display name is too long/i);
  });

  it("rejects a bio over 500 chars", async () => {
    await expect(_updateProfile(stubClient(), { bio: "x".repeat(501) }))
      .rejects.toThrow(/bio is too long/i);
  });

  it("rejects an avatar_url over 1000 chars", async () => {
    await expect(_updateProfile(stubClient(), { avatar_url: "x".repeat(1001) }))
      .rejects.toThrow(/avatar url is too long/i);
  });
});
