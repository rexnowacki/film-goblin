import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { _createBadge, _reevaluateBadges } from "@/lib/actions/admin/badges";

const origin = "https://example.supabase.co";
const input = {
  name: "  Night Fiend  ",
  slug: "night-fiend",
  description: "  Logged the midnight shift.  ",
  imageUrl: `${origin}/storage/v1/object/public/badge-images/id/icon.svg`,
  conditionKind: "watch_log_count" as const,
  threshold: 25,
};

function createClient(options: {
  insertError?: { code?: string; message: string } | null;
  awardCount?: number;
  awardError?: { message: string } | null;
  rpcData?: number;
  rpcError?: { message: string } | null;
} = {}) {
  const calls: Array<{ kind: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      if (table === "badges") {
        return {
          insert(payload: unknown) {
            calls.push({ kind: "insert", value: payload });
            return {
              select(columns: string) {
                calls.push({ kind: "insert-select", value: columns });
                return {
                  single: async () => options.insertError
                    ? { data: null, error: options.insertError }
                    : { data: { id: "badge-1" }, error: null },
                };
              },
            };
          },
        };
      }
      if (table === "user_badges") {
        return {
          select(columns: string, queryOptions: unknown) {
            calls.push({ kind: "award-select", value: { columns, queryOptions } });
            return {
              eq: async (column: string, value: unknown) => {
                calls.push({ kind: "award-eq", value: { column, value } });
                return {
                  data: null,
                  error: options.awardError ?? null,
                  count: options.awardCount ?? 0,
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name: string, args: unknown) {
      calls.push({ kind: `rpc:${name}`, value: args });
      return options.rpcError
        ? { data: null, error: options.rpcError }
        : { data: options.rpcData ?? 0, error: null };
    },
  } as never;
  return { client, calls };
}

describe("_createBadge", () => {
  it("validates, normalizes, inserts, and reports trigger-created awards", async () => {
    const { client, calls } = createClient({ awardCount: 7 });
    const result = await _createBadge(client, "admin-1", input, origin);

    expect(result).toEqual({ ok: true, badgeId: "badge-1", awardedCount: 7 });
    expect(calls[0]).toEqual({
      kind: "insert",
      value: {
        name: "Night Fiend",
        slug: "night-fiend",
        description: "Logged the midnight shift.",
        image_url: input.imageUrl,
        condition_kind: "watch_log_count",
        threshold: 25,
        created_by: "admin-1",
      },
    });
    expect(calls).toContainEqual({
      kind: "award-eq",
      value: { column: "badge_id", value: "badge-1" },
    });
  });

  it("does not touch the database when validation fails", async () => {
    const { client, calls } = createClient();
    const result = await _createBadge(client, "admin-1", { ...input, threshold: 0 }, origin);
    expect(result).toEqual({
      ok: false,
      error: "Threshold must be a whole number between 1 and 10,000.",
    });
    expect(calls).toEqual([]);
  });

  it("maps unique violations to an actionable admin error", async () => {
    const { client } = createClient({ insertError: { code: "23505", message: "duplicate" } });
    await expect(_createBadge(client, "admin-1", input, origin)).resolves.toEqual({
      ok: false,
      error: "A badge already uses that slug or active condition.",
    });
  });

  it("keeps a committed creation successful when its follow-up count is unavailable", async () => {
    const { client } = createClient({ awardError: { message: "count unavailable" } });
    await expect(_createBadge(client, "admin-1", input, origin)).resolves.toEqual({
      ok: true,
      badgeId: "badge-1",
      awardedCount: null,
    });
  });
});

describe("_reevaluateBadges", () => {
  it("calls the service-only global evaluator", async () => {
    const { client, calls } = createClient({ rpcData: 4 });
    await expect(_reevaluateBadges(client)).resolves.toEqual({ ok: true, awardedCount: 4 });
    expect(calls).toEqual([
      { kind: "rpc:evaluate_badges_for_all_users", value: { p_badge_id: null } },
    ]);
  });

  it("fails loud when the evaluator fails", async () => {
    const { client } = createClient({ rpcError: { message: "backfill failed" } });
    await expect(_reevaluateBadges(client)).resolves.toEqual({
      ok: false,
      error: "backfill failed",
    });
  });
});
