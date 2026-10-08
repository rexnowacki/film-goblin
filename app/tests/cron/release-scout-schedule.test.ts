import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isJobKey, JOB_META } from "@/lib/cron/job-meta";

describe("release scout scheduling", () => {
  const maintenance = readFileSync("app/api/cron/maintenance/route.ts", "utf8");

  it("runs on Mondays under its own lock in the maintenance cron", () => {
    expect(maintenance).toContain('jobs.releaseScout = await recordedJob("release-scout", async () => {');
    expect(maintenance).toContain('const locked = await acquireCronLock(sr, "release-scout");');
    expect(maintenance).toContain("return runReleaseScoutWithSvc(sr);");
    const mondayBlock = maintenance.slice(maintenance.indexOf("if (isMonday) {"));
    expect(mondayBlock.indexOf("release-scout")).toBeGreaterThan(-1);
  });

  it("is manually triggerable from the Engine Room", () => {
    expect(isJobKey("release-scout")).toBe(true);
    expect(JOB_META["release-scout"]).toEqual({ label: "Release scout", notifies: false });
  });
});
