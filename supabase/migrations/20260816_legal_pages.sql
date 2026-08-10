-- Editable legal pages (Privacy Policy, Data Deletion instructions).
--
-- The public /privacy and /data-deletion pages render from code defaults unless
-- the platform owner has saved an override here, edited from Super admin → Legal.
-- A missing row means "use the built-in default", so the feature is additive and
-- the pages keep working even before this migration runs.
--
-- Access: read/written only through the service-role client behind a super-admin
-- gate (lib/legal/actions.ts). The PUBLIC pages read via the service role too
-- (server-side), so RLS is enabled with NO policies — no tenant session can
-- touch it; the service role bypasses RLS as designed.

create table if not exists public.legal_pages (
  key        text primary key,
  title      text not null,
  body_html  text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.legal_pages enable row level security;

-- No policies: service-role only.
