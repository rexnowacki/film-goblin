import type pg from "pg";

type QueryClient = Pick<pg.Client, "query">;

export async function runProductEventCleanup(client: QueryClient): Promise<{ rowsDeleted: number }> {
  const result = await client.query(
    `DELETE FROM product_events WHERE received_at < now() - INTERVAL '180 days'`,
  );
  return { rowsDeleted: result.rowCount ?? 0 };
}
