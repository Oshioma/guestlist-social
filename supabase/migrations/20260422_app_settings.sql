-- Generic key/value app settings.
--
-- One-row-per-key store for tunable runtime knobs that operators can
-- adjust without a deploy. First customer is the reaper threshold pair,
-- but the table is deliberately schemaless (jsonb value) so future
-- settings can land here without a migration each time.
--
-- Why a separate table rather than columns on `clients` or a singleton
-- "agency" row: the reaper threshold isn't per-client (the engine is
-- agency-wide), and a singleton row would force a migration for every
-- new key. Key/value with jsonb is the right shape for "operator-tunable
-- agency-wide knobs".
--
-- Reads are cached by the page that needs them; writes are rare (operator
-- clicks Save). No need for an index beyond the primary key.

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
