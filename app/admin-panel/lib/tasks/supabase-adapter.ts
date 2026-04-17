// Supabase implementation of TasksDataAdapter.
//
// This is the one piece of the tasks system that is intentionally
// project-specific. Other projects porting features/tasks/ should write their
// own adapter (e.g. a Prisma adapter, a REST adapter) instead of this file.

import { createClient } from "../../../../lib/supabase/server";
import type {
  CreateTaskInput,
  Task,
  TaskCategory,
  TaskRecurrence,
  TaskStatus,
  TasksDataAdapter,
  UpdateTaskInput,
} from "@/features/tasks";

type TaskRow = {
  id: string | number;
  title: string | null;
  description: string | null;
  category: string | null;
  assignee: string | null;
  created_by: string | null;
  due_date: string | null;
  status: string | null;
  recurrence: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function rowToTask(row: TaskRow): Task {
  return {
    id: String(row.id),
    title: row.title ?? "",
    description: row.description ?? "",
    category: (row.category ?? "general") as TaskCategory,
    assignee: row.assignee ?? "",
    createdBy: row.created_by ?? "",
    dueDate: row.due_date ?? "",
    status: (row.status ?? "open") as TaskStatus,
    recurrence: (row.recurrence ?? "none") as TaskRecurrence,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function updateInputToRow(input: UpdateTaskInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description;
  if (input.category !== undefined) row.category = input.category;
  if (input.assignee !== undefined) row.assignee = input.assignee;
  if (input.dueDate !== undefined) row.due_date = input.dueDate;
  if (input.recurrence !== undefined) row.recurrence = input.recurrence;
  if (input.status !== undefined) row.status = input.status;
  row.updated_at = new Date().toISOString();
  return row;
}

export const supabaseTasksAdapter: TasksDataAdapter = {
  async listTasks() {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(`tasks: ${error.message}`);
    return (data ?? []).map((row: TaskRow) => rowToTask(row));
  },

  async getTask(id: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`tasks: ${error.message}`);
    return data ? rowToTask(data as TaskRow) : null;
  },

  async createTask(input: CreateTaskInput) {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
      title: input.title,
      description: input.description,
      category: input.category,
      assignee: input.assignee,
      created_by: input.createdBy,
      due_date: input.dueDate,
      status: "open",
      recurrence: input.recurrence,
    });
    if (error) {
      console.error("supabaseTasksAdapter.createTask error:", error);
      throw new Error("Could not add task.");
    }
  },

  async updateTask(id: string, input: UpdateTaskInput) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("tasks")
      .update(updateInputToRow(input))
      .eq("id", id);
    if (error) {
      console.error("supabaseTasksAdapter.updateTask error:", error);
      throw new Error("Could not update task.");
    }
  },

  async deleteTask(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      console.error("supabaseTasksAdapter.deleteTask error:", error);
      throw new Error("Could not delete task.");
    }
  },

  async getCurrentUserEmail() {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? "";
  },
};
