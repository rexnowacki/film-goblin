import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocked showtime the service-role lookup returns.
const SHOWTIME = {
  id: "st-1",
  film_id: "film-1",
  starts_at: "2026-06-05T20:30:00-07:00",
  format_label: "70mm",
  tickets_url: "https://loftcinema.org/film/x/",
  theater: { name: "The Loft Cinema" },
  film: { title: "Test Film", artwork_url: "https://img/x.jpg" },
};

// Stub the Next-only imports so the "use server" module loads under vitest
// (we only exercise the private `_` functions, which never call these).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

vi.mock("@/lib/supabase/service-role", () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: async () => ({ data: SHOWTIME, error: null }) }),
        }),
      }),
    }),
  }),
}));

// Captures the gazing_invites insert payload.
let captured: Record<string, unknown> | null;

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: (table: string) => {
      if (table !== "gazing_invites") throw new Error(`unexpected table ${table}`);
      return { insert: async (payload: Record<string, unknown>) => { captured = payload; return { error: null }; } };
    },
  } as never;
}

beforeEach(() => { captured = null; });

describe("gazing invite actions set the broadcast flag", () => {
  it("_summonCoven inserts with broadcast = true", async () => {
    const { _summonCoven } = await import("@/lib/actions/gazing");
    const res = await _summonCoven(fakeClient(), "st-1");
    expect(captured?.broadcast).toBe(true);
    expect(captured?.created_by).toBe("user-1");
    expect(res.url).toMatch(/\/gazing\/.+/);
  });

  it("_createGazingInvite inserts with broadcast = false", async () => {
    const { _createGazingInvite } = await import("@/lib/actions/gazing");
    await _createGazingInvite(fakeClient(), "st-1");
    expect(captured?.broadcast).toBe(false);
  });
});
