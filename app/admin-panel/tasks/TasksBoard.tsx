"use client";

import { useState, useTransition } from "react";
import type {
  Task,
  TaskCategory,
  TaskFilters,
  TaskNotification,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
  TaskUserRole,
} from "../lib/tasks/types";
import { TASKS_CONFIG } from "../lib/tasks/config";
import {
  addTaskAction,
  addTaskCommentAction,
  deleteTaskAction,
  markTaskNotificationReadAction,
  updateTaskAction,
  updateTaskStatusAction,
} from "../lib/tasks/actions";

// ─── style helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#71717a",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  display: "block",
  marginBottom: 4,
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "#18181b",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#3f3f46",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  border: "1px solid #fca5a5",
  color: "#dc2626",
};

// ─── derived helpers ────────────────────────────────────────────────────────────

function categoryOption(value: TaskCategory) {
  return (
    TASKS_CONFIG.categories.find((c) => c.value === value) ??
    TASKS_CONFIG.categories.find((c) => c.value === "general")!
  );
}

function statusOption(value: TaskStatus) {
  return (
    TASKS_CONFIG.statuses.find((s) => s.value === value) ?? {
      value,
      label: value,
    }
  );
}

function priorityOption(value: TaskPriority) {
  return (
    TASKS_CONFIG.priorities.find((p) => p.value === value) ?? {
      value,
      label: value,
    }
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isOverdue(task: Task) {
  if (!task.dueDate) return false;
  if (task.status === "completed") return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

// ─── blank form state ─────────────────────────────────────────────────────────

type TaskFormState = {
  title: string;
  description: string;
  category: TaskCategory;
  assignee: string;
  dueDate: string;
  startDate: string;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  recurrenceInterval: string;
  permissionsScope: "private" | "team" | "admin_only";
  parentTaskId: string | null;
};

function blankForm(overrides?: Partial<TaskFormState>): TaskFormState {
  return {
    title: "",
    description: "",
    category: "general",
    assignee: "",
    dueDate: "",
    startDate: "",
    priority: "medium",
    recurrence: "none",
    recurrenceInterval: "",
    permissionsScope: "team",
    parentTaskId: null,
    ...overrides,
  };
}

function taskToForm(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description,
    category: task.category,
    assignee: task.assignee,
    dueDate: task.dueDate,
    startDate: task.startDate,
    priority: task.priority,
    recurrence: task.recurrence,
    recurrenceInterval: task.recurrenceInterval
      ? String(task.recurrenceInterval)
      : "",
    permissionsScope: task.permissionsScope,
    parentTaskId: task.parentTaskId,
  };
}

// ─── TaskForm ────────────────────────────────────────────────────────────────

function TaskForm({
  form,
  onChange,
  knownUsers,
  showParent,
}: {
  form: TaskFormState;
  onChange: (updated: Partial<TaskFormState>) => void;
  knownUsers: string[];
  showParent?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>Title *</label>
        <input
          style={inputStyle}
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Task title"
        />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Optional description"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <select
            style={inputStyle}
            value={form.category}
            onChange={(e) =>
              onChange({ category: e.target.value as TaskCategory })
            }
          >
            {TASKS_CONFIG.categories.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Priority</label>
          <select
            style={inputStyle}
            value={form.priority}
            onChange={(e) =>
              onChange({ priority: e.target.value as TaskPriority })
            }
          >
            {TASKS_CONFIG.priorities.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Assignee</label>
          {knownUsers.length > 0 ? (
            <select
              style={inputStyle}
              value={form.assignee}
              onChange={(e) => onChange({ assignee: e.target.value })}
            >
              <option value="">— unassigned —</option>
              {knownUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          ) : (
            <input
              style={inputStyle}
              value={form.assignee}
              onChange={(e) => onChange({ assignee: e.target.value })}
              placeholder="email@example.com"
            />
          )}
        </div>

        {TASKS_CONFIG.allowPermissionsScope && (
          <div>
            <label style={labelStyle}>Scope</label>
            <select
              style={inputStyle}
              value={form.permissionsScope}
              onChange={(e) =>
                onChange({
                  permissionsScope: e.target.value as
                    | "private"
                    | "team"
                    | "admin_only",
                })
              }
            >
              {TASKS_CONFIG.permissionScopes.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Start Date</label>
          <input
            type="date"
            style={inputStyle}
            value={form.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Due Date</label>
          <input
            type="date"
            style={inputStyle}
            value={form.dueDate}
            onChange={(e) => onChange({ dueDate: e.target.value })}
          />
        </div>
      </div>

      {TASKS_CONFIG.allowRecurrence && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Recurrence</label>
            <select
              style={inputStyle}
              value={form.recurrence}
              onChange={(e) =>
                onChange({ recurrence: e.target.value as TaskRecurrence })
              }
            >
              {TASKS_CONFIG.recurrences.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {form.recurrence !== "none" && (
            <div>
              <label style={labelStyle}>Every (n)</label>
              <input
                type="number"
                min={1}
                style={inputStyle}
                value={form.recurrenceInterval}
                onChange={(e) =>
                  onChange({ recurrenceInterval: e.target.value })
                }
                placeholder="1"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, color: "#18181b" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "#71717a",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── TaskRow ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  currentUserEmail,
  currentUserRole,
  knownUsers,
  depth,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onAddSubtask,
  onOpenComments,
}: {
  task: Task;
  currentUserEmail: string;
  currentUserRole: TaskUserRole;
  knownUsers: string[];
  depth: number;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onAddSubtask: (parentTask: Task) => void;
  onOpenComments: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = categoryOption(task.category);
  const overdue = isOverdue(task);

  const priorityColors: Record<TaskPriority, string> = {
    low: "#6ee7b7",
    medium: "#fbbf24",
    high: "#f97316",
    urgent: "#ef4444",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 12px",
          marginLeft: depth * 24,
          borderRadius: 10,
          background: "#fafafa",
          border: "1px solid #f4f4f5",
          marginBottom: 6,
        }}
      >
        {/* status select */}
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
          style={{
            ...inputStyle,
            width: 110,
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 600,
            background:
              task.status === "completed"
                ? "#dcfce7"
                : task.status === "in_progress"
                  ? "#fef9c3"
                  : task.status === "blocked"
                    ? "#fee2e2"
                    : "#f4f4f5",
            color:
              task.status === "completed"
                ? "#166534"
                : task.status === "in_progress"
                  ? "#854d0e"
                  : task.status === "blocked"
                    ? "#991b1b"
                    : "#3f3f46",
            border: "1px solid #e4e4e7",
          }}
        >
          {TASKS_CONFIG.statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "#18181b",
                textDecoration:
                  task.status === "completed" ? "line-through" : "none",
              }}
            >
              {task.title}
            </span>

            {/* category badge using TASKS_CONFIG.categories */}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 99,
                background: cat.color + "22",
                color: cat.color,
                border: `1px solid ${cat.color}44`,
              }}
            >
              {cat.label}
            </span>

            {/* priority dot */}
            <span
              title={priorityOption(task.priority).label}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: priorityColors[task.priority],
                flexShrink: 0,
                display: "inline-block",
              }}
            />

            {overdue && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#dc2626",
                  background: "#fee2e2",
                  padding: "1px 6px",
                  borderRadius: 99,
                }}
              >
                OVERDUE
              </span>
            )}
          </div>

          {task.description && (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12,
                color: "#71717a",
                whiteSpace: "pre-wrap",
              }}
            >
              {task.description}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 4,
              fontSize: 11,
              color: "#a1a1aa",
              flexWrap: "wrap",
            }}
          >
            {task.assignee && <span>👤 {task.assignee}</span>}
            {task.dueDate && (
              <span style={{ color: overdue ? "#dc2626" : "#a1a1aa" }}>
                📅 {formatDate(task.dueDate)}
              </span>
            )}
            {task.recurrence !== "none" && (
              <span>
                🔁{" "}
                {TASKS_CONFIG.recurrences.find(
                  (r) => r.value === task.recurrence
                )?.label ?? task.recurrence}
              </span>
            )}
            {(task.comments?.length ?? 0) > 0 && (
              <button
                onClick={() => onOpenComments(task)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#6366f1",
                  padding: 0,
                }}
              >
                💬 {task.comments!.length}
              </button>
            )}
            {TASKS_CONFIG.allowSubtasks && (task.subtasks?.length ?? 0) > 0 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#6366f1",
                  padding: 0,
                }}
              >
                {expanded ? "▾" : "▸"} {task.subtasks.length} subtask
                {task.subtasks.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onOpenComments(task)}
            style={{ ...secondaryButtonStyle, fontSize: 11 }}
          >
            💬
          </button>
          {TASKS_CONFIG.allowSubtasks && !task.parentTaskId && (
            <button
              onClick={() => onAddSubtask(task)}
              style={{ ...secondaryButtonStyle, fontSize: 11 }}
              title="Add subtask"
            >
              +↳
            </button>
          )}
          <button
            onClick={() => onEditTask(task)}
            style={{ ...secondaryButtonStyle, fontSize: 11 }}
          >
            Edit
          </button>
          <button
            onClick={() => onDeleteTask(task)}
            style={{ ...dangerButtonStyle, fontSize: 11 }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* subtasks */}
      {expanded &&
        task.subtasks.map((sub) => (
          <TaskRow
            key={sub.id}
            task={sub}
            currentUserEmail={currentUserEmail}
            currentUserRole={currentUserRole}
            knownUsers={knownUsers}
            depth={depth + 1}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onStatusChange={onStatusChange}
            onAddSubtask={onAddSubtask}
            onOpenComments={onOpenComments}
          />
        ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [notifications, setNotifications] =
    useState<TaskNotification[]>(initialNotifications);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [filters, setFilters] = useState<TaskFilters>({
    status: "all",
    category: "all",
    assignee: "all",
    priority: "all",
    showCompleted: true,
  });
  const [search, setSearch] = useState("");

  // modals
  type ModalMode = "add" | "edit" | "add_subtask" | null;
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormState>(blankForm());

  const [commentsTask, setCommentsTask] = useState<Task | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // ── derived ─────────────────────────────────────────────────────────────────

  const tasks = initialTasks.filter((task) => {
    if (filters.status && filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.category && filters.category !== "all" && task.category !== filters.category) return false;
    if (filters.assignee && filters.assignee !== "all" && task.assignee !== filters.assignee) return false;
    if (filters.priority && filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (!filters.showCompleted && task.status === "completed") return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !task.title.toLowerCase().includes(q) &&
        !task.description.toLowerCase().includes(q) &&
        !task.assignee.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // ── helpers ──────────────────────────────────────────────────────────────────

  function openAdd() {
    setForm(blankForm());
    setEditingTask(null);
    setModalMode("add");
    setError(null);
  }

  function openEdit(task: Task) {
    setForm(taskToForm(task));
    setEditingTask(task);
    setModalMode("edit");
    setError(null);
  }

  function openAddSubtask(parent: Task) {
    setForm(blankForm({ parentTaskId: parent.id }));
    setEditingTask(parent);
    setModalMode("add_subtask");
    setError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingTask(null);
    setError(null);
  }

  function handleFormChange(patch: Partial<TaskFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  // ── actions ──────────────────────────────────────────────────────────────────

  function handleAddTask() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addTaskAction({
          title: form.title.trim(),
          description: form.description,
          category: form.category,
          assignee: form.assignee,
          dueDate: form.dueDate || undefined,
          startDate: form.startDate || undefined,
          priority: form.priority,
          recurrence: form.recurrence,
          recurrenceInterval: form.recurrenceInterval
            ? Number(form.recurrenceInterval)
            : null,
          permissionsScope: form.permissionsScope,
          parentTaskId: form.parentTaskId ?? null,
        });
        closeModal();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add task.");
      }
    });
  }

  function handleEditTask() {
    if (!editingTask) return;
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // Use updateTaskAction for all edit actions (not updateTaskStatusAction)
        await updateTaskAction({
          id: editingTask.id,
          title: form.title.trim(),
          description: form.description,
          category: form.category,
          assignee: form.assignee,
          dueDate: form.dueDate || undefined,
          startDate: form.startDate || undefined,
          priority: form.priority,
          recurrence: form.recurrence,
          recurrenceInterval: form.recurrenceInterval
            ? Number(form.recurrenceInterval)
            : null,
          permissionsScope: form.permissionsScope,
        });
        closeModal();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update task.");
      }
    });
  }

  function handleStatusChange(task: Task, status: TaskStatus) {
    startTransition(async () => {
      try {
        await updateTaskStatusAction({ id: task.id, status });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update status."
        );
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteTaskAction({ id: deleteTarget.id });
        setDeleteTarget(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete task.");
        setDeleteTarget(null);
      }
    });
  }

  function handleAddComment() {
    if (!commentsTask || !commentDraft.trim()) return;
    startTransition(async () => {
      try {
        await addTaskCommentAction({
          taskId: commentsTask.id,
          body: commentDraft.trim(),
        });
        setCommentDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add comment.");
      }
    });
  }

  function handleMarkNotificationRead(id: string) {
    startTransition(async () => {
      try {
        await markTaskNotificationReadAction({ id });
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      } catch {
        // ignore
      }
    });
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181b", margin: 0 }}>
          Tasks
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: "#fee2e2",
                color: "#dc2626",
                padding: "4px 10px",
                borderRadius: 99,
              }}
            >
              {unreadCount} notification{unreadCount !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={openAdd}
            disabled={isPending}
            style={{ ...buttonStyle, opacity: isPending ? 0.6 : 1 }}
          >
            + New Task
          </button>
        </div>
      </div>

      {/* notifications */}
      {notifications.filter((n) => !n.isRead).length > 0 && (
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {notifications
            .filter((n) => !n.isRead)
            .map((n) => (
              <div
                key={n.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#1e40af", fontWeight: 600 }}>
                  {n.title}
                </span>
                <button
                  onClick={() => handleMarkNotificationRead(n.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "#3b82f6",
                    fontWeight: 600,
                  }}
                >
                  Dismiss
                </button>
              </div>
            ))}
        </div>
      )}

      {/* global error */}
      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#dc2626",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#dc2626",
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <input
          style={{ ...inputStyle, width: 200 }}
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          style={{ ...inputStyle, width: 130 }}
          value={filters.status ?? "all"}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: (e.target.value as TaskStatus) || "all",
            }))
          }
        >
          <option value="all">All statuses</option>
          {TASKS_CONFIG.statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* category filter uses TASKS_CONFIG.categories */}
        <select
          style={{ ...inputStyle, width: 140 }}
          value={filters.category ?? "all"}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              category: (e.target.value as TaskCategory) || "all",
            }))
          }
        >
          <option value="all">All categories</option>
          {TASKS_CONFIG.categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          style={{ ...inputStyle, width: 130 }}
          value={filters.priority ?? "all"}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              priority: (e.target.value as TaskPriority) || "all",
            }))
          }
        >
          <option value="all">All priorities</option>
          {TASKS_CONFIG.priorities.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {knownUsers.length > 0 && (
          <select
            style={{ ...inputStyle, width: 160 }}
            value={filters.assignee ?? "all"}
            onChange={(e) =>
              setFilters((f) => ({ ...f, assignee: e.target.value || "all" }))
            }
          >
            <option value="all">All assignees</option>
            {knownUsers.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#3f3f46",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={!!filters.showCompleted}
            onChange={(e) =>
              setFilters((f) => ({ ...f, showCompleted: e.target.checked }))
            }
          />
          Show completed
        </label>
      </div>

      {/* task list */}
      {tasks.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 0",
            color: "#71717a",
            fontSize: 14,
          }}
        >
          No tasks found. Click &ldquo;+ New Task&rdquo; to get started.
        </div>
      ) : (
        <div>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              currentUserEmail={currentUserEmail}
              currentUserRole={currentUserRole}
              knownUsers={knownUsers}
              depth={0}
              onEditTask={openEdit}
              onDeleteTask={setDeleteTarget}
              onStatusChange={handleStatusChange}
              onAddSubtask={openAddSubtask}
              onOpenComments={setCommentsTask}
            />
          ))}
        </div>
      )}

      {/* add / edit task modal */}
      {(modalMode === "add" ||
        modalMode === "edit" ||
        modalMode === "add_subtask") && (
        <Modal
          title={
            modalMode === "edit"
              ? "Edit Task"
              : modalMode === "add_subtask"
                ? `Add Subtask to "${editingTask?.title}"`
                : "New Task"
          }
          onClose={closeModal}
        >
          <TaskForm
            form={form}
            onChange={handleFormChange}
            knownUsers={knownUsers}
          />

          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 16,
              justifyContent: "flex-end",
            }}
          >
            <button onClick={closeModal} style={secondaryButtonStyle}>
              Cancel
            </button>
            <button
              onClick={
                modalMode === "edit" ? handleEditTask : handleAddTask
              }
              disabled={isPending}
              style={{ ...buttonStyle, opacity: isPending ? 0.6 : 1 }}
            >
              {isPending
                ? "Saving…"
                : modalMode === "edit"
                  ? "Save Changes"
                  : "Add Task"}
            </button>
          </div>
        </Modal>
      )}

      {/* delete confirmation */}
      {deleteTarget && (
        <Modal
          title="Delete Task"
          onClose={() => setDeleteTarget(null)}
        >
          <p style={{ fontSize: 14, color: "#3f3f46", marginTop: 0 }}>
            Are you sure you want to delete{" "}
            <strong>&ldquo;{deleteTarget.title}&rdquo;</strong>? This action
            cannot be undone.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 16,
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => setDeleteTarget(null)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isPending}
              style={{
                ...buttonStyle,
                background: "#dc2626",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}

      {/* comments panel */}
      {commentsTask && (
        <Modal
          title={`Comments — ${commentsTask.title}`}
          onClose={() => {
            setCommentsTask(null);
            setCommentDraft("");
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 260,
              overflowY: "auto",
              marginBottom: 12,
            }}
          >
            {(commentsTask.comments ?? []).length === 0 && (
              <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
                No comments yet.
              </p>
            )}
            {(commentsTask.comments ?? []).map((c) => (
              <div
                key={c.id}
                style={{
                  background: "#f4f4f5",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: "#18181b",
                    marginBottom: 2,
                    fontSize: 12,
                  }}
                >
                  {c.createdBy}
                </div>
                <div style={{ color: "#3f3f46" }}>{c.body}</div>
              </div>
            ))}
          </div>

          {TASKS_CONFIG.allowComments && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <button
                onClick={handleAddComment}
                disabled={isPending || !commentDraft.trim()}
                style={{
                  ...buttonStyle,
                  opacity:
                    isPending || !commentDraft.trim() ? 0.5 : 1,
                }}
              >
                Send
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
