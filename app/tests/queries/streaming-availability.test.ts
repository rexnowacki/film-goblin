import { describe, expect, it, vi } from "vitest";
import { getFilmWatchProviders } from "@/lib/queries/streaming-availability";

function makeClient(rows: any[]) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
  chain.in.mockImplementation(function (_column: string, _values: unknown[]) {
    if (chain.in.mock.calls.length === 2) {
      return Promise.resolve({ data: rows, error: null });
    }
    return chain;
  });
  return {
    client: { from: vi.fn(() => chain) } as any,
    chain,
  };
}

describe("getFilmWatchProviders", () => {
  it("limits display data to featured streaming providers and streaming categories", async () => {
    const { client, chain } = makeClient([
      {
        id: "p1",
        film_id: "f1",
        region: "US",
        provider_id: 73,
        provider_name: "Tubi TV",
        provider_logo_path: "/tubi.jpg",
        category: "ads",
        display_priority: 5,
        tmdb_link: "https://example.com/watch",
      },
    ]);

    const rows = await getFilmWatchProviders(client, "f1");

    expect(chain.in).toHaveBeenCalledWith("provider_id", expect.arrayContaining([73, 1899, 9, 15, 350, 8]));
    expect(chain.in).toHaveBeenCalledWith("category", ["flatrate", "free", "ads"]);
    expect(rows).toEqual([
      expect.objectContaining({
        provider_name: "Tubi TV",
        provider_logo_url: "https://image.tmdb.org/t/p/w92/tubi.jpg",
      }),
    ]);
  });
});
