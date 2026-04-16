-- Audit trail for every write to the Meta Graph API.
--
-- Three surfaces write to Meta: the decision executor (pause/budget/
-- duplicate), the campaign creator (campaign + adset), and the social
-- publisher (posts + stories). This table captures every POST so the
-- operator can answer "what did we actually send to Meta, and when?"
-- without digging through server logs.

CREATE TABLE IF NOT EXISTS meta_write_log (
  id bigserial PRIMARY KEY,

  -- What triggered the write. One of:
  --   execute:pause_ad, execute:increase_budget, execute:decrease_budget,
  --   execute:duplicate_ad, campaign:create_campaign, campaign:create_adset,
  --   publish:facebook, publish:instagram, publish:instagram_story
  operation text NOT NULL,

  -- Optional foreign keys into the tables that triggered the write.
  -- All nullable because not every write has a local row yet (e.g.
  -- campaign creation writes to Meta before the local insert).
  client_id bigint REFERENCES clients(id) ON DELETE SET NULL,
  ad_id bigint REFERENCES ads(id) ON DELETE SET NULL,
  campaign_id bigint,
  queue_id bigint,

  -- What we sent.
  meta_endpoint text NOT NULL,          -- e.g. "/act_123/campaigns"
  request_body jsonb,                   -- the URLSearchParams (tokens redacted)

  -- What came back.
  response_status integer,              -- HTTP status code
  response_body jsonb,                  -- full response (tokens redacted)
  success boolean NOT NULL DEFAULT false,
  error_message text,

  -- Timing.
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_write_log_operation
  ON meta_write_log(operation);
CREATE INDEX IF NOT EXISTS idx_meta_write_log_client
  ON meta_write_log(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_write_log_created
  ON meta_write_log(created_at DESC);
