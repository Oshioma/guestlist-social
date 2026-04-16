"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  Task,
  TaskCategory,
  TaskPermissionScope,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskUserRole,
} from "./types";
import {
  TASKS_CONFIG,
  VALID_TASK_CATEGORIES,
  VALID_TASK_PERMISSION_SCOPES,
  VALID_TASK_PRIORITIES,
  VALID_TASK_RECURRENCES,
  VALID_TASK_STATUSES,
} from "./config";
import {
  canAssignTask,
  canChangeTaskStatus,
  canCommentOnTask,
  canDeleteTask,
  canEditTask,
  defaultTaskRoleFromEmail,
} from "./permissions";

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

function mapTaskRow(row: any): Task {
  return {
    id: String(row.id),
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    title: row.title ?? "",
    description: row.description ?? "",
    category: (row.category ?? "general") as TaskCategory,
    assignee: row.assignee ?? "",
    createdBy: row.created_by ?? "",
    dueDate: row.due_date ?? "",
    startDate: row.start_date ?? "",
    status: (row.status ?? "open") as TaskStatus,
    priority: (row.priority ?? "medium") as TaskPriority,
    recurrence: (row.recurrence ?? "none") as TaskRecurrence,
    recurrenceInterval:
      typeof row.recurrence_interval === "number"
        ? row.recurrence_interval
        : null,
    permissionsScope: (row.permissions_scope ?? "team") as TaskPermissionScope,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
    completedAt: row.completed_at ?? "",
    subtasks: [],
  };
}

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  let role: TaskUserRole = defaultTaskRoleFromEmail(email);

  // Temporary placeholder. Replace with real memberships lookup later.
  if (email.endsWith("@admin.com")) role = "admin";
  if (email.endsWith("@manager.com")) role = "manager";

  return {
    supabase,
    actor: {
      email,
      role,
    },
  };
}

async function getTaskOrThrow(id: string): Promise<Task> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Task not found.");
  }

  return mapTaskRow(data);
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

  const { supabase, actor } = await getActor();

  if (!canAssignTask(actor)) {
    throw new Error("You do not have permission to create tasks.");
  }

  if (input.parentTaskId) {
    const parent = await getTaskOrThrow(input.parentTaskId);
    if (!canEditTask(actor, parent)) {
      throw new Error("You do not have permission to add a subtask here.");
    }
  }

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
      created_by: actor.email,
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
    actor: actor.email,
  });

  if (
    TASKS_CONFIG.allowNotifications &&
    data.assignee &&
    data.assignee !== actor.email
  ) {
    await createNotification({
      taskId: String(data.id),
      userEmail: data.assignee,
      type: "task_assigned",
      title: `New task assigned: ${data.title}`,
      body: `${actor.email} assigned you a task.`,
    });
  }

  refreshTasks();
}

export async function updateTaskAction(input: UpdateTaskInput) {
  if (!input.id || !input.title?.trim()) {
    throw new Error("ID and title are required.");
  }

  const { supabase, actor } = await getActor();
  const existing = await getTaskOrThrow(input.id);

  if (!canEditTask(actor, existing)) {
    throw new Error("You do not have permission to edit this task.");
  }

  if (input.assignee && !canAssignTask(actor, existing)) {
    throw new Error("You do not have permission to reassign this task.");
  }

  const normalizedCategory = normalizeCategory(input.category);
  const normalizedRecurrence = normalizeRecurrence(input.recurrence);
  const normalizedPriority = normalizePriority(input.priority);
  const normalizedScope = normalizeScope(input.permissionsScope);

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
    actor: actor.email,
  });

  if (
    TASKS_CONFIG.allowNotifications &&
    existing.assignee !== (input.assignee ?? "").trim() &&
    input.assignee
  ) {
    await createNotification({
      taskId: input.id,
      userEmail: input.assignee,
      type: "task_reassigned",
      title: `Task assigned: ${input.title.trim()}`,
      body: `${actor.email} assigned this task to you.`,
    });
  }

  refreshTasks();
}

export async function updateTaskStatusAction(input: {
  id: string;
  status: string;
}) {
  if (!input.id) throw new Error("ID is required.");

  const { supabase, actor } = await getActor();
  const existing = await getTaskOrThrow(input.id);

  if (!canChangeTaskStatus(actor, existing)) {
    throw new Error("You do not have permission to update this task status.");
  }

  const normalizedStatus = normalizeStatus(input.status);

  if (
    normalizedStatus === "completed" &&
    (existing.recurrence === "daily" ||
      existing.recurrence === "weekly" ||
      existing.recurrence === "monthly")
  ) {
    const nextDue = advanceDueDate(
      existing.dueDate || null,
      existing.recurrence as "daily" | "weekly" | "monthly",
      existing.recurrenceInterval ?? 1
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
      actor: actor.email,
      fieldName: "due_date",
      oldValue: existing.dueDate ?? null,
      newValue: nextDue,
    });

    if (
      TASKS_CONFIG.allowNotifications &&
      existing.assignee &&
      existing.assignee !== actor.email
    ) {
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
    actor: actor.email,
    fieldName: "status",
    oldValue: existing.status ?? null,
    newValue: normalizedStatus,
  });

  if (
    TASKS_CONFIG.allowNotifications &&
    existing.assignee &&
    existing.assignee !== actor.email
  ) {
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

  const { supabase, actor } = await getActor();
  const existing = await getTaskOrThrow(input.id);

  if (!canDeleteTask(actor, existing)) {
    throw new Error("You do not have permission to delete this task.");
  }

  await logTaskActivity({
    taskId: input.id,
    action: "task_deleted",
    actor: actor.email,
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

  const { supabase, actor } = await getActor();
  const task = await getTaskOrThrow(input.taskId);

  if (!canCommentOnTask(actor, task)) {
    throw new Error("You do not have permission to comment on this task.");
  }

  const { error } = await supabase.from("task_comments").insert({
    task_id: input.taskId,
    body: input.body.trim(),
    created_by: actor.email,
  });

  if (error) {
    console.error("addTaskCommentAction error:", error);
    throw new Error("Could not add comment.");
  }

  await logTaskActivity({
    taskId: input.taskId,
    action: "comment_added",
    actor: actor.email,
  });

  if (
    TASKS_CONFIG.allowNotifications &&
    task.assignee &&
    task.assignee !== actor.email
  ) {
    await createNotification({
      taskId: input.taskId,
      userEmail: task.assignee,
      type: "task_comment",
      title: `New comment on: ${task.title}`,
      body: `${actor.email} commented on this task.`,
    });
  }

  refreshTasks();
}

export async function markTaskNotificationReadAction(input: { id: string }) {
  if (!input.id) throw new Error("Notification ID is required.");

  const { supabase, actor } = await getActor();

  const { data: notification, error: fetchError } = await supabase
    .from("task_notifications")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();

  if (fetchError || !notification) {
    throw new Error("Notification not found.");
  }

  if (notification.user_email !== actor.email) {
    throw new Error("You do not have permission to edit this notification.");
  }

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
