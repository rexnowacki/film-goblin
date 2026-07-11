import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

let serviceUpdatedId: string | null;
let serviceUpdateCalls: number;
let operations: string[];
vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: () => ({
    from: (table: string) => {
      if (table !== "gazing_invites") throw new Error(`unexpected service table ${table}`);
      const query: any = {
        eq: () => query,
        select: () => query,
        maybeSingle: async () => ({ data: serviceUpdatedId ? { id: serviceUpdatedId } : null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject),
      };
      return { update: () => { serviceUpdateCalls += 1; operations.push("close"); return query; } };
    },
  }),
}));

let inviteStatus: "scheduled" | "happened";
let inviteHost: string;
let attendeeRow: { id: string } | null;
let attendeeUpdatedId: string | null;
let inserted: Record<string, unknown> | null;

function fakeClient(userId = "guest") {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: (table: string) => {
      if (table === "gazing_invites") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "invite-1", status: inviteStatus, starts_at: "2026-07-11T10:00:00.000Z", created_by: inviteHost }, error: null }) }) }) };
      }
      if (table !== "gazing_attendees") throw new Error(`unexpected table ${table}`);
      const updateQuery: any = {
        eq: () => updateQuery,
        select: () => updateQuery,
        maybeSingle: async () => ({ data: attendeeUpdatedId ? { id: attendeeUpdatedId } : null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject),
      };
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: attendeeRow, error: null }) }) }) }),
        update: () => { operations.push("attendance-update"); return updateQuery; },
        insert: async (payload: Record<string, unknown>) => { operations.push("attendance-insert"); inserted = payload; return { error: null }; },
      };
    },
  } as never;
}

beforeEach(() => {
  inviteStatus = "scheduled";
  inviteHost = "host";
  attendeeRow = { id: "attendee-1" };
  attendeeUpdatedId = "attendee-1";
  inserted = null;
  serviceUpdatedId = "invite-1";
  serviceUpdateCalls = 0;
  operations = [];
});

describe("_confirmAttendance cancellation races", () => {
  it("fails when the attendee row disappears after the happened transition", async () => {
    attendeeUpdatedId = null;
    const { _confirmAttendance } = await import("@/lib/actions/gazing");

    await expect(_confirmAttendance(fakeClient(), "token", new Date("2026-07-11T12:00:00.000Z"))).rejects.toThrow(/changed|cancelled/i);
    expect(serviceUpdateCalls).toBe(1);
    expect(operations).toEqual(["close", "attendance-update"]);
  });

  it("fails when cancellation wins the scheduled-to-happened compare-and-swap", async () => {
    serviceUpdatedId = null;
    const { _confirmAttendance } = await import("@/lib/actions/gazing");

    await expect(_confirmAttendance(fakeClient(), "token", new Date("2026-07-11T12:00:00.000Z"))).rejects.toThrow(/changed|cancelled/i);
    expect(operations).toEqual(["close"]);
  });

  it("transitions a scheduled gazing before writing attendance", async () => {
    const { _confirmAttendance } = await import("@/lib/actions/gazing");

    await expect(_confirmAttendance(fakeClient(), "token", new Date("2026-07-11T12:00:00.000Z"))).resolves.toBe("invite-1");
    expect(operations).toEqual(["close", "attendance-update"]);
  });

  it("keeps the host-after-happened insertion path", async () => {
    inviteStatus = "happened";
    inviteHost = "host";
    attendeeRow = null;
    const { _confirmAttendance } = await import("@/lib/actions/gazing");

    await expect(_confirmAttendance(fakeClient("host"), "token", new Date("2026-07-11T12:00:00.000Z"))).resolves.toBe("invite-1");
    expect(inserted).toMatchObject({ invite_id: "invite-1", user_id: "host" });
    expect(typeof inserted?.attended_at).toBe("string");
    expect(serviceUpdateCalls).toBe(0);
    expect(operations).toEqual(["attendance-insert"]);
  });
});
