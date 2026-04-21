import { describe, it, expect } from "vitest";
import { makeSmokeDb } from "./helpers/pg-mem.js";

describe("migration smoke (pg-mem, DDL only)", () => {
  it("creates every expected table after applying worker + db migrations", async () => {
    const { client, close } = await makeSmokeDb();
    try {
      const r = await client.query(
        `SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_schema IN ('public') ORDER BY table_name`
      );
      const names = r.rows.map((row: { table_name: string }) => row.table_name);
      expect(names).toEqual(expect.arrayContaining([
        "_migrations",
        "films",
        "price_history",
        "profiles",
        "staff",
        "follows",
        "coven_requests",
        "coven_members",
        "watchlists",
        "price_alerts",
        "lists",
        "list_films",
        "list_subscriptions",
        "reviews",
        "recommendations",
        "activity",
      ]));
    } finally {
      await close();
    }
  });
});
