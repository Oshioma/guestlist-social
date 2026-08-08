-- ---------------------------------------------------------------------------
-- Teams, part 2 (posting): let team posters work the Proofer board.
--
-- A team poster is a member/admin/owner of a team (NOT a client). The Proofer
-- board's server actions all run through the RLS (authed) client, so up to now
-- only is_admin() staff could write — a non-staff member could see their
-- team's board but every save/status/comment/queue write was denied by RLS.
--
-- This grants posters scoped WRITE (and read) on exactly the tables the board
-- mutates, keyed on the account (client) being in a team where the caller has
-- a posting role. Clients (role 'client') are excluded from
-- writable_account_ids(), so they stay read-only — their approve/comment
-- actions continue to run through the service-role client in portal actions.
--
-- Live Meta publishing is unaffected: it happens in the admin-only publish
-- queue page via the service-role publishMetaQueueItem(), which posters can't
-- reach. Posters draft, caption, schedule and proof; staff push to Meta.
--
-- These are additive permissive policies (combined with the existing
-- *_admin policies via OR), so staff access is unchanged.
-- ---------------------------------------------------------------------------

begin;

-- Accounts the current user may POST to: those in any team where they hold a
-- posting role. Excludes 'client' (view/approve only). SECURITY DEFINER so it
-- bypasses RLS on team_* and can be referenced from policies without
-- recursion, matching the other helpers.
create or replace function public.writable_account_ids()
returns setof bigint
language sql stable security definer set search_path = public as $$
  select distinct ta.client_id
  from public.team_accounts ta
  join public.team_members tm on tm.team_id = ta.team_id
  where tm.user_id = auth.uid()
    and tm.role in ('owner', 'admin', 'member');
$$;

-- ── Client-id-keyed board tables ────────────────────────────────────────────
drop policy if exists proofer_posts_team_write on public.proofer_posts;
create policy proofer_posts_team_write on public.proofer_posts
  for all to authenticated
  using (client_id in (select public.writable_account_ids()))
  with check (client_id in (select public.writable_account_ids()));

drop policy if exists content_pillars_team_write on public.content_pillars;
create policy content_pillars_team_write on public.content_pillars
  for all to authenticated
  using (client_id in (select public.writable_account_ids()))
  with check (client_id in (select public.writable_account_ids()));

drop policy if exists post_ideas_team_write on public.post_ideas;
create policy post_ideas_team_write on public.post_ideas
  for all to authenticated
  using (client_id in (select public.writable_account_ids()))
  with check (client_id in (select public.writable_account_ids()));

-- ── Post-id-keyed board tables (scope via the parent post's account) ─────────
drop policy if exists proofer_comments_team_write on public.proofer_comments;
create policy proofer_comments_team_write on public.proofer_comments
  for all to authenticated
  using (
    exists (
      select 1 from public.proofer_posts p
      where p.id = proofer_comments.post_id
        and p.client_id in (select public.writable_account_ids())
    )
  )
  with check (
    exists (
      select 1 from public.proofer_posts p
      where p.id = proofer_comments.post_id
        and p.client_id in (select public.writable_account_ids())
    )
  );

drop policy if exists proofer_publish_queue_team_write on public.proofer_publish_queue;
create policy proofer_publish_queue_team_write on public.proofer_publish_queue
  for all to authenticated
  using (
    exists (
      select 1 from public.proofer_posts p
      where p.id = proofer_publish_queue.post_id
        and p.client_id in (select public.writable_account_ids())
    )
  )
  with check (
    exists (
      select 1 from public.proofer_posts p
      where p.id = proofer_publish_queue.post_id
        and p.client_id in (select public.writable_account_ids())
    )
  );

commit;
