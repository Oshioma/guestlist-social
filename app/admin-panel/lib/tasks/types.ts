// Isolated task module types — import only from this path, never from ../types

export type TaskCategory =
  | "video"
  | "story"
  | "carousel"
  | "design"
  | "general";

export type TaskStatus = "open" | "in_progress" | "completed";

export type TaskRecurrence = "none" | "weekly" | "monthly";

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

export type ViewMode = "kanban" | "list" | "by-assignee" | "by-category";

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
