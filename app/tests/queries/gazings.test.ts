import { describe, expect, it, vi } from "vitest";
import {
  getGazings,
  partitionGazings,
  type GazingListRow,
} from "@/lib/queries/gazings";
import type { GazingRosterWithStatus } from "@/lib/queries/gazing-roster";

const NOW = new Date("2026-07-11T12:00:00.000Z");

function row(overrides: Partial<GazingListRow> = {}): GazingListRow {
  return {
    id: "invite-1",
    token: "token-1",
    created_by: "host-1",
    film_id: "film-1",
    film_title: "The Fog",
    poster_url: null,
    theater_name: null,
    starts_at: "2026-07-12T02:00:00.000Z",
    format_label: null,
    tickets_url: null,
    venue_kind: "home",
    status: "scheduled",
    timezone_label: "America/Phoenix",
    created_at: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

function roster(
  status: GazingRosterWithStatus["status"] = "scheduled",
  overrides: Partial<GazingRosterWithStatus> = {},
): GazingRosterWithStatus {
  return {
    count: 0,
    avatars: [],
    viewerIsIn: false,
    viewerIsHost: false,
    status,
    ...overrides,
  };
}

function hydrated(rows: GazingListRow[]): Map<string, GazingRosterWithStatus> {
  return new Map(rows.flatMap(item => item.status === "cancelled"
    ? []
    : [[item.token, roster(item.status)]] as const));
}

describe("partitionGazings", () => {
  it("excludes cancelled gazings even if the database result contains one", () => {
    const rows = [
      row({ id: "scheduled", token: "scheduled" }),
      row({ id: "cancelled", token: "cancelled", status: "cancelled" }),
    ];

    const result = partitionGazings(rows, hydrated(rows), new Map(), "viewer", NOW);

    expect(result.open.map(item => item.id)).toEqual(["scheduled"]);
    expect(result.aftermath).toEqual([]);
  });

  it("omits a row when live status hydration no longer returns it", () => {
    const rows = [row({ id: "stale", token: "stale" })];

    const result = partitionGazings(rows, new Map(), new Map(), "viewer", NOW);

    expect(result).toEqual({ open: [], aftermath: [] });
  });

  it("sorts future scheduled sessions soonest-first and aftermath newest-first", () => {
    const rows = [
      row({ id: "later", token: "later", starts_at: "2026-07-13T02:00:00.000Z" }),
      row({ id: "happened-old", token: "happened-old", status: "happened", starts_at: "2026-07-09T02:00:00.000Z" }),
      row({ id: "soon", token: "soon", starts_at: "2026-07-12T02:00:00.000Z" }),
      row({ id: "overdue", token: "overdue", starts_at: "2026-07-11T10:00:00.000Z" }),
      row({ id: "happened-new", token: "happened-new", status: "happened", starts_at: "2026-07-11T11:00:00.000Z" }),
    ];

    const result = partitionGazings(rows, hydrated(rows), new Map(), "viewer", NOW);

    expect(result.open.map(item => item.id)).toEqual(["soon", "later"]);
    expect(result.aftermath.map(item => item.id)).toEqual(["happened-new", "overdue", "happened-old"]);
  });

  it("labels the viewer as hosting, attending, or summoned", () => {
    const rows = [
      row({ id: "hosting", token: "hosting", created_by: "viewer" }),
      row({ id: "attending", token: "attending" }),
      row({ id: "summoned", token: "summoned" }),
    ];
    const rosters = new Map<string, GazingRosterWithStatus>([
      ["hosting", roster("scheduled", { viewerIsHost: true })],
      ["attending", roster("scheduled", { viewerIsIn: true })],
      ["summoned", roster()],
    ]);

    const result = partitionGazings(rows, rosters, new Map(), "viewer", NOW);

    expect(result.open.map(item => [item.id, item.role])).toEqual([
      ["hosting", "hosting"],
      ["attending", "attending"],
      ["summoned", "summoned"],
    ]);
  });

  it("uses hydrated status as authoritative when the invite changes during assembly", () => {
    const rows = [row({ id: "changed", token: "changed" })];
    const rosters = new Map([["changed", roster("happened")]]);

    const result = partitionGazings(rows, rosters, new Map(), "viewer", NOW);

    expect(result.open).toEqual([]);
    expect(result.aftermath.map(item => [item.id, item.status])).toEqual([["changed", "happened"]]);
  });
});

describe("getGazings", () => {
  it("uses the injected viewer client, explicit columns, and a cancelled-status exclusion", async () => {
    const select = vi.fn();
    const neq = vi.fn();
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const builder = {
      select: (columns: string) => {
        select(columns);
        return builder;
      },
      neq: (column: string, value: string) => {
        neq(column, value);
        return builder;
      },
      order,
    };
    const client = { from: vi.fn(() => builder) };

    const result = await getGazings(client as never, "viewer", NOW);

    expect(client.from).toHaveBeenCalledWith("gazing_invites");
    expect(select).toHaveBeenCalledOnce();
    expect(select.mock.calls[0][0]).not.toContain("*");
    expect(neq).toHaveBeenCalledWith("status", "cancelled");
    expect(order).toHaveBeenCalledWith("starts_at", { ascending: true });
    expect(result).toEqual({ open: [], aftermath: [] });
  });
});
