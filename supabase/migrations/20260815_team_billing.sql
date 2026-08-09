-- ---------------------------------------------------------------------------
-- Team billing — real Stripe subscriptions behind the teams.plan flag.
--
-- teams.plan started life (20260808_teams.sql) as a plain 'free' | 'pro' flag
-- with no payment behind it ("real billing later"). This migration is that
-- "later": it widens the tier set to include 'agency' and records the Stripe
-- subscription state that keeps teams.plan honest.
--
--   Plans (marketing → entitlement):
--     free    — 2 connected social accounts, solo only
--     pro     — 10 connected social accounts, may invite collaborators
--     agency  — 100 connected social accounts, collaborators + client portals
--
-- teams.plan is the single source of truth for entitlement and is kept in sync
-- by the Stripe webhook (app/api/stripe/webhook): a trialing/active/past_due
-- subscription sets plan to its tier; a canceled/unpaid one drops it to 'free'.
--
-- The Stripe columns live directly on `teams` (rather than a side table) so the
-- many places that already read `teams.plan` keep working unchanged. None of
-- these columns are secrets — a Stripe customer/subscription id is not
-- sensitive — so the existing `teams_member_select` RLS policy (members can
-- read their own team) is fine. ALL writes go through the service role
-- (checkout + webhook), same posture as the rest of the teams tables.
-- ---------------------------------------------------------------------------

begin;

-- Widen the tier set: free | pro | agency.
alter table public.teams drop constraint if exists teams_plan_check;
alter table public.teams add constraint teams_plan_check
  check (plan in ('free', 'pro', 'agency'));

-- Stripe subscription state (service-role writes only).
alter table public.teams add column if not exists stripe_customer_id     text;
alter table public.teams add column if not exists stripe_subscription_id text;
alter table public.teams add column if not exists subscription_status    text;
alter table public.teams add column if not exists current_period_end     timestamptz;
alter table public.teams add column if not exists trial_ends_at          timestamptz;

create index if not exists teams_stripe_customer_idx
  on public.teams (stripe_customer_id);

-- One Stripe subscription maps to at most one team.
create unique index if not exists teams_stripe_subscription_idx
  on public.teams (stripe_subscription_id)
  where stripe_subscription_id is not null;

commit;
