import { describe, it, expect } from "vitest";
import { _readSettingBool } from "@/lib/actions/admin/site-settings";

// Minimal fake of the Supabase query chain used by _readSettingBool:
//   client.from(table).select(cols).eq(col, val).maybeSingle()
function fakeClient(result: { data: { value: unknown } | null; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  } as never;
}

describe("_readSettingBool", () => {
  it("returns the fallback when the row is missing", async () => {
    expect(await _readSettingBool(fakeClient({ data: null, error: null }), "invite_gate", true)).toBe(true);
    expect(await _readSettingBool(fakeClient({ data: null, error: null }), "invite_gate", false)).toBe(false);
  });

  it("returns the fallback when the query errors", async () => {
    const c = fakeClient({ data: null, error: { message: "boom" } });
    expect(await _readSettingBool(c, "invite_gate", true)).toBe(true);
  });

  it("returns true for a present JSON true value", async () => {
    const c = fakeClient({ data: { value: true }, error: null });
    expect(await _readSettingBool(c, "invite_gate", false)).toBe(true);
  });

  it("returns false for a present JSON false value", async () => {
    const c = fakeClient({ data: { value: false }, error: null });
    expect(await _readSettingBool(c, "invite_gate", true)).toBe(false);
  });

  it("treats non-boolean values as not-enabled", async () => {
    const c = fakeClient({ data: { value: "true" }, error: null });
    expect(await _readSettingBool(c, "invite_gate", false)).toBe(false);
  });
});
