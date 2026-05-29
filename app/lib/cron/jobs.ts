import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runOnce } from "film-goblin-worker";
import { runRateReminders } from "@/lib/cron/rate-reminders";
import { runItunesAvailabilityCheck } from "@/lib/itunes-availability/check";
import { runTheaterAlerts } from "@/lib/theaters/scrape-theaters";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import type { JobKey } from "@/lib/cron/job-meta";

export { JOB_META, TRIGGERABLE_JOBS, isJobKey, type JobKey } from "@/lib/cron/job-meta";

export async function runJobByKey(key: JobKey): Promise<unknown> {
  switch (key) {
    case "refresh-prices": {
      const client = pgClient();
      try {
        await client.connect();
        const maxFilms = Number(process.env.MAX_FILMS_PER_RUN) || 10000;
        const maxRuntimeMs = Number(process.env.PRICE_REFRESH_MAX_RUNTIME_MS) || 240_000;
        const staleHours = Number(process.env.PRICE_REFRESH_STALE_HOURS) || 20;
        const digest = await runOnce(client, { maxFilms, maxRuntimeMs, staleHours });
        return digest.snapshot();
      } finally {
        await client.end().catch(() => {});
      }
    }
    case "send-rate-reminders": {
      const client = pgClient();
      try {
        await client.connect();
        return runRateReminders(client);
      } finally {
        await client.end().catch(() => {});
      }
    }
    case "check-itunes-availability":
      return runItunesAvailabilityCheck(sr());
    case "theater-alerts":
      return runTheaterAlerts(sr());
  }
}

function pgClient(): pg.Client {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  return new pg.Client({ connectionString: databaseUrl });
}

function sr(): SupabaseClient<Database> {
  return serviceRoleClient();
}
