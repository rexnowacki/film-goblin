import { describe, it, expect } from "vitest";
import { renderDigestEmail } from "../src/render.js";
import type { UserLite, AlertLite } from "../src/query.js";

const USER: UserLite = {
  id: "u1",
  username: "moss.witch",
  email: "moss@test.example",
  unsubscribe_token: "token-abc",
};

const FILM_A = {
  id: "film-a",
  title: "Suspiria",
  director: "Dario Argento",
  year: 1977,
  runtime_min: 99,
  artwork_url: "https://cdn/suspiria.jpg",
  itunes_url: "https://apple/suspiria",
};

const FILM_B = {
  id: "film-b",
  title: "The Wicker Man",
  director: "Robin Hardy",
  year: 1973,
  runtime_min: 88,
  artwork_url: "https://cdn/wickerman.jpg",
  itunes_url: "https://apple/wickerman",
};

const BASE_URL = "https://film-goblin.vercel.app";

describe("renderDigestEmail", () => {
  it("produces a singular subject line for exactly one deal", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    expect(out.subject).toBe("A film just dropped: Suspiria");
  });

  it("produces a pluralized subject for multiple deals", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
      { id: "a2", old_price_usd: 14.99, new_price_usd: 6.99, film: FILM_B },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.subject).toBe("2 films from your watchlist just dropped");
  });

  it("includes film titles + prices + CTAs in the HTML", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
      { id: "a2", old_price_usd: 14.99, new_price_usd: 6.99, film: FILM_B },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.html).toContain("Suspiria");
    expect(out.html).toContain("The Wicker Man");
    expect(out.html).toContain("$9.99");
    expect(out.html).toContain("$4.99");
    expect(out.html).toContain("https://apple/suspiria");
    expect(out.html).toContain("https://apple/wickerman");
    expect(out.html).toContain("https://film-goblin.vercel.app/film/film-a");
    expect(out.html).toContain("https://cdn/suspiria.jpg");
  });

  it("embeds the user's unsubscribe token in the footer link", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    expect(out.html).toContain("https://film-goblin.vercel.app/api/unsubscribe/token-abc");
    expect(out.text).toContain("https://film-goblin.vercel.app/api/unsubscribe/token-abc");
  });

  it("produces a plain-text version mirroring the HTML", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.text).toContain("Suspiria");
    expect(out.text).toContain("$9.99");
    expect(out.text).toContain("$4.99");
    expect(out.text).toContain("Dario Argento");
  });
});
