// Data-layer interface for the portable tasks module.
//
// Implement this against any backend (Supabase, Postgres+Prisma, REST API,
// in-memory store for tests) and inject it into createTaskActions(). The
// feature module never imports a specific DB client.

import type {
  CreateTaskInput,
  Task,
  TaskCompletion,
  TaskCompletionInput,
  UpdateTaskInput,
} from "./types";

export interface TasksDataAdapter {
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<void>;
  updateTask(id: string, input: UpdateTaskInput): Promise<void>;
  deleteTask(id: string): Promise<void>;
  // Used to stamp created_by when adding a task. Return "" if unknown.
  getCurrentUserEmail(): Promise<string>;

  // Optional completion log (powers "what did each person finish each week").
  // Adapters without a backing store can omit all three; the factory then
  // skips logging and completion behaves exactly as before.
  //
  // recordCompletion with replaceExisting=true removes prior rows for the
  // same task first — used for one-off tasks so a reopen + re-complete keeps
  // one row, while recurring tasks append a row per completion.
  recordCompletion?(
    input: TaskCompletionInput,
    replaceExisting: boolean
  ): Promise<void>;
  // Called when a one-off task leaves 'completed' — it isn't done anymore.
  clearCompletionsForTask?(taskId: string): Promise<void>;
  listCompletions?(): Promise<TaskCompletion[]>;
}
