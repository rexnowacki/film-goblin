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
import { recordCronRun } from "@/lib/cron/record-run";

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
    const sr = serviceRoleClient();

    const recordedJob = async (name: string, fn: () => Promise<unknown>): Promise<JobResult> => {
      const result = await recordCronRun(sr, name, "cron", fn);
      if (!result.ok) {
        console.error(`maintenance ${name} failed:`, result.error);
        return { ok: false, error: "job failed" };
      }
      console.log(`maintenance ${name}:`, result.stats);
      if (result.status === "skipped") {
        const reason = (result.stats as { reason?: string } | null)?.reason ?? "skipped";
        return { ok: true, skipped: true, reason };
      }
      return { ok: true, result: result.stats };
    };

    jobs.refreshPrices = await recordedJob("refresh-prices", async () => {
      const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 10000;
      const maxRuntimeMs = Number(process.env.PRICE_REFRESH_MAX_RUNTIME_MS) || 180_000;
      const staleHours = Number(process.env.PRICE_REFRESH_STALE_HOURS) || 20;
      const digest = await runOnce(client, { maxFilms, maxRuntimeMs, staleHours });
      console.log(digest.render());
      return digest.snapshot();
    });

    jobs.rateReminders = await recordedJob("send-rate-reminders", () => runRateReminders(client));

    if (isTheaterDay) {
      jobs.theaterAlerts = await recordedJob("theater-alerts", async () => {
        const locked = await acquireCronLock(sr, "theater-alerts");
        if (!locked) return { skipped: true, reason: "locked" };
        return runTheaterAlerts(sr);
      });
    } else {
      jobs.theaterAlerts = { ok: true, skipped: true, reason: "not scheduled today" };
    }

    if (isMonday) {
      jobs.itunesAvailability = await recordedJob("check-itunes-availability", () => runItunesAvailabilityCheck(sr));
    } else {
      jobs.itunesAvailability = { ok: true, skipped: true, reason: "not scheduled today" };
    }

    jobs.streamingAvailability = await recordedJob("streaming-availability", () => {
      const maxFilms = Number(process.env.STREAMING_AVAILABILITY_MAX_FILMS_PER_RUN) || 40;
      const staleHours = Number(process.env.STREAMING_AVAILABILITY_STALE_HOURS) || 24;
      return runStreamingAvailabilityRefresh(client, { maxFilms, staleHours, region: "US" });
    });

    jobs.sendNotifications = await recordedJob("send-notifications", async () => {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) throw new Error("RESEND_API_KEY not configured");
      const from = process.env.NOTIFY_FROM_EMAIL;
      if (!from) throw new Error("NOTIFY_FROM_EMAIL not configured");
      const baseUrl = process.env.APP_BASE_URL || "https://freshfromthepit.com";
      const digest = await sendDailyDigests(client, new Resend(resendKey), { from, baseUrl });
      const cleanup = await client.query(
        `DELETE FROM notifications WHERE created_at < now() - INTERVAL '30 days'`,
      );
      const runCleanup = await client.query(
        `DELETE FROM cron_runs WHERE started_at < now() - INTERVAL '90 days'`,
      );
      return { digest, notificationsDeleted: cleanup.rowCount ?? 0, cronRunsDeleted: runCleanup.rowCount ?? 0 };
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
