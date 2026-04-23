import { describe, it, expect } from "vitest";
import { friendlyError } from "../../lib/auth/friendly-errors";

describe("friendlyError", () => {
  it("maps a known Supabase message to user-friendly copy", () => {
    expect(friendlyError({ message: "Invalid login credentials" }))
      .toBe("Email or password is incorrect.");
  });

  it("passes through unknown messages unchanged", () => {
    expect(friendlyError({ message: "Some obscure Supabase edge case" }))
      .toBe("Some obscure Supabase edge case");
  });

  it("accepts a bare string", () => {
    expect(friendlyError("Invalid login credentials"))
      .toBe("Email or password is incorrect.");
  });

  it("unwraps Error-like objects via .message", () => {
    const err = new Error("Invalid login credentials");
    expect(friendlyError(err)).toBe("Email or password is incorrect.");
  });

  it("returns a generic fallback for null/undefined", () => {
    expect(friendlyError(null)).toBe("Something went wrong.");
    expect(friendlyError(undefined)).toBe("Something went wrong.");
  });
});
