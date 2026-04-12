-- Background jobs: one row per pipeline run (meta sync → score → actions →
-- decisions → global learnings). Lets the UI show a single "last updated X
-- minutes ago" pill instead of five separate buttons.

CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,                         -- 'full_refresh' | 'meta_sync' | ...
  client_id bigint,                           -- null for cross-client runs
  status text NOT NULL DEFAULT 'queued',      -- 'queued' | 'running' | 'done' | 'failed'
  steps jsonb,                                -- [{ name, status, detail }, ...]
  result_summary text,                        -- layman-friendly one-liner
  error text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_type_created ON jobs(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_client_created ON jobs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
