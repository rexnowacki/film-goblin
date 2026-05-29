import { describe, expect, it } from "vitest";
import { _getAdminStats } from "@/lib/queries/admin-stats";

function fakeClient(counts: Record<string, number>) {
  return {
    from(table: string) {
      const builder: any = {
        eqApplied: false,
        select() { return builder; },
        eq() {
          builder.eqApplied = true;
          return builder;
        },
        then(resolve: (value: any) => void) {
          let key = table;
          if (table === "films" && builder.eqApplied) key = "films_tracking";
          if (table === "film_requests") key = "film_requests_pending";
          resolve({ count: counts[key] ?? 0, error: null });
        },
      };
      return builder;
    },
  };
}

describe("_getAdminStats", () => {
  it("returns the six dashboard counts", async () => {
    const client = fakeClient({
      profiles: 12,
      films: 100,
      films_tracking: 80,
      watchlists: 30,
      watched: 45,
      film_requests_pending: 7,
    });

    await expect(_getAdminStats(client as any)).resolves.toEqual({
      users: 12,
      filmsTotal: 100,
      filmsTracking: 80,
      watchlistEntries: 30,
      watchedLogs: 45,
      pendingRequests: 7,
    });
  });
});
