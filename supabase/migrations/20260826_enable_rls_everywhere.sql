-- ---------------------------------------------------------------------------
-- Enable RLS on every public table that doesn't have it.
--
-- Supabase's security advisor flagged a table in public as publicly
-- accessible (rls_disabled_in_public / sensitive_columns_exposed): with RLS
-- off, anyone holding the project URL + anon key can read and write it
-- through PostgREST. Every table created by this repo's migrations already
-- enables RLS, so any offender was created outside them (dashboard / SQL
-- editor) — which also means we can't name it here. This sweep closes the
-- hole for ALL current strays and is safe to re-run.
--
-- Deny-by-default is deliberate: enabling RLS with no policies means anon
-- and authenticated API access get nothing, while the app's service-role
-- clients (createAdminClient / metaServiceClient) bypass RLS and keep
-- working. If a page later needs session-client access to one of these
-- tables, add a scoped policy for that table in its own migration — do not
-- weaken this sweep.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    raise notice 'RLS enabled on public.%', r.tablename;
  end loop;
end $$;
