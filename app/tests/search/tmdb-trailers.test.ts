import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseBestTmdbTrailer,
  chooseTmdbCast,
  lookupTmdbWatchProviders,
  normalizeTmdbWatchProviders,
  lookupTmdbTrailer,
  lookupTmdbTrailerForFilm,
  resolveTmdbIdByTitleYear,
  type TmdbVideo,
} from "@/lib/search/tmdb";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("chooseBestTmdbTrailer", () => {
  it("prefers official YouTube trailers over newer teasers and featurettes", () => {
    const videos: TmdbVideo[] = [
      {
        key: "featurette-id",
        name: "Behind the Scenes",
        official: true,
        published_at: "2026-01-03T00:00:00.000Z",
        site: "YouTube",
        type: "Featurette",
      },
      {
        key: "teaser-id",
        name: "Official Teaser",
        official: true,
        published_at: "2026-01-04T00:00:00.000Z",
        site: "YouTube",
        type: "Teaser",
      },
      {
        key: "trailer-id",
        name: "Official Trailer",
        official: true,
        published_at: "2026-01-01T00:00:00.000Z",
        site: "YouTube",
        type: "Trailer",
      },
    ];

    expect(chooseBestTmdbTrailer(videos)).toEqual({
      youtube_id: "trailer-id",
      url: "https://www.youtube.com/watch?v=trailer-id",
      label: "Official Trailer",
      official: true,
      published_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("uses the newest video within the same rank", () => {
    const videos: TmdbVideo[] = [
      {
        key: "old-id",
        name: "Official Trailer",
        official: true,
        published_at: "2025-01-01T00:00:00.000Z",
        site: "YouTube",
        type: "Trailer",
      },
      {
        key: "new-id",
        name: "Official Trailer 2",
        official: true,
        published_at: "2026-01-01T00:00:00.000Z",
        site: "YouTube",
        type: "Trailer",
      },
    ];

    expect(chooseBestTmdbTrailer(videos)?.youtube_id).toBe("new-id");
  });

  it("ignores non-YouTube videos and non-trailer video types", () => {
    expect(chooseBestTmdbTrailer([
      { key: "clip-id", site: "YouTube", type: "Clip", official: true },
      { key: "vimeo-id", site: "Vimeo", type: "Trailer", official: true },
    ])).toBeNull();
  });
});

describe("chooseTmdbCast", () => {
  it("keeps top-billed cast in billing order", () => {
    const cast = chooseTmdbCast([
      { id: 2, name: "Second Actor", character: "B", order: 1, profile_path: "/b.jpg", known_for_department: "Acting" },
      { id: 1, name: "Lead Actor", character: "A", order: 0, profile_path: "/a.jpg", known_for_department: "Acting" },
      { id: 3, name: "Third Actor", character: "C", order: 2 },
    ]);

    expect(cast.map((member) => member.name)).toEqual(["Lead Actor", "Second Actor", "Third Actor"]);
    expect(cast[0]).toMatchObject({
      tmdb_id: 1,
      character: "A",
      billing_order: 0,
      profile_path: "/a.jpg",
      known_for_department: "Acting",
    });
  });

  it("drops malformed cast entries and applies the limit", () => {
    const cast = chooseTmdbCast([
      { id: 1, name: "Lead", order: 0 },
      { id: undefined, name: "No ID", order: 1 },
      { id: 2, name: "   ", order: 2 },
      { id: 3, name: "Third", order: 3 },
    ], 1);

    expect(cast).toHaveLength(1);
    expect(cast[0].name).toBe("Lead");
  });
});

describe("normalizeTmdbWatchProviders", () => {
  it("normalizes US providers in streaming-first category order", () => {
    const providers = normalizeTmdbWatchProviders({
      results: {
        US: {
          link: "https://www.themoviedb.org/movie/550-watch",
          rent: [
            { provider_id: 2, provider_name: "Rental B", logo_path: "/rent.jpg", display_priority: 4 },
          ],
          flatrate: [
            { provider_id: 3, provider_name: "Stream C", logo_path: "/stream-c.jpg", display_priority: 8 },
            { provider_id: 1, provider_name: "Stream A", logo_path: "/stream-a.jpg", display_priority: 1 },
          ],
          ads: [
            { provider_id: 4, provider_name: "Ads D", logo_path: null, display_priority: 2 },
          ],
        },
      },
    });

    expect(providers.map((provider) => `${provider.category}:${provider.provider_name}`)).toEqual([
      "flatrate:Stream A",
      "flatrate:Stream C",
      "ads:Ads D",
      "rent:Rental B",
    ]);
    expect(providers[0]).toMatchObject({
      provider_id: 1,
      provider_logo_path: "/stream-a.jpg",
      provider_logo_url: "https://image.tmdb.org/t/p/w92/stream-a.jpg",
      tmdb_link: "https://www.themoviedb.org/movie/550-watch",
    });
  });

  it("returns an empty list when the requested region is missing", () => {
    expect(normalizeTmdbWatchProviders({ results: { CA: { flatrate: [] } } }, "US")).toEqual([]);
  });
});

describe("lookupTmdbTrailer", () => {
  it("fetches TMDB videos and returns the selected trailer", async () => {
    vi.stubEnv("TMDB_API_KEY", "tmdb-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { key: "abc123", name: "Official Trailer", official: true, site: "YouTube", type: "Trailer" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupTmdbTrailer(550)).resolves.toEqual({
      ok: true,
      trailer: {
        youtube_id: "abc123",
        url: "https://www.youtube.com/watch?v=abc123",
        label: "Official Trailer",
        official: true,
        published_at: null,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/movie/550/videos?api_key=tmdb-key&language=en-US",
      { cache: "no-store" },
    );
  });
});

describe("lookupTmdbWatchProviders", () => {
  it("fetches TMDB watch providers and normalizes the requested region", async () => {
    vi.stubEnv("TMDB_API_KEY", "tmdb-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          US: {
            flatrate: [
              { provider_id: 8, provider_name: "Shudder", logo_path: "/shudder.jpg", display_priority: 3 },
            ],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupTmdbWatchProviders(550, "US")).resolves.toEqual({
      ok: true,
      providers: [
        {
          provider_id: 8,
          provider_name: "Shudder",
          provider_logo_path: "/shudder.jpg",
          provider_logo_url: "https://image.tmdb.org/t/p/w92/shudder.jpg",
          category: "flatrate",
          display_priority: 3,
          tmdb_link: null,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/movie/550/watch/providers?api_key=tmdb-key",
      { cache: "no-store" },
    );
  });
});

describe("resolveTmdbIdByTitleYear", () => {
  it("only accepts exact normalized title and year matches", async () => {
    vi.stubEnv("TMDB_API_KEY", "tmdb-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 1, title: "Dark Song", release_date: "2017-01-01" },
          { id: 2, title: "A Dark Song", release_date: "2017-04-07" },
          { id: 3, title: "A Dark Song", release_date: "2016-01-01" },
        ],
      }),
    }));

    await expect(resolveTmdbIdByTitleYear("A Dark Song", 2017)).resolves.toEqual({
      ok: true,
      tmdb_id: 2,
    });
  });

  it("strips a duplicated parenthetical release year from stored titles", async () => {
    vi.stubEnv("TMDB_API_KEY", "tmdb-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: 1091267, title: "The Well", release_date: "2024-08-01" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveTmdbIdByTitleYear("The Well (2024)", 2024)).resolves.toEqual({
      ok: true,
      tmdb_id: 1091267,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/search/movie?api_key=tmdb-key&query=The%20Well&language=en-US&include_adult=false&year=2024",
      { cache: "no-store" },
    );
  });
});

describe("lookupTmdbTrailerForFilm", () => {
  it("resolves a TMDB id by title/year before looking up videos", async () => {
    vi.stubEnv("TMDB_API_KEY", "tmdb-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: 999, title: "Mandy", release_date: "2018-09-13" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ key: "trailer999", name: "Official Trailer", official: true, site: "YouTube", type: "Trailer" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupTmdbTrailerForFilm({ title: "Mandy", year: 2018 })).resolves.toEqual({
      ok: true,
      trailer: {
        tmdb_id: 999,
        youtube_id: "trailer999",
        url: "https://www.youtube.com/watch?v=trailer999",
        label: "Official Trailer",
        official: true,
        published_at: null,
      },
    });
  });
});
