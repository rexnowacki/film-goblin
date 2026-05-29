import * as Sentry from "@sentry/node";
import type { serviceRoleClient } from "@/lib/supabase/service-role";

type ServiceRoleClient = ReturnType<typeof serviceRoleClient>;
type RunStatus = "success" | "skipped";

export type RecordCronRunResult =
  | { ok: true; status: RunStatus; stats: unknown }
  | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isSkipped(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { skipped?: unknown }).skipped === true;
}

async function updateRun(
  sr: ServiceRoleClient,
  id: number | string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (id == null) return;
  try {
    await (sr as any).from("cron_runs").update(patch).eq("id", id);
  } catch {
    // Recording must never make a completed job fail after the fact.
  }
}

export async function recordCronRun(
  sr: ServiceRoleClient,
  job: string,
  triggeredBy: "cron" | "manual",
  fn: () => Promise<unknown>,
): Promise<RecordCronRunResult> {
  let id: number | string | null = null;

  try {
    const { data, error } = await (sr as any)
      .from("cron_runs")
      .insert({ job, status: "running", triggered_by: triggeredBy })
      .select("id")
      .single();
    if (!error) id = data?.id ?? null;
  } catch {
    // If the history table is temporarily unavailable, still run the job.
  }

  try {
    const stats = await fn();
    const status: RunStatus = isSkipped(stats) ? "skipped" : "success";
    await updateRun(sr, id, { status, stats, finished_at: new Date().toISOString() });
    return { ok: true, status, stats };
  } catch (err) {
    const error = errorMessage(err);
    Sentry.captureException(err);
    await updateRun(sr, id, {
      status: "error",
      error_text: error,
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error };
  }
}
