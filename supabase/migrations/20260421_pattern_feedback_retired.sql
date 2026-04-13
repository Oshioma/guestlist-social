-- Stale pattern reaper: retirement state on pattern_feedback.
--
-- Background. The engine runs pattern-backed decisions through
-- /api/generate-decisions, the executor pushes them to Meta, and
-- measureDueOutcomes writes verdicts into pattern_feedback. So far so
-- good — but until now nothing acted on a sustained bad track record.
-- A pattern with 8 negative verdicts and 1 positive would still be
-- consulted on every run, because the engine's "block" path is in-memory
-- and recomputes every request from raw counts. Operators had to spot
-- the red badge themselves and edit global_learnings by hand.
--
-- Why the columns live here, not on global_learnings: global_learnings
-- is rebuilt via DELETE-then-INSERT every time generate-global-learnings
-- runs (see route comment). Any retirement flag stored there would be
-- wiped on the next rebuild. pattern_feedback is the durable ledger
-- keyed on the same (pattern_key, industry) shape, so retirement state
-- belongs alongside the verdict counts that justify it.
--
-- Two columns:
--   • retired_at — null = active, timestamptz = retired (and when)
--   • retired_reason — short human-readable string for the dashboard
--     ("8 of 10 verdicts negative (80%)") so an operator looking at a
--     retired pattern can see the math without re-querying the ledger.
--
-- A nullable retired_at also lets us "unretire" a pattern by setting
-- the column back to null — useful if the cron mis-fires or a pattern
-- recovers (verdicts can swing positive after a retirement window).

ALTER TABLE pattern_feedback
  ADD COLUMN IF NOT EXISTS retired_at timestamptz NULL;

ALTER TABLE pattern_feedback
  ADD COLUMN IF NOT EXISTS retired_reason text NULL;

-- Most queries are "show me the active patterns" (engine reads, dashboard
-- reads). Partial index on retired_at IS NULL keeps the scan cheap as the
-- ledger grows and the retired set becomes long-tail.
CREATE INDEX IF NOT EXISTS idx_pattern_feedback_active
  ON pattern_feedback (pattern_key, industry)
  WHERE retired_at IS NULL;
