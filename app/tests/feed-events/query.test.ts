import { describe, expect, it } from "vitest";
import { getPitArchiveEvents } from "@/lib/feed-events/query";

function stubArchiveClient(rows: unknown[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return chain; },
    order: (...args: unknown[]) => { calls.push({ method: "order", args }); return chain; },
    lt: (...args: unknown[]) => { calls.push({ method: "lt", args }); return chain; },
    limit: async (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return { data: rows, error: null };
    },
  };
  const client = { from: (table: string) => { calls.push({ method: "from", args: [table] }); return chain; } } as never;
  return { client, calls };
}

describe("getPitArchiveEvents", () => {
  it("orders newest-first, limits the page, and normalizes an embedded film", async () => {
    const { client, calls } = stubArchiveClient([{
      id: "event-1", event_type: "price_drop", film_id: "film-1", payload: {}, copy: "x", priority: 90,
      created_at: "2026-07-09T12:00:00Z", film: [{ id: "film-1", title: "The Pit", artwork_url: null }],
    }]);

    const events = await getPitArchiveEvents(client, { limit: 7 });

    expect(calls).toEqual(expect.arrayContaining([
      { method: "from", args: ["feed_events"] },
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "limit", args: [7] },
    ]));
    expect(calls.some((call) => call.method === "lt")).toBe(false);
    expect(events[0]?.film).toEqual({ id: "film-1", title: "The Pit", artwork_url: null });
  });

  it("uses a strict older-than cursor boundary", async () => {
    const { client, calls } = stubArchiveClient([]);
    await getPitArchiveEvents(client, { before: "2026-07-08T00:00:00Z" });
    expect(calls).toEqual(expect.arrayContaining([
      { method: "lt", args: ["created_at", "2026-07-08T00:00:00Z"] },
      { method: "limit", args: [30] },
    ]));
  });
});
