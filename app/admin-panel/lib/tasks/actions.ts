"use server";

import {
  addTaskAction as addTaskActionImpl,
  updateTaskAction as updateTaskActionImpl,
  updateTaskStatusAction as updateTaskStatusActionImpl,
  deleteTaskAction as deleteTaskActionImpl,
} from "../task-actions";

export async function addTaskAction(
  ...args: Parameters<typeof addTaskActionImpl>
) {
  return addTaskActionImpl(...args);
}

export async function updateTaskAction(
  ...args: Parameters<typeof updateTaskActionImpl>
) {
  return updateTaskActionImpl(...args);
}

export async function updateTaskStatusAction(
  ...args: Parameters<typeof updateTaskStatusActionImpl>
) {
  return updateTaskStatusActionImpl(...args);
}

export async function deleteTaskAction(
  ...args: Parameters<typeof deleteTaskActionImpl>
) {
  return deleteTaskActionImpl(...args);
}
