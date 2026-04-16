-- ---------------------------------------------------------------------------
-- RLS policies: scope portal users to their own client data.
--
-- Admin = auth user with NO rows in client_user_links → full access.
-- Portal = auth user WITH rows in client_user_links → read-only on
--          their linked client(s) data.
--
-- The middleware already gates UI routes, but without RLS a portal user
-- could bypass the UI and hit the Supabase REST API directly. These
-- policies close that gap.
-- ---------------------------------------------------------------------------

begin;

-- Helper: returns true if the current auth user is an admin (no client links).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from client_user_links
    where auth_user_id = auth.uid()
  );
$$;

-- Helper: returns the client IDs the current user can see.
-- Admins see all clients; portal users see only their linked clients.
create or replace function public.visible_client_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then id
    else null
  end
  from clients
  where public.is_admin()
  union all
  select client_id from client_user_links
  where auth_user_id = auth.uid()
    and not public.is_admin();
$$;

-- ── clients ──────────────────────────────────────────────────────────
alter table public.clients enable row level security;

create policy clients_admin_all on public.clients
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy clients_portal_select on public.clients
  for select to authenticated
  using (id in (select public.visible_client_ids()));

-- ── ads ────────��─────────────────────────────────────────────────────
alter table public.ads enable row level security;

create policy ads_admin_all on public.ads
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy ads_portal_select on public.ads
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

-- ── campaigns ────────────────��───────────────────────────────────────
alter table public.campaigns enable row level security;

create policy campaigns_admin_all on public.campaigns
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy campaigns_portal_select on public.campaigns
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

-- ── reviews ──────────────��───────────────────────────────────────────
alter table public.reviews enable row level security;

create policy reviews_admin_all on public.reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy reviews_portal_select on public.reviews
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

-- ── proofer_posts ────────────────────────────────────────────────────
alter table public.proofer_posts enable row level security;

create policy proofer_posts_admin_all on public.proofer_posts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy proofer_posts_portal_select on public.proofer_posts
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

-- ── Admin-only tables (no portal access) ────���────────────────────────
-- These tables either have no client_id or contain agency-wide data
-- that portal users must never see.

alter table public.ad_decisions enable row level security;
create policy ad_decisions_admin on public.ad_decisions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.meta_execution_queue enable row level security;
create policy meta_execution_queue_admin on public.meta_execution_queue
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.ad_actions enable row level security;
create policy ad_actions_admin on public.ad_actions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.action_learnings enable row level security;
create policy action_learnings_admin on public.action_learnings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.global_learnings enable row level security;
create policy global_learnings_admin on public.global_learnings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.client_playbooks enable row level security;
create policy client_playbooks_admin on public.client_playbooks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.decision_outcomes enable row level security;
create policy decision_outcomes_admin on public.decision_outcomes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.pattern_feedback enable row level security;
create policy pattern_feedback_admin on public.pattern_feedback
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.experiments enable row level security;
create policy experiments_admin on public.experiments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.experiment_variants enable row level security;
create policy experiment_variants_admin on public.experiment_variants
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.app_settings enable row level security;
create policy app_settings_admin on public.app_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.meta_write_log enable row level security;
create policy meta_write_log_admin on public.meta_write_log
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.jobs enable row level security;
create policy jobs_admin on public.jobs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.proofer_publish_queue enable row level security;
create policy proofer_publish_queue_admin on public.proofer_publish_queue
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.proofer_comments enable row level security;
create policy proofer_comments_admin on public.proofer_comments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tables below may have been created in the initial commit outside
-- migrations. Use DO blocks so the migration doesn't fail if the
-- table doesn't exist yet.

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='memories') then
    alter table public.memories enable row level security;
    create policy memories_admin on public.memories
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='tasks') then
    alter table public.tasks enable row level security;
    create policy tasks_admin on public.tasks
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='reports') then
    alter table public.reports enable row level security;
    create policy reports_admin on public.reports
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='suggestions') then
    alter table public.suggestions enable row level security;
    create policy suggestions_admin_all on public.suggestions
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
    create policy suggestions_portal_select on public.suggestions
      for select to authenticated using (client_id in (select public.visible_client_ids()));
  end if;
end $$;

-- ── client_user_links ────────────────────────────────────────────────
-- Portal users can read their own link (needed by middleware); admins
-- get full access.
alter table public.client_user_links enable row level security;

create policy client_user_links_admin on public.client_user_links
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy client_user_links_own on public.client_user_links
  for select to authenticated
  using (auth_user_id = auth.uid());

commit;
