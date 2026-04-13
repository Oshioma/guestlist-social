"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

const VALID_CATEGORIES = ["video", "story", "carousel", "design", "general"];
const VALID_STATUSES = ["open", "in_progress", "completed"];
const VALID_RECURRENCES = ["none", "weekly", "monthly"];

function advanceDueDate(
  dueDate: string | null,
  recurrence: "weekly" | "monthly"
): string {
  // Base from the existing due date if present, otherwise today
  const base = dueDate ? new Date(dueDate) : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  if (recurrence === "weekly") {
    base.setDate(base.getDate() + 7);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base.toISOString().slice(0, 10);
}

export async function addTaskAction(
  title: string,
  description: string,
  category: string,
  assignee: string,
  dueDate: string,
  recurrence: string = "none"
) {
  if (!title.trim()) {
    throw new Error("Task title is required.");
  }

  const normalizedCategory = VALID_CATEGORIES.includes(category)
    ? category
    : "general";
  const normalizedRecurrence = VALID_RECURRENCES.includes(recurrence)
    ? recurrence
    : "none";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const createdBy = user?.email ?? "unknown";

  const { error } = await supabase.from("tasks").insert({
    title: title.trim(),
    description: description.trim(),
    category: normalizedCategory,
    assignee: assignee.trim(),
    created_by: createdBy,
    due_date: dueDate || null,
    status: "open",
    recurrence: normalizedRecurrence,
  });

  if (error) {
    console.error("addTaskAction error:", error);
    throw new Error("Could not add task.");
  }

  revalidatePath("/admin-panel/tasks");
}

export async function updateTaskAction(
  id: string,
  title: string,
  description: string,
  category: string,
  assignee: string,
  dueDate: string,
  recurrence: string = "none"
) {
  if (!id || !title.trim()) {
    throw new Error("ID and title are required.");
  }

  const normalizedCategory = VALID_CATEGORIES.includes(category)
    ? category
    : "general";
  const normalizedRecurrence = VALID_RECURRENCES.includes(recurrence)
    ? recurrence
    : "none";

  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({
      title: title.trim(),
      description: description.trim(),
      category: normalizedCategory,
      assignee: assignee.trim(),
      due_date: dueDate || null,
      recurrence: normalizedRecurrence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateTaskAction error:", error);
    throw new Error("Could not update task.");
  }

  revalidatePath("/admin-panel/tasks");
}

export async function updateTaskStatusAction(id: string, status: string) {
  if (!id) throw new Error("ID is required.");
  const normalizedStatus = VALID_STATUSES.includes(status) ? status : "open";

  const supabase = await createClient();

  // If completing a recurring task, advance its due date and reopen instead
  if (normalizedStatus === "completed") {
    const { data: existing, error: fetchError } = await supabase
      .from("tasks")
      .select("id, recurrence, due_date")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("updateTaskStatusAction fetch error:", fetchError);
      throw new Error("Could not update task status.");
    }

    if (
      existing &&
      (existing.recurrence === "weekly" || existing.recurrence === "monthly")
    ) {
      const nextDue = advanceDueDate(
        existing.due_date,
        existing.recurrence as "weekly" | "monthly"
      );
      const { error: rollError } = await supabase
        .from("tasks")
        .update({
          due_date: nextDue,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (rollError) {
        console.error("updateTaskStatusAction roll error:", rollError);
        throw new Error("Could not roll recurring task forward.");
      }

      revalidatePath("/admin-panel/tasks");
      return;
    }
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateTaskStatusAction error:", error);
    throw new Error("Could not update task status.");
  }

  revalidatePath("/admin-panel/tasks");
}

export async function deleteTaskAction(id: string) {
  if (!id) throw new Error("ID is required.");

  const supabase = await createClient();

  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    console.error("deleteTaskAction error:", error);
    throw new Error("Could not delete task.");
  }

  revalidatePath("/admin-panel/tasks");
}
