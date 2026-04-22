import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { runOnce } from "film-goblin-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900; // 15 min on Vercel Pro; harmless on Hobby.

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
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 500 },
    );
  }

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 100;
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const digest = await runOnce(client, { maxFilms });
    console.log(digest.render());
    return NextResponse.json({ ok: true, digest: digest.snapshot() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron refresh-prices failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
