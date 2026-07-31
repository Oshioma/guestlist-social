-- Proofer: choose publish destinations on the board instead of the queue page.
--
-- Until now "which channels does this go to" was decided on the publish queue
-- page ("Queue for Instagram" / "Queue for Facebook" / "Queue both"), while
-- proofer_posts.platform doubled as both the Instagram *format* and, for the
-- value 'facebook', a whole separate draft with its own caption and media.
--
-- Splitting the two concepts:
--
--   proofer_posts.platform         -> the Instagram format only
--                                     (instagram_feed | instagram_story |
--                                      instagram_reel). meta-publish already
--                                      reads this to decide story vs feed.
--   proofer_posts.publish_targets  -> the destinations: 'instagram' and/or
--                                     'facebook'. One caption and one set of
--                                     media now fan out to both.
--
-- This migration is deliberately additive: it adds a column and backfills it.
-- No row is deleted, merged or rewritten, so nothing a client has already
-- approved can be lost. Legacy platform='facebook' rows are left in place and
-- the board still surfaces them (see ProoferBoard's legacy handling) so their
-- captions stay reachable rather than being silently orphaned.

begin;

alter table public.proofer_posts
  add column if not exists publish_targets text[] not null default '{}';

-- Only the two destinations the publish queue understands are valid.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'proofer_posts_publish_targets_valid'
      and conrelid = 'public.proofer_posts'::regclass
  ) then
    alter table public.proofer_posts
      add constraint proofer_posts_publish_targets_valid
      check (publish_targets <@ array['instagram','facebook']::text[]);
  end if;
end$$;

-- Backfill from the existing platform column so every current post keeps
-- publishing exactly where it publishes today.
update public.proofer_posts
set publish_targets = array['facebook']
where cardinality(publish_targets) = 0
  and platform = 'facebook';

update public.proofer_posts
set publish_targets = array['instagram']
where cardinality(publish_targets) = 0
  and platform like 'instagram%';

-- Anything with an unrecognised platform still needs a sane default.
update public.proofer_posts
set publish_targets = array['instagram']
where cardinality(publish_targets) = 0;

commit;
