// Daily generator (runs inside the maintenance cron): anniversaries — the
// guaranteed freshness fallback — plus milestone checks. Max ONE anniversary
// per day (spec). Idempotent via emit.ts dedup rules.

import type { Client as PgClient } from "pg";
import { emitFeedEvent } from "./emit";
import { isFullMoonUTCDate } from "./moon";

export interface AnniversaryCandidate {
  film_id: string;
  title: string;
  release_year: number;
  watchlist_count: number;
}

export function pickAnniversary(
  candidates: AnniversaryCandidate[],
  todayYear: number,
): (AnniversaryCandidate & { age: number }) | null {
  if (candidates.length === 0) return null;
  const withAge = candidates
    .map(c => ({ ...c, age: todayYear - c.release_year }))
    .filter(c => c.age > 0);
  if (withAge.length === 0) return null;
  const byPopularity = (a: typeof withAge[number], b: typeof withAge[number]) =>
    b.watchlist_count - a.watchlist_count || b.age - a.age;
  const round = withAge.filter(c => c.age % 5 === 0).sort(byPopularity);
  return round[0] ?? withAge.sort(byPopularity)[0];
}

const CATALOG_START = 250;
const CATALOG_STEP = 50;

export function catalogThresholds(count: number): number[] {
  const out: number[] = [];
  for (let t = CATALOG_START; t <= count; t += CATALOG_STEP) out.push(t);
  return out;
}

const MEMBER_STEP = 5;

export function latestMemberThreshold(count: number, step = MEMBER_STEP): number | null {
  if (count < step) return null;
  return count - (count % step);
}

export interface FullMoonCandidate {
  film_id: string;
  title: string;
  prior_appearances: number;
  watchlist_count: number;
}

// Owner decision 2026-07-06: prefer werewolves; fall back to the creature
// trio until more werewolf films are tagged. Rotate: fewest prior full_moon
// appearances first so the small pool doesn't repeat one favorite.
const FULL_MOON_PRIMARY_TAGS = ["werewolves"];
const FULL_MOON_FALLBACK_TAGS = ["vampires", "zombies", "kaiju"];

export function pickFullMoonFilm(candidates: FullMoonCandidate[]): FullMoonCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) =>
    a.prior_appearances - b.prior_appearances
    || b.watchlist_count - a.watchlist_count
    || a.film_id.localeCompare(b.film_id),
  )[0];
}

export async function runDailyFeedEvents(
  client: PgClient,
  now: Date = new Date(),
): Promise<{ emitted: number }> {
  let emitted = 0;
  const bump = (r: "inserted" | "deduped") => { if (r === "inserted") emitted += 1; };

  // --- anniversary (max one per day; the freshness fallback of last resort) ---
  const anniv = await client.query(
    `SELECT f.id AS film_id, f.title,
            EXTRACT(YEAR FROM f.theatrical_release_date)::int AS release_year,
            count(w.id)::int AS watchlist_count
     FROM films f
     LEFT JOIN watchlists w ON w.film_id = f.id
     WHERE f.theatrical_release_date IS NOT NULL
       AND EXTRACT(MONTH FROM f.theatrical_release_date) = $1
       AND EXTRACT(DAY   FROM f.theatrical_release_date) = $2
     GROUP BY f.id, f.title, f.theatrical_release_date`,
    [now.getUTCMonth() + 1, now.getUTCDate()],
  );
  const picked = pickAnniversary(anniv.rows, now.getUTCFullYear());
  if (picked) {
    bump(await emitFeedEvent(client, {
      type: "anniversary",
      filmId: picked.film_id,
      vars: { title: picked.title, year: picked.release_year, age: picked.age },
    }));
  }

  // --- milestone: catalog size crosses 250, 300, 350, … ---
  const filmCount = Number((await client.query(`SELECT count(*) AS c FROM films`)).rows[0].c);
  for (const t of catalogThresholds(filmCount)) {
    bump(await emitFeedEvent(client, {
      type: "milestone", filmId: null,
      vars: { n: t, milestone_kind: "catalog" },
    }));
  }

  // --- milestone: monthly coven watch total (1st of the month, for last month) ---
  if (now.getUTCDate() === 1) {
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthly = await client.query(
      `SELECT count(*) AS c FROM watched
       WHERE watched_at >= $1
         AND watched_at <  $2`,
      [prevMonthStart.toISOString(), thisMonthStart.toISOString()],
    );
    const n = Number(monthly.rows[0].c);
    if (n > 0) {
      bump(await emitFeedEvent(client, {
        type: "milestone", filmId: null,
        vars: { n, milestone_kind: "monthly" },
        payloadExtra: { month: now.toISOString().slice(0, 7) },
      }));
    }
  }

  // --- milestone: every 5th member (self-heals missed crossings via dedup) ---
  const members = Number((await client.query(`SELECT count(*) AS c FROM profiles`)).rows[0].c);
  const t = latestMemberThreshold(members);
  if (t !== null) {
    bump(await emitFeedEvent(client, {
      type: "milestone", filmId: null,
      vars: { n: t, milestone_kind: "member" },
    }));
  }

  // --- last_showing: film's final active future Loft showtime is today (UTC) ---
  const lastShows = await client.query(
    `SELECT f.id AS film_id, f.title
     FROM films f
     JOIN theater_showtimes ts ON ts.film_id = f.id
     WHERE ts.is_active AND ts.starts_at >= now()
     GROUP BY f.id, f.title
     HAVING max(ts.starts_at) < (date_trunc('day', now()) + interval '1 day')`,
  );
  for (const r of lastShows.rows) {
    bump(await emitFeedEvent(client, {
      type: "last_showing",
      filmId: r.film_id,
      vars: { title: r.title, theater: "The Loft" },
    }));
  }

  // --- verdict_anointed: coven verdict crosses the top tier (once ever) ---
  const anointed = await client.query(
    `SELECT fws.id AS film_id, fws.title
     FROM films_with_stats fws
     WHERE fws.coven_rating_pct >= 90 AND fws.coven_rating_count >= 5
       AND NOT EXISTS (
         SELECT 1 FROM feed_events fe
         WHERE fe.film_id = fws.id AND fe.event_type = 'verdict_anointed'
       )`,
  );
  for (const r of anointed.rows) {
    bump(await emitFeedEvent(client, {
      type: "verdict_anointed",
      filmId: r.film_id,
      vars: { title: r.title },
    }));
  }

  // --- full_moon: one film, on full-moon days, max one event per window ---
  if (isFullMoonUTCDate(now)) {
    const recentMoon = await client.query(
      `SELECT 1 FROM feed_events
       WHERE event_type = 'full_moon' AND created_at > now() - interval '3 days'
       LIMIT 1`,
    );
    if (!recentMoon.rowCount) {
      const poolFor = async (tags: string[]) => client.query(
        `SELECT f.id AS film_id, f.title,
                (SELECT count(*) FROM feed_events fe
                 WHERE fe.film_id = f.id AND fe.event_type = 'full_moon')::int AS prior_appearances,
                (SELECT count(*) FROM watchlists w WHERE w.film_id = f.id)::int AS watchlist_count
         FROM films f
         WHERE EXISTS (
           SELECT 1 FROM film_tags ft JOIN tags t ON t.id = ft.tag_id
           WHERE ft.film_id = f.id AND t.type = 'subject' AND t.name = ANY($1)
         )`,
        [tags],
      );
      let pool = await poolFor(FULL_MOON_PRIMARY_TAGS);
      if (pool.rowCount === 0) pool = await poolFor(FULL_MOON_FALLBACK_TAGS);
      const picked = pickFullMoonFilm(pool.rows);
      if (picked) {
        bump(await emitFeedEvent(client, {
          type: "full_moon",
          filmId: picked.film_id,
          vars: { title: picked.title },
        }));
      }
    }
  }

  // --- monthly_communion: most-watched film of last month (1st of month) ---
  if (now.getUTCDate() === 1) {
    const commThisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const commPrevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = commPrevMonthStart.toISOString().slice(0, 7);
    const dup = await client.query(
      `SELECT 1 FROM feed_events
       WHERE event_type = 'monthly_communion' AND payload ->> 'month' = $1
       LIMIT 1`,
      [month],
    );
    if (!dup.rowCount) {
      const top = await client.query(
        `SELECT f.id AS film_id, f.title, count(*)::int AS n
         FROM watched w JOIN films f ON f.id = w.film_id
         WHERE w.watched_at >= $1 AND w.watched_at < $2
         GROUP BY f.id, f.title
         HAVING count(*) >= 2
         ORDER BY n DESC, f.id
         LIMIT 1`,
        [commPrevMonthStart.toISOString(), commThisMonthStart.toISOString()],
      );
      const t = top.rows[0];
      if (t) {
        bump(await emitFeedEvent(client, {
          type: "monthly_communion",
          filmId: t.film_id,
          vars: { title: t.title, n: Number(t.n) },
          payloadExtra: { month },
        }));
      }
    }
  }

  return { emitted };
}
