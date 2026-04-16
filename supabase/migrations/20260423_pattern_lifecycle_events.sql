-- Pattern lifecycle audit log.
--
-- Background. pattern_feedback already records the *current* state of each
-- pattern slice (verdict counts, retired_at flag, retired_reason). What it
-- doesn't record is the trail: when did the reaper retire this pattern? was
-- it unretired by an operator before? what did the verdict counts look like
-- the moment it was retired? Right now that history is reconstructible only
-- from cron logs, which is fine until you actually need it ("why is this
-- pattern back in play after we killed it?").
--
-- Solution. A small append-only table keyed on the same (pattern_key,
-- industry) shape, with one row per state change. The reaper writes a
-- 'retired' event after each successful sweep update; the unretire route
-- writes an 'unretired' event when an operator overrides. The verdict
-- counts at the moment of the event are snapshotted so the row stands
-- alone — you don't need to cross-reference pattern_feedback as it exists
-- now to read the history.
--
-- Append-only by convention (no UPDATE / DELETE in app code). If we ever
-- need to redact, do it via a manual DB migration with a reason.

CREATE TABLE IF NOT EXISTS pattern_lifecycle_events (
  id bigserial PRIMARY KEY,
  pattern_key text NOT NULL,
  -- '' = agency-wide slice, same convention as pattern_feedback's PK shape
  -- so the join from one to the other is direct.
  industry text NOT NULL DEFAULT '',
  -- 'retired' | 'unretired'. Kept loose (text, not enum) so we can add
  -- 'reseeded' or similar later without a schema migration.
  event_type text NOT NULL,
  -- Free-form. For 'retired' this is the same string we stamped onto
  -- pattern_feedback.retired_reason ("8 of 10 verdicts negative (80%)").
  -- For 'unretired' it's the operator's typed note (or null if they
  -- didn't leave one).
  reason text NULL,
  -- 'reaper' | operator email | 'system'. Lets the dashboard say
  -- "retired by the reaper on Tue" vs "brought back by nelly@...".
  actor text NOT NULL,
  -- Verdict counts at the moment of the event. Lets the audit row stand
  -- alone without re-joining pattern_feedback — useful when investigating
  -- "what did we know when we made this call?".
  positive_at_event integer NULL,
  negative_at_event integer NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Most reads are "give me the timeline for this slice" — newest first
-- by occurred_at. Composite index covers it cleanly.
CREATE INDEX IF NOT EXISTS idx_pattern_lifecycle_events_slice
  ON pattern_lifecycle_events (pattern_key, industry, occurred_at DESC);

-- Secondary read pattern: "show me everything the reaper did this week"
-- for the dashboard banner. Index on (event_type, occurred_at DESC) keeps
-- that scan cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_pattern_lifecycle_events_recent
  ON pattern_lifecycle_events (event_type, occurred_at DESC);
