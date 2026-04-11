-- Structured experiments for A/B testing
CREATE TABLE IF NOT EXISTS experiments (
  id bigserial PRIMARY KEY,
  client_id bigint REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id bigint REFERENCES campaigns(id) ON DELETE SET NULL,
  ad_id bigint REFERENCES ads(id) ON DELETE SET NULL,
  title text NOT NULL,
  hypothesis text,
  variable_tested text,
  baseline_label text DEFAULT 'control',
  variant_label text DEFAULT 'variant',
  success_metric text,
  secondary_metric text,
  status text DEFAULT 'planned',
  outcome text,
  winner text,
  confidence text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Track control vs variant clearly
CREATE TABLE IF NOT EXISTS experiment_variants (
  id bigserial PRIMARY KEY,
  experiment_id bigint REFERENCES experiments(id) ON DELETE CASCADE,
  ad_id bigint REFERENCES ads(id) ON DELETE CASCADE,
  label text NOT NULL,
  role text NOT NULL,  -- 'control' or 'variant'
  notes text,
  snapshot_before jsonb,
  snapshot_after jsonb,
  created_at timestamp with time zone DEFAULT now()
);
