-- Global learnings: cross-client pattern intelligence
-- Aggregates action_learnings across all clients into reusable patterns.
-- Drives the "What's Working Right Now" dashboard and enriches action suggestions.

CREATE TABLE IF NOT EXISTS global_learnings (
  id bigserial PRIMARY KEY,

  -- Classification
  pattern_type text NOT NULL,        -- 'hook' | 'creative' | 'audience' | 'budget' | 'failure' | 'fast_win' | 'other'
  pattern_key text NOT NULL UNIQUE,  -- normalized grouping key, e.g. 'test_new_creative_low_ctr'
  pattern_label text NOT NULL,       -- human-readable, e.g. 'Replace creative when CTR is low'

  -- The recommendation
  action_summary text NOT NULL,      -- 'Test new creative (hook, image, headline)'

  -- Aggregated metrics
  times_seen integer NOT NULL DEFAULT 0,
  unique_clients integer NOT NULL DEFAULT 0,
  positive_count integer NOT NULL DEFAULT 0,
  neutral_count integer NOT NULL DEFAULT 0,
  negative_count integer NOT NULL DEFAULT 0,

  -- Effect size
  avg_ctr_lift numeric,
  avg_cpc_change numeric,
  avg_reliability numeric,

  -- Consistency: % of the time this pattern produced a positive outcome
  consistency_score numeric NOT NULL DEFAULT 0,

  -- Supporting evidence
  sample_learnings jsonb,            -- [{ learning, outcome, ctr_lift, client_id }, ...]
  top_tags text[],

  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_learnings_type ON global_learnings(pattern_type);
CREATE INDEX IF NOT EXISTS idx_global_learnings_consistency ON global_learnings(consistency_score DESC);
CREATE INDEX IF NOT EXISTS idx_global_learnings_times_seen ON global_learnings(times_seen DESC);
