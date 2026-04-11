-- Extend ad_actions with outcome tracking columns
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS hypothesis text;
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS metric_snapshot_before jsonb;
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS metric_snapshot_after jsonb;
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS outcome text;          -- 'positive', 'neutral', 'negative'
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS result_summary text;
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Separate outcomes table for full history (one action can have multiple check-ins)
CREATE TABLE IF NOT EXISTS action_outcomes (
  id bigserial PRIMARY KEY,
  action_id uuid REFERENCES ad_actions(id) ON DELETE CASCADE,
  metric_snapshot_before jsonb,
  metric_snapshot_after jsonb,
  outcome text,
  result_summary text,
  created_at timestamp with time zone DEFAULT now()
);
