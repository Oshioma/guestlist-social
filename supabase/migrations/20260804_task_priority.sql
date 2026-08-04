-- ---------------------------------------------------------------------------
-- Task priority — a simple "is this high priority?" flag on tasks.
--
-- The tasks board (and the dashboard's per-person priority widget) needs a way
-- to mark a task as high priority. Two levels is enough for how the team works:
-- 'normal' (the default for every existing and new task) and 'high'.
--
-- Kept as a text column with a check constraint rather than a Postgres enum so
-- adding a future level (e.g. 'urgent') is a one-line change, not a type
-- migration. Existing rows default to 'normal', so nothing needs backfilling.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal', 'high'));

-- Speeds up the dashboard widget's "latest high-priority task per assignee"
-- lookup: it scans only high-priority rows, newest first.
create index if not exists tasks_priority_created_idx
  on public.tasks (priority, created_at desc)
  where priority = 'high';
