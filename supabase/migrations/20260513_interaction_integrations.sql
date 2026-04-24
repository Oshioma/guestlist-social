-- Per-agency integration credentials for the Interaction Engine.
-- Lets operators paste their RapidAPI key + IG scraper endpoints into
-- the Discovery tab UI instead of having to set Vercel env vars for
-- every tenant. Each account_id gets its own row so different clients
-- can use different scrapers / tiers if needed; account_id = 'default'
-- applies when no per-account row exists.
--
-- Written/read only via the service role — the api_key column holds
-- secrets that must never leak to browser code. RLS is enabled with no
-- policies so anon/authenticated clients cannot see rows.

begin;

create table if not exists public.interaction_integrations (
  id bigserial primary key,
  account_id text not null default 'default',
  provider text not null default 'rapidapi_ig',
  api_key text,
  host text,
  location_search_path text,
  location_posts_path text,
  updated_at timestamptz not null default now(),
  unique (account_id, provider)
);

create index if not exists interaction_integrations_account_id_idx
  on public.interaction_integrations (account_id);

alter table public.interaction_integrations enable row level security;

-- No policies: service role only.

commit;
