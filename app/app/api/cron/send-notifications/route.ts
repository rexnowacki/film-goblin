import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { Resend } from "resend";
import { sendDailyDigests } from "film-goblin-notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function missing(envVar: string) {
  console.error(`cron send-notifications missing required env: ${envVar}`);
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

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return missing("RESEND_API_KEY");

  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!from) return missing("NOTIFY_FROM_EMAIL");

  const baseUrl = process.env.APP_BASE_URL || "https://freshfromthepit.com";

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  const resend = new Resend(resendKey);

  try {
    await client.connect();
    const digest = await sendDailyDigests(client, resend, { from, baseUrl });
    console.log(`notifier digest: sent=${digest.sent} failed=${digest.failed} skipped=${digest.skipped}`);

    // Notifications cleanup: drop rows older than 30 days. Bell reads only
    // the last 14 days; the extra 16-day buffer keeps a row visible after
    // it's been read but ages it out within a month.
    const cleanup = await client.query(
      `DELETE FROM notifications WHERE created_at < now() - INTERVAL '30 days'`
    );
    console.log(`notifications cleanup: deleted=${cleanup.rowCount ?? 0}`);

    return NextResponse.json({ ok: true, digest, notificationsDeleted: cleanup.rowCount ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron send-notifications failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
