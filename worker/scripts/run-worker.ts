import "dotenv/config";
import { Client } from "pg";
import * as Sentry from "@sentry/node";
import { runOnce } from "../src/worker.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 10000;
    const maxRuntimeMs = Number(process.env.PRICE_REFRESH_MAX_RUNTIME_MS) || 240_000;
    const staleHours = Number(process.env.PRICE_REFRESH_STALE_HOURS) || 20;
    const digest = await runOnce(client, { maxFilms, maxRuntimeMs, staleHours });
    console.log(digest.render());
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  Sentry.captureException(err);
  process.exit(1);
});
