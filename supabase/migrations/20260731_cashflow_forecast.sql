-- ---------------------------------------------------------------------------
-- Cashflow forecast — an editable, monthly forecast grid for the agency.
--
-- Shape mirrors the operator's existing spreadsheet: one row per line item
-- (Rent, a crew salary, a subscription, a revenue stream…), grouped into
-- sections (Overheads / Software / Crew / Rooms / Revenue), with twelve
-- monthly amounts stored as a jsonb array [Jan … Dec].
--
-- Why jsonb array rather than 12 numeric columns: the grid is edited a cell
-- at a time and rows come and go freely; a single array column keeps the
-- table narrow and means "add a month layout later" never needs a migration.
-- Totals (Costs, Net, running balance, runway) are NOT stored — they are
-- derived on every render so the numbers can never drift out of sync the way
-- the hand-maintained spreadsheet totals had.
--
-- Access: agency-wide financial data. Admins (auth users with no client_user
-- links — see public.is_admin()) get full read/write; client-portal users get
-- nothing. The /app/cashflow page is additionally gated to the admin role.
-- ---------------------------------------------------------------------------

create table if not exists public.cashflow_lines (
  id          bigint generated always as identity primary key,
  year        int  not null,
  section     text not null,
  label       text not null,
  kind        text not null default 'cost' check (kind in ('cost', 'revenue')),
  sort_order  int  not null default 0,
  -- Twelve monthly amounts, January … December. Nulls/short arrays are read
  -- as 0 by the app, so a sparse row is fine.
  amounts     jsonb not null default '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cashflow_lines_year_order_idx
  on public.cashflow_lines (year, sort_order);

-- One row per year holding the opening bank balance the running-balance
-- projection starts from.
create table if not exists public.cashflow_settings (
  year            int primary key,
  opening_balance numeric not null default 0,
  updated_at      timestamptz not null default now()
);

alter table public.cashflow_lines    enable row level security;
alter table public.cashflow_settings enable row level security;

-- Drop-then-create so the migration is safe to re-run (Postgres has no
-- CREATE POLICY IF NOT EXISTS).
drop policy if exists cashflow_lines_admin_all on public.cashflow_lines;
create policy cashflow_lines_admin_all on public.cashflow_lines
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists cashflow_settings_admin_all on public.cashflow_settings;
create policy cashflow_settings_admin_all on public.cashflow_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Seed: 2026 forecast, transcribed from the operator's spreadsheet ────────
-- Placements were reconciled against the sheet's own monthly Costs totals
-- (e.g. Jan £5,288, Mar £4,430, Apr £5,516 all match to the penny), so
-- annual/one-off items land in the correct month.

insert into public.cashflow_settings (year, opening_balance)
values (2026, 0)
on conflict (year) do nothing;

-- Seeded once. The guard keeps the migration re-runnable: cashflow_lines has
-- no natural unique key, so a bare re-insert would duplicate every row.
do $$
begin
if not exists (select 1 from public.cashflow_lines where year = 2026) then
insert into public.cashflow_lines (year, section, label, kind, sort_order, amounts) values
  -- Overheads
  (2026, 'Overheads', 'Rent',            'cost', 10, '[400,400,400,400,400,400,400,400,400,400,400,400]'),
  (2026, 'Overheads', 'Hardware',        'cost', 20, '[0,0,0,0,0,0,0,0,0,0,0,0]'),
  (2026, 'Overheads', 'Misc Drinks etc', 'cost', 30, '[0,0,0,0,0,0,0,0,0,0,0,0]'),
  (2026, 'Overheads', 'Bank Charges',    'cost', 40, '[29.88,29.88,29.88,23.88,23.88,23.88,23.88,23.88,23.88,23.88,23.88,23.88]'),
  (2026, 'Overheads', 'Accountant',      'cost', 50, '[750,750,0,0,0,0,0,0,0,0,0,0]'),
  (2026, 'Overheads', 'Companies House', 'cost', 60, '[0,0,50,0,0,0,0,0,0,0,0,0]'),
  -- Software & Subscriptions
  (2026, 'Software & Subscriptions', 'Envato',              'cost', 110, '[30,175,0,0,0,0,0,0,0,0,0,0]'),
  (2026, 'Software & Subscriptions', 'Capsule',             'cost', 120, '[16.8,16.8,16.8,16.8,16.8,16.8,16.8,16.8,16.8,16.8,16.8,16.8]'),
  (2026, 'Software & Subscriptions', 'Google Apps',         'cost', 130, '[56,56,56,56,56,56,56,56,56,56,56,56]'),
  (2026, 'Software & Subscriptions', 'Canva',               'cost', 140, '[12,12,12,12,12,12,12,12,12,12,12,12]'),
  (2026, 'Software & Subscriptions', 'Internet',            'cost', 150, '[50,50,50,50,50,50,50,50,50,50,50,50]'),
  (2026, 'Software & Subscriptions', 'Deyvce',              'cost', 160, '[9,9,9,9,9,9,9,9,9,9,9,9]'),
  (2026, 'Software & Subscriptions', 'Zoom',                'cost', 170, '[9,12,12,12,12,12,12,12,12,12,12,12]'),
  (2026, 'Software & Subscriptions', 'Facebook ads',        'cost', 180, '[75,90,50,50,50,50,50,50,50,50,50,50]'),
  (2026, 'Software & Subscriptions', 'Liability insurance', 'cost', 190, '[9.77,9.77,9.77,9.77,9.77,9.77,0,0,0,0,0,0]'),
  (2026, 'Software & Subscriptions', 'Kushukuru wix',       'cost', 200, '[0,0,0,0,0,0,0,0,0,0,0,0]'),
  (2026, 'Software & Subscriptions', 'Namecheap domains',   'cost', 210, '[50,0,0,0,0,0,0,0,0,0,0,0]'),
  (2026, 'Software & Subscriptions', 'Dropbox',             'cost', 220, '[9.99,9.99,9.99,9.99,9.99,9.99,9.99,9.99,9.99,9.99,9.99,9.99]'),
  (2026, 'Software & Subscriptions', 'Hostgator',           'cost', 230, '[45,45,45,45,45,45,45,45,45,45,45,45]'),
  (2026, 'Software & Subscriptions', 'Claude',              'cost', 240, '[0,0,0,0,0,0,0,80,0,0,0,0]'),
  (2026, 'Software & Subscriptions', 'ChatGPT',             'cost', 250, '[0,0,0,0,0,0,0,20,0,0,0,0]'),
  (2026, 'Software & Subscriptions', 'Vercel',              'cost', 260, '[0,0,0,0,0,0,0,0,0,0,0,0]'),
  -- Crew
  (2026, 'Crew', 'Oshi',   'cost', 310, '[995,1000,1000,1000,1500,1500,1500,1500,1500,1500,1500,1500]'),
  (2026, 'Crew', 'Nelly',  'cost', 320, '[821,1123,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000]'),
  (2026, 'Crew', 'Diana',  'cost', 330, '[500,500,500,500,250,250,250,250,250,250,250,250]'),
  (2026, 'Crew', 'Yuri',   'cost', 340, '[500,0,230,1772,750,750,750,750,750,750,750,750]'),
  (2026, 'Crew', 'Joshua', 'cost', 350, '[230,230,230,230,230,230,230,230,230,230,230,230]'),
  (2026, 'Crew', 'Karen',  'cost', 360, '[170,170,170,170,170,170,170,170,170,170,170,170]'),
  (2026, 'Crew', 'Edson',  'cost', 370, '[150,150,150,150,150,150,150,150,150,150,150,150]'),
  (2026, 'Crew', 'Amy',    'cost', 380, '[0,0,150,0,0,0,0,0,0,0,0,0]'),
  -- Rooms
  (2026, 'Rooms', 'Karen',  'cost', 410, '[100,0,0,0,0,0,30,0,0,0,0,0]'),
  (2026, 'Rooms', 'Edson',  'cost', 420, '[150,0,130,0,0,130,0,0,130,0,0,130]'),
  (2026, 'Rooms', 'Joshua', 'cost', 430, '[120,0,120,0,0,0,160,0,0,0,160,120]'),
  -- Revenue
  (2026, 'Revenue', 'Social revenue', 'revenue', 510, '[4300,4300,4300,6000,5400,5500,0,0,0,0,0,0]');
end if;
end $$;
