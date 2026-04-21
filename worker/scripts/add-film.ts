import "dotenv/config";
import { Client } from "pg";
import { fetchPrices, parseFilm } from "../src/itunes.js";
import { upsertFilm } from "../src/db.js";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run add-film <itunes_track_id>");
    process.exit(2);
  }
  const id = Number(arg);
  if (!Number.isFinite(id)) {
    console.error(`Not a number: ${arg}`);
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await fetchPrices([id]);
    if (res.resultCount === 0) {
      console.error(`iTunes returned no results for trackId=${id}`);
      process.exit(1);
    }
    const parsed = parseFilm(res.results[0]);
    if (!parsed) {
      console.error(`trackId=${id} failed parse (wrong kind, invalid price, etc.)`);
      process.exit(1);
    }
    const uuid = await upsertFilm(client, parsed);
    console.log(`Upserted ${parsed.title} (${parsed.year}) as ${uuid}`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
