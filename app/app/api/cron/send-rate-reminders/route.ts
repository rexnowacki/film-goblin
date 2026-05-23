import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { runRateReminders } from "@/lib/cron/rate-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function missing(envVar: string) {
  console.error(`cron send-rate-reminders missing required env: ${envVar}`);
  return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return missing("DATABASE_URL");

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const { inserted } = await runRateReminders(client);
    console.log(`rate-reminders: inserted=${inserted}`);
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron send-rate-reminders failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
