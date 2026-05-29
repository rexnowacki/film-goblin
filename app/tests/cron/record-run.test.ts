import { describe, expect, it } from "vitest";
import { recordCronRun } from "@/lib/cron/record-run";

function fakeSr() {
  const calls = { inserted: null as any, updated: null as any, updatedId: null as any };
  const sr = {
    from(_table: string) {
      return {
        insert(row: any) {
          calls.inserted = row;
          return {
            select() {
              return {
                single: async () => ({ data: { id: 42 }, error: null }),
              };
            },
          };
        },
        update(patch: any) {
          calls.updated = patch;
          return {
            eq: async (_column: string, id: any) => {
              calls.updatedId = id;
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { sr, calls };
}

describe("recordCronRun", () => {
  it("persists success with stats", async () => {
    const { sr, calls } = fakeSr();
    const result = await recordCronRun(sr as any, "refresh-prices", "manual", async () => ({ films_refreshed: 3 }));

    expect(result).toEqual({ ok: true, status: "success", stats: { films_refreshed: 3 } });
    expect(calls.inserted).toMatchObject({ job: "refresh-prices", status: "running", triggered_by: "manual" });
    expect(calls.updated).toMatchObject({ status: "success", stats: { films_refreshed: 3 } });
    expect(calls.updated.finished_at).toBeTruthy();
    expect(calls.updatedId).toBe(42);
  });

  it("persists skipped when fn returns skipped", async () => {
    const { sr, calls } = fakeSr();
    const result = await recordCronRun(sr as any, "theater-alerts", "manual", async () => ({
      skipped: true,
      reason: "locked",
    }));

    expect(result).toEqual({ ok: true, status: "skipped", stats: { skipped: true, reason: "locked" } });
    expect(calls.updated).toMatchObject({ status: "skipped" });
  });

  it("persists error and returns ok false when fn throws", async () => {
    const { sr, calls } = fakeSr();
    const result = await recordCronRun(sr as any, "refresh-prices", "cron", async () => {
      throw new Error("boom");
    });

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(calls.updated).toMatchObject({ status: "error", error_text: "boom" });
  });
});
