import { describe, it, expect, vi } from "vitest";
import { getMyWatchlistWithFilms } from "@/lib/queries/watchlists";

function makeClient(rows: any[]) {
  const watchlistsChain: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  const showtimesChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "theater_showtimes") return showtimesChain;
      return watchlistsChain;
    }),
  } as any;
}

describe("getMyWatchlistWithFilms", () => {
  it("coerces NUMERIC fields (max_price_usd, latest_price) from string to number", async () => {
    const client = makeClient([
      {
        id: "w1",
        film_id: "f1",
        max_price_usd: "9.99",
        last_alerted_at: null,
        created_at: "2026-04-20T00:00:00Z",
        film: {
          id: "f1",
          title: "Midsommar",
          director: "Ari Aster",
          year: 2019,
          artwork_url: "https://example.com/a.jpg",
          itunes_url: "https://itunes.apple.com/us/movie/id1",
          genre_primary: "Horror",
          runtime_min: 147,
          latest_price: "14.99",
        },
      },
    ]);
    const rows = await getMyWatchlistWithFilms(client);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].max_price_usd).toBe("number");
    expect(rows[0].max_price_usd).toBe(9.99);
    expect(typeof rows[0].film.latest_price).toBe("number");
    expect(rows[0].film.latest_price).toBe(14.99);
  });

  it("returns null for missing NUMERIC fields (not NaN)", async () => {
    const client = makeClient([
      {
        id: "w1",
        film_id: "f1",
        max_price_usd: null,
        last_alerted_at: null,
        created_at: "2026-04-20T00:00:00Z",
        film: {
          id: "f1",
          title: "Midsommar",
          director: "Ari Aster",
          year: 2019,
          artwork_url: "",
          itunes_url: null,
          genre_primary: "Horror",
          runtime_min: 147,
          latest_price: null,
        },
      },
    ]);
    const rows = await getMyWatchlistWithFilms(client);
    expect(rows[0].max_price_usd).toBeNull();
    expect(rows[0].film.latest_price).toBeNull();
  });
});
