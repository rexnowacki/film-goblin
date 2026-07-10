import { describe, expect, it, vi } from "vitest";
import { runProductEventCleanup } from "@/lib/cron/product-event-cleanup";

describe("runProductEventCleanup", () => {
  it("deletes only rows older than 180 days and reports the count", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 7 });
    await expect(runProductEventCleanup({ query } as never)).resolves.toEqual({ rowsDeleted: 7 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("received_at < now() - INTERVAL '180 days'"));
  });

  it("fails loud when the delete fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database down"));
    await expect(runProductEventCleanup({ query } as never)).rejects.toThrow("database down");
  });
});
