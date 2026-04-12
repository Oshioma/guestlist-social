-- Make global_learnings.pattern_key + industry a composite identifier.
--
-- Background. The original 20260412_global_learnings migration declared
-- `pattern_key text NOT NULL UNIQUE`. The 20260417 industry migration then
-- added an `industry` column to support per-industry slices, but kept the
-- bare-pattern_key UNIQUE constraint by encoding the industry as a suffix
-- on the key string (e.g. `creative_format:ugc:industry:hospitality`). The
-- comment in that migration explicitly called this a workaround.
--
-- That workaround is now blocking us:
--   1. The decision engine in /api/generate-decisions reads global_learnings
--      keyed on the *bare* pattern_key plus the `industry` column —
--      buildPatternIndex(rows, industry) expects pattern_key='budget:scale_up'
--      and industry='hospitality' as separate fields.
--   2. The pattern_feedback ledger (20260420_pattern_feedback) keys on the
--      composite (pattern_key, industry) with empty-string for agency-wide.
--      Joining UI badges, engine lookups, and feedback rows all assumed
--      bare keys; only the *generator* was suffixing.
--   3. We're adding industry-aware action patterns (this commit) — without
--      this migration the generator can't write a per-industry budget:scale_up
--      row alongside the agency-wide one because they share a pattern_key.
--
-- Drop the bare UNIQUE, add a composite UNIQUE on (pattern_key, industry)
-- with COALESCE so null = empty string for matching. After this lands the
-- generator can stop encoding industry into the pattern_key string.
--
-- Idempotent: the DROP CONSTRAINT IF EXISTS handles re-runs, and the new
-- index name is distinct from any existing one.

-- The original UNIQUE was created without an explicit constraint name, so
-- Postgres named it `global_learnings_pattern_key_key`. Dropping by that
-- name is the standard convention for `column UNIQUE` shorthand.
ALTER TABLE global_learnings
  DROP CONSTRAINT IF EXISTS global_learnings_pattern_key_key;

-- Composite uniqueness. Using a unique index with COALESCE lets nulls and
-- empty strings collapse, so an agency-wide row (industry IS NULL) and
-- another agency-wide row with industry='' would still collide if both
-- were ever inserted with the same key. The generator only writes NULL
-- for agency-wide, so this is purely defensive.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_global_learnings_pattern_industry
  ON global_learnings (pattern_key, COALESCE(industry, ''));
