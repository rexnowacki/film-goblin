import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

let inviteRow: { id: string; created_by: string } | null;
vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: inviteRow, error: null }) }) }),
    }),
  }),
}));

let existingRow: { id: string } | null;
let inserted: Record<string, unknown> | null;
let deletedId: string | null;
let insertError: { code: string } | null;

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table !== "gazing_attendees") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }) }) }),
        insert: async (payload: Record<string, unknown>) => { inserted = payload; return { error: insertError }; },
        delete: () => ({ eq: async (_col: string, id: string) => { deletedId = id; return { error: null }; } }),
      };
    },
  } as never;
}

beforeEach(() => {
  inviteRow = { id: "inv-1", created_by: "host-1" };
  existingRow = null;
  inserted = null;
  deletedId = null;
  insertError = null;
});

describe("toggleGazingRsvp", () => {
  it("inserts an attendee row when not yet attending", async () => {
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(true);
    expect(inserted).toEqual({ invite_id: "inv-1", user_id: "user-1" });
  });

  it("deletes the attendee row when already attending", async () => {
    existingRow = { id: "att-9" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(false);
    expect(deletedId).toBe("att-9");
  });

  it("rejects the host RSVPing their own gazing", async () => {
    inviteRow = { id: "inv-1", created_by: "user-1" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    await expect(_toggleGazingRsvp(fakeClient(), "tok-1")).rejects.toThrow(/host/i);
  });

  it("treats duplicate insert races as already attending", async () => {
    insertError = { code: "23505" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(true);
    expect(inserted).toEqual({ invite_id: "inv-1", user_id: "user-1" });
  });

  it("rejects an unknown token", async () => {
    inviteRow = null;
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    await expect(_toggleGazingRsvp(fakeClient(), "tok-x")).rejects.toThrow();
  });
});
