-- Connected Meta accounts: per-client Facebook Page and Instagram business
-- account credentials obtained via the /api/meta/connect OAuth flow. This
-- table holds long-lived page access tokens, so it is write/read-only via
-- the Supabase service role — RLS is enabled with no policies so
-- anon/authenticated clients cannot see rows.

begin;

create table if not exists public.connected_meta_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.clients(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram')),
  account_id text not null,
  account_name text not null default '',
  access_token text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform, account_id)
);

create index if not exists connected_meta_accounts_client_id_idx
  on public.connected_meta_accounts (client_id);

create index if not exists connected_meta_accounts_platform_idx
  on public.connected_meta_accounts (platform);

alter table public.connected_meta_accounts enable row level security;

-- Intentionally NO policies. Only the Supabase service role (used by the
-- Meta OAuth callback and the server-side publish function) can read or
-- write this table. Tokens must never be exposed to browser code.

commit;
