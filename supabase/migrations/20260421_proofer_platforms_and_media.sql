-- Proofer: platform variants + multi-image carousels.
--
-- #3 (Platform picker): one proofer_posts row per (client_id, post_date,
-- platform) instead of per (client_id, post_date). Each platform gets its
-- own caption, media, status, comments and publish queue.
--
-- #5 (Multi-image carousels): add media_urls text[] so a single day/platform
-- can hold an ordered list of images/videos. image_url is kept in sync with
-- media_urls[0] for back-compat with consumers that still read the single
-- column (e.g. the publish queue board).

begin;

-- #3 ---------------------------------------------------------------------
alter table public.proofer_posts
  add column if not exists platform text not null default 'instagram_feed';

-- Drop the old (client_id, post_date) unique constraint if it exists. We
-- look it up by shape rather than name because the original migration may
-- have used an auto-generated constraint name.
do $$
declare
  cons_name text;
begin
  select c.conname
    into cons_name
  from pg_constraint c
  where c.conrelid = 'public.proofer_posts'::regclass
    and c.contype = 'u'
    and (
      select array_agg(a.attname order by a.attnum)
      from unnest(c.conkey) as k(attnum)
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = k.attnum
    ) = array['client_id','post_date']::name[];

  if cons_name is not null then
    execute format('alter table public.proofer_posts drop constraint %I', cons_name);
  end if;
end$$;

-- Create the new composite unique constraint.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'proofer_posts_client_id_post_date_platform_key'
      and conrelid = 'public.proofer_posts'::regclass
  ) then
    alter table public.proofer_posts
      add constraint proofer_posts_client_id_post_date_platform_key
      unique (client_id, post_date, platform);
  end if;
end$$;

-- #5 ---------------------------------------------------------------------
alter table public.proofer_posts
  add column if not exists media_urls text[] not null default '{}';

-- Backfill media_urls from existing image_url so single images become
-- one-item carousels and the existing UI keeps working.
update public.proofer_posts
set media_urls = array[image_url]
where (media_urls is null or cardinality(media_urls) = 0)
  and image_url is not null
  and image_url <> '';

commit;
