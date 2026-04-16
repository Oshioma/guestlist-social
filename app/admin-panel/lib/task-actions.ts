"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import type {
  TaskCategory,
  TaskPermissionScope,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
} from "./types";
import {
  TASKS_CONFIG,
  VALID_TASK_CATEGORIES,
  VALID_TASK_PERMISSION_SCOPES,
  VALID_TASK_PRIORITIES,
  VALID_TASK_RECURRENCES,
  VALID_TASK_STATUSES,
} from "./tasks-config";

type AddTaskInput = {
  title: string;
  description?: string;
  category?: string;
  assignee?: string;
  dueDate?: string;
  startDate?: string;
  recurrence?: string;
  recurrenceInterval?: number | null;
  priority?: string;
  parentTaskId?: string | null;
  permissionsScope?: string;
};

type UpdateTaskInput = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  assignee?: string;
  dueDate?: string;
  startDate?: string;
  recurrence?: string;
  recurrenceInterval?: number | null;
  priority?: string;
  permissionsScope?: string;
};

function normalizeCategory(value?: string): TaskCategory {
  return VALID_TASK_CATEGORIES.includes(value as TaskCategory)
    ? (value as TaskCategory)
    : "general";
}

function normalizeStatus(value?: string): TaskStatus {
  return VALID_TASK_STATUSES.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : "open";
}

function normalizePriority(value?: string): TaskPriority {
  return VALID_TASK_PRIORITIES.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : "medium";
}

function normalizeRecurrence(value?: string): TaskRecurrence {
  return VALID_TASK_RECURRENCES.includes(value as TaskRecurrence)
    ? (value as TaskRecurrence)
    : "none";
}

function normalizeScope(value?: string): TaskPermissionScope {
  return VALID_TASK_PERMISSION_SCOPES.includes(value as TaskPermissionScope)
    ? (value as TaskPermissionScope)
    : "team";
}

function advanceDueDate(
  dueDate: string | null,
  recurrence: "daily" | "weekly" | "monthly",
  interval: number | null
): string {
  const base = dueDate ? new Date(dueDate) : new Date();
  const step = interval && interval > 0 ? interval : 1;

  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  if (recurrence === "daily") {
    base.setDate(base.getDate() + step);
  } else if (recurrence === "weekly") {
    base.setDate(base.getDate() + step * 7);
  } else {
    base.setMonth(base.getMonth() + step);
  }

  return base.toISOString().slice(0, 10);
}

async function getActorEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    supabase,
    actor: user?.email ?? "unknown",
  };
}

async function logTaskActivity(params: {
  taskId: string;
  action: string;
  actor: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  const supabase = await createClient();

  await supabase.from("task_activity").insert({
    task_id: params.taskId,
    action: params.action,
    field_name: params.fieldName ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    actor: params.actor,
  });
}

async function createNotification(params: {
  taskId?: string | null;
  userEmail: string;
  type: string;
  title: string;
  body?: string;
}) {
  const supabase = await createClient();

  await supabase.from("task_notifications").insert({
    task_id: params.taskId ?? null,
    user_email: params.userEmail,
    type: params.type,
    title: params.title,
    body: params.body ?? "",
    is_read: false,
  });
}

function refreshTasks() {
  revalidatePath(TASKS_CONFIG.revalidatePath);
}

export async function addTaskAction(input: AddTaskInput) {
  if (!input.title?.trim()) {
    throw new Error("Task title is required.");
  }

  const { supabase, actor } = await getActorEmail();

  const normalizedCategory = normalizeCategory(input.category);
  const normalizedRecurrence = normalizeRecurrence(input.recurrence);
  const normalizedPriority = normalizePriority(input.priority);
  const normalizedScope = normalizeScope(input.permissionsScope);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      parent_task_id: input.parentTaskId ?? null,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      category: normalizedCategory,
      assignee: (input.assignee ?? "").trim(),
      created_by: actor,
      due_date: input.dueDate || null,
      start_date: input.startDate || null,
      status: "open",
      priority: normalizedPriority,
      recurrence: normalizedRecurrence,
      recurrence_interval:
        input.recurrenceInterval && input.recurrenceInterval > 0
          ? input.recurrenceInterval
          : null,
      permissions_scope: normalizedScope,
    })
    .select("id, assignee, title")
    .single();

  if (error) {
    console.error("addTaskAction error:", error);
    throw new Error("Could not add task.");
  }

  await logTaskActivity({
    taskId: String(data.id),
    action: input.parentTaskId ? "subtask_created" : "task_created",
    actor,
  });

  if (TASKS_CONFIG.allowNotifications && data.assignee && data.assignee !== actor) {
    await createNotification({
      taskId: String(data.id),
      userEmail: data.assignee,
      type: "task_assigned",
      title: `New task assigned: ${data.title}`,
      body: `${actor} assigned you a task.`,
    });
  }

  refreshTasks();
}

export async function updateTaskAction(input: UpdateTaskInput) {
  if (!input.id || !input.title?.trim()) {
    throw new Error("ID and title are required.");
  }

  const { supabase, actor } = await getActorEmail();

  const normalizedCategory = normalizeCategory(input.category);
  const normalizedRecurrence = normalizeRecurrence(input.recurrence);
  const normalizedPriority = normalizePriority(input.priority);
  const normalizedScope = normalizeScope(input.permissionsScope);

  const { data: existing, error: existingError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();

  if (existingError) {
    console.error("updateTaskAction fetch error:", existingError);
    throw new Error("Could not update task.");
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      category: normalizedCategory,
      assignee: (input.assignee ?? "").trim(),
      due_date: input.dueDate || null,
      start_date: input.startDate || null,
      recurrence: normalizedRecurrence,
      recurrence_interval:
        input.recurrenceInterval && input.recurrenceInterval > 0
          ? input.recurrenceInterval
          : null,
      priority: normalizedPriority,
      permissions_scope: normalizedScope,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    console.error("updateTaskAction error:", error);
    throw new Error("Could not update task.");
  }

  await logTaskActivity({
    taskId: input.id,
    action: "task_updated",
    actor,
  });

  if (
    TASKS_CONFIG.allowNotifications &&
    existing?.assignee !== (input.assignee ?? "").trim() &&
    input.assignee
  ) {
    await createNotification({
      taskId: input.id,
      userEmail: input.assignee,
      type: "task_reassigned",
      title: `Task assigned: ${input.title.trim()}`,
      body: `${actor} assigned this task to you.`,
    });
  }

  refreshTasks();
}

export async function updateTaskStatusAction(input: {
  id: string;
  status: string;
}) {
  if (!input.id) throw new Error("ID is required.");

  const { supabase, actor } = await getActorEmail();
  const normalizedStatus = normalizeStatus(input.status);

  const { data: existing, error: fetchError } = await supabase
    .from("tasks")
    .select(
      "id, title, assignee, status, recurrence, recurrence_interval, due_date"
    )
    .eq("id", input.id)
    .maybeSingle();

  if (fetchError) {
    console.error("updateTaskStatusAction fetch error:", fetchError);
    throw new Error("Could not update task status.");
  }

  if (
    normalizedStatus === "completed" &&
    existing &&
    (existing.recurrence === "daily" ||
      existing.recurrence === "weekly" ||
      existing.recurrence === "monthly")
  ) {
    const nextDue = advanceDueDate(
      existing.due_date,
      existing.recurrence as "daily" | "weekly" | "monthly",
      existing.recurrence_interval ?? 1
    );

    const { error: rollError } = await supabase
      .from("tasks")
      .update({
        due_date: nextDue,
        status: "open",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    if (rollError) {
      console.error("updateTaskStatusAction roll error:", rollError);
      throw new Error("Could not roll recurring task forward.");
    }

    await logTaskActivity({
      taskId: input.id,
      action: "recurring_task_rolled",
      actor,
      fieldName: "due_date",
      oldValue: existing.due_date ?? null,
      newValue: nextDue,
    });

    if (TASKS_CONFIG.allowNotifications && existing.assignee && existing.assignee !== actor) {
      await createNotification({
        taskId: input.id,
        userEmail: existing.assignee,
        type: "task_recurring_rolled",
        title: `Recurring task reopened: ${existing.title}`,
        body: `Next due date: ${nextDue}`,
      });
    }

    refreshTasks();
    return;
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: normalizedStatus,
      completed_at:
        normalizedStatus === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    console.error("updateTaskStatusAction error:", error);
    throw new Error("Could not update task status.");
  }

  await logTaskActivity({
    taskId: input.id,
    action: "task_status_changed",
    actor,
    fieldName: "status",
    oldValue: existing?.status ?? null,
    newValue: normalizedStatus,
  });

  if (TASKS_CONFIG.allowNotifications && existing?.assignee && existing.assignee !== actor) {
    await createNotification({
      taskId: input.id,
      userEmail: existing.assignee,
      type: "task_status_changed",
      title: `Task updated: ${existing.title}`,
      body: `Status changed to ${normalizedStatus.replace("_", " ")}.`,
    });
  }

  refreshTasks();
}

export async function deleteTaskAction(input: { id: string }) {
  if (!input.id) throw new Error("ID is required.");

  const { supabase, actor } = await getActorEmail();

  await logTaskActivity({
    taskId: input.id,
    action: "task_deleted",
    actor,
  });

  const { error } = await supabase.from("tasks").delete().eq("id", input.id);

  if (error) {
    console.error("deleteTaskAction error:", error);
    throw new Error("Could not delete task.");
  }

  refreshTasks();
}

export async function addTaskCommentAction(input: {
  taskId: string;
  body: string;
}) {
  if (!input.taskId || !input.body.trim()) {
    throw new Error("Task and comment body are required.");
  }

  const { supabase, actor } = await getActorEmail();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, assignee, title")
    .eq("id", input.taskId)
    .maybeSingle();

  if (taskError) {
    throw new Error("Could not find task.");
  }

  const { error } = await supabase.from("task_comments").insert({
    task_id: input.taskId,
    body: input.body.trim(),
    created_by: actor,
  });

  if (error) {
    console.error("addTaskCommentAction error:", error);
    throw new Error("Could not add comment.");
  }

  await logTaskActivity({
    taskId: input.taskId,
    action: "comment_added",
    actor,
  });

  if (TASKS_CONFIG.allowNotifications && task?.assignee && task.assignee !== actor) {
    await createNotification({
      taskId: input.taskId,
      userEmail: task.assignee,
      type: "task_comment",
      title: `New comment on: ${task.title}`,
      body: `${actor} commented on this task.`,
    });
  }

  refreshTasks();
}

export async function markTaskNotificationReadAction(input: { id: string }) {
  if (!input.id) throw new Error("Notification ID is required.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("task_notifications")
    .update({ is_read: true })
    .eq("id", input.id);

  if (error) {
    console.error("markTaskNotificationReadAction error:", error);
    throw new Error("Could not mark notification as read.");
  }

  refreshTasks();
}
