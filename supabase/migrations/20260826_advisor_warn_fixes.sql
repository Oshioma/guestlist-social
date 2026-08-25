-- ---------------------------------------------------------------------------
-- Fixes for the WARN-level findings from Supabase's security advisor.
--
-- 1. Always-true RLS policies. Policies are OR'd, so a USING(true) policy
--    silently defeats every scoped policy beside it. Three exist (the
--    proofer_posts and tasks ones were created outside these migrations):
--      - proofer_posts  "proofer_posts write for authenticated" — let ANY
--        signed-in user, client-portal users included, write any tenant's
--        posts. Dropped; proofer_posts_admin_all (staff), _team_write
--        (posters/proofers) and _portal_select (clients) carry all real use.
--      - tasks "tasks write for authenticated" — same hole. Dropped;
--        tasks_admin carries staff access.
--      - content_pillars content_pillars_all_authenticated (20260422, from
--        before the team RLS). Dropped; _team_write carries posters and
--        proofers, and staff get a proper admin_all policy added here.
--
-- 2. Mutable search_path on SECURITY DEFINER / trigger functions — pinned to
--    public, matching the newer helpers. Guarded by signature so a function
--    that doesn't exist (or was declared differently) is skipped.
--
-- 3. SECURITY DEFINER helpers executable by anon. The RLS helper functions
--    must stay executable by authenticated (policies evaluate them as the
--    querying role), but anon has no business calling any of them, and
--    ensure_personal_team(p_user, …) — which acts on an arbitrary user id —
--    is only ever called on the service role, so it is closed to both.
--
-- 4. postimages bucket listing. The bucket is public (object URLs work
--    without any policy); the two broad SELECT policies only enabled
--    directory listing, which nothing in the app uses from the browser —
--    all storage work goes through the server. Dropped.
--
-- Not fixable from a migration — do these in the Supabase dashboard:
--    - auth_leaked_password_protection: Authentication → Providers →
--      Password → enable leaked-password protection (HaveIBeenPwned check).
--    - extension_in_public (pg_net): moving it can disturb the pg_cron →
--      net.http_post schedules; leave unless Supabase support advises.
-- ---------------------------------------------------------------------------

-- 1. Loose policies.
drop policy if exists "proofer_posts write for authenticated" on public.proofer_posts;
drop policy if exists "tasks write for authenticated" on public.tasks;
drop policy if exists content_pillars_all_authenticated on public.content_pillars;

drop policy if exists content_pillars_admin_all on public.content_pillars;
create policy content_pillars_admin_all on public.content_pillars
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. Pin search_path.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.cashflow_set_amount(bigint, int, numeric)',
    'public.cashflow_fill_right(bigint, int)',
    'public.cashflow_set_retainer(int, int, numeric)',
    'public.sales_week_set_day(bigint, text, int, int)',
    'public.teams_touch_updated_at()',
    'public.user_onboarding_touch_updated_at()',
    'public.update_updated_at()',
    'public.set_updated_at()',
    'public.current_app_role()'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('alter function %s set search_path = public', sig);
    end if;
  end loop;
end $$;

-- 3. Close the RPC surface to anon (and ensure_personal_team entirely).
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.is_admin()',
    'public.my_team_ids()',
    'public.my_role_in(uuid)',
    'public.can_manage_team(uuid)',
    'public.can_post_in_team(uuid)',
    'public.visible_account_ids()',
    'public.visible_client_ids()',
    'public.writable_account_ids()',
    'public.current_app_role()'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from anon', sig);
    end if;
  end loop;

  if to_regprocedure('public.ensure_personal_team(uuid, text)') is not null then
    revoke execute on function public.ensure_personal_team(uuid, text)
      from anon, authenticated;
  end if;
end $$;

-- 4. Stop the public bucket from being listable.
drop policy if exists "postimages public read" on storage.objects;
drop policy if exists "postimages read for authenticated" on storage.objects;
