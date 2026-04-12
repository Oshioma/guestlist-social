-- Expand Meta data capture: delivery quality, funnel, conversion detail,
-- video, creative structure, Meta rankings, raw effective status, and
-- breakdown tables for placement + demographics.
--
-- Purely additive: every column/table is new. Nothing in the existing
-- scoring, action, or learning pipelines references these yet — they get
-- populated by the next meta sync and read by later scoring upgrades.

-- ---------------------------------------------------------------------------
-- ads: delivery quality + efficiency
-- ---------------------------------------------------------------------------
ALTER TABLE ads ADD COLUMN IF NOT EXISTS reach bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS frequency numeric;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cpm numeric;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cpp numeric;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS unique_clicks bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS unique_ctr numeric;

-- ads: funnel
ALTER TABLE ads ADD COLUMN IF NOT EXISTS inline_link_clicks bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS outbound_clicks bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS landing_page_views bigint;

-- ads: conversion detail (split out the ones we score on; jsonb for the rest)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS purchases integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS leads integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS add_to_cart integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS initiate_checkout integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS complete_registration integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS view_content integer;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS actions_raw jsonb;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cost_per_action_raw jsonb;

-- ads: video
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_plays bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_thruplays bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_avg_watch_seconds numeric;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_p25 bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_p50 bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_p75 bigint;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS video_p100 bigint;

-- ads: creative structure
ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_type text;           -- IMAGE|VIDEO|CAROUSEL|DYNAMIC
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cta_type text;                -- LEARN_MORE|SHOP_NOW|...
ALTER TABLE ads ADD COLUMN IF NOT EXISTS destination_url text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS object_story_id text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS asset_feed_spec jsonb;

-- ads: Meta rankings (relative to other advertisers)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS quality_ranking text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS engagement_rate_ranking text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS conversion_rate_ranking text;

-- ads: raw Meta truth separate from app scoring
ALTER TABLE ads ADD COLUMN IF NOT EXISTS meta_effective_status text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS meta_configured_status text;

-- ---------------------------------------------------------------------------
-- Breakdown tables: one row per ad × dimension bucket.
-- Do NOT cram breakdowns onto ads — combinatorial explosion.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_placement_insights (
  id bigserial PRIMARY KEY,
  ad_id bigint REFERENCES ads(id) ON DELETE CASCADE,
  client_id bigint,
  publisher_platform text,
  platform_position text,
  device_platform text,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric DEFAULT 0,
  ctr numeric,
  cpm numeric,
  actions jsonb,
  date_start date,
  date_stop date,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (ad_id, publisher_platform, platform_position, device_platform, date_start, date_stop)
);

CREATE INDEX IF NOT EXISTS idx_ad_placement_insights_ad ON ad_placement_insights(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_placement_insights_client ON ad_placement_insights(client_id);

CREATE TABLE IF NOT EXISTS ad_demographic_insights (
  id bigserial PRIMARY KEY,
  ad_id bigint REFERENCES ads(id) ON DELETE CASCADE,
  client_id bigint,
  age text,
  gender text,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric DEFAULT 0,
  ctr numeric,
  actions jsonb,
  date_start date,
  date_stop date,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (ad_id, age, gender, date_start, date_stop)
);

CREATE INDEX IF NOT EXISTS idx_ad_demographic_insights_ad ON ad_demographic_insights(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_demographic_insights_client ON ad_demographic_insights(client_id);
