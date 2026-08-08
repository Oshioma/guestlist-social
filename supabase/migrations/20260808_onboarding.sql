-- ---------------------------------------------------------------------------
-- First-run onboarding: per-user progress + a lightweight funnel event log.
--
-- Proofer had no per-user settings/profile row and no product-analytics system
-- (see the audit-only meta_write_log). This migration adds the two smallest
-- pieces the guided first-run experience needs, following the same shape and
-- conventions as user_roles (per-user row keyed on auth.users, RLS self-read,
-- updated_at trigger, all writes through the service-role client).
--
--   user_onboarding    — one row per auth user: has the tour been started,
--                        which step are they on, is it completed/skipped, and
--                        a pointer to the account + first post it produced (so
--                        a replay never duplicates the real post).
--   onboarding_events  — append-only funnel log (onboarding_started,
--                        social_connected, hook_used, first_post_saved, …) so
--                        we can see where users drop off. Fire-and-forget.
--
-- Idempotent so it's safe to replay.
-- ---------------------------------------------------------------------------

begin;

-- ── user_onboarding ─────────────────────────────────────────────────────────
create table if not exists public.user_onboarding (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  onboarding_started   boolean not null default false,
  onboarding_step      integer not null default 0,
  onboarding_completed boolean not null default false,
  onboarding_skipped   boolean not null default false,
  -- The real account (clients.id) the tour created for this user, and the real
  -- proofer_posts row it saved. Kept so a restarted tour reuses them instead of
  -- creating duplicates. bigint mirrors clients.id / proofer_posts.id.
  account_client_id    bigint,
  first_post_id        bigint,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.user_onboarding add column if not exists onboarding_started   boolean not null default false;
alter table public.user_onboarding add column if not exists onboarding_step       integer not null default 0;
alter table public.user_onboarding add column if not exists onboarding_completed  boolean not null default false;
alter table public.user_onboarding add column if not exists onboarding_skipped    boolean not null default false;
alter table public.user_onboarding add column if not exists account_client_id     bigint;
alter table public.user_onboarding add column if not exists first_post_id         bigint;
alter table public.user_onboarding add column if not exists created_at            timestamptz not null default now();
alter table public.user_onboarding add column if not exists updated_at            timestamptz not null default now();

create or replace function public.user_onboarding_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists user_onboarding_touch on public.user_onboarding;
create trigger user_onboarding_touch
  before update on public.user_onboarding
  for each row execute function public.user_onboarding_touch_updated_at();

-- RLS: a user may read AND write only their own onboarding row (the guided
-- flow reads/updates it directly through the authed client). Service-role
-- writes bypass RLS regardless.
alter table public.user_onboarding enable row level security;

drop policy if exists user_onboarding_self_read on public.user_onboarding;
create policy user_onboarding_self_read on public.user_onboarding
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_onboarding_self_write on public.user_onboarding;
create policy user_onboarding_self_write on public.user_onboarding
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── onboarding_events (funnel analytics) ────────────────────────────────────
create table if not exists public.onboarding_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  event      text not null,
  step       integer,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_events_user_idx on public.onboarding_events (user_id, created_at);
create index if not exists onboarding_events_event_idx on public.onboarding_events (event, created_at);

-- RLS: users can read their own events; inserts happen via the service-role
-- client in the logging server action (fire-and-forget), which bypasses RLS.
alter table public.onboarding_events enable row level security;

drop policy if exists onboarding_events_self_read on public.onboarding_events;
create policy onboarding_events_self_read on public.onboarding_events
  for select to authenticated
  using (auth.uid() = user_id);

commit;
