import { describe, it, expect, vi } from "vitest";
import { getLandingFeed } from "@/lib/queries/landing";

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

function makeClient(opts: {
  activityRows?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  films?: Array<Record<string, unknown>>;
  alertRows?: Array<Record<string, unknown>>;
} = {}) {
  const fromCalls: string[] = [];
  const activityChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: opts.activityRows ?? [], error: null }),
  };
  const profilesChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: opts.profiles ?? [], error: null }),
  };
  const filmsChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: opts.films ?? [], error: null }),
  };
  const alertsChain: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: opts.alertRows ?? [], error: null }),
  };
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "activity") return activityChain;
      if (table === "profiles") return profilesChain;
      if (table === "films") return filmsChain;
      if (table === "price_alerts") return alertsChain;
      throw new Error(`unexpected table ${table}`);
    }),
  } as any;
  return { client, fromCalls, activityChain };
}

const actor = { id: "u1", username: "moss.witch", display_name: "Moss Witch", avatar_url: null };
const film = { id: "f1", title: "Possession", artwork_url: "http://x/p.jpg" };

describe("getLandingFeed — row shaping", () => {
  it("shapes a watch_logged row with actor and film", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(3 * MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
    });
    const rows = await getLandingFeed(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "watch_logged",
      actor: { username: "moss.witch" },
      film: { id: "f1", title: "Possession" },
    });
  });

  it("includes recipient on recommendation_sent and drops the row when recipient is missing", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "recommendation_sent", payload: { film_id: "f1", to_user_id: "u2" }, created_at: iso(MIN), actor_user_id: "u1" },
        { id: "a2", kind: "recommendation_sent", payload: { film_id: "f1", to_user_id: "ghost" }, created_at: iso(2 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor, { id: "u2", username: "vhs.ghoul", display_name: null, avatar_url: null }],
      films: [film],
    });
    const rows = await getLandingFeed(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "recommendation_sent", recipient: { username: "vhs.ghoul" } });
  });

  it("drops rows whose actor or film is missing", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "missing" },
        { id: "a2", kind: "watch_logged", payload: { film_id: "missing" }, created_at: iso(2 * MIN), actor_user_id: "u1" },
        { id: "a3", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(3 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor],
      films: [film],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.id)).toEqual(["a3"]);
  });

  it("respects the limit after filtering", async () => {
    const { client } = makeClient({
      activityRows: [1, 2, 3].map(n => ({
        id: `a${n}`, kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(n * MIN), actor_user_id: "u1",
      })),
      profiles: [actor],
      films: [film],
    });
    const rows = await getLandingFeed(client, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual(["a1", "a2"]);
  });
});

describe("getLandingFeed — price drop splice", () => {
  it("splices a fresh price alert into timestamp order with computed pctOff", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(1 * MIN), actor_user_id: "u1" },
        { id: "a2", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(60 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor],
      films: [film, { id: "f2", title: "Suspiria", artwork_url: null }],
      alertRows: [{ id: "pa1", film_id: "f2", old_price_usd: 9.99, new_price_usd: 4.99, created_at: iso(30 * MIN) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged", "price_drop", "watch_logged"]);
    const drop = rows[1] as Extract<(typeof rows)[number], { kind: "price_drop" }>;
    expect(drop.newPriceUsd).toBeCloseTo(4.99);
    expect(drop.pctOff).toBe(50);
    expect(drop.film.title).toBe("Suspiria");
  });

  it("ignores price alerts older than 14 days", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
      alertRows: [{ id: "pa1", film_id: "f1", old_price_usd: 9.99, new_price_usd: 4.99, created_at: iso(15 * DAY) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged"]);
  });

  it("ignores alerts where the price did not actually drop", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
      alertRows: [{ id: "pa1", film_id: "f1", old_price_usd: 4.99, new_price_usd: 4.99, created_at: iso(MIN) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged"]);
  });

  it("ignores alerts with a zero old price", async () => {
    const { client } = makeClient({
      activityRows: [{ id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(MIN), actor_user_id: "u1" }],
      profiles: [actor],
      films: [film],
      alertRows: [{ id: "pa1", film_id: "f1", old_price_usd: 0, new_price_usd: 4.99, created_at: iso(MIN) }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(["watch_logged"]);
  });
});

describe("getLandingFeed — empty states", () => {
  it("returns [] and skips profile/film fetches when there is no activity and no alert", async () => {
    const { client, fromCalls } = makeClient();
    const rows = await getLandingFeed(client);
    expect(rows).toEqual([]);
    expect(fromCalls).not.toContain("profiles");
    expect(fromCalls).not.toContain("films");
  });
});
