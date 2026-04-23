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
  return NextResponse.json({ error: `${envVar} not configured` }, { status: 500 });
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

  const from = process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev";
  const baseUrl = process.env.APP_BASE_URL || "https://film-goblin.vercel.app";

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  const resend = new Resend(resendKey);

  try {
    await client.connect();
    const digest = await sendDailyDigests(client, resend, { from, baseUrl });
    console.log(`notifier digest: sent=${digest.sent} failed=${digest.failed} skipped=${digest.skipped}`);
    return NextResponse.json({ ok: true, digest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron send-notifications failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
