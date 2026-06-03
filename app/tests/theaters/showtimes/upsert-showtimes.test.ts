import { describe, expect, it } from "vitest";
import { buildShowtimeRows, selectStaleIds } from "@/lib/theaters/showtimes/upsert-showtimes";
import type { ResolvedShowtime } from "@/lib/theaters/showtimes/types";

const now = new Date("2026-06-03T12:00:00Z");

const scraped: ResolvedShowtime[] = [
  {
    sid: "100",
    title: "Death Becomes Her",
    rawDate: "Fri 6/5 @ 8:30pm",
    screenLabel: "Screen 4",
    filmUrl: "https://loftcinema.org/film/death-becomes-her/",
    startsAt: "2026-06-06T03:30:00.000Z",
    formatLabel: null,
  },
];

describe("buildShowtimeRows", () => {
  it("maps a scraped showtime to a DB row keyed by source_sid", () => {
    const rows = buildShowtimeRows("loft-id", scraped, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      theater_id: "loft-id",
      source_sid: "100",
      title: "Death Becomes Her",
      normalized_title: "death becomes her",
      starts_at: "2026-06-06T03:30:00.000Z",
      screen_label: "Screen 4",
      format_label: null,
      tickets_url: "https://loftcinema.org/film/death-becomes-her/",
      source_url: "https://loftcinema.org/film/death-becomes-her/",
      is_active: true,
      last_seen_at: "2026-06-03T12:00:00.000Z",
    });
  });
});

describe("selectStaleIds", () => {
  it("returns only future active rows absent from the latest scrape", () => {
    const existing = [
      { id: "gone-1", source_sid: "999", starts_at: "2026-06-07T02:00:00.000Z" },
      { id: "past-1", source_sid: "888", starts_at: "2026-06-01T02:00:00.000Z" },
      { id: "kept-1", source_sid: "100", starts_at: "2026-06-06T03:30:00.000Z" },
    ];
    const keptSids = new Set(scraped.map((showtime) => showtime.sid));
    expect(selectStaleIds(existing, keptSids, now)).toEqual(["gone-1"]);
  });
});
