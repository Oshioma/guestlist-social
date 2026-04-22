// Legacy import path. All logic now lives in ./tasks/actions (which uses
// the portable features/tasks/ factory + Supabase adapter). Kept here to
// avoid breaking older imports (e.g. TasksBoard.fallback.tsx).

export {
  addTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "./tasks/actions";
