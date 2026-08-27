-- Last-known-good cache for discovery searches. Every successful run of a
-- saved search overwrites its row here; when a live fetch fails (scraper
-- outage, Meta hiccup) the discover API serves these cached posts with a
-- fetched_at stamp so the operator sees stale-but-useful results instead
-- of an empty error state.

begin;

create table if not exists public.interaction_search_results (
  account_id text not null,
  kind text not null,
  value text not null,
  posts jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (account_id, kind, value)
);

alter table public.interaction_search_results enable row level security;

-- Service role only, matching interaction_searches.

commit;
