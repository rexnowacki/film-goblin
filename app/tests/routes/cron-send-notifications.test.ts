import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const connectMock = vi.fn();
const endMock = vi.fn();
const queryMock = vi.fn();
const clientCtor = vi.fn(() => ({ connect: connectMock, end: endMock, query: queryMock }));
const sendDailyDigestsMock = vi.fn();
const resendCtor = vi.fn();

vi.mock("pg", () => ({
  default: { Client: clientCtor },
  Client: clientCtor,
}));

vi.mock("film-goblin-notifier", () => ({
  sendDailyDigests: sendDailyDigestsMock,
}));

vi.mock("resend", () => ({
  Resend: resendCtor,
}));

const { GET } = await import("../../app/api/cron/send-notifications/route");

function makeRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost:3000/api/cron/send-notifications", { headers });
}

describe("GET /api/cron/send-notifications", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://fake/test";
    process.env.RESEND_API_KEY = "re_test";
    process.env.NOTIFY_FROM_EMAIL = "onboarding@resend.dev";
    process.env.APP_BASE_URL = "https://film-goblin.vercel.app";
    connectMock.mockReset().mockResolvedValue(undefined);
    endMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockReset().mockResolvedValue({ rowCount: 0 });
    clientCtor.mockClear();
    sendDailyDigestsMock.mockReset();
    resendCtor.mockClear();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(sendDailyDigestsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer does not match CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 500 when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("server misconfigured");
  });

  it("returns 500 when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("server misconfigured");
  });

  it("returns 200 with digest counters on happy path and runs the 30-day cleanup", async () => {
    sendDailyDigestsMock.mockResolvedValue({
      sent: 3, failed: 0, skipped: 0, failed_user_ids: [],
    });
    queryMock.mockResolvedValue({ rowCount: 7 });
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(clientCtor).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(resendCtor).toHaveBeenCalledWith("re_test");
    expect(sendDailyDigestsMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/DELETE FROM notifications/i);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.digest.sent).toBe(3);
    expect(body.notificationsDeleted).toBe(7);
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and ends the client when sendDailyDigests throws", async () => {
    sendDailyDigestsMock.mockRejectedValue(new Error("notifier boom"));
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("job failed");
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
