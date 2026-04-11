-- Client playbooks: auto-summarized from reliable learnings
CREATE TABLE IF NOT EXISTS client_playbooks (
  id bigserial PRIMARY KEY,
  client_id bigint REFERENCES clients(id) ON DELETE CASCADE,
  category text NOT NULL,       -- 'winning_hooks', 'winning_formats', 'failing_patterns', 'audience_insights', 'budget_rules'
  insight text NOT NULL,
  supporting_count integer DEFAULT 1,
  avg_reliability numeric DEFAULT 0,
  tags text[],
  generated_at timestamp with time zone DEFAULT now()
);
