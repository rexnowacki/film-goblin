import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

let inviteRow: { id: string; created_by: string; status: "scheduled" | "happened" | "cancelled" } | null;
let claimedInvitee: Record<string, unknown> | null;
let claimError: Error | null;
let operations: string[];
vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: () => ({
    from: (table: string) => {
      if (table === "gazing_invites") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: inviteRow, error: null }) }) }),
        };
      }
      if (table === "gazing_invitees") {
        return {
          upsert: async (payload: Record<string, unknown>) => {
            operations.push("claim");
            claimedInvitee = payload;
            return { error: claimError };
          },
        };
      }
      throw new Error(`unexpected service-role table ${table}`);
    },
  }),
}));

let existingRow: { id: string } | null;
let inserted: Record<string, unknown> | null;
let deletedId: string | null;
let deletedRow: { id: string } | null;
let insertError: { code: string } | null;

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table !== "gazing_attendees") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => {
          operations.push("lookup");
          return { data: existingRow, error: null };
        } }) }) }),
        insert: async (payload: Record<string, unknown>) => {
          operations.push("insert");
          inserted = payload;
          return { error: insertError };
        },
        delete: () => {
          const query: any = {
            eq: (_col: string, id: string) => { deletedId = id; return query; },
            select: () => query,
            maybeSingle: async () => ({ data: deletedRow, error: null }),
            then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve, reject),
          };
          return query;
        },
      };
    },
  } as never;
}

beforeEach(() => {
  inviteRow = { id: "inv-1", created_by: "host-1", status: "scheduled" };
  claimedInvitee = null;
  claimError = null;
  operations = [];
  existingRow = null;
  inserted = null;
  deletedId = null;
  deletedRow = { id: "att-9" };
  insertError = null;
});

describe("toggleGazingRsvp", () => {
  it("claims a valid private-token bearer before inserting their RSVP", async () => {
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(true);
    expect(claimedInvitee).toEqual({ invite_id: "inv-1", user_id: "user-1" });
    expect(inserted).toEqual({ invite_id: "inv-1", user_id: "user-1" });
    expect(operations).toEqual(["claim", "lookup", "insert"]);
  });

  it("fails before attendee access when the bearer claim cannot be persisted", async () => {
    claimError = new Error("claim failed");
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");

    await expect(_toggleGazingRsvp(fakeClient(), "tok-1")).rejects.toThrow("claim failed");
    expect(operations).toEqual(["claim"]);
    expect(inserted).toBeNull();
  });

  it("deletes the attendee row when already attending", async () => {
    existingRow = { id: "att-9" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    const res = await _toggleGazingRsvp(fakeClient(), "tok-1");
    expect(res.attending).toBe(false);
    expect(deletedId).toBe("att-9");
  });

  it("fails if cancellation wins between the status read and RSVP deletion", async () => {
    existingRow = { id: "att-9" };
    deletedRow = null;
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");

    await expect(_toggleGazingRsvp(fakeClient(), "tok-1")).rejects.toThrow(/changed|scheduled/i);
    expect(deletedId).toBe("att-9");
  });

  it("rejects the host RSVPing their own gazing", async () => {
    inviteRow = { id: "inv-1", created_by: "user-1", status: "scheduled" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");
    await expect(_toggleGazingRsvp(fakeClient(), "tok-1")).rejects.toThrow(/host/i);
    expect(claimedInvitee).toBeNull();
  });

  it("rejects RSVP changes after a gazing is cancelled", async () => {
    inviteRow = { id: "inv-1", created_by: "host-1", status: "cancelled" };
    const { _toggleGazingRsvp } = await import("@/lib/actions/gazing");

    await expect(_toggleGazingRsvp(fakeClient(), "tok-1")).rejects.toThrow(/scheduled/i);
    expect(claimedInvitee).toBeNull();
    expect(inserted).toBeNull();
    expect(deletedId).toBeNull();
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
    expect(claimedInvitee).toBeNull();
  });
});
