import { describe, it, expect, beforeEach, vi } from "vitest";

// The route imports web-push and the service-role client at module scope;
// stub env before importing so module init doesn't throw.
beforeEach(() => {
  vi.stubEnv("PUSH_FANOUT_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
});

function req(auth: string | null, body: unknown): Request {
  return new Request("http://localhost/api/push/fanout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/fanout auth", () => {
  it("401 without Authorization header", async () => {
    const { POST } = await import("@/app/api/push/fanout/route");
    const res = await POST(req(null, { notification_id: "n-1" }));
    expect(res.status).toBe(401);
  });

  it("401 with wrong secret", async () => {
    const { POST } = await import("@/app/api/push/fanout/route");
    const res = await POST(req("Bearer wrong", { notification_id: "n-1" }));
    expect(res.status).toBe(401);
  });

  it("400 with correct secret but missing notification_id", async () => {
    const { POST } = await import("@/app/api/push/fanout/route");
    const res = await POST(req("Bearer test-secret", {}));
    expect(res.status).toBe(400);
  });
});
