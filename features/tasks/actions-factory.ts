// Action factory: produces CRUD handlers from an adapter + options.
//
// All validation and recurrence logic lives here so implementations of
// TasksDataAdapter stay trivial. Host apps wrap the returned handlers in a
// "use server" module (or a tRPC/REST route) and wire in revalidation.

import type { TasksDataAdapter } from "./adapter";
import type { TaskCategory, TaskRecurrence, TaskStatus } from "./types";

const VALID_CATEGORIES: TaskCategory[] = [
  "video",
  "story",
  "carousel",
  "design",
  "general",
];
const VALID_STATUSES: TaskStatus[] = ["open", "in_progress", "completed"];
const VALID_RECURRENCES: TaskRecurrence[] = ["none", "weekly", "monthly"];

export type TaskActionsOptions = {
  // Called after any successful mutation. Use this to revalidate caches
  // (e.g. revalidatePath on Next.js) or broadcast to subscribers.
  onMutate?: () => void | Promise<void>;
  // Override allowed categories (defaults to the core union).
  allowedCategories?: readonly string[];
};

function normalizeCategory(
  value: string,
  allowed: readonly string[]
): TaskCategory {
  return (allowed.includes(value) ? value : "general") as TaskCategory;
}

function normalizeRecurrence(value: string): TaskRecurrence {
  return (
    VALID_RECURRENCES.includes(value as TaskRecurrence) ? value : "none"
  ) as TaskRecurrence;
}

function normalizeStatus(value: string): TaskStatus {
  return (
    VALID_STATUSES.includes(value as TaskStatus) ? value : "open"
  ) as TaskStatus;
}

function advanceDueDate(
  dueDate: string | null,
  recurrence: "weekly" | "monthly"
): string {
  const base = dueDate ? new Date(dueDate) : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  if (recurrence === "weekly") {
    base.setDate(base.getDate() + 7);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base.toISOString().slice(0, 10);
}

export function createTaskActions(
  adapter: TasksDataAdapter,
  options: TaskActionsOptions = {}
) {
  const allowed = options.allowedCategories ?? VALID_CATEGORIES;

  async function afterMutate() {
    if (options.onMutate) await options.onMutate();
  }

  return {
    async addTask(
      title: string,
      description: string,
      category: string,
      assignee: string,
      dueDate: string,
      recurrence: string = "none"
    ) {
      if (!title.trim()) throw new Error("Task title is required.");

      const createdBy = (await adapter.getCurrentUserEmail()) || "unknown";

      await adapter.createTask({
        title: title.trim(),
        description: description.trim(),
        category: normalizeCategory(category, allowed),
        assignee: assignee.trim(),
        createdBy,
        dueDate: dueDate || null,
        recurrence: normalizeRecurrence(recurrence),
      });

      await afterMutate();
    },

    async updateTask(
      id: string,
      title: string,
      description: string,
      category: string,
      assignee: string,
      dueDate: string,
      recurrence: string = "none"
    ) {
      if (!id || !title.trim()) {
        throw new Error("ID and title are required.");
      }

      await adapter.updateTask(id, {
        title: title.trim(),
        description: description.trim(),
        category: normalizeCategory(category, allowed),
        assignee: assignee.trim(),
        dueDate: dueDate || null,
        recurrence: normalizeRecurrence(recurrence),
      });

      await afterMutate();
    },

    async updateStatus(id: string, status: string) {
      if (!id) throw new Error("ID is required.");
      const normalizedStatus = normalizeStatus(status);

      // Completing a recurring task rolls it forward rather than closing it.
      if (normalizedStatus === "completed") {
        const existing = await adapter.getTask(id);
        if (
          existing &&
          (existing.recurrence === "weekly" ||
            existing.recurrence === "monthly")
        ) {
          const nextDue = advanceDueDate(
            existing.dueDate || null,
            existing.recurrence
          );
          await adapter.updateTask(id, {
            dueDate: nextDue,
            status: "open",
          });
          await afterMutate();
          return;
        }
      }

      await adapter.updateTask(id, { status: normalizedStatus });
      await afterMutate();
    },

    async deleteTask(id: string) {
      if (!id) throw new Error("ID is required.");
      await adapter.deleteTask(id);
      await afterMutate();
    },
  };
}

export type TaskActions = ReturnType<typeof createTaskActions>;
