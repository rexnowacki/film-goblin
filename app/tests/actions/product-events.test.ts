import { describe, expect, it, vi } from "vitest";
import { _recordProductEvents } from "@/lib/actions/product-events";
import type { ProductEventInput } from "@/lib/product-events/registry";

function event(): ProductEventInput {
  return {
    event_id: "22222222-2222-4222-8222-222222222222",
    event_name: "session_started",
    session_id: "11111111-1111-4111-8111-111111111111",
    occurred_at: new Date().toISOString(),
    properties: {},
  };
}

function client(options: { user?: boolean; error?: unknown; data?: number } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: options.data ?? 1, error: options.error ?? null });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: options.user === false ? null : { id: "u1" } }, error: null }) },
    rpc,
  };
}

describe("actions/product-events", () => {
  it("requires auth and calls the RPC with validated rows", async () => {
    const c = client();
    const input = event();
    await expect(_recordProductEvents(c as never, [input])).resolves.toBe(1);
    expect(c.rpc).toHaveBeenCalledWith("record_product_events", {
      events: [expect.objectContaining(input)],
    });
  });

  it("rejects unauthenticated and invalid batches before RPC", async () => {
    await expect(_recordProductEvents(client({ user: false }) as never, [event()])).rejects.toThrow();
    const c = client();
    await expect(_recordProductEvents(c as never, [])).rejects.toThrow("1 to 20");
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("throws RPC errors for the fail-soft browser queue to handle", async () => {
    await expect(_recordProductEvents(client({ error: new Error("rpc") }) as never, [event()])).rejects.toThrow("rpc");
  });
});
