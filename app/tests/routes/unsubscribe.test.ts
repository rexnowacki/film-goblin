import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();
const endMock = vi.fn();
const clientCtor = vi.fn(() => ({
  connect: connectMock,
  end: endMock,
  query: queryMock,
}));

vi.mock("pg", () => ({
  default: { Client: clientCtor },
  Client: clientCtor,
}));

const { GET } = await import("../../app/api/unsubscribe/[token]/route");

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/unsubscribe/abc");
}

describe("GET /api/unsubscribe/[token]", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake/test";
    connectMock.mockReset().mockResolvedValue(undefined);
    endMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 404 HTML when no profile matches the token", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await GET(makeRequest(), { params: Promise.resolve({ token: "invalid" }) });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toMatch(/no longer valid/i);
  });

  it("returns 200 HTML and UPDATEs the profile when the token matches", async () => {
    queryMock.mockResolvedValue({ rows: [{ handle: "moss" }], rowCount: 1 });
    const res = await GET(makeRequest(), { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toMatch(/off the list/i);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE profiles/i);
    expect(sql).toMatch(/email_notifications_enabled = FALSE/i);
    expect(params).toEqual(["valid-token"]);
  });

  it("is idempotent — a valid token already opted-out still returns 200", async () => {
    queryMock.mockResolvedValue({ rows: [{ handle: "moss" }], rowCount: 1 });
    const res = await GET(makeRequest(), { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(200);
  });
});
