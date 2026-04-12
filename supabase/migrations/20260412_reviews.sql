-- Client review layer: a saved, narrative summary of what happened in a
-- period (week / month) plus an approval workflow for what to do next.
-- This is the presentation layer that turns the action / decision /
-- learnings backend into something a client can read in 60 seconds.

CREATE TABLE IF NOT EXISTS reviews (
  id bigserial PRIMARY KEY,
  client_id bigint REFERENCES clients(id) ON DELETE CASCADE,

  -- Period the review covers
  period_label text NOT NULL,          -- e.g. "Week of Apr 7", "March 2026"
  period_type text NOT NULL,           -- 'weekly' | 'monthly' | 'adhoc'
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- Lifecycle
  status text NOT NULL DEFAULT 'draft',-- 'draft' | 'sent' | 'approved'
  share_token text UNIQUE,             -- minted when sent

  -- Narrative blocks (deterministic now, LLM-rewritable later)
  headline text,                       -- "Things are improving"
  subhead text,                        -- "You spent £4,820 and got 312 leads…"
  what_happened text,                  -- one paragraph
  what_improved jsonb,                 -- [{ metric, before, after, delta_pct, direction, layman }, ...]
  what_we_tested jsonb,                -- [{ ad_name, hypothesis, result, outcome }, ...]
  what_we_learned jsonb,               -- [{ insight, evidence, pattern_key }, ...]
  what_we_did jsonb,                   -- [{ action, ad_name, outcome }, ...]
  what_next jsonb,                     -- [{ idx, label, detail, type, ad_id?, source_action_id?, source_decision_id? }, ...]

  -- Frozen snapshot of the metrics that drove the review so it never drifts
  metrics_snapshot jsonb,

  generated_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  approved_at timestamp with time zone,
  approved_by text,
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_reviews_client ON reviews(client_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_share_token ON reviews(share_token) WHERE share_token IS NOT NULL;

-- One row per "next step" the client can approve / decline / change
CREATE TABLE IF NOT EXISTS review_approvals (
  id bigserial PRIMARY KEY,
  review_id bigint REFERENCES reviews(id) ON DELETE CASCADE,

  proposal_index integer NOT NULL,             -- index into reviews.what_next
  proposal_label text NOT NULL,
  proposal_detail text,
  proposal_type text NOT NULL,                 -- 'scale' | 'fix' | 'launch' | 'pause' | 'budget'

  status text NOT NULL DEFAULT 'pending',      -- 'pending' | 'approved' | 'declined' | 'changed'
  client_note text,
  decided_at timestamp with time zone,
  decided_by text,

  -- Wired into the action/decision engine when approved
  resulting_action_id uuid REFERENCES ad_actions(id) ON DELETE SET NULL,
  resulting_decision_id bigint REFERENCES ad_decisions(id) ON DELETE SET NULL,

  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_approvals_review ON review_approvals(review_id);
CREATE INDEX IF NOT EXISTS idx_review_approvals_status ON review_approvals(status);
