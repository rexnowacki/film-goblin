import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";

export interface CronRunRow {
  job: string;
  status: "running" | "success" | "error" | "skipped";
  startedAt: string;
  finishedAt: string | null;
  stats: unknown;
  errorText: string | null;
}

type Client = SupabaseClient<Database>;

export async function _getLatestCronRuns(
  client: Client,
  jobs: string[],
): Promise<Record<string, CronRunRow>> {
  const { data, error } = await (client as any)
    .from("cron_runs")
    .select("job, status, started_at, finished_at, stats, error_text")
    .in("job", jobs)
    .order("started_at", { ascending: false });
  if (error || !data) return {};

  const latest: Record<string, CronRunRow> = {};
  for (const row of data as any[]) {
    if (latest[row.job]) continue;
    latest[row.job] = {
      job: row.job,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? null,
      stats: row.stats ?? null,
      errorText: row.error_text ?? null,
    };
  }
  return latest;
}

export async function getLatestCronRuns(jobs: string[]): Promise<Record<string, CronRunRow>> {
  return _getLatestCronRuns(serviceRoleClient(), jobs);
}
