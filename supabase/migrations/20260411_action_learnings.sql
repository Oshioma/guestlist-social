-- Learnings auto-generated from completed action outcomes
CREATE TABLE IF NOT EXISTS action_learnings (
  id bigserial PRIMARY KEY,
  client_id bigint REFERENCES clients(id),
  ad_id bigint REFERENCES ads(id),
  action_id uuid REFERENCES ad_actions(id) ON DELETE SET NULL,
  problem text NOT NULL,
  action_taken text NOT NULL,
  outcome text NOT NULL,              -- 'positive', 'neutral', 'negative'
  metric_before jsonb,
  metric_after jsonb,
  learning text NOT NULL,             -- human-readable summary
  tags text[],                        -- e.g. ['creative', 'ctr', 'hook']
  created_at timestamp with time zone DEFAULT now()
);
