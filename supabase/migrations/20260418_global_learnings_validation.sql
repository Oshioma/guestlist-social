-- Backward-validation columns for global_learnings.
--
-- Every generator run currently delete+inserts the entire table, so a
-- pattern that drifts has no signal of "this used to be stronger" — it
-- just silently changes. These two columns let the generator carry the
-- previous run's stats forward by pattern_key, so the UI can render
-- "↓ slipping" and "✨ new" badges without a separate history table.
--
-- Both nullable: a row that's never been seen before has no prev values,
-- and we use that absence to flag "new" patterns on the dashboard.

ALTER TABLE global_learnings
  ADD COLUMN IF NOT EXISTS prev_consistency_score numeric,
  ADD COLUMN IF NOT EXISTS prev_unique_clients integer;
