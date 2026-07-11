import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

type Status = "scheduled" | "happened" | "cancelled";

function fakeClient(options: { current: Status; updatedId: string | null }) {
  const filters: Array<[string, string]> = [];
  let updateCalls = 0;
  const updateQuery: any = {
    eq: (column: string, value: string) => { filters.push([column, value]); return updateQuery; },
    select: () => updateQuery,
    maybeSingle: async () => ({ data: options.updatedId ? { id: options.updatedId } : null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve, reject),
  };
  return {
    filters,
    get updateCalls() { return updateCalls; },
    client: {
      auth: { getUser: async () => ({ data: { user: { id: "host" } }, error: null }) },
      from: (table: string) => {
        if (table !== "gazing_invites") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "invite-1", created_by: "host", status: options.current, starts_at: "2026-07-11T12:00:00.000Z", film_id: "film-1" }, error: null }) }) }),
          update: () => { updateCalls += 1; return updateQuery; },
        };
      },
    } as never,
  };
}

describe("_closeGazing compare-and-swap", () => {
  it("fails when another closer wins after the scheduled row was read", async () => {
    const state = fakeClient({ current: "scheduled", updatedId: null });
    const { _closeGazing } = await import("@/lib/actions/gazing");

    await expect(_closeGazing(state.client, "token", "cancelled", new Date("2026-07-11T11:00:00.000Z"))).rejects.toThrow(/changed|closed/i);
    expect(state.filters).toContainEqual(["status", "scheduled"]);
  });

  it("returns the id only when the scheduled compare-and-swap succeeds", async () => {
    const state = fakeClient({ current: "scheduled", updatedId: "invite-1" });
    const { _closeGazing } = await import("@/lib/actions/gazing");

    await expect(_closeGazing(state.client, "token", "cancelled", new Date("2026-07-11T11:00:00.000Z"))).resolves.toBe("invite-1");
    expect(state.filters).toEqual([["id", "invite-1"], ["status", "scheduled"]]);
  });

  it("rejects a terminal row before attempting an update", async () => {
    const state = fakeClient({ current: "cancelled", updatedId: "invite-1" });
    const { _closeGazing } = await import("@/lib/actions/gazing");

    await expect(_closeGazing(state.client, "token", "cancelled", new Date("2026-07-11T11:00:00.000Z"))).rejects.toThrow(/cannot be closed/i);
    expect(state.updateCalls).toBe(0);
  });
});
