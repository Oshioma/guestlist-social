-- Collapse the two-step "proof, then queue" flow into one.
--
-- Previously a post had to be proofed on the proofer AND then manually
-- "added to the publish queue" on the publish page before it could be
-- scheduled. The app now creates the queued rows automatically the moment a
-- post is proofed/approved (see updateProoferStatusAction), so the separate
-- "Ready to queue" step is gone.
--
-- This backfills posts that were proofed/approved *before* that change and
-- never got queued, so they show up in the queue (status "queued", awaiting
-- a send time) rather than being stranded.
--
-- A post can publish to more than one destination, so we insert one queued
-- row per publish target (mirroring the app's queueProoferPostToTargetsAction
-- and updateProoferStatusAction). The per-(post, platform) NOT EXISTS guard
-- means targets already in the queue — scheduled, published, or otherwise —
-- are left untouched, and only missing targets are added.
--
-- Must run after 20260731_proofer_publish_targets.sql (which adds the
-- publish_targets column and backfills it); the 0801 date guarantees that
-- ordering on a fresh database.

insert into public.proofer_publish_queue (post_id, platform, status, created_by, updated_at)
select
  p.id,
  t.platform,
  'queued',
  coalesce(p.updated_by, p.created_by, 'system'),
  now()
from public.proofer_posts p
cross join lateral (
  select unnest(
    case
      when cardinality(p.publish_targets) > 0 then p.publish_targets
      when p.platform = 'facebook' then array['facebook']
      else array['instagram']
    end
  ) as platform
) t
where p.status in ('proofed', 'approved')
  and not exists (
    select 1
    from public.proofer_publish_queue q
    where q.post_id = p.id
      and q.platform = t.platform
  );
