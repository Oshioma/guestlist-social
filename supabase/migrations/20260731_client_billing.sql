-- ---------------------------------------------------------------------------
-- Client billing — what each client pays the agency, admin-only.
--
-- `monthly_price` is the retainer the client pays us (distinct from
-- `monthly_budget`, which is their ad spend). `direct_debit` marks clients who
-- pay by DD. Both are surfaced only on the admin client-edit page and are
-- never shown in the client portal.
--
-- Seeding: values are applied to clients that ALREADY exist, matched on name
-- (case-insensitive). Rows with no matching client are simply skipped — we
-- never create a client from this list.
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists monthly_price numeric;

alter table public.clients
  add column if not exists direct_debit boolean not null default false;

update public.clients c
set monthly_price = v.price,
    direct_debit  = v.dd
from (values
  ('alsop and walker',        600, true),
  ('firestorm heaters',       600, true),
  ('the coconut company',     600, true),
  ('eye level opticians',     600, true),
  ('kingsley smythe',         500, true),
  ('mark2 ebikes',            500, true),
  ('@scan2veri',              500, false),
  ('teamountain',             500, true),
  ('moons green charcuterie', 500, true),
  ('hydes cyder',             350, true),
  ('bush barn farm',          350, false),
  ('japanese knife company',  400, true)
) as v(name, price, dd)
where lower(c.name) = v.name;
