import type { Client } from "pg";

export interface UserLite {
  id: string;
  handle: string;
  email: string;
  unsubscribe_token: string;
}

export interface FilmLite {
  id: string;
  title: string;
  director: string;
  year: number;
  runtime_min: number;
  artwork_url: string;
  itunes_url: string;
}

export interface AlertLite {
  id: string;
  old_price_usd: number;
  new_price_usd: number;
  film: FilmLite;
}

export interface PendingDigest {
  user: UserLite;
  alerts: AlertLite[];
}

function toNum(v: unknown): number {
  return typeof v === "string" ? Number(v) : (v as number);
}

export async function findPendingDigests(client: Client): Promise<PendingDigest[]> {
  const { rows } = await client.query(`
    SELECT
      u.id AS user_id,
      p.handle,
      u.email,
      p.unsubscribe_token,
      pa.id AS alert_id,
      pa.old_price_usd,
      pa.new_price_usd,
      f.id AS film_id,
      f.title,
      f.director,
      f.year,
      f.runtime_min,
      f.artwork_url,
      f.itunes_url
    FROM price_alerts pa
    JOIN watchlists wl ON wl.id = pa.watchlist_id
    JOIN auth.users u ON u.id = wl.user_id
    JOIN profiles p ON p.id = u.id
    JOIN films f ON f.id = pa.film_id
    WHERE pa.notified_at IS NULL
      AND p.email_notifications_enabled = TRUE
    ORDER BY u.id, pa.created_at DESC
  `);

  const byUser = new Map<string, PendingDigest>();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user: {
          id: r.user_id,
          handle: r.handle,
          email: r.email,
          unsubscribe_token: r.unsubscribe_token,
        },
        alerts: [],
      });
    }
    byUser.get(r.user_id)!.alerts.push({
      id: r.alert_id,
      old_price_usd: toNum(r.old_price_usd),
      new_price_usd: toNum(r.new_price_usd),
      film: {
        id: r.film_id,
        title: r.title,
        director: r.director,
        year: r.year,
        runtime_min: r.runtime_min,
        artwork_url: r.artwork_url,
        itunes_url: r.itunes_url,
      },
    });
  }
  return Array.from(byUser.values());
}
