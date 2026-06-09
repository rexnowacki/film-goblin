import { describe, it, expect, vi } from "vitest";
import {
  consumeIpRateLimit,
  hashKey,
  parseClientIp,
  utcHourBucket,
  utcQuarterHourBucket,
} from "../lib/rate-limit";

describe("parseClientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    expect(parseClientIp("203.0.113.7, 10.0.0.1", null)).toBe("203.0.113.7");
    expect(parseClientIp("203.0.113.7", "10.9.9.9")).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(parseClientIp(null, "203.0.113.9")).toBe("203.0.113.9");
    expect(parseClientIp(null, null)).toBe("unknown");
    expect(parseClientIp("  ,", " ")).toBe("unknown");
  });
});

describe("hashKey", () => {
  it("returns a stable 32-char hex digest", () => {
    expect(hashKey("1.2.3.4")).toBe(hashKey("1.2.3.4"));
    expect(hashKey("1.2.3.4")).toMatch(/^[0-9a-f]{32}$/);
    expect(hashKey("1.2.3.4")).not.toBe(hashKey("1.2.3.5"));
  });
});

describe("window buckets", () => {
  it("floors to 15-minute UTC buckets", () => {
    expect(utcQuarterHourBucket(new Date("2026-06-09T14:23:45Z"))).toBe("2026-06-09T14:15");
    expect(utcQuarterHourBucket(new Date("2026-06-09T14:00:00Z"))).toBe("2026-06-09T14:00");
    expect(utcQuarterHourBucket(new Date("2026-06-09T14:59:59Z"))).toBe("2026-06-09T14:45");
  });

  it("produces hourly UTC buckets", () => {
    expect(utcHourBucket(new Date("2026-06-09T14:23:45Z"))).toBe("2026-06-09T14");
  });
});

describe("consumeIpRateLimit", () => {
  it("passes through an allowed result and calls the RPC with the right args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: true, count: 1, remaining: 9 }], error: null });
    const r = await consumeIpRateLimit({ rpc } as never, {
      ipHash: "x", key: "k", limit: 10, windowStart: "2026-06-09T14:15",
    });
    expect(r).toEqual({ allowed: true, count: 1, remaining: 9 });
    expect(rpc).toHaveBeenCalledWith("consume_ip_rate_limit", {
      p_ip_hash: "x",
      p_key: "k",
      p_limit: 10,
      p_window_start: "2026-06-09T14:15",
    });
  });

  it("denies when the RPC says the limit is exhausted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: false, count: 10, remaining: 0 }], error: null });
    const r = await consumeIpRateLimit({ rpc } as never, {
      ipHash: "x", key: "k", limit: 10, windowStart: "w",
    });
    expect(r.allowed).toBe(false);
  });

  it("fails open when the RPC errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await consumeIpRateLimit({ rpc } as never, {
      ipHash: "x", key: "k", limit: 10, windowStart: "w",
    });
    expect(r).toEqual({ allowed: true, count: 0, remaining: 10 });
  });
});
