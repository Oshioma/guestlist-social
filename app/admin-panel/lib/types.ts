export type TaskCategory =
  | "video"
  | "carousel"
  | "story"
  | "design"
  | "general";

export type TaskStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "completed";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";

export type TaskPermissionScope = "private" | "team" | "admin_only";

export type TaskUserRole = "admin" | "manager" | "member" | "viewer";

export type TaskComment = {
  id: string;
  taskId: string;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskActivity = {
  id: string;
  taskId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  actor: string;
  createdAt: string;
};

export type TaskNotification = {
  id: string;
  taskId: string | null;
  userEmail: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

export type Task = {
  id: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  category: TaskCategory;
  assignee: string;
  createdBy: string;
  dueDate: string;
  startDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  recurrenceInterval: number | null;
  permissionsScope: TaskPermissionScope;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  subtasks: Task[];
  comments?: TaskComment[];
  activity?: TaskActivity[];
};

export type TaskFilters = {
  q?: string;
  status?: TaskStatus | "all";
  category?: TaskCategory | "all";
  assignee?: string | "all";
  priority?: TaskPriority | "all";
  due?: "all" | "today" | "overdue" | "upcoming" | "none";
  showCompleted?: boolean;
};

export type GetTasksDataInput = {
  filters?: TaskFilters;
  includeSubtasks?: boolean;
  includeComments?: boolean;
  includeActivity?: boolean;
  includeNotifications?: boolean;
};

export type GetTasksDataResult = {
  tasks: Task[];
  currentUserEmail: string;
  currentUserRole: TaskUserRole;
  knownUsers: string[];
  notifications: TaskNotification[];
};
