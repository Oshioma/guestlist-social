-- ---------------------------------------------------------------------------
-- ad_actions.operator_note — a one-line, human-written gloss the operator
-- adds when completing an action.
--
-- Distinct from `result_summary`, which holds either the operator's typed
-- summary OR the auto-generated reasons string from /api/complete-action.
-- The note is purely the operator's voice — it surfaces in the audit trail
-- and the next review verbatim, so the client gets context that the metric
-- delta alone doesn't carry ("we changed the lifestyle imagery to lean
-- darker — same offer, totally different aesthetic").
-- ---------------------------------------------------------------------------
ALTER TABLE ad_actions
  ADD COLUMN IF NOT EXISTS operator_note text;
