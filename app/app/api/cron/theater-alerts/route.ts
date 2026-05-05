import { NextResponse } from "next/server";
import * as Sentry from "@sentry/node";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { acquireCronLock } from "@/lib/theaters/lock";
import { runTheaterAlerts } from "@/lib/theaters/scrape-theaters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  if (process.env.SENTRY_DSN && !Sentry.isInitialized?.()) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  try {
    const supabase = serviceRoleClient();
    const locked = await acquireCronLock(supabase, "theater-alerts");
    if (!locked) {
      return NextResponse.json({ ok: true, skipped: true, reason: "locked" });
    }
    const summary = await runTheaterAlerts(supabase);
    console.log("theater-alerts:", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron theater-alerts failed:", message);
    Sentry.captureException(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
