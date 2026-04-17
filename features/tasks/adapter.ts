// Data-layer interface for the portable tasks module.
//
// Implement this against any backend (Supabase, Postgres+Prisma, REST API,
// in-memory store for tests) and inject it into createTaskActions(). The
// feature module never imports a specific DB client.

import type { CreateTaskInput, Task, UpdateTaskInput } from "./types";

export interface TasksDataAdapter {
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<void>;
  updateTask(id: string, input: UpdateTaskInput): Promise<void>;
  deleteTask(id: string): Promise<void>;
  // Used to stamp created_by when adding a task. Return "" if unknown.
  getCurrentUserEmail(): Promise<string>;
}
