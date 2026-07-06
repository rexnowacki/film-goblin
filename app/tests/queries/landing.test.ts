import { describe, it, expect, vi } from "vitest";
import { getLandingFeed } from "@/lib/queries/landing";

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

function makeClient(opts: {
  activityRows?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  films?: Array<Record<string, unknown>>;
  systemEvents?: Array<Record<string, unknown>>;
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
  const feedEventsChain: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: opts.systemEvents ?? [], error: null }),
  };
  const client = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "activity") return activityChain;
      if (table === "profiles") return profilesChain;
      if (table === "films") return filmsChain;
      if (table === "feed_events") return feedEventsChain;
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

describe("getLandingFeed — system event composition", () => {
  it("weaves a recent system event into the composed output", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(1 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor],
      films: [film],
      systemEvents: [{
        id: "s1",
        event_type: "price_drop",
        film_id: "f2",
        payload: {},
        copy: "🩸 The blood price falls. **Suspiria** is now $4.99.",
        priority: 90,
        created_at: iso(30 * MIN),
        film: { id: "f2", title: "Suspiria", artwork_url: null },
      }],
    });
    const rows = await getLandingFeed(client);
    expect(rows.map(r => r.kind)).toEqual(expect.arrayContaining(["watch_logged", "system"]));
    const sysRow = rows.find(r => r.kind === "system") as Extract<(typeof rows)[number], { kind: "system" }>;
    expect(sysRow.copy).toContain("Suspiria");
    expect(sysRow.film?.title).toBe("Suspiria");
  });

  it("renders a system event with no film as film: null", async () => {
    const { client } = makeClient({
      activityRows: [
        { id: "a1", kind: "watch_logged", payload: { film_id: "f1" }, created_at: iso(1 * MIN), actor_user_id: "u1" },
      ],
      profiles: [actor],
      films: [film],
      systemEvents: [{
        id: "s1",
        event_type: "milestone",
        film_id: null,
        payload: {},
        copy: "🎉 The pit now holds 100 films.",
        priority: 50,
        created_at: iso(5 * MIN),
        film: null,
      }],
    });
    const rows = await getLandingFeed(client);
    const sysRow = rows.find(r => r.kind === "system") as Extract<(typeof rows)[number], { kind: "system" }>;
    expect(sysRow.film).toBeNull();
  });

  it("shows system events even with zero user activity", async () => {
    const { client } = makeClient({
      systemEvents: [{
        id: "s1",
        event_type: "new_film",
        film_id: "f1",
        payload: {},
        copy: "🕯️ Summoned to the pit: **Possession**.",
        priority: 70,
        created_at: iso(MIN),
        film: { id: "f1", title: "Possession", artwork_url: null },
      }],
    });
    const rows = await getLandingFeed(client);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("system");
  });
});

describe("getLandingFeed — empty states", () => {
  it("returns [] and skips profile/film fetches when there is no activity and no system events", async () => {
    const { client, fromCalls } = makeClient();
    const rows = await getLandingFeed(client);
    expect(rows).toEqual([]);
    expect(fromCalls).not.toContain("profiles");
    expect(fromCalls).not.toContain("films");
  });
});
