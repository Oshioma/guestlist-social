// Action factory: produces CRUD handlers from an adapter + options.
//
// All validation and recurrence logic lives here so implementations of
// TasksDataAdapter stay trivial. Host apps wrap the returned handlers in a
// "use server" module (or a tRPC/REST route) and wire in revalidation.

import type { TasksDataAdapter } from "./adapter";
import type {
  TaskCategory,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
} from "./types";

const VALID_CATEGORIES: TaskCategory[] = [
  "video",
  "story",
  "carousel",
  "design",
  "general",
  "social",
  "one_day",
];
const VALID_STATUSES: TaskStatus[] = ["open", "in_progress", "completed"];
const VALID_PRIORITIES: TaskPriority[] = ["normal", "high"];
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

function normalizePriority(value: string): TaskPriority {
  return (
    VALID_PRIORITIES.includes(value as TaskPriority) ? value : "normal"
  ) as TaskPriority;
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
      recurrence: string = "none",
      priority: string = "normal"
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
        priority: normalizePriority(priority),
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
      recurrence: string = "none",
      priority: string = "normal"
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
        priority: normalizePriority(priority),
        recurrence: normalizeRecurrence(recurrence),
      });

      await afterMutate();
    },

    // Quick, targeted priority change — lets the UI flag an existing task
    // high priority without re-sending every other field.
    async updatePriority(id: string, priority: string) {
      if (!id) throw new Error("ID is required.");
      await adapter.updateTask(id, { priority: normalizePriority(priority) });
      await afterMutate();
    },

    async updateStatus(id: string, status: string) {
      if (!id) throw new Error("ID is required.");
      const normalizedStatus = normalizeStatus(status);
      const existing = await adapter.getTask(id);

      // Log completion events so the weekly report can answer "who finished
      // what" — essential for recurring tasks, which roll forward to open and
      // otherwise leave no trace of having been done.
      async function logCompletion(replaceExisting: boolean) {
        if (!existing || !adapter.recordCompletion) return;
        const completedBy = (await adapter.getCurrentUserEmail()) || "";
        await adapter.recordCompletion(
          {
            taskId: existing.id,
            title: existing.title,
            category: existing.category,
            assignee: existing.assignee,
            completedBy,
            recurrence: existing.recurrence,
          },
          replaceExisting
        );
      }

      if (normalizedStatus === "completed") {
        // Completing a recurring task rolls it forward rather than closing it.
        if (
          existing &&
          (existing.recurrence === "weekly" ||
            existing.recurrence === "monthly")
        ) {
          await logCompletion(false);
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
        // One-off: keep a single row for the latest completion, and don't
        // duplicate it when the task is already completed.
        if (existing && existing.status !== "completed") {
          await logCompletion(true);
        }
      } else if (
        existing &&
        existing.status === "completed" &&
        existing.recurrence === "none" &&
        adapter.clearCompletionsForTask
      ) {
        // A one-off task reopened isn't done anymore — drop its log row.
        await adapter.clearCompletionsForTask(existing.id);
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
