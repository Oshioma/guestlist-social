-- Add adset_meta_id to ads.
--
-- The Meta execution queue's increase_adset_budget action targets ad sets
-- by their Meta id, but until now we only stored the campaign_meta_id on
-- ads. The decision engine doesn't have anywhere to look up the ad set Meta
-- id when it wants to seed a budget bump, so we cache it on the ad row at
-- sync time.
--
-- (We deliberately do not create a full adsets table yet. The only reason
-- this column exists is to give the queue seeder a Meta id to attach to a
-- proposed change — when the executor runs, it re-fetches live ad-set
-- state from Meta, so we never trust a stale cached budget here.)

ALTER TABLE ads ADD COLUMN IF NOT EXISTS adset_meta_id text;

CREATE INDEX IF NOT EXISTS idx_ads_adset_meta_id ON ads(adset_meta_id);
