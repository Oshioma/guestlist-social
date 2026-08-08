-- ---------------------------------------------------------------------------
-- Teams: the workspace layer.
--
-- Post Proofer historically had two separate ideas of "who can log in":
--   - user_roles        → agency staff (global admin / member)
--   - client_user_links → portal clients (read-only, scoped to one client)
--
-- This migration introduces a single unifying concept — a **team** — without
-- disturbing either of those systems. It is deliberately ADDITIVE:
--
--   * It creates three new tables (teams, team_members, team_accounts) and a
--     handful of helper functions.
--   * It does NOT change any existing table's columns or RLS, so getViewer(),
--     the middleware, the portal and the admin panel all behave exactly as
--     they do today. The team-aware cutover of those surfaces is a separate,
--     carefully-reviewed step.
--   * It BACKFILLS the new tables from the current data so the moment the
--     app starts reading them, nobody's access changes:
--       - a "Guestlist Social" team owned by Oshi, holding every account,
--         with every current staff user carried over as owner/admin/member;
--       - one isolated team per portal client, holding just that client's
--         account, with the client carried over as a 'client' member and
--         Oshi as its admin.
--
-- The model in one line: a TEAM is a wall around a set of ACCOUNTS; a
-- MEMBER's ROLE in that team decides what they can do inside it. An account
-- (today's `clients` row) can belong to MANY teams — that is how Oshi's
-- "Guestlist Social" team and a client's own isolated team can both show the
-- same account's posts while the client still sees nothing else.
--
-- Roles (team_members.role):
--   owner  — creator; everything, incl. billing + delete team
--   admin  — everything except billing/delete; manages accounts, credentials,
--            people, and can post
--   member — can create/schedule/publish posts; cannot see credentials, add
--            accounts, or invite people
--   client — read + approve/comment only (today's portal experience)
--
-- Plan gate (teams.plan): 'free' = solo (owner only). 'pro' = may invite
-- members/admins. Wired to a plain flag now; real billing later.
-- ---------------------------------------------------------------------------

begin;

-- ── teams ──────────────────────────────────────────────────────────────
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  plan          text not null default 'free',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.teams drop constraint if exists teams_plan_check;
alter table public.teams add constraint teams_plan_check
  check (plan in ('free', 'pro'));

create index if not exists teams_owner_idx on public.teams (owner_user_id);

-- ── team_members ─────────────────────────────────────────────────────────
create table if not exists public.team_members (
  id         bigserial primary key,
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('owner', 'admin', 'member', 'client'));

create index if not exists team_members_user_idx on public.team_members (user_id);
create index if not exists team_members_team_idx on public.team_members (team_id);

-- ── team_accounts (many-to-many: teams ↔ accounts/clients) ───────────────
create table if not exists public.team_accounts (
  team_id    uuid not null references public.teams(id) on delete cascade,
  client_id  bigint not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, client_id)
);

create index if not exists team_accounts_client_idx on public.team_accounts (client_id);

-- ── updated_at bump ──────────────────────────────────────────────────────
create or replace function public.teams_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists teams_touch on public.teams;
create trigger teams_touch
  before update on public.teams
  for each row execute function public.teams_touch_updated_at();

drop trigger if exists team_members_touch on public.team_members;
create trigger team_members_touch
  before update on public.team_members
  for each row execute function public.teams_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions.
--
-- All are SECURITY DEFINER so they run as the migration/table owner and
-- therefore bypass RLS on team_members/team_accounts. This is what lets an
-- RLS policy on team_members reference my_team_ids() without recursing — the
-- same pattern the existing is_admin()/visible_client_ids() helpers use.
-- ---------------------------------------------------------------------------

-- Teams the current auth user is a member of.
create or replace function public.my_team_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

-- The current user's role in a given team (null if not a member).
create or replace function public.my_role_in(p_team uuid)
returns text
language sql stable security definer set search_path = public as $$
  select role from public.team_members
  where team_id = p_team and user_id = auth.uid()
  limit 1;
$$;

-- Account (client) ids visible to the current user: everything in any team
-- they belong to. This is the team-era replacement for visible_client_ids().
create or replace function public.visible_account_ids()
returns setof bigint
language sql stable security definer set search_path = public as $$
  select distinct ta.client_id
  from public.team_accounts ta
  where ta.team_id in (select public.my_team_ids());
$$;

-- Can the current user create/schedule/publish posts in this team?
create or replace function public.can_post_in_team(p_team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role_in(p_team) in ('owner', 'admin', 'member');
$$;

-- Can the current user manage the team (accounts, credentials, people, name)?
create or replace function public.can_manage_team(p_team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role_in(p_team) in ('owner', 'admin');
$$;

-- Ensure a user has a personal team, creating one (owner, free plan) if not.
-- Returns the team id. This is the hook the future self-serve sign-up flow
-- calls so "when someone signs up, they automatically have a team". It is
-- intentionally NOT wired to an auth.users trigger: invited members/clients
-- are added to someone else's team and should not also get an empty personal
-- team. The sign-up path calls this explicitly for genuine new sign-ups.
create or replace function public.ensure_personal_team(p_user uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  select id into t
  from public.teams
  where owner_user_id = p_user
  order by created_at
  limit 1;

  if t is not null then
    return t;
  end if;

  insert into public.teams (name, owner_user_id, plan)
  values (coalesce(nullif(trim(p_name), ''), 'My Team'), p_user, 'free')
  returning id into t;

  insert into public.team_members (team_id, user_id, role)
  values (t, p_user, 'owner')
  on conflict (team_id, user_id) do nothing;

  return t;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS on the new tables.
--
-- Reads are scoped to the caller's own teams so a signed-in user can render
-- their team switcher, member list and account list without leaking other
-- teams. ALL writes go through the Supabase service role in server actions
-- (same posture as user_roles / connected_meta_accounts) — there are
-- deliberately no INSERT/UPDATE/DELETE policies for authenticated users.
-- ---------------------------------------------------------------------------
alter table public.teams         enable row level security;
alter table public.team_members  enable row level security;
alter table public.team_accounts enable row level security;

drop policy if exists teams_member_select on public.teams;
create policy teams_member_select on public.teams
  for select to authenticated
  using (id in (select public.my_team_ids()));

drop policy if exists team_members_visible_select on public.team_members;
create policy team_members_visible_select on public.team_members
  for select to authenticated
  using (team_id in (select public.my_team_ids()));

drop policy if exists team_accounts_visible_select on public.team_accounts;
create policy team_accounts_visible_select on public.team_accounts
  for select to authenticated
  using (team_id in (select public.my_team_ids()));

-- ---------------------------------------------------------------------------
-- Backfill — reproduce today's access exactly under the new model.
-- Idempotent: safe to re-run. Uses ON CONFLICT / existence guards throughout.
-- ---------------------------------------------------------------------------
do $$
declare
  oshi    uuid;
  gs_team uuid;
  ct      uuid;
  r       record;
begin
  -- Identify the primary owner. Prefer the known founder address; otherwise
  -- fall back to the earliest existing admin so the migration still completes
  -- on a dev/staging DB where that email doesn't exist.
  select id into oshi from auth.users
  where lower(email) = 'oshi@guestlist.net'
  limit 1;

  if oshi is null then
    select user_id into oshi from public.user_roles
    where role = 'admin'
    order by created_at
    limit 1;
  end if;

  -- ── "Guestlist Social" — Oshi's own workspace, holding every account ────
  select id into gs_team from public.teams where name = 'Guestlist Social' limit 1;
  if gs_team is null then
    insert into public.teams (name, owner_user_id, plan)
    values ('Guestlist Social', oshi, 'pro')
    returning id into gs_team;
  end if;

  if oshi is not null then
    insert into public.team_members (team_id, user_id, role)
    values (gs_team, oshi, 'owner')
    on conflict (team_id, user_id) do update set role = 'owner';
  end if;

  -- Every current admin-panel user joins Guestlist Social. Admins → admin,
  -- everyone else → member. ON CONFLICT DO NOTHING preserves Oshi's 'owner'.
  for r in select user_id, role from public.user_roles loop
    insert into public.team_members (team_id, user_id, role)
    values (
      gs_team,
      r.user_id,
      case when r.role = 'admin' then 'admin' else 'member' end
    )
    on conflict (team_id, user_id) do nothing;
  end loop;

  -- Every account (client) belongs to Guestlist Social.
  insert into public.team_accounts (team_id, client_id)
  select gs_team, c.id from public.clients c
  on conflict do nothing;

  -- ── One isolated team per portal client ────────────────────────────────
  -- For each client that has portal user(s): a team named after the client,
  -- holding only that client's account, administered by Oshi.
  for r in
    select distinct l.client_id,
           coalesce(nullif(trim(c.name), ''), 'Client ' || l.client_id) as cname
    from public.client_user_links l
    join public.clients c on c.id = l.client_id
  loop
    -- Find this client's existing isolated team (idempotency guard) or make it.
    select t.id into ct
    from public.teams t
    where t.name = r.cname
      and t.id <> gs_team
      and exists (
        select 1 from public.team_accounts ta
        where ta.team_id = t.id and ta.client_id = r.client_id
      )
    limit 1;

    if ct is null then
      insert into public.teams (name, owner_user_id, plan)
      values (r.cname, oshi, 'free')
      returning id into ct;
    end if;

    insert into public.team_accounts (team_id, client_id)
    values (ct, r.client_id)
    on conflict do nothing;

    if oshi is not null then
      insert into public.team_members (team_id, user_id, role)
      values (ct, oshi, 'admin')
      on conflict (team_id, user_id) do nothing;
    end if;
  end loop;

  -- Add each portal user to their client's isolated team as a 'client'.
  for r in
    select l.auth_user_id,
           l.client_id,
           coalesce(nullif(trim(c.name), ''), 'Client ' || l.client_id) as cname
    from public.client_user_links l
    join public.clients c on c.id = l.client_id
  loop
    select t.id into ct
    from public.teams t
    where t.name = r.cname
      and t.id <> gs_team
      and exists (
        select 1 from public.team_accounts ta
        where ta.team_id = t.id and ta.client_id = r.client_id
      )
    limit 1;

    if ct is not null then
      insert into public.team_members (team_id, user_id, role)
      values (ct, r.auth_user_id, 'client')
      on conflict (team_id, user_id) do nothing;
    end if;
  end loop;
end
$$;

commit;
