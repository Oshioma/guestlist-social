-- Industry-segmented playbook rows.
--
-- The cross-client creative aggregation in /api/generate-global-learnings
-- emits both agency-wide rows ("UGC outperforms by 28% across 4 clients")
-- and now per-industry rows ("UGC outperforms by 41% in hospitality").
-- Both kinds live in the same table; the `industry` column is null for the
-- agency-wide rows and set for the per-industry rows.
--
-- The pattern_key UNIQUE constraint is preserved by encoding the industry
-- as a suffix on the key (e.g. `creative_format:ugc:industry:hospitality`),
-- so we don't need to drop or relax the existing index. The dedicated
-- industry column exists purely so the playbook page can filter cleanly
-- via WHERE industry = $1 instead of LIKE-matching the key.

ALTER TABLE global_learnings ADD COLUMN IF NOT EXISTS industry text;
CREATE INDEX IF NOT EXISTS idx_global_learnings_industry ON global_learnings(industry);
