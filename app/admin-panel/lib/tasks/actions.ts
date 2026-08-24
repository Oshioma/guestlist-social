"use server";

// Server actions exposed to the UI. Wires the portable createTaskActions
// factory to this project's Supabase adapter and Next.js revalidation.
// To port to another project, replace supabaseTasksAdapter with your adapter
// and update the revalidatePath target.

import { revalidatePath } from "next/cache";
import { createTaskActions } from "@/features/tasks";
import { supabaseTasksAdapter } from "./supabase-adapter";

const actions = createTaskActions(supabaseTasksAdapter, {
  onMutate: () => {
    revalidatePath("/admin-panel/tasks");
    revalidatePath("/admin-panel/tasks/completed");
    revalidatePath("/admin-panel/tasks/overview");
  },
});

export async function addTaskAction(
  title: string,
  description: string,
  category: string,
  assignee: string,
  dueDate: string,
  recurrence: string = "none",
  priority: string = "normal"
) {
  return actions.addTask(
    title,
    description,
    category,
    assignee,
    dueDate,
    recurrence,
    priority
  );
}

export async function updateTaskAction(
  id: string,
  title: string,
  description: string,
  category: string,
  assignee: string,
  dueDate: string,
  recurrence: string = "none",
  priority: string = "normal"
) {
  return actions.updateTask(
    id,
    title,
    description,
    category,
    assignee,
    dueDate,
    recurrence,
    priority
  );
}

export async function updateTaskStatusAction(id: string, status: string) {
  return actions.updateStatus(id, status);
}

export async function updateTaskPriorityAction(id: string, priority: string) {
  return actions.updatePriority(id, priority);
}

export async function deleteTaskAction(id: string) {
  return actions.deleteTask(id);
}
