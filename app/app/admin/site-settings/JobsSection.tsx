"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JOB_META, TRIGGERABLE_JOBS, type JobKey } from "@/lib/cron/job-meta";
import type { CronRunRow } from "@/lib/queries/cron-runs";

function StatusPill({ run }: { run?: CronRunRow }) {
  if (!run) return <span style={{ fontSize: 12, opacity: 0.55 }}>never run</span>;

  const color =
    run.status === "success" ? "var(--accent)" :
    run.status === "error" ? "var(--danger)" :
    "var(--bone)";
  const when = run.finishedAt ?? run.startedAt;
  return (
    <span style={{ color, fontSize: 12 }}>
      {run.status}
      {when ? <> · {new Date(when).toLocaleString()}</> : null}
    </span>
  );
}

function numberStat(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

function statsLine(job: JobKey, run?: CronRunRow): string | null {
  const stats = run?.stats as Record<string, unknown> | null | undefined;
  if (!stats) return null;

  if (stats.skipped === true) {
    return typeof stats.reason === "string" ? stats.reason : "skipped";
  }

  switch (job) {
    case "refresh-prices":
      return `${numberStat(stats.films_refreshed)} indexed · ${numberStat(stats.price_drops)} price drops · ${numberStat(stats.alerts_fired)} alerts`;
    case "send-rate-reminders":
      return `${numberStat(stats.inserted)} reminders queued`;
    case "check-itunes-availability":
      return Object.entries(stats)
        .filter(([, value]) => typeof value === "number" || typeof value === "string" || typeof value === "boolean")
        .slice(0, 4)
        .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
        .join(" · ") || null;
    case "theater-alerts":
      return Object.entries(stats)
        .filter(([, value]) => typeof value === "number" || typeof value === "string" || typeof value === "boolean")
        .slice(0, 4)
        .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
        .join(" · ") || null;
  }
}

export default function JobsSection({ runs }: { runs: Record<string, CronRunRow> }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {TRIGGERABLE_JOBS.map((job) => (
        <JobRow key={job} job={job} initialRun={runs[job]} />
      ))}
    </div>
  );
}

function JobRow({ job, initialRun }: { job: JobKey; initialRun?: CronRunRow }) {
  const router = useRouter();
  const meta = JOB_META[job];
  const [run, setRun] = useState<CronRunRow | undefined>(initialRun);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);

  function runNow() {
    if (meta.notifies && !window.confirm(`Run "${meta.label}" now? This can send notifications to users.`)) return;

    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/jobs/${job}/run`, { method: "POST" });
        const body = await response.json();
        if (!response.ok || body.ok === false) {
          setMessage(`Failed: ${body.error ?? response.status}`);
          return;
        }

        if (body.status === "skipped") {
          const reason = body.stats?.reason ?? "already running";
          setMessage(String(reason));
        } else {
          setMessage("Done.");
        }

        const finishedAt = new Date().toISOString();
        setRun({
          job,
          status: body.status,
          startedAt: finishedAt,
          finishedAt,
          stats: body.stats ?? null,
          errorText: null,
        });
        router.refresh();
      } catch {
        setMessage("Request failed.");
      }
    });
  }

  const detail = statsLine(job, run);

  return (
    <div
      style={{
        alignItems: "center",
        background: "var(--void-2)",
        border: "2px solid var(--bone)",
        display: "flex",
        gap: 16,
        justifyContent: "space-between",
        padding: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="head" style={{ fontSize: 18 }}>{meta.label}</div>
        <div style={{ marginTop: 2 }}><StatusPill run={run} /></div>
        {detail ? <div style={{ fontSize: 12, marginTop: 5, opacity: 0.8 }}>{detail}</div> : null}
        {run?.status === "error" && run.errorText ? (
          <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 5 }}>{run.errorText}</div>
        ) : null}
        {message ? <div style={{ fontSize: 12, marginTop: 5, opacity: 0.9 }}>{message}</div> : null}
      </div>
      <button
        type="button"
        className="btn-outline-bone"
        disabled={pending}
        onClick={runNow}
        style={{ cursor: pending ? "wait" : "pointer", flexShrink: 0 }}
      >
        {pending ? "Running..." : "Run now"}
      </button>
    </div>
  );
}
