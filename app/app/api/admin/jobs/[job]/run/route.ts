import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { acquireCronLock } from "@/lib/theaters/lock";
import { isJobKey } from "@/lib/cron/job-meta";
import { runJobByKey } from "@/lib/cron/jobs";
import { recordCronRun } from "@/lib/cron/record-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ job: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  if (!isJobKey(job)) {
    return NextResponse.json({ error: "unknown job" }, { status: 400 });
  }

  if ((job === "refresh-prices" || job === "send-rate-reminders") && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
  }

  const sr = serviceRoleClient();
  const locked = await acquireCronLock(sr, job);
  if (!locked) {
    return NextResponse.json({
      ok: true,
      status: "skipped",
      stats: { skipped: true, reason: "already running" },
    });
  }

  const result = await recordCronRun(sr, job, "manual", () => runJobByKey(job));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
