# Porting the tasks system to another project

The tasks feature is built as a portable module with an adapter pattern, so
you can copy it into another repo with minimal edits. The shared "master
copy" lives in [`features/tasks/`](../features/tasks) — everything
project-specific sits behind an adapter and a few wrapper files in the host
app.

## Architecture

```
features/tasks/                     ← portable, never edit per-project
  types.ts                          Task, filters, inputs
  adapter.ts                        TasksDataAdapter interface
  actions-factory.ts                createTaskActions(adapter, { onMutate })
  config.ts                         default categories, statuses, shortcuts
  index.ts                          barrel

app/admin-panel/lib/tasks/          ← host-specific glue (edit per-project)
  supabase-adapter.ts               concrete adapter for this project
  actions.ts                        "use server" module wiring the factory
  types.ts, config.ts               thin re-exports (override defaults here)
```

To port: copy `features/tasks/` verbatim, rewrite the adapter against the
target project's data layer, and wire the action factory into its
equivalent of Next.js server actions.

## Prompt to paste into Claude Code on the target repo

Copy this whole block into an assistant running in the target repo. It is
self-contained and assumes no prior context.

````markdown
# Port the tasks system from guestlist-social

I want to copy the tasks management feature from my other project
(`Oshioma/guestlist-social`) into this repo. It's built as a portable module
that's designed to be copied across projects via an adapter pattern. Please
help me do that.

## Step 1 — Discover this project's stack
Before you do anything, tell me:
- What framework this repo uses (Next.js App Router / Pages / Remix / other)
- What database + client (Supabase / Prisma / Drizzle / raw SQL / REST API)
- How auth works (what gives us the current user email?)
- Where UI components live, and what styling system is used
- Whether there's already a `features/` folder or similar module pattern

Then confirm with me before proceeding so we agree on where things go.

## Step 2 — Copy the portable module verbatim
From `Oshioma/guestlist-social`, copy the entire `features/tasks/` folder
into this repo at the same path (or under whatever module folder this repo
already uses). It contains five files, and none of them should be edited:

- `features/tasks/types.ts` — Task, TaskStatus, TaskRecurrence, TaskCategory,
  TaskFilters, SavedView, CreateTaskInput, UpdateTaskInput, etc.
- `features/tasks/adapter.ts` — the `TasksDataAdapter` interface
  (listTasks / getTask / createTask / updateTask / deleteTask /
  getCurrentUserEmail)
- `features/tasks/actions-factory.ts` — `createTaskActions(adapter, { onMutate })`
  that returns handlers (addTask, updateTask, updateStatus, deleteTask) with
  validation + recurring-task roll-forward logic built in
- `features/tasks/config.ts` — default categories, status columns, recurrence
  options, keyboard shortcuts
- `features/tasks/index.ts` — barrel export

**Do not modify these files** — they're the shared master copy. Per-project
customization happens at the seams below, not in this folder.

## Step 3 — Write a data adapter for this project
Create an adapter that implements `TasksDataAdapter` against this project's
backend. Use `app/admin-panel/lib/tasks/supabase-adapter.ts` from
guestlist-social as the reference — it's ~120 lines. Swap Supabase calls for
whatever this project uses (Prisma, Drizzle, REST, etc.).

Contract reminder:
```ts
interface TasksDataAdapter {
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<void>;
  updateTask(id: string, input: UpdateTaskInput): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getCurrentUserEmail(): Promise<string>;
}
```

## Step 4 — Wire up server actions (or equivalent)
Create a thin "use server" module (or tRPC router / API route — whatever
this project uses) that:
1. Imports `createTaskActions` from `@/features/tasks`
2. Passes in the adapter from Step 3
3. Passes an `onMutate` callback that revalidates/refreshes the tasks view
4. Re-exports the action handlers

Reference: `app/admin-panel/lib/tasks/actions.ts` in guestlist-social.

## Step 5 — Create the database schema
Add a `tasks` table with these columns:
```
id uuid primary key default gen_random_uuid()
title text not null
description text default ''
category text default 'general'
assignee text default ''
created_by text default ''
due_date date
status text default 'open'         -- open | in_progress | completed
recurrence text default 'none'     -- none | weekly | monthly
created_at timestamptz default now()
updated_at timestamptz default now()
```
Add appropriate RLS / access rules for this project.

## Step 6 — Port the UI
Copy `app/admin-panel/tasks/TasksBoard.tsx` (~1020 lines) and
`app/admin-panel/tasks/page.tsx` from guestlist-social. It imports:
- `SectionCard` from a host `components/` folder — replace with this
  project's equivalent card wrapper, or create a simple one
- Types/config/actions from the paths we set up in steps 2–4

Features it ships with: Kanban board with drag-and-drop, List view with
weekly grouping, bulk selection, search + category + assignee filters,
saved view presets (localStorage), detail panel with subtasks/comments/
activity tabs (currently client-only, NOT persisted), keyboard shortcuts,
recurring tasks that auto-roll-forward on completion.

## Step 7 — Project-specific customization
Override these via the seams — don't fork the feature module:
1. **Categories** — edit `app/.../lib/tasks/config.ts` (the host re-export)
   to replace `DEFAULT_CATEGORIES` with categories that fit this project
2. **Route paths** — update the `onMutate` / revalidation target
3. **User list** — if this project has a nicer way to list known users for
   the assignee picker, wire that into the page's data-fetch function (see
   guestlist's `getTasksData` for the pattern — tasks come from the adapter,
   user aggregation is project-specific)

## Deliverables
When done, show me:
- The list of files created/modified
- The migration to add the `tasks` table
- A quick manual test plan (create / edit / complete / delete / recurring
  roll-forward)
- Anything that differs from guestlist-social (category names, DB client,
  auth, etc.) so I have a record of the customizations

## Do not
- Do NOT edit anything inside `features/tasks/` — that's the shared master
- Do NOT invent extra features beyond what's in the source
- Do NOT skip Step 1 — confirm the stack with me first
````

## Tip

If the target repo is also Supabase + Next.js App Router, you can literally
`cp -r` the files — steps 3 and 4 become trivial. If the stack differs,
steps 1 and 3 are where the agent does real work; the rest is mechanical.
