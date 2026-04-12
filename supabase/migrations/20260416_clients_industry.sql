-- Add industry classification to clients.
--
-- Powers cross-client / cross-industry pattern segmentation. The Pattern
-- Engine wants to be able to say "underperforms in 3 industries" — that
-- requires every client to carry an industry tag.
--
-- Free text rather than an enum so operators can add new industries
-- without a migration. Indexed because the playbook page filters on it.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry text;

CREATE INDEX IF NOT EXISTS idx_clients_industry ON clients(industry);
