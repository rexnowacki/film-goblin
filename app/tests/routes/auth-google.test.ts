import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const signInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOAuth },
  })),
}));

const { GET } = await import("../../app/api/auth/google/route");

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=abc" },
      error: null,
    });
  });

  it("uses the request origin for the callback redirect", async () => {
    const res = await GET(
      new NextRequest("https://freshfromthepit.com/api/auth/google?next=%2Fwatchlist"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=abc");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://freshfromthepit.com/api/auth/callback?next=%2Fwatchlist",
      },
    });
  });
});
