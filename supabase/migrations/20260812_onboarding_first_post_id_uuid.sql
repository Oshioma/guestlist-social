-- ---------------------------------------------------------------------------
-- Fix: user_onboarding.first_post_id had the wrong type.
--
-- It was created as `bigint`, but proofer_posts.id is a `uuid`. So when the
-- guided tour saved the first post and tried to record its id, the write failed
-- with: invalid input syntax for type bigint: "<uuid>". That surfaced as an
-- error on the yellow "Save" step even though the post itself had saved.
--
-- Convert the column to uuid. It only ever held a convenience pointer (used to
-- reference / dedupe the tour's post), and every write to it errored before
-- this, so there is nothing to preserve — the guarded cast nulls it.
-- Idempotent: only runs while the column is still bigint.
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_onboarding'
      and column_name = 'first_post_id'
      and data_type = 'bigint'
  ) then
    alter table public.user_onboarding
      alter column first_post_id type uuid using null::uuid;
  end if;
end $$;

commit;
