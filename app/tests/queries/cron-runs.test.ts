import { describe, expect, it } from "vitest";
import { _getLatestCronRuns } from "@/lib/queries/cron-runs";

function fakeClient(rows: any[]) {
  return {
    from() {
      const builder: any = {
        select() { return builder; },
        in() { return builder; },
        order() { return builder; },
        then(resolve: (value: any) => void) {
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
}

describe("_getLatestCronRuns", () => {
  it("returns the most recent row per job", async () => {
    const client = fakeClient([
      {
        job: "refresh-prices",
        status: "success",
        started_at: "2026-05-29T09:58:00Z",
        finished_at: "2026-05-29T10:00:00Z",
        stats: { price_drops: 2 },
        error_text: null,
      },
      {
        job: "refresh-prices",
        status: "error",
        started_at: "2026-05-28T09:58:00Z",
        finished_at: "2026-05-28T10:00:00Z",
        stats: null,
        error_text: "boom",
      },
      {
        job: "theater-alerts",
        status: "skipped",
        started_at: "2026-05-29T10:00:00Z",
        finished_at: "2026-05-29T10:01:00Z",
        stats: { skipped: true },
        error_text: null,
      },
    ]);

    const latest = await _getLatestCronRuns(client as any, ["refresh-prices", "theater-alerts"]);
    expect(latest["refresh-prices"]).toMatchObject({ status: "success", stats: { price_drops: 2 } });
    expect(latest["theater-alerts"]).toMatchObject({ status: "skipped" });
  });

  it("omits jobs with no rows", async () => {
    const latest = await _getLatestCronRuns(fakeClient([]) as any, ["refresh-prices"]);
    expect(latest["refresh-prices"]).toBeUndefined();
  });
});
