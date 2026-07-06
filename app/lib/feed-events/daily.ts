// Daily generator (runs inside the maintenance cron): anniversaries — the
// guaranteed freshness fallback — plus milestone checks. Max ONE anniversary
// per day (spec). Idempotent via emit.ts dedup rules.

import type { Client as PgClient } from "pg";
import { emitFeedEvent } from "./emit";

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
    const monthly = await client.query(
      `SELECT count(*) AS c FROM watched
       WHERE watched_at >= date_trunc('month', now() - interval '1 month')
         AND watched_at <  date_trunc('month', now())`,
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

  // --- milestone: every 5th member ---
  const members = Number((await client.query(`SELECT count(*) AS c FROM profiles`)).rows[0].c);
  if (members > 0 && members % MEMBER_STEP === 0) {
    bump(await emitFeedEvent(client, {
      type: "milestone", filmId: null,
      vars: { n: members, milestone_kind: "member" },
    }));
  }

  return { emitted };
}
