import { describe, expect, it, vi } from "vitest";
import { getAdminBadgeRows } from "@/lib/queries/admin/badges";

function clientWith(
  definitions: Array<Record<string, unknown>>,
  awardCounts: Record<string, number>,
) {
  const selected: Array<{ table: string; columns: string }> = [];
  const client = {
    from(table: string) {
      if (table === "badges") {
        const builder: any = {
          select: vi.fn((columns: string) => {
            selected.push({ table, columns });
            return builder;
          }),
          order: vi.fn(() => builder),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: definitions, error: null }).then(resolve),
        };
        return builder;
      }
      if (table === "user_badges") {
        return {
          select: vi.fn((columns: string, options: unknown) => ({
            eq: vi.fn(async (column: string, value: string) => {
              selected.push({ table, columns: `${columns}:${JSON.stringify(options)}:${column}=${value}` });
              return { data: null, error: null, count: awardCounts[value] ?? 0 };
            }),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as never;
  return { client, selected };
}

describe("getAdminBadgeRows", () => {
  it("uses explicit public columns and aggregates award counts", async () => {
    const { client, selected } = clientWith([
      {
        id: "b1",
        slug: "fresh-blood",
        name: "Fresh Blood",
        description: "25 logs",
        image_url: "/badges/fresh-blood.svg",
        condition_kind: "watch_log_count",
        threshold: 25,
        is_active: true,
        created_at: "2026-07-13T00:00:00Z",
      },
    ], { b1: 2 });

    await expect(getAdminBadgeRows(client)).resolves.toEqual([
      {
        id: "b1",
        slug: "fresh-blood",
        name: "Fresh Blood",
        description: "25 logs",
        imageUrl: "/badges/fresh-blood.svg",
        conditionKind: "watch_log_count",
        threshold: 25,
        isActive: true,
        createdAt: "2026-07-13T00:00:00Z",
        awardCount: 2,
      },
    ]);
    expect(selected).toEqual([
      {
        table: "badges",
        columns: "id, slug, name, description, image_url, condition_kind, threshold, is_active, created_at",
      },
      {
        table: "user_badges",
        columns: 'badge_id:{"count":"exact","head":true}:badge_id=b1',
      },
    ]);
  });
});
