import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductEventQueue } from "@/lib/product-events/queue";
import type { ProductEventInput } from "@/lib/product-events/registry";

function event(id: string): ProductEventInput {
  return {
    event_id: id,
    event_name: "session_started",
    session_id: "11111111-1111-4111-8111-111111111111",
    occurred_at: new Date().toISOString(),
    properties: {},
  };
}

describe("product event queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flushes after the interval and dedupes event ids", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const q = createProductEventQueue(flush, { intervalMs: 5000 });
    q.add(event("a")); q.add(event("a"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toHaveLength(1);
  });

  it("flushes immediately at the cap", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const q = createProductEventQueue(flush, { batchCap: 2 });
    q.add(event("a")); q.add(event("b"));
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  });

  it("retries once then succeeds with the same ids", async () => {
    const flush = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    const q = createProductEventQueue(flush);
    q.add(event("a"));
    await q.flushNow();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[0][0][0].event_id).toBe(flush.mock.calls[1][0][0].event_id);
  });

  it("drops after the second failure without rejecting", async () => {
    const onDrop = vi.fn();
    const q = createProductEventQueue(vi.fn().mockRejectedValue(new Error("down")), { onDrop });
    q.add(event("a"));
    await expect(q.flushNow()).resolves.toBeUndefined();
    expect(onDrop).toHaveBeenCalledTimes(1);
  });
});
