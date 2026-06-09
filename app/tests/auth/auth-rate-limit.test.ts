import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...mod,
    getClientIpHash: vi.fn().mockResolvedValue("test-ip-hash"),
    consumeIpRateLimit: vi.fn(),
  };
});
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { signIn, signUp, checkUsernameAvailability } from "@/lib/actions/auth";
import { consumeIpRateLimit } from "@/lib/rate-limit";

const THROTTLE = "Too many attempts. Try again in a few minutes.";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.mocked(consumeIpRateLimit).mockReset();
  vi.mocked(consumeIpRateLimit).mockResolvedValue({ allowed: true, count: 1, remaining: 9 });
});

describe("signIn throttling", () => {
  it("returns the throttle error when the per-IP limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit).mockResolvedValueOnce({ allowed: false, count: 30, remaining: 0 });
    const res = await signIn(fd({ identifier: "someone", password: "whatever1" }));
    expect(res.error).toBe(THROTTLE);
  });

  it("returns the throttle error when the per-identifier limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit)
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 29 })
      .mockResolvedValueOnce({ allowed: false, count: 10, remaining: 0 });
    const res = await signIn(fd({ identifier: "someone", password: "whatever1" }));
    expect(res.error).toBe(THROTTLE);
  });

  it("returns the throttle error when the identifier-global limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit)
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 29 })
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 9 })
      .mockResolvedValueOnce({ allowed: false, count: 50, remaining: 0 });
    const res = await signIn(fd({ identifier: "someone", password: "whatever1" }));
    expect(res.error).toBe(THROTTLE);
    const thirdCall = vi.mocked(consumeIpRateLimit).mock.calls[2][1];
    expect(thirdCall.key).toBe("signin-global");
    expect(thirdCall.ipHash).toMatch(/^id:/);
  });
});

describe("signUp", () => {
  it("enforces an 8-character password minimum before rate limiting", async () => {
    const res = await signUp(fd({ username: "newgoblin", password: "seven77" }));
    expect(res.error).toMatch(/at least 8/);
    expect(vi.mocked(consumeIpRateLimit)).not.toHaveBeenCalled();
  });

  it("returns the throttle error when the signup limit is exhausted", async () => {
    vi.mocked(consumeIpRateLimit).mockResolvedValueOnce({ allowed: false, count: 5, remaining: 0 });
    const res = await signUp(fd({ username: "newgoblin", password: "longenough1" }));
    expect(res.error).toBe(THROTTLE);
  });
});

describe("checkUsernameAvailability throttling", () => {
  it("returns neutral ok when throttled", async () => {
    vi.mocked(consumeIpRateLimit).mockResolvedValueOnce({ allowed: false, count: 60, remaining: 0 });
    const res = await checkUsernameAvailability("somename");
    expect(res.status).toBe("ok");
  });
});
