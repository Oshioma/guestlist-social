-- ---------------------------------------------------------------------------
-- Auth rate limiting: a small fixed-window counter used to throttle the public
-- auth actions (sign-up, sign-in, password reset) per IP and per email.
--
-- CAPTCHA (Turnstile) stops a one-shot bot; this stops a solver farm or a
-- credential-stuffing/email-bomb script from grinding the same endpoint. The
-- app calls check_rate_limit() from the service-role client only — the table
-- has RLS on with no policies, so anon/authenticated can't read or write it.
--
-- The helper is intentionally fail-open on the app side: if this migration
-- hasn't been applied (or the RPC errors), the caller treats the request as
-- allowed, so auth keeps working exactly as before until the limiter is live.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.auth_rate_limits (
  bucket text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

-- Service-role only. RLS enabled with zero policies => anon/authenticated are
-- denied all access; the service-role key bypasses RLS.
alter table public.auth_rate_limits enable row level security;

-- Atomically bump the counter for a bucket and report whether the caller is
-- still under the limit. Fixed window: the first hit stamps window_start; once
-- the window elapses the next hit resets the count to 1. The upsert takes a row
-- lock, so concurrent hits on the same bucket serialise.
create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.auth_rate_limits as t (bucket, count, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
    set count =
          case
            when now() - t.window_start > make_interval(secs => p_window_seconds)
            then 1
            else t.count + 1
          end,
        window_start =
          case
            when now() - t.window_start > make_interval(secs => p_window_seconds)
            then now()
            else t.window_start
          end
  returning t.count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Only the service role should ever call this.
revoke all on function public.check_rate_limit(text, int, int) from public;
revoke all on function public.check_rate_limit(text, int, int) from anon;
revoke all on function public.check_rate_limit(text, int, int) from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Housekeeping (optional): stale buckets can be pruned periodically. There is
-- no cron wired for this — the table stays tiny in practice — but if it grows:
--   delete from public.auth_rate_limits
--   where window_start < now() - interval '1 day';
-- ---------------------------------------------------------------------------
