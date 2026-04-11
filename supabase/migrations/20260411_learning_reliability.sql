-- Learning reliability scoring
ALTER TABLE action_learnings ADD COLUMN IF NOT EXISTS times_seen integer DEFAULT 1;
ALTER TABLE action_learnings ADD COLUMN IF NOT EXISTS reliability_score numeric DEFAULT 0;
ALTER TABLE action_learnings ADD COLUMN IF NOT EXISTS avg_ctr_lift numeric;
ALTER TABLE action_learnings ADD COLUMN IF NOT EXISTS avg_cpc_change numeric;
