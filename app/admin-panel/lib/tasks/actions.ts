"use server";

// Isolated task module server actions — import only from this path.
// Re-exports the canonical implementations from the shared task-actions module
// so the TasksBoard can depend exclusively on the tasks sub-module.
export {
  addTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "../task-actions";
