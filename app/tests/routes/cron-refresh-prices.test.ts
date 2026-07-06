import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted mocks — constructed before the route module loads.
const connectMock = vi.fn();
const endMock = vi.fn();
const clientCtor = vi.fn(() => ({ connect: connectMock, end: endMock }));
const runOnceMock = vi.fn();
const runPriceFeedScanMock = vi.fn();

vi.mock("pg", () => ({
  default: { Client: clientCtor },
  Client: clientCtor,
}));

vi.mock("film-goblin-worker", () => ({
  runOnce: runOnceMock,
}));

vi.mock("@/lib/feed-events/price-scan", () => ({
  runPriceFeedScan: runPriceFeedScanMock,
}));

// Import AFTER the mocks are registered.
const { GET } = await import("../../app/api/cron/refresh-prices/route");

function makeRequest(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost:3000/api/cron/refresh-prices", { headers });
}

describe("GET /api/cron/refresh-prices", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://fake/test";
    delete process.env.MAX_FILMS_PER_RUN;
    delete process.env.PRICE_REFRESH_MAX_RUNTIME_MS;
    delete process.env.PRICE_REFRESH_STALE_HOURS;
    connectMock.mockReset().mockResolvedValue(undefined);
    endMock.mockReset().mockResolvedValue(undefined);
    clientCtor.mockClear();
    runOnceMock.mockReset();
    runPriceFeedScanMock.mockReset().mockResolvedValue({ scanned: 0, emitted: 0 });
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(clientCtor).not.toHaveBeenCalled();
    expect(runOnceMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer does not match CRON_SECRET", async () => {
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runOnceMock).not.toHaveBeenCalled();
  });

  it("returns 500 when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("server misconfigured");
  });

  it("connects, runs the pipeline, and returns the digest snapshot on success", async () => {
    runOnceMock.mockResolvedValue({
      render: () => "films_refreshed=3 price_changes=1",
      snapshot: () => ({
        films_refreshed: 3,
        price_changes: 1,
        alerts_fired: 0,
        parse_failures: 0,
        unavailable_marked: 0,
        parse_failure_ids: [],
        stopped_reason: "complete",
      }),
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(clientCtor).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(runOnceMock).toHaveBeenCalledTimes(1);
    const [, opts] = runOnceMock.mock.calls[0];
    expect(opts).toEqual({ maxFilms: 10000, maxRuntimeMs: 240_000, staleHours: 20 });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.digest.films_refreshed).toBe(3);
    expect(body.feedScan).toEqual({ scanned: 0, emitted: 0 });
    expect(runPriceFeedScanMock).toHaveBeenCalledTimes(1);
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("honors MAX_FILMS_PER_RUN when set", async () => {
    process.env.MAX_FILMS_PER_RUN = "25";
    runOnceMock.mockResolvedValue({
      render: () => "films_refreshed=0",
      snapshot: () => ({
        films_refreshed: 0,
        price_changes: 0,
        alerts_fired: 0,
        parse_failures: 0,
        unavailable_marked: 0,
        parse_failure_ids: [],
        stopped_reason: "complete",
      }),
    });

    await GET(makeRequest("Bearer test-secret"));
    const [, opts] = runOnceMock.mock.calls[0];
    expect(opts).toEqual({ maxFilms: 25, maxRuntimeMs: 240_000, staleHours: 20 });
  });

  it("returns 500 and ends the client when runOnce throws", async () => {
    runOnceMock.mockRejectedValue(new Error("pipeline boom"));

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("job failed");
    expect(endMock).toHaveBeenCalledTimes(1);
  });
});
