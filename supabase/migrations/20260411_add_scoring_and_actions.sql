-- Add performance scoring columns to ads
ALTER TABLE ads ADD COLUMN IF NOT EXISTS performance_status text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS performance_score integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS performance_reason text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS last_scored_at timestamp with time zone;

-- Create ad_actions table for tracking suggested actions
CREATE TABLE IF NOT EXISTS ad_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id bigint REFERENCES ads(id),
  problem text,
  action text,
  priority text,
  status text DEFAULT 'pending',
  result text,
  created_at timestamp with time zone DEFAULT now()
);
