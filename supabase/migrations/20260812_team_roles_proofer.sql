-- Add the 'proofer' team role.
--
-- Role model (see the teams UI): Admin · Proofer · Creator, plus the
-- backend-only 'owner' (team creator/marker) and 'client' (portal viewer).
--   - 'member' is retained as-is and surfaced in the UI as "Creator" — a
--     drafts-only role. It's also the auto-role for self-signups.
--   - 'proofer' is NEW: works the board like a member/Creator AND can approve
--     posts (approval enforcement lives in app code — this migration only
--     grants the same scoped board access members already have).
--   - Manager checks (owner/admin) are unchanged — proofers/creators don't
--     manage the team.
--
-- Every posting RLS policy routes through can_post_in_team() and
-- writable_account_ids(), so widening those two helpers is all that's needed
-- to give proofers member-level write access.

begin;

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('owner', 'admin', 'proofer', 'member', 'client'));

create or replace function public.can_post_in_team(p_team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role_in(p_team) in ('owner', 'admin', 'proofer', 'member');
$$;

create or replace function public.writable_account_ids()
returns setof bigint
language sql stable security definer set search_path = public as $$
  select distinct ta.client_id
  from public.team_accounts ta
  join public.team_members tm on tm.team_id = ta.team_id
  where tm.user_id = auth.uid()
    and tm.role in ('owner', 'admin', 'proofer', 'member');
$$;

commit;
