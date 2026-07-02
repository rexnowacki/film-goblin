import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidateCalls: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => { revalidateCalls.push(path); },
}));

let fakeAuthClient: unknown;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeAuthClient,
}));

import {
  _recordFypImpressions,
  _setNotInterested,
  _undoNotInterested,
  setNotInterested,
  undoNotInterested,
} from "@/lib/actions/fyp";

function stubClient() {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: async (fn: string, args: unknown) => { calls.push({ kind: `rpc:${fn}`, args }); return { data: null, error: null }; },
    from: (table: string) => ({
      insert: (payload: unknown) => { calls.push({ kind: `insert:${table}`, args: payload }); return Promise.resolve({ error: null }); },
      delete: () => ({
        eq: (col1: string, v1: unknown) => ({
          eq: (col2: string, v2: unknown) => {
            calls.push({ kind: `delete:${table}`, args: { [col1]: v1, [col2]: v2 } });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  } as never;
  return { client, calls };
}

describe("_recordFypImpressions", () => {
  it("calls the RPC with the film ids", async () => {
    const { client, calls } = stubClient();
    await _recordFypImpressions(client, ["f1", "f2"]);
    expect(calls).toEqual([{ kind: "rpc:record_fyp_impressions", args: { p_film_ids: ["f1", "f2"] } }]);
  });
  it("no-ops on empty input", async () => {
    const { client, calls } = stubClient();
    await _recordFypImpressions(client, []);
    expect(calls).toHaveLength(0);
  });
  it("caps at 50 ids", async () => {
    const { client, calls } = stubClient();
    await _recordFypImpressions(client, Array.from({ length: 80 }, (_, i) => `f${i}`));
    expect((calls[0].args as { p_film_ids: string[] }).p_film_ids).toHaveLength(50);
  });
});

describe("_setNotInterested / _undoNotInterested", () => {
  it("inserts the user-owned dismissal row", async () => {
    const { client, calls } = stubClient();
    await _setNotInterested(client, "f1");
    expect(calls).toEqual([{ kind: "insert:fyp_not_interested", args: { user_id: "u1", film_id: "f1" } }]);
  });
  it("deletes the dismissal row on undo", async () => {
    const { client, calls } = stubClient();
    await _undoNotInterested(client, "f1");
    expect(calls).toEqual([{ kind: "delete:fyp_not_interested", args: { user_id: "u1", film_id: "f1" } }]);
  });
});

describe("setNotInterested / undoNotInterested public wrappers", () => {
  beforeEach(() => {
    revalidateCalls.length = 0;
    fakeAuthClient = stubClient().client;
  });

  it("setNotInterested does NOT revalidate — optimistic client state is the in-session truth, so an RSC refresh mid-interaction would unmount the still-visible undo stub", async () => {
    await setNotInterested("f1");
    expect(revalidateCalls).toEqual([]);
  });

  it("undoNotInterested still revalidates so the next natural request recomputes from the DB", async () => {
    await undoNotInterested("f1");
    expect(revalidateCalls).toEqual(["/films"]);
  });
});
