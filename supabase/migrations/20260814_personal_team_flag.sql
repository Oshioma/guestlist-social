-- Personal teams: make "personal" an explicit marker instead of a guess.
--
-- Before this, the Teams page called whichever team you owned that was created
-- earliest your "personal" team. That mislabels a founder's real agency team
-- (e.g. "Guestlist Social") as personal just because it's the oldest. Here we
-- add a real teams.is_personal flag, teach ensure_personal_team to use it, and
-- backfill so every existing posting user has exactly one personal team — while
-- shared teams (those with more than just their owner) are left non-personal.

begin;

alter table public.teams
  add column if not exists is_personal boolean not null default false;

-- At most one personal team per owner.
create unique index if not exists teams_one_personal_per_owner
  on public.teams (owner_user_id)
  where is_personal;

-- ensure_personal_team, now flag-based:
--   1. If the user already has a team marked personal, return it.
--   2. Else, if they own a *solo* team (they're its only member), adopt that as
--      their personal team — this is the historical self-signup team, so we mark
--      it rather than create a confusing duplicate.
--   3. Else create a fresh personal team (a founder whose only team is shared
--      lands here, so their shared team stays non-personal).
create or replace function public.ensure_personal_team(p_user uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  -- 1) Existing marked personal team.
  select id into t
  from public.teams
  where owner_user_id = p_user and is_personal
  order by created_at
  limit 1;
  if t is not null then
    return t;
  end if;

  -- 2) Adopt a solo owned team (only member is the owner themselves).
  select te.id into t
  from public.teams te
  where te.owner_user_id = p_user
    and (select count(*) from public.team_members tm where tm.team_id = te.id) = 1
  order by te.created_at
  limit 1;
  if t is not null then
    update public.teams set is_personal = true where id = t;
    return t;
  end if;

  -- 3) Create a fresh personal team.
  insert into public.teams (name, owner_user_id, plan, is_personal)
  values (coalesce(nullif(trim(p_name), ''), 'My Team'), p_user, 'free', true)
  returning id into t;

  insert into public.team_members (team_id, user_id, role)
  values (t, p_user, 'owner')
  on conflict (team_id, user_id) do nothing;

  return t;
end
$$;

-- Backfill: give every existing user who works in a team (a posting role
-- somewhere) a personal team, naming any freshly-created one after them.
do $$
declare
  r record;
begin
  for r in
    select distinct tm.user_id as uid,
      coalesce(
        nullif(split_part(coalesce(au.raw_user_meta_data->>'full_name', ''), ' ', 1), ''),
        nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
        'My'
      ) as first_name
    from public.team_members tm
    join auth.users au on au.id = tm.user_id
    where tm.role in ('owner', 'admin', 'proofer', 'member')
  loop
    perform public.ensure_personal_team(r.uid, r.first_name || '''s Team');
  end loop;
end $$;

commit;
