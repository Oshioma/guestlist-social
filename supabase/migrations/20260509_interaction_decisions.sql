-- Interaction decisions: persists approve/save/skip triage decisions made
-- by operators on comments surfaced in the Interaction Engine. Before this
-- table existed, decisions lived only in client-side state — a refresh or
-- navigation wiped everything. With persistence we can also drive future
-- analytics (response latency, approve rate, learning extraction).
--
-- Written/read only via the service role on the server (the /app/interaction
-- page uses a service-role client already for connected_meta_accounts).

begin;

create table if not exists public.interaction_decisions (
  id bigserial primary key,
  account_id text not null,
  comment_id text not null,
  decision text not null check (decision in ('approved', 'saved', 'skipped')),
  comment_text text,
  comment_author text,
  comment_permalink text,
  poster_type text,
  poster_score integer,
  follower_count integer,
  engagement_rate numeric,
  relevance integer,
  opportunity integer,
  risk integer,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (account_id, comment_id)
);

create index if not exists interaction_decisions_account_id_idx
  on public.interaction_decisions (account_id);

create index if not exists interaction_decisions_decided_at_idx
  on public.interaction_decisions (decided_at desc);

alter table public.interaction_decisions enable row level security;

-- No policies: service role only. The Interaction page's save action runs
-- server-side with the service client, so anon/authenticated users never
-- touch this table directly.

-- Track the most recent Graph API error per connected account so the UI
-- can flag expired tokens instead of silently returning empty feeds.
alter table public.connected_meta_accounts
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

commit;
