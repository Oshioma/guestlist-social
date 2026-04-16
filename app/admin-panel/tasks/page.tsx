import type { Task, TaskPermissionScope, TaskUserRole } from "./types";

export type TaskActor = {
  email: string;
  role: TaskUserRole;
};

export function canViewTask(actor: TaskActor, task: Task): boolean {
  if (actor.role === "admin") return true;

  if (task.permissionsScope === "admin_only") {
    return actor.role === "manager";
  }

  if (task.permissionsScope === "private") {
    return task.assignee === actor.email || task.createdBy === actor.email;
  }

  return true;
}

export function canEditTask(actor: TaskActor, task: Task): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "viewer") return false;

  if (task.permissionsScope === "admin_only") {
    return actor.role === "manager";
  }

  if (task.createdBy === actor.email) return true;
  if (task.assignee === actor.email) return true;

  return actor.role === "manager";
}

export function canDeleteTask(actor: TaskActor, task: Task): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "viewer") return false;

  if (task.permissionsScope === "admin_only") {
    return actor.role === "manager";
  }

  return task.createdBy === actor.email || actor.role === "manager";
}

export function canChangeTaskStatus(actor: TaskActor, task: Task): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "viewer") return false;

  if (task.permissionsScope === "admin_only") {
    return actor.role === "manager";
  }

  return (
    task.assignee === actor.email ||
    task.createdBy === actor.email ||
    actor.role === "manager"
  );
}

export function canCommentOnTask(actor: TaskActor, task: Task): boolean {
  if (actor.role === "viewer") return false;
  return canViewTask(actor, task);
}

export function canAssignTask(actor: TaskActor, task?: Task): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "viewer") return false;

  if (!task) {
    return actor.role === "manager" || actor.role === "member";
  }

  if (task.permissionsScope === "admin_only") {
    return actor.role === "manager";
  }

  return actor.role === "manager" || task.createdBy === actor.email;
}

export function defaultTaskRoleFromEmail(email: string): TaskUserRole {
  if (!email) return "viewer";
  return "member";
}

export function normalizePermissionScope(
  scope?: string
): TaskPermissionScope {
  if (scope === "private" || scope === "team" || scope === "admin_only") {
    return scope;
  }
  return "team";
}
