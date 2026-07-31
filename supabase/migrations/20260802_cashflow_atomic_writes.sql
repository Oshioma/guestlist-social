-- ---------------------------------------------------------------------------
-- Atomic per-cell writes for the cashflow forecast.
--
-- Cell/override edits previously did a read-modify-write of the whole 12-value
-- jsonb array in application code. Two quick edits to the same row could race
-- and lose one another (last write wins on the full array). These functions
-- mutate a single index in one statement, so concurrent edits to different
-- months no longer clobber each other.
--
-- SECURITY INVOKER: the caller's RLS still applies, so the existing admin-only
-- policies on cashflow_lines / cashflow_settings remain the real guard.
-- ---------------------------------------------------------------------------

create or replace function public.cashflow_set_amount(
  p_id bigint, p_month int, p_value numeric
) returns void
language sql security invoker as $$
  update public.cashflow_lines
  set amounts = jsonb_set(
        coalesce(amounts, '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb),
        array[p_month::text], to_jsonb(p_value), true),
      updated_at = now()
  where id = p_id;
$$;

create or replace function public.cashflow_fill_right(
  p_id bigint, p_from int
) returns void
language plpgsql security invoker as $$
declare a jsonb; v jsonb; i int;
begin
  select coalesce(amounts, '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb)
    into a from public.cashflow_lines where id = p_id;
  if a is null then return; end if;
  v := a -> p_from;
  for i in p_from + 1 .. 11 loop
    a := jsonb_set(a, array[i::text], v, true);
  end loop;
  update public.cashflow_lines set amounts = a, updated_at = now() where id = p_id;
end $$;

-- p_value null clears the override for that month (revert to the live total).
create or replace function public.cashflow_set_retainer(
  p_year int, p_month int, p_value numeric
) returns void
language plpgsql security invoker as $$
declare v jsonb;
begin
  v := case when p_value is null then 'null'::jsonb else to_jsonb(p_value) end;
  insert into public.cashflow_settings (year, retainer_overrides)
  values (
    p_year,
    jsonb_set('[null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
              array[p_month::text], v, true)
  )
  on conflict (year) do update
    set retainer_overrides = jsonb_set(
          coalesce(public.cashflow_settings.retainer_overrides,
                   '[null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb),
          array[p_month::text], v, true),
        updated_at = now();
end $$;

grant execute on function public.cashflow_set_amount(bigint, int, numeric) to authenticated;
grant execute on function public.cashflow_fill_right(bigint, int) to authenticated;
grant execute on function public.cashflow_set_retainer(int, int, numeric) to authenticated;
