import { describe, expect, it } from "vitest";
import { parseMentionUsernames } from "@/lib/ritual/mentions";

describe("parseMentionUsernames", () => {
  it("extracts dotted usernames case-insensitively and dedupes", () => {
    expect(parseMentionUsernames("@Cthulhu.Lemon hey @cthulhu.lemon")).toEqual(["cthulhu.lemon"]);
  });

  it("ignores email addresses and trims trailing punctuation", () => {
    expect(parseMentionUsernames("email cthulhu@example.com, ask @jellybones.")).toEqual(["jellybones"]);
  });

  it("keeps underscores and numbers", () => {
    expect(parseMentionUsernames("ping @user_42 and @bob.42")).toEqual(["user_42", "bob.42"]);
  });

  it("drops empty and overlong handles", () => {
    expect(parseMentionUsernames("@. @abcdefghijklmnopqrstuvwxyzabcdefg")).toEqual([]);
  });
});
