-- Content pillars: evergreen, per-client buckets (e.g. "Education",
-- "Behind-the-scenes", "Promo") that every proofer post can be tagged with
-- so the team sees a consistent set of rails across the month.

begin;

create table if not exists public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  color text not null default '#18181b',
  description text not null default '',
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_by text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_pillars_client_id_idx
  on public.content_pillars (client_id);

alter table public.content_pillars enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'content_pillars'
      and policyname = 'content_pillars_all_authenticated'
  ) then
    create policy content_pillars_all_authenticated
      on public.content_pillars
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end$$;

-- Tag each proofer post with a pillar. Nullable so existing posts still
-- load, and so "unassigned" is a valid state.
alter table public.proofer_posts
  add column if not exists pillar_id uuid references public.content_pillars(id)
    on delete set null;

create index if not exists proofer_posts_pillar_id_idx
  on public.proofer_posts (pillar_id);

commit;
