-- ---------------------------------------------------------------------------
-- Task completions — an append-only log of "who finished what, when".
--
-- The tasks table alone can't answer "what did each employee get done each
-- week": it has no completed_at (updated_at drifts on later edits), and
-- completing a *recurring* task rolls it forward to 'open' with the next due
-- date, so the completion itself leaves no trace. This table records one row
-- per completion event, which the weekly completed-tasks report reads.
--
-- Semantics (enforced in features/tasks/actions-factory.ts):
--   * recurring task completed  → append a row, task rolls forward as before
--   * one-off task completed    → replace that task's row (re-completing after
--                                 a reopen keeps only the latest completion)
--   * one-off task reopened     → its row is deleted (it isn't done anymore)
-- ---------------------------------------------------------------------------

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  -- Stored as text so it works regardless of the tasks.id type; the task may
  -- also be deleted later, so this is deliberately not a foreign key — the log
  -- keeps its snapshot either way.
  task_id text not null,
  title text not null,
  category text not null default 'general',
  assignee text not null default '',
  completed_by text not null default '',
  recurrence text not null default 'none',
  completed_at timestamp with time zone not null default now()
);

-- The report reads "recent completions, newest first".
create index if not exists task_completions_completed_at_idx
  on public.task_completions (completed_at desc);

-- Same access model as tasks itself: staff only (see 20260427_rls_policies).
alter table public.task_completions enable row level security;
create policy task_completions_admin on public.task_completions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Backfill: tasks already sitting in 'completed' get one row each, dated by
-- updated_at (the closest thing to a completion time we have for them). The
-- tasks table was created outside migrations, so guard its existence, and
-- skip the backfill on re-run if the log already has rows.
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'tasks')
     and not exists (select 1 from public.task_completions) then
    insert into public.task_completions
      (task_id, title, category, assignee, completed_by, recurrence, completed_at)
    select
      t.id::text,
      coalesce(t.title, ''),
      coalesce(t.category, 'general'),
      coalesce(t.assignee, ''),
      coalesce(t.assignee, ''),
      coalesce(t.recurrence, 'none'),
      coalesce(t.updated_at, t.created_at, now())
    from public.tasks t
    where t.status = 'completed';
  end if;
end $$;
