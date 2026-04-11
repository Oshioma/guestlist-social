-- Decision queue: system-generated decisions awaiting approval
CREATE TABLE IF NOT EXISTS ad_decisions (
  id bigserial PRIMARY KEY,
  client_id bigint REFERENCES clients(id) ON DELETE CASCADE,
  ad_id bigint REFERENCES ads(id) ON DELETE CASCADE,
  type text NOT NULL,               -- 'scale_budget', 'pause_or_replace', 'kill_test', 'apply_known_fix', 'apply_winning_pattern'
  reason text NOT NULL,
  action text NOT NULL,
  confidence text NOT NULL,         -- 'low', 'medium', 'high'
  meta_action text,                 -- optional: 'pause', 'unpause', 'update_budget'
  status text DEFAULT 'pending',    -- 'pending', 'approved', 'rejected', 'executed'
  approved_at timestamp with time zone,
  executed_at timestamp with time zone,
  execution_result text,
  created_at timestamp with time zone DEFAULT now()
);
