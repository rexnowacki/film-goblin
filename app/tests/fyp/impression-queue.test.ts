import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createImpressionQueue } from "@/lib/fyp/impression-queue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createImpressionQueue", () => {
  it("flushes batched ids on the interval", () => {
    const flush = vi.fn();
    const q = createImpressionQueue(flush, 5000);
    q.add("a"); q.add("b");
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenCalledWith(["a", "b"]);
  });

  it("never flushes the same id twice per page view", () => {
    const flush = vi.fn();
    const q = createImpressionQueue(flush, 5000);
    q.add("a");
    vi.advanceTimersByTime(5000);
    q.add("a"); q.add("b");
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenNthCalledWith(1, ["a"]);
    expect(flush).toHaveBeenNthCalledWith(2, ["b"]);
  });

  it("flushNow drains immediately; dispose flushes leftovers and stops the timer", () => {
    const flush = vi.fn();
    const q = createImpressionQueue(flush, 5000);
    q.add("a");
    q.flushNow();
    expect(flush).toHaveBeenCalledWith(["a"]);
    q.add("b");
    q.dispose();
    expect(flush).toHaveBeenCalledWith(["b"]);
    q.add("c");
    vi.advanceTimersByTime(60000);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does not call flush when nothing is pending", () => {
    const flush = vi.fn();
    createImpressionQueue(flush, 5000);
    vi.advanceTimersByTime(20000);
    expect(flush).not.toHaveBeenCalled();
  });
});
