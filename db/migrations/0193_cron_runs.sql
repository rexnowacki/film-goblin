-- Persisted history of background-job runs (cron + manual admin triggers).

CREATE TABLE IF NOT EXISTS cron_runs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job          TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'error', 'skipped')),
  stats        JSONB,
  error_text   TEXT,
  triggered_by TEXT        NOT NULL DEFAULT 'cron'
                 CHECK (triggered_by IN ('cron', 'manual'))
);

CREATE INDEX IF NOT EXISTS cron_runs_job_started_idx
  ON cron_runs (job, started_at DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. RLS-on + zero policies denies anon/authed.
