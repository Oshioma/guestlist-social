-- Pattern feedback ledger — closes the prediction loop on global_learnings.
--
-- Background. The decision engine in /api/generate-decisions can produce
-- "pattern-backed" decisions: instead of a per-ad rule of thumb, it consults
-- global_learnings to find a cross-client pattern (e.g. "creative:pause_replace
-- has 75% positive verdicts across 4 clients") and seeds the queue based on
-- that. The executor pushes the change to Meta. captureBaseline records the
-- ad's metrics. measureDueOutcomes (cron, every 6h) reads them again N days
-- later and writes a verdict to decision_outcomes.
--
-- Until now that verdict went into the void. The global_learnings row that
-- *generated* the decision had no idea whether the engine's recommendation
-- worked or not. global_learnings.consistency_score only reflected operator-
-- recorded action_learnings, never the engine's own track record. That's the
-- one-way loop we're closing here.
--
-- Why a separate ledger instead of nudging consistency_score in place? The
-- generate-global-learnings route rebuilds global_learnings via DELETE-then-
-- INSERT on every run (it has to, to clean up patterns whose source learnings
-- were deleted). Any in-place nudge would be wiped on the next rebuild. The
-- ledger here is the durable record of engine-driven verdicts; the rebuild
-- reads it back and folds the counts into the new consistency_score.
--
-- Design notes:
--   - Keyed by (pattern_key, industry). Empty-string industry means
--     agency-wide so we can use a plain composite primary key without
--     COALESCE shenanigans.
--   - Counts are monotonically increasing — we never decrement. A wrong
--     verdict that gets re-classified later would need a separate compensating
--     entry, not an in-place edit. That's the right call: this is a ledger.
--   - last_verdict_at is a convenience for "show me the freshest signal"
--     dashboards. The cumulative counts are the actual feedback signal.

CREATE TABLE IF NOT EXISTS pattern_feedback (
  pattern_key text NOT NULL,
  industry text NOT NULL DEFAULT '',
  engine_uses integer NOT NULL DEFAULT 0,
  positive_verdicts integer NOT NULL DEFAULT 0,
  negative_verdicts integer NOT NULL DEFAULT 0,
  neutral_verdicts integer NOT NULL DEFAULT 0,
  inconclusive_verdicts integer NOT NULL DEFAULT 0,
  last_verdict_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pattern_key, industry)
);

-- Lookups by pattern_key alone (when we don't care which industry slice).
CREATE INDEX IF NOT EXISTS idx_pattern_feedback_key
  ON pattern_feedback (pattern_key);

-- Pattern provenance on the queue row. Without these the verdict has no way
-- to trace back to the originating global_learnings row. source_pattern_key
-- is the pattern_key (e.g. "creative:pause_replace"); source_pattern_industry
-- is the industry slice the engine actually picked (null = agency-wide). Both
-- nullable because rule-engine decisions don't have a pattern source.
ALTER TABLE meta_execution_queue
  ADD COLUMN IF NOT EXISTS source_pattern_key text;

ALTER TABLE meta_execution_queue
  ADD COLUMN IF NOT EXISTS source_pattern_industry text;

-- Index because the verdict path will look up queue rows by id and read these
-- fields, which hits the primary key already, so no extra index there. But
-- we'll occasionally want to ask "show me every pattern_key the engine has
-- used" — partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_meta_execution_queue_source_pattern_key
  ON meta_execution_queue (source_pattern_key)
  WHERE source_pattern_key IS NOT NULL;
