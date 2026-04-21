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
    const digest = await runOnce(client);
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
