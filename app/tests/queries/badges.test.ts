import { describe, expect, it, vi } from "vitest";
import { getProfileBadges } from "@/lib/queries/badges";

function clientWith(result: { data: unknown[] | null; error: Error | null }) {
  const selected: string[] = [];
  const filters: Array<[string, unknown]> = [];
  const orders: Array<[string, Record<string, unknown>]> = [];
  const builder: any = {
    select: vi.fn((columns: string) => {
      selected.push(columns);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    }),
    order: vi.fn((column: string, options: Record<string, unknown>) => {
      orders.push([column, options]);
      return builder;
    }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe("user_badges");
      return builder;
    }),
  } as never;
  return { client, selected, filters, orders };
}

describe("getProfileBadges", () => {
  it("returns only public badge fields in stable newest-first order", async () => {
    const { client, selected, filters, orders } = clientWith({
      data: [
        {
          badge_id: "b2",
          awarded_at: "2026-07-13T00:00:00Z",
          badge: [{ id: "b2", slug: "zine-fiend", name: "Zine Fiend", description: "Logged 50 watches.", image_url: "/badges/zine-fiend.svg" }],
        },
        {
          badge_id: "b1",
          awarded_at: "2026-07-14T00:00:00Z",
          badge: { id: "b1", slug: "fresh-blood", name: "Fresh Blood", description: "Logged 25 watches.", image_url: "/badges/fresh-blood.svg" },
        },
      ],
      error: null,
    });

    await expect(getProfileBadges(client, "user-1")).resolves.toEqual([
      {
        id: "b1",
        slug: "fresh-blood",
        name: "Fresh Blood",
        description: "Logged 25 watches.",
        image_url: "/badges/fresh-blood.svg",
        awarded_at: "2026-07-14T00:00:00Z",
      },
      {
        id: "b2",
        slug: "zine-fiend",
        name: "Zine Fiend",
        description: "Logged 50 watches.",
        image_url: "/badges/zine-fiend.svg",
        awarded_at: "2026-07-13T00:00:00Z",
      },
    ]);
    expect(selected).toEqual([
      "badge_id, awarded_at, badge:badges!inner(id, slug, name, description, image_url)",
    ]);
    expect(selected[0]).not.toMatch(/evidence|created_by|condition_kind|threshold/);
    expect(filters).toEqual([
      ["user_id", "user-1"],
      ["badge.is_active", true],
    ]);
    expect(orders).toEqual([
      ["awarded_at", { ascending: false }],
      ["badge_id", { ascending: true }],
    ]);
  });

  it("fails loudly when the public badge query fails", async () => {
    const failure = new Error("badge query failed");
    const { client } = clientWith({ data: null, error: failure });
    await expect(getProfileBadges(client, "user-1")).rejects.toBe(failure);
  });
});
