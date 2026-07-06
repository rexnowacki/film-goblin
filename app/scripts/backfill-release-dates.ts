// One-time backfill: theatrical_release_date from TMDB for films that have a
// tmdb_id but no date (10/322 had dates as of 2026-07-05). Idempotent — only
// touches NULL dates. Run from app/ with prod env sourced:
//   set -a; source .env.local; source ../db/.env; set +a
//   PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsx scripts/backfill-release-dates.ts
import pg from "pg";
import { lookupTmdb } from "../lib/search/tmdb";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, title, tmdb_id FROM films
     WHERE tmdb_id IS NOT NULL AND theatrical_release_date IS NULL
     ORDER BY title`,
  );
  console.log(`${rows.length} films to backfill`);

  let updated = 0, missing = 0, failed = 0;
  for (const f of rows) {
    const res = await lookupTmdb(Number(f.tmdb_id));
    if (!res.ok) { failed += 1; console.warn(`FAIL ${f.title}: ${res.error}`); continue; }
    const date = res.fields.theatrical_release_date;
    if (!date) { missing += 1; console.warn(`no date on TMDB: ${f.title}`); continue; }
    await client.query(
      `UPDATE films SET theatrical_release_date = $1 WHERE id = $2 AND theatrical_release_date IS NULL`,
      [date, f.id],
    );
    updated += 1;
    await new Promise(r => setTimeout(r, 120)); // stay friendly to TMDB rate limits
  }

  console.log(`done: ${updated} updated, ${missing} no-date, ${failed} failed`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
