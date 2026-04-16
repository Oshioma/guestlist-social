-- Post-publish insights: reach/engagement data fetched from Meta after
-- a post has been published. The cron at /api/cron/fetch-post-insights
-- runs periodically and fills these columns for posts whose published_at
-- is at least 24h old.

alter table proofer_publish_queue
  add column if not exists meta_post_id text,
  add column if not exists insights_fetched_at timestamptz,
  add column if not exists insights_reach bigint,
  add column if not exists insights_impressions bigint,
  add column if not exists insights_engagement bigint,
  add column if not exists insights_likes bigint,
  add column if not exists insights_comments bigint,
  add column if not exists insights_shares bigint,
  add column if not exists insights_saves bigint;

create index if not exists idx_publish_queue_insights_due
  on proofer_publish_queue(published_at)
  where status = 'published' and insights_fetched_at is null;
