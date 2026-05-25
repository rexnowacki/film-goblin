import { NextResponse } from "next/server";
import pg from "pg";
import * as Sentry from "@sentry/node";
import { Resend } from "resend";
import { runOnce } from "film-goblin-worker";
import { sendDailyDigests } from "film-goblin-notifier";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { runRateReminders } from "@/lib/cron/rate-reminders";
import { runItunesAvailabilityCheck } from "@/lib/itunes-availability/check";
import { runStreamingAvailabilityRefresh } from "@/lib/streaming-availability/refresh";
import { acquireCronLock } from "@/lib/theaters/lock";
import { runTheaterAlerts } from "@/lib/theaters/scrape-theaters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type JobResult =
  | { ok: true; skipped?: false; result: unknown }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function missing(envVar: string) {
  console.error(`maintenance missing required env: ${envVar}`);
  return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function runJob(name: string, fn: () => Promise<unknown>): Promise<JobResult> {
  try {
    const result = await fn();
    console.log(`maintenance ${name}:`, result);
    return { ok: true, result };
  } catch (err) {
    const message = errorMessage(err);
    console.error(`maintenance ${name} failed:`, message);
    Sentry.captureException(err);
    return { ok: false, error: "job failed" };
  }
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

  const now = new Date();
  const day = now.getUTCDay();
  const isMonday = day === 1;
  const isTheaterDay = day === 1 || day === 4;

  const client = new pg.Client({ connectionString: databaseUrl });
  const jobs: Record<string, JobResult> = {};

  try {
    await client.connect();

    jobs.refreshPrices = await runJob("refresh-prices", async () => {
      const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 10000;
      const maxRuntimeMs = Number(process.env.PRICE_REFRESH_MAX_RUNTIME_MS) || 180_000;
      const staleHours = Number(process.env.PRICE_REFRESH_STALE_HOURS) || 20;
      const digest = await runOnce(client, { maxFilms, maxRuntimeMs, staleHours });
      console.log(digest.render());
      return digest.snapshot();
    });

    jobs.rateReminders = await runJob("rate-reminders", () => runRateReminders(client));

    if (isTheaterDay) {
      jobs.theaterAlerts = await runJob("theater-alerts", async () => {
        const supabase = serviceRoleClient();
        const locked = await acquireCronLock(supabase, "theater-alerts");
        if (!locked) return { skipped: true, reason: "locked" };
        return runTheaterAlerts(supabase);
      });
    } else {
      jobs.theaterAlerts = { ok: true, skipped: true, reason: "not scheduled today" };
    }

    if (isMonday) {
      jobs.itunesAvailability = await runJob("check-itunes-availability", async () => {
        const supabase = serviceRoleClient();
        return runItunesAvailabilityCheck(supabase);
      });
    } else {
      jobs.itunesAvailability = { ok: true, skipped: true, reason: "not scheduled today" };
    }

    jobs.streamingAvailability = await runJob("streaming-availability", () => {
      const maxFilms = Number(process.env.STREAMING_AVAILABILITY_MAX_FILMS_PER_RUN) || 40;
      const staleHours = Number(process.env.STREAMING_AVAILABILITY_STALE_HOURS) || 24;
      return runStreamingAvailabilityRefresh(client, { maxFilms, staleHours, region: "US" });
    });

    jobs.sendNotifications = await runJob("send-notifications", async () => {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) throw new Error("RESEND_API_KEY not configured");
      const from = process.env.NOTIFY_FROM_EMAIL;
      if (!from) throw new Error("NOTIFY_FROM_EMAIL not configured");
      const baseUrl = process.env.APP_BASE_URL || "https://film-goblin.vercel.app";
      const digest = await sendDailyDigests(client, new Resend(resendKey), { from, baseUrl });
      const cleanup = await client.query(
        `DELETE FROM notifications WHERE created_at < now() - INTERVAL '30 days'`,
      );
      return { digest, notificationsDeleted: cleanup.rowCount ?? 0 };
    });
  } finally {
    await client.end().catch(() => {});
  }

  const failed = Object.values(jobs).filter(job => !job.ok);
  return NextResponse.json(
    { ok: failed.length === 0, ranAt: now.toISOString(), jobs },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
