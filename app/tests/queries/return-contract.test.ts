import { afterEach, describe, expect, it, vi } from "vitest";
import { getReturnContract, getReturnContracts } from "@/lib/queries/return-contract";

vi.mock("@/lib/queries/taste-twins", () => ({
  getTasteTwinSuggestions: vi.fn().mockResolvedValue([]),
}));

function chain(result: { data: unknown[] | null; error: Error | null }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "gte", "not", "gt", "in"]) {
    query[method] = () => query;
  }
  query.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

afterEach(() => vi.restoreAllMocks());

describe("getReturnContracts", () => {
  it("returns the Daily Omen as an ordered one-item queue when no higher candidate exists", async () => {
    const client = {
      from: vi.fn(() => chain({ data: [], error: null })),
    } as never;
    const now = new Date("2026-07-10T12:00:00.000Z");

    const contracts = await getReturnContracts(client, "00000000-0000-4000-8000-000000000001", now);

    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      kind: "daily_omen",
      key: "daily_omen:2026-07-10",
    });
    await expect(getReturnContract(client, "00000000-0000-4000-8000-000000000001", now))
      .resolves.toMatchObject({ kind: "daily_omen" });
  });

  it("fails closed to an empty queue when a source query fails", async () => {
    const error = new Error("source unavailable");
    const client = {
      from: vi.fn(() => chain({ data: null, error })),
    } as never;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getReturnContracts(
      client,
      "00000000-0000-4000-8000-000000000001",
      new Date("2026-07-10T12:00:00.000Z"),
    )).resolves.toEqual([]);
    expect(log).toHaveBeenCalledWith("return contract query failed", error);
  });
});
