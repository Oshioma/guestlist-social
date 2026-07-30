-- Live sync for the proofer board.
--
-- Stream proofer_posts changes to every open browser via Supabase Realtime so
-- a teammate's saved edits (a new image, caption, or status change) appear
-- without a page refresh. Realtime still enforces the existing RLS policies,
-- so a browser only receives rows it is already allowed to read.

-- REPLICA IDENTITY FULL so UPDATE and DELETE payloads carry every column
-- (notably client_id), which the client subscription filters on.
alter table public.proofer_posts replica identity full;

-- Add the table to Supabase's realtime publication, idempotently — the
-- publication is created automatically by Supabase and may already list it.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proofer_posts'
  ) then
    alter publication supabase_realtime add table public.proofer_posts;
  end if;
end $$;
