import { describe, it, expect } from "vitest";
import { safeRedirect } from "../../lib/auth/safe-redirect";

describe("safeRedirect", () => {
  it("returns the path when it's a same-origin absolute path", () => {
    expect(safeRedirect("/home")).toBe("/home");
    expect(safeRedirect("/p/moss.witch")).toBe("/p/moss.witch");
    expect(safeRedirect("/films?q=horror")).toBe("/films?q=horror");
  });

  it("rejects protocol-relative URLs (open redirect)", () => {
    expect(safeRedirect("//evil.com")).toBe("/home");
    expect(safeRedirect("//evil.com/path")).toBe("/home");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirect("https://evil.com")).toBe("/home");
    expect(safeRedirect("http://evil.com/path")).toBe("/home");
  });

  it("falls back to provided default on empty/undefined input", () => {
    expect(safeRedirect("")).toBe("/home");
    expect(safeRedirect(undefined)).toBe("/home");
    expect(safeRedirect(null)).toBe("/home");
    expect(safeRedirect("", "/settings")).toBe("/settings");
  });
});
