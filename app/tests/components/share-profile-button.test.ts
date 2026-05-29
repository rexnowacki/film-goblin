import { describe, it, expect } from "vitest";
import { buildProfileInviteUrl, buildProfileInviteMessage } from "@/components/ShareProfileButton";

describe("buildProfileInviteUrl", () => {
  it("appends ?invite=1", () => {
    expect(buildProfileInviteUrl("teethtony")).toBe("https://freshfromthepit.com/p/teethtony?invite=1");
  });

  it("URL-encodes the username", () => {
    expect(buildProfileInviteUrl("weird.name")).toBe("https://freshfromthepit.com/p/weird.name?invite=1");
  });
});

describe("buildProfileInviteMessage", () => {
  it("formats display name and URL", () => {
    expect(buildProfileInviteMessage("Tony", "https://example.com/x")).toBe("Tony on Film Goblin: https://example.com/x");
  });
});
