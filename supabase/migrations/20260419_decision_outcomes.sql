-- ---------------------------------------------------------------------------
-- decision_outcomes — close the prediction loop.
--
-- Every executed meta_execution_queue row gets a paired decision_outcomes
-- row with two halves:
--
--   1. baseline_*  — captured at execute time (whatever the ads row reported
--                    most recently from meta-sync)
--   2. followup_*  — captured N days later by /api/measure-decision-outcomes
--
-- The verdict (positive/neutral/negative/inconclusive) is derived from the
-- two snapshots and surfaced on the dashboard so the operator can answer
-- the only question that matters: "is the engine actually right?"
--
-- Notes:
--  - We keep this in its own table (rather than columns on
--    meta_execution_queue) so the queue stays a state machine and the
--    measurement layer can have its own status, retries, and lifecycle.
--  - One-to-one with executed queue rows, enforced by the UNIQUE on
--    queue_id. We never want two outcomes for the same execution.
--  - Both snapshots are stored as raw values (impressions, clicks, spend
--    cents) AND derived ratios (ctr, cpm). Storing both means we can
--    re-derive the verdict later if we change the math, without re-pulling
--    data from Meta.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS decision_outcomes (
  id bigserial PRIMARY KEY,
  queue_id bigint NOT NULL UNIQUE REFERENCES meta_execution_queue(id) ON DELETE CASCADE,
  ad_id bigint REFERENCES ads(id) ON DELETE SET NULL,
  client_id bigint REFERENCES clients(id) ON DELETE SET NULL,
  decision_type text NOT NULL,

  -- ----- Baseline: captured at execute time -----
  baseline_captured_at timestamptz NOT NULL DEFAULT now(),
  baseline_impressions bigint,
  baseline_clicks bigint,
  baseline_spend_cents bigint,
  baseline_ctr numeric,
  baseline_cpm numeric,

  -- ----- Follow-up: captured N days later -----
  followup_due_at timestamptz NOT NULL,
  followup_captured_at timestamptz,
  followup_impressions bigint,
  followup_clicks bigint,
  followup_spend_cents bigint,
  followup_ctr numeric,
  followup_cpm numeric,

  -- ----- Verdict (set when followup runs) -----
  ctr_lift_pct numeric,
  cpm_change_pct numeric,
  verdict text,         -- positive | neutral | negative | inconclusive
  verdict_reason text,

  status text NOT NULL DEFAULT 'awaiting_followup',  -- awaiting_followup | measured | failed
  measured_at timestamptz,
  error text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- The follow-up sweep needs to find rows whose followup_due_at has passed.
CREATE INDEX IF NOT EXISTS idx_decision_outcomes_due
  ON decision_outcomes(status, followup_due_at)
  WHERE status = 'awaiting_followup';

-- The dashboard widget filters by measured_at + verdict.
CREATE INDEX IF NOT EXISTS idx_decision_outcomes_measured
  ON decision_outcomes(measured_at DESC)
  WHERE status = 'measured';
