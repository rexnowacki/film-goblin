import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { runOnce } from "film-goblin-worker";
import { runPriceFeedScan } from "@/lib/feed-events/price-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby plan cap. Bump to 900 on Pro if needed.

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("cron refresh-prices missing required env: DATABASE_URL");
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  }

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 10000;
  const maxRuntimeMs = Number(process.env.PRICE_REFRESH_MAX_RUNTIME_MS) || 240_000;
  const staleHours = Number(process.env.PRICE_REFRESH_STALE_HOURS) || 20;
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const digest = await runOnce(client, { maxFilms, maxRuntimeMs, staleHours });
    console.log(digest.render());
    const feedScan = await runPriceFeedScan(client);
    return NextResponse.json({ ok: true, digest: digest.snapshot(), feedScan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron refresh-prices failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
