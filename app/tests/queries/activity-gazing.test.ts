import { beforeEach, describe, expect, it, vi } from "vitest";

const gazing = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  get: vi.fn(async () => gazing.rows),
}));

vi.mock("@/lib/queries/gazing-roster", () => ({
  EMPTY_ROSTER: { count: 0, avatars: [], viewerIsIn: false, viewerIsHost: false },
  getGazingRostersForTokens: gazing.get,
}));
vi.mock("@/lib/queries/activity-reactions", () => ({
  getReactionsForActivities: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/queries/activity-comments", () => ({
  getCommentSummariesForActivities: vi.fn(async () => new Map()),
}));

import { getEnrichedActivity } from "@/lib/queries/activity";

const film = {
  id: "film-1",
  title: "The Film",
  director: "A. Director",
  year: 2026,
  artwork_url: "https://example.test/poster.jpg",
  itunes_url: "https://example.test/buy",
};
const profiles = [
  { id: "host", username: "host", display_name: null, avatar_url: null },
  { id: "guest", username: "guest", display_name: null, avatar_url: null },
];
const activityRows = [
  {
    id: "summon",
    kind: "gazing_invited",
    payload: { invite_id: "inv-1", film_id: film.id, token: "tok-live", starts_at: "2026-07-12T02:00:00Z" },
    created_at: "2026-07-11T01:00:00Z",
    actor_user_id: "host",
  },
  {
    id: "attending",
    kind: "gazing_attending",
    payload: { invite_id: "inv-2", film_id: film.id, token: "tok-gone", to_user_id: "host", starts_at: "2026-07-12T02:00:00Z" },
    created_at: "2026-07-11T00:30:00Z",
    actor_user_id: "guest",
  },
];

function chainResult(data: unknown[]) {
  const query: any = {};
  for (const method of ["select", "order", "eq", "in", "filter", "lt"]) query[method] = () => query;
  query.limit = async () => ({ data, error: null });
  return query;
}

function client() {
  return {
    from: (table: string) => {
      if (table === "activity") return chainResult(activityRows);
      if (table === "profiles") {
        return { select: () => ({ in: async (_column: string, ids: string[]) => ({ data: profiles.filter(row => ids.includes(row.id)), error: null }) }) };
      }
      if (table === "films") {
        return { select: () => ({ in: async () => ({ data: [film], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

beforeEach(() => {
  gazing.rows = new Map();
  gazing.get.mockClear();
});

describe("getEnrichedActivity gazing status", () => {
  it("omits gazing rows whose live invite is cancelled, missing, or unauthorized", async () => {
    const page = await getEnrichedActivity(client(), "viewer", { scope: "site", limit: 20 });

    expect(page.items).toEqual([]);
    expect(gazing.get).toHaveBeenCalledWith(expect.anything(), ["tok-live", "tok-gone"], "viewer");
  });

  it("keeps non-cancelled rows and carries live status into rendering", async () => {
    gazing.rows = new Map([
      ["tok-live", { count: 0, avatars: [], viewerIsIn: false, viewerIsHost: false, status: "scheduled" }],
      ["tok-gone", { count: 1, avatars: [], viewerIsIn: true, viewerIsHost: false, status: "happened" }],
    ]);

    const page = await getEnrichedActivity(client(), "viewer", { scope: "site", limit: 20 });

    expect(page.items.map(item => ({ kind: item.kind, status: "gazingStatus" in item ? item.gazingStatus : null }))).toEqual([
      { kind: "gazing_invited", status: "scheduled" },
      { kind: "gazing_attending", status: "happened" },
    ]);
  });
});
