import "dotenv/config";
import { Client } from "pg";
import { seedFilms } from "../src/seed.js";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const n = await seedFilms(client);
    console.log(`Seeded ${n} films.`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
