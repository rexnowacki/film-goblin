import { describe, it, expect, vi } from "vitest";
import { getProfilesBySearch } from "@/lib/queries/profiles";

function makeClient(rows: any[]) {
  const builder: any = {
    _calls: { not: [] as Array<{ col: string; op: string; value: string }> },
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn(function (col: string, op: string, value: string) {
      builder._calls.not.push({ col, op, value });
      return builder;
    }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as any;
}

describe("getProfilesBySearch", () => {
  it("returns rows unfiltered when excludeUserIds is omitted", async () => {
    const client = makeClient([{ id: "p1", username: "alice" }]);
    const rows = await getProfilesBySearch(client, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("alice");
    expect(client._builder._calls.not).toHaveLength(0);
  });

  it("does not call .not() when excludeUserIds is empty", async () => {
    const client = makeClient([{ id: "p1", username: "alice" }]);
    await getProfilesBySearch(client, { excludeUserIds: [] });
    expect(client._builder._calls.not).toHaveLength(0);
  });

  it("calls .not(id, in, ...) when excludeUserIds is non-empty", async () => {
    const client = makeClient([]);
    await getProfilesBySearch(client, { excludeUserIds: ["u1", "u2"] });
    expect(client._builder._calls.not).toHaveLength(1);
    expect(client._builder._calls.not[0].col).toBe("id");
    expect(client._builder._calls.not[0].op).toBe("in");
    expect(client._builder._calls.not[0].value).toBe("(u1,u2)");
  });
});
