-- ---------------------------------------------------------------------------
-- Supabase-side cron schedules (pg_cron + pg_net).
--
-- The app's cron routes (/api/cron/*) have never had a scheduler checked in:
-- vercel.json carries no crons, and Vercel Hobby only allows daily crons
-- anyway — far too slow for the 5-minute publish queue. So the clock moves
-- into the database, which runs on every Supabase plan: pg_cron fires on
-- schedule and pg_net makes an async HTTP call to the matching app route.
--
-- Configuration lives in public.cron_runtime_config (RLS on, no policies —
-- only the service role / postgres can touch it). Until BOTH rows are filled
-- in, every job is a silent no-op, so this migration is safe to apply before
-- the operator finishes setup:
--
--   update public.cron_runtime_config set value = 'https://<your-app-domain>'
--    where key = 'app_url';
--   update public.cron_runtime_config set value = '<same value as the
--    CRON_SECRET env var in Vercel>' where key = 'cron_secret';
--
-- (Run once in the Supabase SQL editor. CRON_SECRET must also be set in the
-- Vercel project env, since the routes check it.)
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Config table ────────────────────────────────────────────────────────────

create table if not exists public.cron_runtime_config (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.cron_runtime_config enable row level security;
-- Deliberately NO policies: anon/authenticated get nothing; the cron jobs
-- run as postgres, which bypasses RLS.

insert into public.cron_runtime_config (key, value)
values ('app_url', ''), ('cron_secret', '')
on conflict (key) do nothing;

-- ── Caller helper ───────────────────────────────────────────────────────────

create or replace function public.call_app_cron(path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base   text;
  secret text;
begin
  select value into base   from public.cron_runtime_config where key = 'app_url';
  select value into secret from public.cron_runtime_config where key = 'cron_secret';
  -- Fail closed: not configured yet → do nothing.
  if base is null or base = '' or secret is null or secret = '' then
    return;
  end if;
  -- Async fire-and-forget; the Vercel function keeps running even if we
  -- don't wait for the full response.
  perform net.http_post(
    url := rtrim(base, '/') || path,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

-- Only the scheduler (postgres) should be able to fire app endpoints.
revoke execute on function public.call_app_cron(text) from public;
revoke execute on function public.call_app_cron(text) from anon;
revoke execute on function public.call_app_cron(text) from authenticated;

-- ── Schedules (all times UTC; cron.schedule upserts by job name) ────────────
--
-- Cadences follow docs/product-overview.md: publish queue every 5 minutes,
-- insights every 6 hours, token refresh daily, pattern reaper weekly,
-- monthly reviews on the 1st, admin report daily (the route respects the
-- once-a-day marker, so a report already sent by an early admin-panel visit
-- is not sent twice).

select cron.schedule(
  'guestlist-publish-meta-queue',
  '*/5 * * * *',
  $$select public.call_app_cron('/api/cron/publish-meta-queue')$$
);

select cron.schedule(
  'guestlist-fetch-post-insights',
  '20 */6 * * *',
  $$select public.call_app_cron('/api/cron/fetch-post-insights')$$
);

select cron.schedule(
  'guestlist-refresh-instagram-tokens',
  '40 2 * * *',
  $$select public.call_app_cron('/api/cron/refresh-instagram-tokens')$$
);

select cron.schedule(
  'guestlist-retire-stale-patterns',
  '10 4 * * 1',
  $$select public.call_app_cron('/api/cron/retire-stale-patterns')$$
);

select cron.schedule(
  'guestlist-monthly-reviews',
  '30 6 1 * *',
  $$select public.call_app_cron('/api/cron/monthly-reviews')$$
);

select cron.schedule(
  'guestlist-daily-admin-report',
  '0 7 * * *',
  $$select public.call_app_cron('/api/cron/daily-admin-report')$$
);
