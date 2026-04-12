-- Link suggested actions to the global learning pattern that validates them.
-- Purely additive: existing code paths keep working, the new columns are
-- only populated by generate-actions when a matching pattern is found.
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS validated_by text;
ALTER TABLE ad_actions ADD COLUMN IF NOT EXISTS validated_pattern_key text;
