-- Per-user Proofer preferences.
--
-- Stores the last account (client) a user was viewing on the Proofer board, so
-- signing back in — even on a different device or on the other product domain
-- (guestlistsocial.com vs postproofer.com, where a browser cookie can't follow)
-- — resumes on the same account. Best-effort: everything that reads or writes
-- this table degrades gracefully if the row is missing.

create table if not exists public.user_proofer_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  last_client_id bigint,
  updated_at     timestamptz not null default now()
);

alter table public.user_proofer_prefs enable row level security;

-- A user can only ever see and change their own preferences row.
drop policy if exists user_proofer_prefs_rw on public.user_proofer_prefs;
create policy user_proofer_prefs_rw on public.user_proofer_prefs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
