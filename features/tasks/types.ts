// Core task types for the portable tasks module.
//
// These types are intentionally generic. Host apps can re-export and narrow
// TaskCategory to an enum of their choice (see app/admin-panel/lib/tasks/types.ts).

export type TaskStatus = "open" | "in_progress" | "completed";

export type TaskRecurrence = "none" | "weekly" | "monthly";

// Host apps typically narrow this to a union of their category keys.
export type TaskCategory =
  | "video"
  | "story"
  | "carousel"
  | "design"
  | "general"
  | "social"
  | "one_day";

export type Task = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  assignee: string;
  createdBy: string;
  dueDate: string;
  status: TaskStatus;
  recurrence: TaskRecurrence;
  createdAt: string;
  updatedAt: string;
};

export type ViewMode = "kanban" | "list" | "by-assignee" | "by-category" | "completed";

export type TaskFilters = {
  category: TaskCategory | "all";
  assignee: string | "all";
  search: string;
  showCompleted: boolean;
};

export type SavedView = {
  id: string;
  name: string;
  filters: TaskFilters;
  viewMode: ViewMode;
};

export type LocalSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export type LocalComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  type: "status_change" | "edit" | "created";
  description: string;
  at: string;
};

// Inputs accepted by the adapter. Keeping these separate from Task lets the
// factory normalize and validate before hitting the data layer.
export type CreateTaskInput = {
  title: string;
  description: string;
  category: TaskCategory;
  assignee: string;
  createdBy: string;
  dueDate: string | null;
  recurrence: TaskRecurrence;
};

export type UpdateTaskInput = Partial<{
  title: string;
  description: string;
  category: TaskCategory;
  assignee: string;
  dueDate: string | null;
  recurrence: TaskRecurrence;
  status: TaskStatus;
}>;
