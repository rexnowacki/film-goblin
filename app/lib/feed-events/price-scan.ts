// Post-sweep price scan: derives price feed events from price_history rather
// than hooking the worker (zero worker changes — the worker's job is prices,
// this module's job is theater). Runs right after runOnce() in the
// maintenance cron and in the standalone refresh-prices route.
// Idempotent: re-runs are absorbed by emit.ts's 7-day dedup.

import type { Client as PgClient } from "pg";
import { classifyPriceChange } from "./classify";
import { emitFeedEvent } from "./emit";

export async function runPriceFeedScan(
  client: PgClient,
  opts: { sinceHours?: number } = {},
): Promise<{ scanned: number; emitted: number }> {
  const sinceHours = opts.sinceHours ?? 26; // daily cron cadence + slack

  // Latest new price per film in the window, with the immediately-prior price.
  const { rows } = await client.query(
    `WITH ranked AS (
       SELECT ph.film_id, ph.price_usd, ph.created_at,
              LAG(ph.price_usd) OVER (PARTITION BY ph.film_id ORDER BY ph.created_at) AS prev_price,
              ROW_NUMBER() OVER (PARTITION BY ph.film_id ORDER BY ph.created_at DESC) AS rn
       FROM price_history ph
     )
     SELECT r.film_id, r.price_usd, r.prev_price, f.title
     FROM ranked r
     JOIN films f ON f.id = r.film_id
     WHERE r.rn = 1
       AND r.created_at > now() - ($1 || ' hours')::interval
       AND r.prev_price IS NOT NULL
       AND r.price_usd <> r.prev_price`,
    [String(sinceHours)],
  );

  let emitted = 0;
  for (const r of rows) {
    const filmId: string = r.film_id;
    const newPrice = Number(r.price_usd);
    const prevPrice = Number(r.prev_price);

    const stats = await client.query(
      `SELECT
         min(price_usd) FILTER (WHERE rn > 1)                                   AS hist_min,
         EXTRACT(EPOCH FROM (max(created_at) - min(created_at))) / 86400        AS span_days,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd)
           FILTER (WHERE rn > 1 AND created_at > now() - interval '180 days')   AS median_180
       FROM (
         SELECT price_usd, created_at,
                ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
         FROM price_history WHERE film_id = $1
       ) t`,
      [filmId],
    );
    const s = stats.rows[0];
    const median = s.median_180 == null ? prevPrice : Number(s.median_180);

    const above = await client.query(
      `SELECT count(*) AS c FROM (
         SELECT price_usd, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
         FROM price_history
         WHERE film_id = $1 AND created_at > now() - interval '7 days'
       ) t WHERE rn > 1 AND price_usd >= $2`,
      [filmId, median],
    );

    const kind = classifyPriceChange({
      prevPrice,
      newPrice,
      histMin: s.hist_min == null ? newPrice : Number(s.hist_min),
      histSpanDays: s.span_days == null ? 0 : Number(s.span_days),
      median,
      rowsAtOrAboveMedianLast7d: Number(above.rows[0].c),
    });
    if (!kind) continue;

    const result = await emitFeedEvent(client, {
      type: kind,
      filmId,
      vars: { title: r.title, price: newPrice, old_price: prevPrice },
    });
    if (result === "inserted") emitted += 1;
  }

  return { scanned: rows.length, emitted };
}
