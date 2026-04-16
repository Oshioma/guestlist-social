import type {
  TaskCategory,
  TaskPermissionScope,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
} from "./types";

export type TaskCategoryOption = {
  value: TaskCategory;
  label: string;
  color: string;
};

export type TaskSystemConfig = {
  revalidatePath: string;
  categories: TaskCategoryOption[];
  statuses: { value: TaskStatus; label: string }[];
  priorities: { value: TaskPriority; label: string }[];
  recurrences: { value: TaskRecurrence; label: string }[];
  permissionScopes: { value: TaskPermissionScope; label: string }[];
  allowSubtasks: boolean;
  allowComments: boolean;
  allowNotifications: boolean;
  allowRecurrence: boolean;
  allowPriority: boolean;
  allowPermissionsScope: boolean;
};

export const TASKS_CONFIG: TaskSystemConfig = {
  revalidatePath: "/admin-panel/tasks",

  categories: [
    { value: "video", label: "Video", color: "#22c55e" },
    { value: "carousel", label: "Carousel", color: "#3b82f6" },
    { value: "story", label: "Story", color: "#eab308" },
    { value: "design", label: "Design", color: "#a855f7" },
    { value: "general", label: "General", color: "#71717a" },
  ],

  statuses: [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In progress" },
    { value: "blocked", label: "Blocked" },
    { value: "completed", label: "Completed" },
  ],

  priorities: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
  ],

  recurrences: [
    { value: "none", label: "One-off" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ],

  permissionScopes: [
    { value: "private", label: "Private" },
    { value: "team", label: "Team" },
    { value: "admin_only", label: "Admin only" },
  ],

  allowSubtasks: true,
  allowComments: true,
  allowNotifications: true,
  allowRecurrence: true,
  allowPriority: true,
  allowPermissionsScope: true,
};

export const VALID_TASK_CATEGORIES = TASKS_CONFIG.categories.map((c) => c.value);
export const VALID_TASK_STATUSES = TASKS_CONFIG.statuses.map((s) => s.value);
export const VALID_TASK_PRIORITIES = TASKS_CONFIG.priorities.map((p) => p.value);
export const VALID_TASK_RECURRENCES = TASKS_CONFIG.recurrences.map((r) => r.value);
export const VALID_TASK_PERMISSION_SCOPES = TASKS_CONFIG.permissionScopes.map(
  (s) => s.value
);
