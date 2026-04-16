import { createClient } from "@/lib/supabase/server";
import { canViewTask, defaultTaskRoleFromEmail } from "./permissions";
import type {
  GetTasksDataInput,
  GetTasksDataResult,
  Task,
  TaskActivity,
  TaskCategory,
  TaskComment,
  TaskNotification,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskUserRole,
} from "./types";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number) {
  const d = new Date(dateKey);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeTaskRow(row: any): Task {
  return {
    id: String(row.id),
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    title: row.title ?? "",
    description: row.description ?? "",
    category: (row.category ?? "general") as TaskCategory,
    assignee: row.assignee ?? "",
    createdBy: row.created_by ?? "",
    dueDate: row.due_date ?? "",
    startDate: row.start_date ?? "",
    status: (row.status ?? "open") as TaskStatus,
    priority: (row.priority ?? "medium") as TaskPriority,
    recurrence: (row.recurrence ?? "none") as TaskRecurrence,
    recurrenceInterval:
      typeof row.recurrence_interval === "number"
        ? row.recurrence_interval
        : null,
    permissionsScope: (row.permissions_scope ?? "team") as
      | "private"
      | "team"
      | "admin_only",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
    completedAt: row.completed_at ?? "",
    subtasks: [],
  };
}

async function getCurrentTaskActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  let role: TaskUserRole = defaultTaskRoleFromEmail(email);

  // Temporary placeholder. Replace with real memberships lookup later.
  if (email.endsWith("@admin.com")) role = "admin";
  if (email.endsWith("@manager.com")) role = "manager";

  return { email, role };
}

export async function getTasksData(
  input: GetTasksDataInput = {}
): Promise<GetTasksDataResult> {
  const {
    filters,
    includeSubtasks = true,
    includeComments = true,
    includeActivity = true,
    includeNotifications = true,
  } = input;

  const supabase = await createClient();
  const actor = await getCurrentTaskActor();
  const today = todayKey();

  let query = supabase.from("tasks").select("*");

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters?.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters?.assignee && filters.assignee !== "all") {
    query = query.eq("assignee", filters.assignee);
  }

  if (filters?.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }

  if (filters?.showCompleted === false) {
    query = query.neq("status", "completed");
  }

  if (filters?.due === "today") {
    query = query.eq("due_date", today);
  } else if (filters?.due === "overdue") {
    query = query.lt("due_date", today).neq("status", "completed");
  } else if (filters?.due === "upcoming") {
    query = query.gte("due_date", today).lte("due_date", addDays(today, 14));
  } else if (filters?.due === "none") {
    query = query.is("due_date", null);
  }

  const { data: tasksData, error: tasksError } = await query.order("due_date", {
    ascending: true,
    nullsFirst: false,
  });

  if (tasksError) {
    throw new Error(`tasks: ${tasksError.message}`);
  }

  let tasks = (tasksData ?? []).map(normalizeTaskRow);

  tasks = tasks.filter((task) => canViewTask(actor, task));

  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    tasks = tasks.filter((task) => {
      return (
        task.title.toLowerCase().includes(q) ||
        task.description.toLowerCase().includes(q) ||
        task.assignee.toLowerCase().includes(q) ||
        task.createdBy.toLowerCase().includes(q)
      );
    });
  }

  const userSet = new Set<string>();
  if (actor.email) userSet.add(actor.email);

  tasks.forEach((t) => {
    if (t.assignee) userSet.add(t.assignee);
    if (t.createdBy) userSet.add(t.createdBy);
  });

  const commentsMap = new Map<string, TaskComment[]>();
  const activityMap = new Map<string, TaskActivity[]>();
  let notifications: TaskNotification[] = [];

  const taskIds = tasks.map((t) => t.id);

  if (includeComments && taskIds.length > 0) {
    const { data, error } = await supabase
      .from("task_comments")
      .select("*")
      .in("task_id", taskIds)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`task_comments: ${error.message}`);

    (data ?? []).forEach((row) => {
      const taskId = String(row.task_id);
      const existing = commentsMap.get(taskId) ?? [];
      existing.push({
        id: String(row.id),
        taskId,
        body: row.body ?? "",
        createdBy: row.created_by ?? "",
        createdAt: row.created_at ?? "",
        updatedAt: row.updated_at ?? "",
      });
      commentsMap.set(taskId, existing);
    });
  }

  if (includeActivity && taskIds.length > 0) {
    const { data, error } = await supabase
      .from("task_activity")
      .select("*")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`task_activity: ${error.message}`);

    (data ?? []).forEach((row) => {
      const taskId = String(row.task_id);
      const existing = activityMap.get(taskId) ?? [];
      existing.push({
        id: String(row.id),
        taskId,
        action: row.action ?? "",
        fieldName: row.field_name ?? null,
        oldValue: row.old_value ?? null,
        newValue: row.new_value ?? null,
        actor: row.actor ?? "",
        createdAt: row.created_at ?? "",
      });
      activityMap.set(taskId, existing);
    });
  }

  if (includeNotifications && actor.email) {
    const { data, error } = await supabase
      .from("task_notifications")
      .select("*")
      .eq("user_email", actor.email)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`task_notifications: ${error.message}`);

    notifications = (data ?? []).map((row) => ({
      id: String(row.id),
      taskId: row.task_id ? String(row.task_id) : null,
      userEmail: row.user_email ?? "",
      type: row.type ?? "",
      title: row.title ?? "",
      body: row.body ?? "",
      isRead: Boolean(row.is_read),
      createdAt: row.created_at ?? "",
    }));
  }

  tasks = tasks.map((task) => ({
    ...task,
    comments: commentsMap.get(task.id) ?? [],
    activity: activityMap.get(task.id) ?? [],
  }));

  if (includeSubtasks) {
    const parentTasks = tasks.filter((t) => !t.parentTaskId);
    const childTasks = tasks.filter((t) => !!t.parentTaskId);

    const byParent = new Map<string, Task[]>();

    childTasks.forEach((task) => {
      if (!task.parentTaskId) return;
      const list = byParent.get(task.parentTaskId) ?? [];
      list.push(task);
      byParent.set(task.parentTaskId, list);
    });

    tasks = parentTasks.map((task) => ({
      ...task,
      subtasks: (byParent.get(task.id) ?? [])
        .filter((child) => canViewTask(actor, child))
        .sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }

  const knownUsers = Array.from(userSet)
    .filter((u) => u && u !== "unknown")
    .sort((a, b) => a.localeCompare(b));

  return {
    tasks,
    currentUserEmail: actor.email,
    currentUserRole: actor.role,
    knownUsers,
    notifications,
  };
}
