// Portable tasks module — barrel export.
//
// Port this folder to another project by copying features/tasks/ and writing
// an adapter that implements TasksDataAdapter. See adapter.ts for the contract
// and actions-factory.ts for the action handlers.

export type {
  Task,
  TaskCategory,
  TaskStatus,
  TaskRecurrence,
  ViewMode,
  TaskFilters,
  SavedView,
  LocalSubtask,
  LocalComment,
  ActivityEntry,
  CreateTaskInput,
  UpdateTaskInput,
} from "./types";

export type { TasksDataAdapter } from "./adapter";

export {
  createTaskActions,
  type TaskActions,
  type TaskActionsOptions,
} from "./actions-factory";

export {
  DEFAULT_CATEGORIES,
  STATUS_COLUMNS,
  STATUS_OPTIONS,
  RECURRENCE_OPTIONS,
  KEYBOARD_SHORTCUTS,
} from "./config";
