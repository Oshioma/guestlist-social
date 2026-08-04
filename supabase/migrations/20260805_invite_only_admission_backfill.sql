-- Deny-by-default admission backfill.
--
-- getViewer(), middleware.ts, and getMemberAccess() now admit an admin-panel
-- account ONLY if it has an explicit user_roles row. Previously a missing row
-- was silently treated as an admitted "member" (and getViewer even resolved it
-- to an admin viewer). That open default — combined with the now-removed public
-- sign-up — is what let unknown users/bots reach the panel.
--
-- Every existing non-client account relied on that default, so without this
-- backfill the new gate would lock them out. Give each of them an explicit row
-- that preserves their current capabilities: role 'member', can_run_ads false —
-- exactly what the old missing-row default resolved to. Real admins already
-- carry an explicit 'admin' row (managing members always required one), so the
-- NOT EXISTS guard leaves those untouched.
--
-- Bots were already deleted from auth.users before this ran, so every account
-- captured here is a legitimate, known user.
--
-- Idempotent: inserts only for users who have neither a user_roles row nor a
-- client_user_links row. Safe to replay.

insert into user_roles (user_id, role, can_run_ads)
select u.id, 'member', false
from auth.users u
where not exists (
    select 1 from user_roles r where r.user_id = u.id
  )
  and not exists (
    select 1 from client_user_links l where l.auth_user_id = u.id
  )
on conflict (user_id) do nothing;
