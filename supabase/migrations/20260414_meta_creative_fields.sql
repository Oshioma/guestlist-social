-- Meta creative trust layer.
--
-- Pairs every ad with the structured creative fields the engine needs to
-- start saying useful things like "UGC videos with how-to hooks beat product
-- shots by 28% CTR" instead of vague "creative is weak". The previous
-- 20260412_meta_expanded_signals migration already added `creative_type` and
-- some structural fields; this layer adds the human-readable bits (image,
-- headline, body, CTA) plus two classifier columns the sync writes from
-- rule-based heuristics.
--
-- All additive — old code paths keep working, new code paths read these
-- columns when present.

ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_image_url text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_video_url text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_body text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_headline text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS creative_cta text;

-- Classifier outputs. Both nullable — we never force a label when the
-- heuristic isn't confident. Values are short snake_case strings so they
-- aggregate cleanly.
--
-- hook_type one of: direct_offer | curiosity | problem_solution |
--                   testimonial | how_to | emotional
-- format_style one of: talking_head | product_shot | ugc | graphic |
--                      text_heavy
ALTER TABLE ads ADD COLUMN IF NOT EXISTS hook_type text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS format_style text;
