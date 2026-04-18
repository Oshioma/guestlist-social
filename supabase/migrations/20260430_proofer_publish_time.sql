-- Per-post publish time so the proofer board can set when a post should go
-- live. Stored as "HH:MM" in UTC (e.g. "18:00" for 6 PM GMT). Defaults to
-- 18:00. When the post is queued for publishing, post_date + publish_time
-- becomes the default scheduled_for timestamp.

alter table public.proofer_posts
  add column if not exists publish_time text not null default '18:00';
