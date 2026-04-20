-- ai_generation_runs: audit trail for each batch idea generation.
-- Lets you trace which prompt + brand context version produced which ideas,
-- and improve prompting over time.

begin;

create table if not exists public.ai_generation_runs (
  id                      uuid        primary key default gen_random_uuid(),
  client_id               bigint      not null references public.clients(id) on delete cascade,
  month                   text        not null,
  platform                text        not null,
  prompt                  text,
  brand_context_snapshot  jsonb,
  number_of_ideas         int         not null default 0,
  empty_slots_found       int         not null default 0,
  created_by              text,
  created_at              timestamptz not null default now()
);

create index if not exists ai_generation_runs_client_idx
  on public.ai_generation_runs (client_id, created_at desc);

-- Add FK from post_ideas to generation runs
alter table public.post_ideas
  add constraint post_ideas_generation_run_fk
  foreign key (generation_run_id)
  references public.ai_generation_runs(id)
  on delete set null;

alter table public.ai_generation_runs enable row level security;

create policy ai_generation_runs_admin on public.ai_generation_runs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
