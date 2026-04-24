-- Saved discovery searches per Instagram account. Keeps the set of
-- competitor handles / hashtags / keywords the operator wants to watch,
-- so the Discovery tab can reload the same list of lookups on every visit
-- and we don't have to query Meta blindly.

begin;

create table if not exists public.interaction_searches (
  id bigserial primary key,
  account_id text not null,
  kind text not null check (kind in ('handle', 'hashtag', 'mentions')),
  value text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (account_id, kind, value)
);

create index if not exists interaction_searches_account_id_idx
  on public.interaction_searches (account_id);

alter table public.interaction_searches enable row level security;

-- Service role only, matching interaction_decisions.

commit;
