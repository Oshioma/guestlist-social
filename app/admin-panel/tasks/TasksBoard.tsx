"use client";

import { useMemo, useState, useTransition } from "react";
import SectionCard from "../components/SectionCard";
import type {
  Task,
  TaskCategory,
  TaskFilters,
  TaskNotification,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskUserRole,
} from "../lib/types";
import { TASKS_CONFIG } from "../lib/tasks-config";
import {
  addTaskAction,
  addTaskCommentAction,
  deleteTaskAction,
  markTaskNotificationReadAction,
  updateTaskAction,
  updateTaskStatusAction,
} from "../lib/task-actions";

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f4f4f5",
  color: "#71717a",
  cursor: "not-allowed",
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#18181b",
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  background: "#fff",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function formatDate(dueDate: string) {
  if (!dueDate) return "No due date";
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function priorityColor(priority: TaskPriority) {
  if (priority === "urgent") return "#b91c1c";
  if (priority === "high") return "#c2410c";
  if (priority === "medium") return "#1d4ed8";
  return "#52525b";
}

function categoryMeta(category: TaskCategory) {
  return (
    TASKS_CONFIG.categories.find((c) => c.value === category) ?? {
      value: "general" as TaskCategory,
      label: "General",
      color: "#71717a",
    }
  );
}

export default function TasksBoard({
  initialTasks,
  currentUserEmail,
  currentUserRole,
  knownUsers,
  initialNotifications,
}: {
  initialTasks: Task[];
  currentUserEmail: string;
  currentUserRole: TaskUserRole;
  knownUsers: string[];
  initialNotifications: TaskNotification[];
}) {
  const [isPending, startTransition] = useTransition();
  const [tasks] = useState<Task[]>(initialTasks);
  const [notifications] = useState<TaskNotification[]>(initialNotifications);

  const canCreateTasks =
    currentUserRole === "admin" ||
    currentUserRole === "manager" ||
    currentUserRole === "member";

  const canComment =
    currentUserRole === "admin" ||
    currentUserRole === "manager" ||
    currentUserRole === "member";

  const canEditTasks =
    currentUserRole === "admin" ||
    currentUserRole === "manager" ||
    currentUserRole === "member";

  const canDeleteTasks =
    currentUserRole === "admin" ||
    currentUserRole === "manager" ||
    currentUserRole === "member";

  const canChangeStatus =
    currentUserRole === "admin" ||
    currentUserRole === "manager" ||
    currentUserRole === "member";

  const canAddSubtasks =
    TASKS_CONFIG.allowSubtasks &&
    (currentUserRole === "admin" ||
      currentUserRole === "manager" ||
      currentUserRole === "member");

  const canSeeNotifications = TASKS_CONFIG.allowNotifications;

  const [filters, setFilters] = useState<TaskFilters>({
    q: "",
    status: "all",
    category: "all",
    assignee: "all",
    priority: "all",
    due: "all",
    showCompleted: true,
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    category:
      TASKS_CONFIG.categories[0]?.value ?? ("general" as TaskCategory),
    assignee: currentUserEmail || "",
    dueDate: "",
    startDate: "",
    recurrence: "none" as TaskRecurrence,
    recurrenceInterval: 1,
    priority: "medium" as TaskPriority,
  });

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId) ?? null;
  }, [tasks, selectedTaskId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (
        filters.q &&
        ![
          task.title,
          task.description,
          task.assignee,
          task.createdBy,
        ].some((v) => v.toLowerCase().includes(filters.q!.toLowerCase()))
      ) {
        return false;
      }

      if (
        filters.status &&
        filters.status !== "all" &&
        task.status !== filters.status
      ) {
        return false;
      }

      if (
        filters.category &&
        filters.category !== "all" &&
        task.category !== filters.category
      ) {
        return false;
      }

      if (
        filters.assignee &&
        filters.assignee !== "all" &&
        task.assignee !== filters.assignee
      ) {
        return false;
      }

      if (
        filters.priority &&
        filters.priority !== "all" &&
        task.priority !== filters.priority
      ) {
        return false;
      }

      if (filters.showCompleted === false && task.status === "completed") {
        return false;
      }

      if (filters.due === "today") {
        const today = new Date().toISOString().slice(0, 10);
        if (task.dueDate !== today) return false;
      } else if (filters.due === "overdue") {
        if (!isOverdue(task)) return false;
      } else if (filters.due === "none") {
        if (task.dueDate) return false;
      }

      return true;
    });
  }, [tasks, filters]);

  const myTasks = useMemo(() => {
    return filteredTasks.filter((t) => t.assignee === currentUserEmail);
  }, [filteredTasks, currentUserEmail]);

  const teamTasks = useMemo(() => {
    return filteredTasks.filter(
      (t) => t.assignee && t.assignee !== currentUserEmail
    );
  }, [filteredTasks, currentUserEmail]);

  const assigneeOptions = useMemo(() => {
    return Array.from(
      new Set([currentUserEmail, ...knownUsers].filter(Boolean))
    );
  }, [currentUserEmail, knownUsers]);

  function handleCreateTask(parentTaskId?: string | null) {
    if (!newTask.title.trim()) return;

    startTransition(async () => {
      try {
        await addTaskAction({
          title: newTask.title,
          description: newTask.description,
          category: newTask.category,
          assignee: newTask.assignee,
          dueDate: newTask.dueDate,
          startDate: newTask.startDate,
          recurrence: TASKS_CONFIG.allowRecurrence ? newTask.recurrence : "none",
          recurrenceInterval:
            TASKS_CONFIG.allowRecurrence && newTask.recurrence !== "none"
              ? newTask.recurrenceInterval
              : null,
          priority: TASKS_CONFIG.allowPriority ? newTask.priority : "medium",
          parentTaskId: TASKS_CONFIG.allowSubtasks ? parentTaskId ?? null : null,
          permissionsScope: TASKS_CONFIG.allowPermissionsScope ? "team" : "team",
        });

        setNewTask({
          title: "",
          description: "",
          category:
            TASKS_CONFIG.categories[0]?.value ?? ("general" as TaskCategory),
          assignee: currentUserEmail || "",
          dueDate: "",
          startDate: "",
          recurrence: "none",
          recurrenceInterval: 1,
          priority: "medium",
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add task");
      }
    });
  }

  function handleStatusChange(task: Task, status: TaskStatus) {
    startTransition(async () => {
      try {
        await updateTaskStatusAction({
          id: task.id,
          status,
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function handleDelete(task: Task) {
    if (!confirm(`Delete "${task.title}"?`)) return;

    startTransition(async () => {
      try {
        await deleteTaskAction({ id: task.id });
        if (selectedTaskId === task.id) {
          setSelectedTaskId(null);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete task");
      }
    });
  }

  function handleMarkNotificationRead(id: string) {
    startTransition(async () => {
      try {
        await markTaskNotificationReadAction({ id });
      } catch (err) {
        alert(
          err instanceof Error
            ? err.message
            : "Could not mark notification as read"
        );
      }
    });
  }

  function TaskCard({
    task,
    level = 0,
  }: {
    task: Task;
    level?: number;
  }) {
    const category = categoryMeta(task.category);
    const overdue = isOverdue(task);

    return (
      <div
        style={{
          border: "1px solid #e4e4e7",
          borderRadius: 14,
          background: "#fff",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginLeft: level > 0 ? 18 : 0,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: category.color,
                marginTop: 4,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#18181b",
                  marginBottom: 3,
                }}
              >
                {task.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#71717a",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span>{category.label}</span>
                {TASKS_CONFIG.allowPriority && (
                  <>
                    <span>•</span>
                    <span
                      style={{
                        color: priorityColor(task.priority),
                        fontWeight: 700,
                      }}
                    >
                      {task.priority}
                    </span>
                  </>
                )}
                <span>•</span>
                <span>{task.assignee || "Unassigned"}</span>
                <span>•</span>
                <span>{formatDate(task.dueDate)}</span>
                {TASKS_CONFIG.allowRecurrence && task.recurrence !== "none" && (
                  <>
                    <span>•</span>
                    <span>Repeats {task.recurrence}</span>
                  </>
                )}
                {overdue && (
                  <>
                    <span>•</span>
                    <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                      Overdue
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={task.status}
              onChange={(e) =>
                handleStatusChange(task, e.target.value as TaskStatus)
              }
              disabled={isPending || !canChangeStatus}
              style={{
                ...(canChangeStatus ? inputStyle : disabledInputStyle),
                width: 140,
              }}
            >
              {TASKS_CONFIG.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              disabled={isPending}
              style={secondaryButton}
            >
              {canEditTasks ? "Edit" : "View"}
            </button>

            {canDeleteTasks && (
              <button
                type="button"
                onClick={() => handleDelete(task)}
                disabled={isPending}
                style={{
                  ...secondaryButton,
                  color: "#b91c1c",
                  borderColor: "#fecaca",
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {task.description && (
          <div
            style={{
              fontSize: 13,
              color: "#52525b",
              whiteSpace: "pre-wrap",
            }}
          >
            {task.description}
          </div>
        )}

        {TASK
