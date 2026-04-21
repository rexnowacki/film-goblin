import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db.js";

describe("migrations", () => {
  it("creates the three core tables", async () => {
    const { client, close } = await makeTestDb();
    try {
      const tables = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
      );
      const names = tables.rows.map((r: { table_name: string }) => r.table_name);
      expect(names).toEqual(expect.arrayContaining([
        "_migrations", "films", "price_alerts", "price_history", "watchlists",
      ]));
    } finally {
      await close();
    }
  });
});
