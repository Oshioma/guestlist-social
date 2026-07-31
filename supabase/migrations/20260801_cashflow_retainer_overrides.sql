-- ---------------------------------------------------------------------------
-- Per-month retainer overrides for the cashflow forecast.
--
-- The "Client retainers" row defaults to the live client total (sum of active
-- clients' monthly_price) applied to every month. That's right for the current
-- month and the future, but historical months often billed a different amount
-- (fewer clients, different prices). This column lets an operator pin a
-- specific value to any month.
--
-- Shape: a 12-element JSON array [Jan … Dec]. A null entry means "no override —
-- use the live client total for that month"; a number pins that month.
-- ---------------------------------------------------------------------------

alter table public.cashflow_settings
  add column if not exists retainer_overrides jsonb;
