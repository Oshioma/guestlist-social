-- Make the Proofer board fully team-scoped without hiding any agency account.
--
-- The board now shows only accounts in teams the viewer belongs to (so an
-- independent invitee's account never leaks into the owner's picker). For that
-- to be safe, every existing agency account must belong to a team. The teams
-- migration backfilled all accounts that existed then into "Guestlist Social",
-- but accounts created afterwards (via createClientAction, which didn't link a
-- team) can be orphaned. This adds any such orphan to the Guestlist Social team.
--
-- Independent users' accounts are already linked to their own team (onboarding
-- links them), so they are NOT matched here — only genuinely team-less accounts.
-- Idempotent.

do $$
declare
  gs uuid;
begin
  select id into gs
  from public.teams
  where name = 'Guestlist Social'
  order by created_at
  limit 1;

  if gs is null then
    -- No agency team to attach to; nothing to do.
    return;
  end if;

  insert into public.team_accounts (team_id, client_id)
  select gs, c.id
  from public.clients c
  where coalesce(c.archived, false) = false
    and not exists (
      select 1 from public.team_accounts ta where ta.client_id = c.id
    )
  on conflict (team_id, client_id) do nothing;
end
$$;
