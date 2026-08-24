-- The ad forms have always collected a destination URL — the landing page an
-- ad points at — but the column was never added to `ads` in production. The
-- consequences were all silent:
--
--   * the one-click "campaign + first ad" insert failed outright
--     (PGRST204: Could not find the 'creative_destination_url' column of 'ads'),
--     so the campaign saved and its ad did not;
--   * the "Clone a past winner" query on the new-campaign page selects this
--     column, so it errored and returned nothing — the winners list has simply
--     been empty;
--   * push-ad-to-meta falls back to "https://example.com" when the field is
--     missing, meaning an ad pushed to Meta pointed at example.com.
--
-- Nullable text, no default: existing rows keep no destination, which is what
-- the app already treats as "unset".

alter table public.ads
  add column if not exists creative_destination_url text;
