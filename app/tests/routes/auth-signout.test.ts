import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();
const deleteCookie = vi.fn();
const getAllCookies = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut } })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: getAllCookies, delete: deleteCookie })),
}));

const { POST } = await import("../../app/auth/signout/route");
const { isSupabaseAuthCookie } = await import("../../lib/auth/supabase-cookies");

describe("POST /auth/signout", () => {
  beforeEach(() => {
    signOut.mockReset();
    deleteCookie.mockReset();
    getAllCookies.mockReset();
  });

  it("clears only this browser session and returns a native redirect", async () => {
    signOut.mockResolvedValue({ error: null });
    const response = await POST(new NextRequest("https://freshfromthepit.com/auth/signout", { method: "POST" }));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://freshfromthepit.com/");
  });

  it("clears auth-cookie chunks and still leaves when remote sign-out fails", async () => {
    signOut.mockResolvedValue({ error: new Error("nope") });
    getAllCookies.mockReturnValue([
      { name: "sb-project-auth-token" },
      { name: "sb-project-auth-token.0" },
      { name: "theme" },
    ]);
    const response = await POST(new NextRequest("https://freshfromthepit.com/auth/signout", { method: "POST" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://freshfromthepit.com/");
    expect(deleteCookie).toHaveBeenCalledWith("sb-project-auth-token");
    expect(deleteCookie).toHaveBeenCalledWith("sb-project-auth-token.0");
    expect(deleteCookie).not.toHaveBeenCalledWith("theme");
  });

  it("recognizes only Supabase auth-token cookies", () => {
    expect(isSupabaseAuthCookie("sb-abc-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abc-auth-token.2")).toBe(true);
    expect(isSupabaseAuthCookie("theme")).toBe(false);
  });

  it("rejects cross-origin logout submissions", async () => {
    const response = await POST(new NextRequest("https://freshfromthepit.com/auth/signout", {
      method: "POST",
      headers: { origin: "https://malicious.example" },
    }));
    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });
});
