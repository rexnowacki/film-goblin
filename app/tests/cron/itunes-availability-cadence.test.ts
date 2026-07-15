import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("iTunes availability cadence", () => {
  const checkSource = readFileSync("lib/itunes-availability/check.ts", "utf8");
  const maintenanceSource = readFileSync("app/api/cron/maintenance/route.ts", "utf8");

  it("rechecks eligible theatrical films after twenty hours", () => {
    expect(checkSource).toContain("Date.now() - 20 * 60 * 60 * 1000");
    expect(checkSource).not.toContain("Date.now() - 6 * 86400 * 1000");
  });

  it("runs the Apple TV transition check every maintenance day", () => {
    expect(maintenanceSource).toContain(
      'jobs.itunesAvailability = await recordedJob("check-itunes-availability", () => runItunesAvailabilityCheck(sr));',
    );
    expect(maintenanceSource).not.toContain(
      'jobs.itunesAvailability = { ok: true, skipped: true, reason: "not scheduled today" };',
    );
  });
});
