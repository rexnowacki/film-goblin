import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { makeServer } from "./helpers/http.js";
import { makeTestDb } from "./helpers/db.js";
import { seedFilms } from "../src/seed.js";
import { midsommarResult } from "./fixtures/itunes-responses.js";

const server = makeServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("seedFilms", () => {
  it("searches each query term and upserts feature-movie results", async () => {
    const { client, close } = await makeTestDb();
    try {
      let calls = 0;
      server.use(
        http.get("https://itunes.apple.com/search", ({ request }) => {
          calls++;
          const url = new URL(request.url);
          const term = url.searchParams.get("term");
          return HttpResponse.json({
            resultCount: 1,
            results: [{ ...midsommarResult, trackId: 1000 + calls, trackName: `Film for ${term}` }],
          });
        })
      );

      const inserted = await seedFilms(client, ["folk horror", "a24"]);
      expect(inserted).toBe(2);
      expect(calls).toBe(2);

      const films = await client.query(`SELECT count(*)::int AS n FROM films`);
      expect(films.rows[0].n).toBe(2);
    } finally { await close(); }
  });

  it("deduplicates across queries (same trackId upserts once)", async () => {
    const { client, close } = await makeTestDb();
    try {
      server.use(http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({ resultCount: 1, results: [midsommarResult] })
      ));
      await seedFilms(client, ["term1", "term2"]);
      const r = await client.query(`SELECT count(*)::int AS n FROM films`);
      expect(r.rows[0].n).toBe(1);
    } finally { await close(); }
  });
});
