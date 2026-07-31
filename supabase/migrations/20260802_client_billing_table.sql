-- ---------------------------------------------------------------------------
-- Move client billing to its own admin-only table.
--
-- monthly_price / direct_debit previously lived on `clients`. Portal users can
-- read their own `clients` row via RLS, which meant a client could technically
-- read those columns through the API even though the UI hid them. Moving
-- billing to a dedicated table with an admin-only policy closes that off: a
-- portal user has no access to `client_billing` at all.
--
-- Existing values are copied over, then the columns are dropped from `clients`.
-- Guarded so the migration is safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.client_billing (
  client_id     bigint primary key references public.clients(id) on delete cascade,
  monthly_price numeric,
  direct_debit  boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.client_billing enable row level security;

drop policy if exists client_billing_admin_all on public.client_billing;
create policy client_billing_admin_all on public.client_billing
  for all using (public.is_admin()) with check (public.is_admin());

-- Copy any existing billing off `clients`, then drop the leaky columns.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
      and column_name = 'monthly_price'
  ) then
    insert into public.client_billing (client_id, monthly_price, direct_debit)
    select id, monthly_price, coalesce(direct_debit, false)
    from public.clients
    where monthly_price is not null or direct_debit = true
    on conflict (client_id) do update
      set monthly_price = excluded.monthly_price,
          direct_debit  = excluded.direct_debit;

    alter table public.clients drop column if exists monthly_price;
    alter table public.clients drop column if exists direct_debit;
  end if;
end $$;
