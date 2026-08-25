-- ---------------------------------------------------------------------------
-- Sales tracker — two editable logs for the sales effort, living at /app/sales.
--
-- 1. sales_weeks — the weekly activity grid. One row per (week, rep) holding
--    Mon–Fri counts of calls / opportunities / deals as length-5 jsonb arrays
--    (same narrow-table trick as cashflow_lines), plus a per-week leads count.
--    Weekly and yearly totals are NOT stored — the page derives them, so they
--    can never drift from the day cells the way the spreadsheet totals could.
--
-- 2. sales_opportunities — the per-company pipeline log. One row per pitch:
--    which month it belongs to, the day it was logged, the company, the quoted
--    amount, where it landed (pending / booked / not booked), an optional
--    follow-up date (the sheet's "Date" column) and free-form notes.
--
-- Access: internal sales data for the whole crew — any admitted admin-panel
-- member (a user_roles row → public.is_admin()) may read and write, so reps
-- can log their own numbers. Client-portal users get nothing.
-- ---------------------------------------------------------------------------

create table if not exists public.sales_weeks (
  id          bigint generated always as identity primary key,
  -- Monday of the week ("W/S" in the spreadsheet).
  week_start  date not null,
  rep         text not null default 'Nelly',
  -- Five daily counts, Monday … Friday. Nulls/short arrays read as 0.
  calls       jsonb not null default '[0,0,0,0,0]'::jsonb,
  opps        jsonb not null default '[0,0,0,0,0]'::jsonb,
  deals       jsonb not null default '[0,0,0,0,0]'::jsonb,
  leads       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_start, rep)
);

create index if not exists sales_weeks_week_idx
  on public.sales_weeks (week_start desc);

create table if not exists public.sales_opportunities (
  id          bigint generated always as identity primary key,
  -- First of the month the row is grouped under (the sheet's month headings).
  month_start date not null,
  -- The day the pitch was logged. Null for rows the sheet only dated by month.
  opp_date    date,
  company     text not null default '',
  -- Quoted amount in GBP. Null when it hasn't been priced yet.
  amount      numeric,
  status      text not null default 'pending'
              check (status in ('pending', 'booked', 'not_booked')),
  -- The sheet's "Date" column — a call-back / decision date.
  follow_up   date,
  notes       text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sales_opportunities_month_idx
  on public.sales_opportunities (month_start, sort_order);

alter table public.sales_weeks         enable row level security;
alter table public.sales_opportunities enable row level security;

-- is_admin() = "has a user_roles row", i.e. any admitted staff member — the
-- whole crew can log sales. Drop-then-create so the migration re-runs cleanly.
drop policy if exists sales_weeks_staff_all on public.sales_weeks;
create policy sales_weeks_staff_all on public.sales_weeks
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sales_opportunities_staff_all on public.sales_opportunities;
create policy sales_opportunities_staff_all on public.sales_opportunities
  for all using (public.is_admin()) with check (public.is_admin());

-- Atomic single-day writes (same rationale as cashflow_set_amount): two quick
-- edits to different days of the same row must not clobber each other through
-- a read-modify-write of the whole array. SECURITY INVOKER — RLS still applies.
create or replace function public.sales_week_set_day(
  p_id bigint, p_metric text, p_day int, p_value int
) returns void
language plpgsql security invoker as $$
begin
  if p_day < 0 or p_day > 4 then
    raise exception 'bad day index %', p_day;
  end if;
  if p_metric = 'calls' then
    update public.sales_weeks
    set calls = jsonb_set(coalesce(calls, '[0,0,0,0,0]'::jsonb),
                          array[p_day::text], to_jsonb(p_value), true),
        updated_at = now()
    where id = p_id;
  elsif p_metric = 'opps' then
    update public.sales_weeks
    set opps = jsonb_set(coalesce(opps, '[0,0,0,0,0]'::jsonb),
                         array[p_day::text], to_jsonb(p_value), true),
        updated_at = now()
    where id = p_id;
  elsif p_metric = 'deals' then
    update public.sales_weeks
    set deals = jsonb_set(coalesce(deals, '[0,0,0,0,0]'::jsonb),
                          array[p_day::text], to_jsonb(p_value), true),
        updated_at = now()
    where id = p_id;
  else
    raise exception 'bad metric %', p_metric;
  end if;
end $$;

grant execute on function public.sales_week_set_day(bigint, text, int, int) to authenticated;

-- ── Seed: transcribed from the operator's spreadsheet ───────────────────────
-- Weekly activity, Nelly, W/S 12 Jan – 20 Apr 2026. Day totals were checked
-- against the sheet's own weekly totals (e.g. W/S 19/01: 102 calls / 15 opps).
-- The sheet's "W/S 21/04" week is stored under its actual Monday, 20 Apr.
-- Guarded so a re-run can't duplicate rows.

do $$
begin
if not exists (select 1 from public.sales_weeks) then
insert into public.sales_weeks (week_start, rep, calls, opps, deals, leads) values
  ('2026-01-12', 'Nelly', '[7,21,16,10,20]',   '[0,3,1,1,3]', '[0,0,0,0,0]', 0),
  ('2026-01-19', 'Nelly', '[26,20,20,15,21]',  '[5,4,4,0,2]', '[0,0,0,0,0]', 0),
  ('2026-01-26', 'Nelly', '[0,16,16,23,20]',   '[0,3,3,5,1]', '[0,0,0,0,0]', 0),
  ('2026-02-02', 'Nelly', '[13,7,23,0,24]',    '[2,0,1,0,4]', '[0,0,0,0,0]', 0),
  ('2026-02-09', 'Nelly', '[22,22,16,19,16]',  '[4,1,2,3,1]', '[0,0,0,0,0]', 0),
  ('2026-02-16', 'Nelly', '[14,15,5,24,15]',   '[0,2,0,4,3]', '[0,0,1,0,0]', 0),
  ('2026-02-23', 'Nelly', '[19,14,14,7,0]',    '[4,1,2,2,0]', '[0,0,0,0,0]', 0),
  ('2026-03-02', 'Nelly', '[25,20,0,15,5]',    '[3,4,0,1,0]', '[0,0,0,0,0]', 0),
  ('2026-03-09', 'Nelly', '[15,9,21,15,14]',   '[4,0,5,1,2]', '[1,1,0,0,0]', 0),
  ('2026-03-16', 'Nelly', '[0,21,7,7,14]',     '[0,3,1,0,2]', '[0,0,1,0,0]', 0),
  ('2026-03-23', 'Nelly', '[5,10,15,9,0]',     '[1,1,2,1,0]', '[0,0,0,0,0]', 0),
  ('2026-04-20', 'Nelly', '[10,9,9,15,5]',     '[1,3,1,2,1]', '[0,0,0,0,0]', 0);
end if;
end $$;

-- Opportunity log, January – April 2026. Status comes from which column the
-- amount sat in on the sheet (Amount → pending, Booked, Not Booked); the
-- sheet's "Date" column is stored as follow_up. Rows the sheet left undated
-- keep opp_date null and their sheet order via sort_order.

do $$
begin
if not exists (select 1 from public.sales_opportunities) then
insert into public.sales_opportunities
  (month_start, opp_date, company, amount, status, follow_up, notes, sort_order) values
  -- January
  ('2026-01-01', '2026-01-13', 'Crossogue Preserves',   500, 'pending',    null, '', 10),
  ('2026-01-01', '2026-01-13', 'Devon Distillery',      500, 'pending',    null, '', 20),
  ('2026-01-01', '2026-01-13', 'Olu Olu Foods',         500, 'pending',    null, '', 30),
  ('2026-01-01', '2026-01-19', 'Jeeves & Jericho',      350, 'pending',    null, '', 40),
  ('2026-01-01', '2026-01-19', 'Modern Art Distillery', 350, 'pending',    null, '', 50),
  ('2026-01-01', '2026-01-19', 'Jam Mothers',           350, 'not_booked', null, '', 60),
  ('2026-01-01', '2026-01-19', 'Lakeland Mues',         350, 'not_booked', null, '', 70),
  ('2026-01-01', '2026-01-19', 'Suffolk Salami Co',     350, 'pending',    null, '', 80),
  ('2026-01-01', '2026-01-19', 'Auntie''s Sauces',      500, 'not_booked', null, '', 90),
  ('2026-01-01', '2026-01-20', 'Antelm Hats',           350, 'not_booked', null, '', 100),
  ('2026-01-01', '2026-01-20', 'Da Vinci',              500, 'not_booked', null, '', 110),
  ('2026-01-01', '2026-01-20', 'Fussells',              350, 'pending',    null, '', 120),
  ('2026-01-01', '2026-01-20', 'Slake Spirits',         350, 'pending',    null, '', 130),
  ('2026-01-01', '2026-01-21', 'Koyu Matcha',           500, 'pending',    null, 'Quoted 500 / 600', 140),
  ('2026-01-01', '2026-01-21', 'House of Flavours',     500, 'pending',    null, '', 150),
  ('2026-01-01', '2026-01-21', 'Riverbank Bakery',      500, 'not_booked', null, '', 160),
  ('2026-01-01', '2026-01-23', 'Honey Hills',           350, 'pending',    null, '', 170),
  ('2026-01-01', '2026-01-23', '820 Spirits',           500, 'not_booked', null, '', 180),
  ('2026-01-01', '2026-01-27', 'Pretty Smart Food',     600, 'pending',    '2026-02-10', '', 190),
  ('2026-01-01', '2026-01-27', 'Naija Treats',          350, 'not_booked', null, '', 200),
  ('2026-01-01', '2026-01-27', 'Stockans',              600, 'not_booked', '2026-02-10', '', 210),
  ('2026-01-01', '2026-01-28', 'New Forest Ice Cream',  600, 'not_booked', null, '', 220),
  ('2026-01-01', '2026-01-28', 'Ms Tita''s Coffee',     400, 'pending',    '2026-02-02', '', 230),
  ('2026-01-01', '2026-01-28', 'Izelias Chocolate',     350, 'pending',    null, '', 240),
  ('2026-01-01', '2026-01-29', 'Lauden Chocolate',      500, 'pending',    null, '', 250),
  ('2026-01-01', '2026-01-29', 'Evans of Arlesford',    500, 'pending',    null, '', 260),
  ('2026-01-01', '2026-01-29', 'Victus Emporium',       700, 'not_booked', '2026-02-11', '', 270),
  ('2026-01-01', '2026-01-29', 'Skapeti',               500, 'booked',     null, '', 280),
  ('2026-01-01', '2026-01-29', 'Suzanna & Daughters',   350, 'pending',    null, '', 290),
  ('2026-01-01', '2026-01-30', 'Pucketts Pickles',      350, 'pending',    '2026-02-06', '', 300),
  -- February
  ('2026-02-01', '2026-02-02', 'Django Coffee',             350,  'not_booked', null, '', 10),
  ('2026-02-01', '2026-02-02', 'Butler Country Estates',    null, 'pending',    null, '', 20),
  ('2026-02-01', '2026-02-04', 'Orexis / Simply Delicious', 500,  'pending',    null, '', 30),
  ('2026-02-01', '2026-02-04', 'Farm Girl Sausages',        null, 'pending',    null, '', 40),
  ('2026-02-01', '2026-02-06', 'Honeyland',                 600,  'not_booked', null, '', 50),
  ('2026-02-01', '2026-02-06', 'Dale''s Butchers',          500,  'pending',    null, '', 60),
  ('2026-02-01', '2026-02-06', 'Brookwood Barns',           500,  'pending',    null, '', 70),
  ('2026-02-01', '2026-02-06', 'Northbrook Arms',           500,  'not_booked', null, '', 80),
  ('2026-02-01', '2026-02-09', 'Colchester Oyster Fishery', 500,  'pending',    null, '', 90),
  ('2026-02-01', '2026-02-09', 'Hydes Cyder',               350,  'booked',     null, '', 100),
  ('2026-02-01', '2026-02-09', 'Real Jam',                  500,  'not_booked', null, '', 110),
  ('2026-02-01', '2026-02-09', 'Powabyke',                  350,  'not_booked', null, '', 120),
  ('2026-02-01', '2026-02-10', 'Biltong Boss',              500,  'pending',    null, '', 130),
  ('2026-02-01', '2026-02-11', 'Japanese Knife Co',         400,  'booked',     null, '', 140),
  ('2026-02-01', '2026-02-11', 'Cotswold Curer',            350,  'pending',    null, '', 150),
  ('2026-02-01', '2026-02-12', 'The BBQ Shop',              500,  'not_booked', null, '', 160),
  ('2026-02-01', '2026-02-12', 'Jane''s Grains',            350,  'not_booked', null, '', 170),
  ('2026-02-01', '2026-02-12', 'Wilfreds Pies',             500,  'pending',    null, '', 180),
  ('2026-02-01', '2026-02-17', 'dlux London',               500,  'pending',    null, '', 190),
  ('2026-02-01', '2026-02-17', 'Leon Boots Co',             500,  'not_booked', null, '', 200),
  ('2026-02-01', '2026-02-19', 'Waterhouse Fayre',          350,  'not_booked', null, '', 210),
  ('2026-02-01', '2026-02-19', 'Bush Barn Farm',            350,  'booked',     null, '', 220),
  ('2026-02-01', '2026-02-19', 'Italian Recipe',            500,  'pending',    null, '', 230),
  ('2026-02-01', '2026-02-19', 'Cornish Country Cordials',  350,  'not_booked', null, '', 240),
  ('2026-02-01', '2026-02-19', 'Hanora Health',             500,  'pending',    null, '', 250),
  ('2026-02-01', '2026-02-20', 'Forge Coffee',              500,  'not_booked', null, '', 260),
  ('2026-02-01', '2026-02-20', 'South Downs Sourdough',     350,  'not_booked', null, '', 270),
  ('2026-02-01', '2026-02-20', 'Curious Tea',               500,  'not_booked', null, '', 280),
  ('2026-02-01', '2026-02-23', 'Cotswold Gold',             500,  'pending',    null, '', 290),
  ('2026-02-01', '2026-02-23', 'Savage Works',              350,  'pending',    null, '', 300),
  ('2026-02-01', '2026-02-23', 'The Giggly Pig',            500,  'pending',    null, '', 310),
  ('2026-02-01', '2026-02-23', 'LG Leather',                200,  'not_booked', null, '', 320),
  ('2026-02-01', null,         'RooDog',                    350,  'pending',    null, '', 330),
  ('2026-02-01', null,         'Croft House',               500,  'pending',    null, '', 340),
  ('2026-02-01', null,         'Golden Pride',              500,  'pending',    null, '', 350),
  ('2026-02-01', null,         'Ottervale',                 350,  'pending',    null, '', 360),
  ('2026-02-01', null,         'Moons Green',               500,  'booked',     null, '', 370),
  ('2026-02-01', null,         'Peanut Caramel',            350,  'not_booked', null, '', 380),
  ('2026-02-01', null,         'Anna Calvert',              null, 'pending',    null, '', 390),
  -- March (the sheet dated these by month only)
  ('2026-03-01', null, 'Reet Yorkshire Food',    350,  'pending',    null, '', 10),
  ('2026-03-01', null, 'The Bakers Pig',         350,  'not_booked', null, '', 20),
  ('2026-03-01', null, 'Nicholls Nectar',        350,  'not_booked', null, '', 30),
  ('2026-03-01', null, 'Oink & Udder',           350,  'not_booked', null, '', 40),
  ('2026-03-01', null, 'Farmers at Home',        350,  'pending',    null, '', 50),
  ('2026-03-01', null, 'Welsh Coffee Co',        350,  'not_booked', null, '', 60),
  ('2026-03-01', null, 'Avalis',                 500,  'pending',    null, '', 70),
  ('2026-03-01', null, 'Goat Herd Coffee',       650,  'pending',    null, '', 80),
  ('2026-03-01', null, 'Wild Oat Drink',         400,  'pending',    null, '', 90),
  ('2026-03-01', null, 'Fresh Flour Co',         500,  'not_booked', null, '', 100),
  ('2026-03-01', null, 'Flavour Moments',        500,  'pending',    null, '', 110),
  ('2026-03-01', null, 'Green Olive Firewood',   500,  'pending',    null, '', 120),
  ('2026-03-01', null, 'Nila Parmar',            500,  'pending',    null, '', 130),
  ('2026-03-01', null, 'Itania Oil',             500,  'not_booked', null, '', 140),
  ('2026-03-01', null, 'Oh Raw',                 400,  'pending',    null, '', 150),
  ('2026-03-01', null, 'Pendragon Drinks',       500,  'pending',    null, '', 160),
  ('2026-03-01', null, 'Furlong Fabricaton',     350,  'pending',    null, '', 170),
  ('2026-03-01', null, 'Pura Panela',            500,  'pending',    null, '', 180),
  ('2026-03-01', null, 'Yockenthwaite',          600,  'not_booked', null, '', 190),
  ('2026-03-01', null, 'Apple County Cider Co',  500,  'pending',    null, '', 200),
  ('2026-03-01', null, 'Vin Vineyards',          500,  'pending',    null, '', 210),
  ('2026-03-01', null, 'The Bagel Bakery',       500,  'pending',    null, '', 220),
  ('2026-03-01', null, 'Counter Culture Drinks', 500,  'pending',    null, '', 230),
  ('2026-03-01', null, 'Invoke Distillery',      500,  'pending',    null, '', 240),
  ('2026-03-01', null, 'Honey Heaven',           null, 'pending',    null, '', 250),
  ('2026-03-01', null, 'Succulento',             500,  'pending',    null, '', 260),
  ('2026-03-01', null, 'Joe''s Chilli Sauce',    500,  'not_booked', null, '', 270),
  -- April
  ('2026-04-01', null,         'Brown Bag Crisps',         null, 'pending', null, '', 10),
  ('2026-04-01', null,         'Vanilla ETC',              null, 'pending', null, '', 20),
  ('2026-04-01', null,         'Stewarts',                 null, 'pending', null, '', 30),
  ('2026-04-01', null,         'Respite Tea',              null, 'pending', null, '', 40),
  ('2026-04-01', '2026-04-21', 'Prewett''s Biscuits',      null, 'pending', null, '', 50),
  ('2026-04-01', '2026-04-21', 'Boka Food',                null, 'pending', null, '', 60),
  ('2026-04-01', '2026-04-21', 'Kentish Mayde',            null, 'pending', null, '', 70),
  ('2026-04-01', '2026-04-22', 'Ralph''s Boutique Caterer', null, 'pending', null, '', 80),
  ('2026-04-01', '2026-04-23', 'Nature Squared',           null, 'pending', null, '', 90),
  ('2026-04-01', '2026-04-23', 'Love Pickle',              null, 'pending', null, '', 100),
  ('2026-04-01', '2026-04-24', 'Hildon Water',             null, 'pending', null, '', 110);
end if;
end $$;
