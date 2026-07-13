import { afterEach, describe, expect, it, vi } from "vitest";
import { getReturnContract, getReturnContracts } from "@/lib/queries/return-contract";
import { getTasteTwinSuggestions } from "@/lib/queries/taste-twins";

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
  it("returns only a profile-photo reminder when setup is otherwise complete", async () => {
    const rows: Record<string, unknown[]> = {
      coven_requests: [],
      return_contract_deferrals: [],
      profiles: [{ id: "00000000-0000-4000-8000-000000000001", username: "moss", avatar_url: null, created_at: "2026-07-01T00:00:00Z" }],
    };
    const client = {
      from: vi.fn((table: string) => chain({ data: rows[table] ?? [], error: null })),
    };
    const now = new Date("2026-07-10T12:00:00.000Z");

    const contracts = await getReturnContracts(client as never, "00000000-0000-4000-8000-000000000001", now);

    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      kind: "profile_photo",
      key: "profile_photo:00000000-0000-4000-8000-000000000001",
      href: "/settings#your-face",
    });
    await expect(getReturnContract(client as never, "00000000-0000-4000-8000-000000000001", now))
      .resolves.toMatchObject({ kind: "profile_photo" });
    expect(client.from).not.toHaveBeenCalledWith("watchlists");
    expect(client.from).not.toHaveBeenCalledWith("recommendations");
    expect(client.from).not.toHaveBeenCalledWith("gazing_invites");
    expect(client.from).not.toHaveBeenCalledWith("films_with_stats");
  });

  it("omits the photo reminder after an avatar is set and uses ranked taste suggestions", async () => {
    vi.mocked(getTasteTwinSuggestions).mockResolvedValueOnce([{
      user: { id: "00000000-0000-4000-8000-000000000002", username: "hex", avatar_url: null },
      sharedTraits: [{ name: "folk horror", facet: "subgenre" }],
      sharedFilm: null,
      source: "taste",
    }]);
    const rows: Record<string, unknown[]> = {
      coven_requests: [],
      return_contract_deferrals: [],
      profiles: [{ id: "00000000-0000-4000-8000-000000000001", username: "moss", avatar_url: "/moss.png", created_at: "2026-07-01T00:00:00Z" }],
    };
    const client = { from: vi.fn((table: string) => chain({ data: rows[table] ?? [], error: null })) };

    const contracts = await getReturnContracts(client as never, "00000000-0000-4000-8000-000000000001", new Date("2026-07-10T12:00:00Z"));

    expect(contracts.map(item => item.kind)).toEqual(["taste_twin"]);
    expect(contracts[0]).toMatchObject({ subjectId: "00000000-0000-4000-8000-000000000002", subjectUsername: "hex" });
    expect(getTasteTwinSuggestions).toHaveBeenCalledWith(client as never, "00000000-0000-4000-8000-000000000001", 3);
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
