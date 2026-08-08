-- ---------------------------------------------------------------------------
-- Teams cutover, part 1 of 2 (RLS): source client scoping from teams.
--
-- The entire RLS scheme (20260427_rls_policies.sql and the additive policies
-- after it) rests on two helper functions:
--
--   is_admin()           — the "staff sees & writes everything" gate on the
--                          agency-internal and client-scoped tables.
--   visible_client_ids() — the set a NON-staff (portal) user may SELECT.
--
-- Rather than rewrite ~25 policies, we redefine just these two so that client
-- scoping flows through team membership (team_accounts) instead of
-- client_user_links. Every policy keeps working; only its data source moves.
--
-- Behaviour is preserved for every current user (the 20260808 backfill put
-- all staff into "Guestlist Social" and every portal client into their own
-- isolated team), and it is *safer* for accounts that are neither staff nor
-- client — see is_admin() below.
--
-- Staff identity itself intentionally stays keyed on user_roles (the agency
-- roster) so the existing member-invite flow keeps working unchanged. It is
-- the CLIENT isolation — the multi-tenant boundary that actually matters —
-- that becomes team-based here.
-- ---------------------------------------------------------------------------

begin;

-- is_admin(): agency staff = anyone with a user_roles row.
--
-- Previously this was "has NO client_user_links row". For real users the two
-- agree (staff have a user_roles row and no link; clients have a link and no
-- user_roles row). But the old form failed OPEN for an account that had
-- neither — it returned true, granting full access at the RLS layer to any
-- authenticated account that slipped past the app-layer gates. Keying on the
-- presence of a user_roles row instead fails CLOSED: unknown accounts get
-- nothing.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid()
  );
$$;

-- visible_client_ids(): the account (client) ids a scoped user may SELECT —
-- exactly the accounts in the teams they belong to. Staff read access is
-- carried by the *_admin_all policies (is_admin()), so this set only has to
-- be correct for non-staff; returning the same team-based set for everyone
-- is harmless and keeps the function simple.
--
-- This is deliberately identical to visible_account_ids() from 20260808;
-- the older name is kept because ~6 policies reference it.
create or replace function public.visible_client_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct ta.client_id
  from public.team_accounts ta
  where ta.team_id in (
    select tm.team_id
    from public.team_members tm
    where tm.user_id = auth.uid()
  );
$$;

commit;
