-- user_roles: who can do what inside the admin panel.
--
--   role         : 'admin' | 'member'
--                    admin  = full admin-panel access + can manage members
--                    member = admin-panel access, cannot manage members
--   can_run_ads  : boolean flag — only users with this can create/edit
--                  campaigns and ads. Read access is not restricted.
--
-- Intentionally decoupled from client_user_links. A Supabase user is:
--   - a client (has a client_user_links row)    → portal-only
--   - OR an admin-panel user (no link)          → user_roles row governs
--     capabilities. Missing row defaults to member/no-ads at the helper layer.
--
-- Kept idempotent so it's safe to replay over a hand-crafted table.

create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member',
  can_run_ads boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_roles add column if not exists can_run_ads boolean not null default false;
alter table user_roles add column if not exists created_at timestamptz not null default now();
alter table user_roles add column if not exists updated_at timestamptz not null default now();

-- Re-seat the role check so pre-existing 'operator'/'viewer' values coerce
-- into the new model without a data loss.
update user_roles set role = 'admin'  where role in ('admin', 'operator');
update user_roles set role = 'member' where role not in ('admin', 'member');

alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles add constraint user_roles_role_check
  check (role in ('admin', 'member'));

-- updated_at bump on modify
create or replace function user_roles_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists user_roles_touch on user_roles;
create trigger user_roles_touch
  before update on user_roles
  for each row execute function user_roles_touch_updated_at();

-- RLS: users can read their own row (so getViewer works with anon/authed JWT).
-- All writes go through the service-role client in server actions.
alter table user_roles enable row level security;

drop policy if exists user_roles_self_read on user_roles;
create policy user_roles_self_read on user_roles
  for select
  using (auth.uid() = user_id);
