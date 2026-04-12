"use client";

import { useMemo, useState, useTransition } from "react";
import SectionCard from "../components/SectionCard";
import type { Task, TaskCategory, TaskStatus, TaskRecurrence } from "../lib/types";
import {
  addTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "../lib/task-actions";

const CATEGORIES: { value: TaskCategory; label: string; color: string }[] = [
  { value: "video", label: "Video", color: "#22c55e" },
  { value: "carousel", label: "Carousel", color: "#3b82f6" },
  { value: "story", label: "Story", color: "#eab308" },
  { value: "design", label: "Design", color: "#a855f7" },
  { value: "general", label: "General", color: "#71717a" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const RECURRENCE_OPTIONS: { value: TaskRecurrence; label: string }[] = [
  { value: "none", label: "One-off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function recurrenceSummary(recurrence: TaskRecurrence, dueDate: string) {
  if (recurrence === "none") return "";
  if (!dueDate) {
    return recurrence === "weekly" ? "Repeats weekly" : "Repeats monthly";
  }
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) {
    return recurrence === "weekly" ? "Repeats weekly" : "Repeats monthly";
  }
  if (recurrence === "weekly") {
    return `Every ${WEEKDAY_NAMES[d.getDay()]}`;
  }
  return `Monthly on day ${d.getDate()}`;
}

function categoryMeta(value: string) {
  return (
    CATEGORIES.find((c) => c.value === value) ?? {
      value: "general" as TaskCategory,
      label: "General",
      color: "#71717a",
    }
  );
}

function statusPillStyles(status: TaskStatus) {
  if (status === "completed")
    return { bg: "#dcfce7", color: "#166534", border: "#86efac" };
  if (status === "in_progress")
    return { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" };
  return { bg: "#f4f4f5", color: "#52525b", border: "#e4e4e7" };
}

function isOverdue(dueDate: string, status: TaskStatus) {
  if (!dueDate || status === "completed") return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

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

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
};

const primaryButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#18181b",
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#fff",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export default function TasksBoard({
  initialTasks,
  currentUserEmail,
  knownUsers,
}: {
  initialTasks: Task[];
  currentUserEmail: string;
  knownUsers: string[];
}) {
  const [tasks] = useState<Task[]>(initialTasks);
  const [isPending, startTransition] = useTransition();

  // New task form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general");
  const [assignee, setAssignee] = useState(currentUserEmail || "");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    category: TaskCategory;
    assignee: string;
    dueDate: string;
    recurrence: TaskRecurrence;
  } | null>(null);

  const myTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.assignee === currentUserEmail && t.status !== "completed"
      ),
    [tasks, currentUserEmail]
  );

  const myTasksByCategory = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    CATEGORIES.forEach((c) => {
      groups[c.value] = myTasks.filter((t) => t.category === c.value);
    });
    return groups;
  }, [myTasks]);

  const allTasksByCategory = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    CATEGORIES.forEach((c) => {
      groups[c.value] = tasks.filter((t) => t.category === c.value);
    });
    return groups;
  }, [tasks]);

  function handleAdd() {
    if (!title.trim()) return;
    const snapshot = {
      title: title.trim(),
      description: description.trim(),
      category,
      assignee: assignee.trim(),
      dueDate,
      recurrence,
    };
    startTransition(async () => {
      try {
        await addTaskAction(
          snapshot.title,
          snapshot.description,
          snapshot.category,
          snapshot.assignee,
          snapshot.dueDate,
          snapshot.recurrence
        );
        setTitle("");
        setDescription("");
        setDueDate("");
        setRecurrence("none");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add task");
      }
    });
  }

  function handleStatusChange(task: Task, newStatus: TaskStatus) {
    startTransition(async () => {
      try {
        await updateTaskStatusAction(task.id, newStatus);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  function handleDelete(task: Task) {
    if (!confirm(`Delete "${task.title}"?`)) return;
    startTransition(async () => {
      try {
        await deleteTaskAction(task.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditDraft({
      title: task.title,
      description: task.description,
      category: task.category,
      assignee: task.assignee,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      recurrence: task.recurrence ?? "none",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  function saveEdit(task: Task) {
    if (!editDraft) return;
    const draft = editDraft;
    startTransition(async () => {
      try {
        await updateTaskAction(
          task.id,
          draft.title,
          draft.description,
          draft.category,
          draft.assignee,
          draft.dueDate,
          draft.recurrence
        );
        setEditingId(null);
        setEditDraft(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update task");
      }
    });
  }

  const assigneeOptions = Array.from(
    new Set([currentUserEmail, ...knownUsers].filter(Boolean))
  );

  function renderTaskRow(task: Task, allowReassign: boolean = true) {
    const meta = categoryMeta(task.category);
    const pill = statusPillStyles(task.status);
    const overdue = isOverdue(task.dueDate, task.status);
    const isEditing = editingId === task.id;

    if (isEditing && editDraft) {
      return (
        <div
          key={task.id}
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            padding: 12,
            background: "#fafafa",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            type="text"
            value={editDraft.title}
            onChange={(e) =>
              setEditDraft({ ...editDraft, title: e.target.value })
            }
            style={inputStyle}
            placeholder="Title"
          />
          <textarea
            value={editDraft.description}
            onChange={(e) =>
              setEditDraft({ ...editDraft, description: e.target.value })
            }
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            placeholder="Description"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <select
              value={editDraft.category}
              onChange={(e) =>
                setEditDraft({
                  ...editDraft,
                  category: e.target.value as TaskCategory,
                })
              }
              style={inputStyle}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={editDraft.assignee}
              onChange={(e) =>
                setEditDraft({ ...editDraft, assignee: e.target.value })
              }
              style={inputStyle}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={editDraft.dueDate}
              onChange={(e) =>
                setEditDraft({ ...editDraft, dueDate: e.target.value })
              }
              style={inputStyle}
            />
            <select
              value={editDraft.recurrence}
              onChange={(e) =>
                setEditDraft({
                  ...editDraft,
                  recurrence: e.target.value as TaskRecurrence,
                })
              }
              style={inputStyle}
            >
              {RECURRENCE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => saveEdit(task)}
              disabled={isPending}
              style={primaryButton}
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isPending}
              style={secondaryButton}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        style={{
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: meta.color,
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#18181b",
                  textDecoration:
                    task.status === "completed" ? "line-through" : "none",
                }}
              >
                {task.title}
              </span>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: pill.bg,
                  color: pill.color,
                  border: `1px solid ${pill.border}`,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {STATUS_OPTIONS.find((s) => s.value === task.status)?.label ??
                  task.status}
              </span>
              {overdue && (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#fee2e2",
                    color: "#991b1b",
                    border: "1px solid #fecaca",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Overdue
                </span>
              )}
              {task.recurrence && task.recurrence !== "none" && (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#ede9fe",
                    color: "#5b21b6",
                    border: "1px solid #ddd6fe",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                  title={recurrenceSummary(task.recurrence, task.dueDate)}
                >
                  {recurrenceSummary(task.recurrence, task.dueDate)}
                </span>
              )}
            </div>
            {task.description && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "#52525b",
                  whiteSpace: "pre-wrap",
                }}
              >
                {task.description}
              </div>
            )}
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#71717a",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <span>Due: {formatDate(task.dueDate)}</span>
              <span>·</span>
              <span>Assignee: {task.assignee || "Unassigned"}</span>
              {task.createdBy && (
                <>
                  <span>·</span>
                  <span>From: {task.createdBy}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <select
              value={task.status}
              onChange={(e) =>
                handleStatusChange(task, e.target.value as TaskStatus)
              }
              disabled={isPending}
              style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {allowReassign && (
              <button
                type="button"
                onClick={() => startEdit(task)}
                disabled={isPending}
                style={secondaryButton}
              >
                Edit
              </button>
            )}
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 700,
            color: "#18181b",
            letterSpacing: "-0.03em",
          }}
        >
          Tasks
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "#71717a",
            maxWidth: 760,
          }}
        >
          Assign work to teammates, track progress, and keep every category
          moving. Your own open tasks are shown first.
        </p>
      </div>

      <SectionCard title="My open tasks">
        {myTasks.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            Nothing assigned to you. Nice.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {CATEGORIES.map((c) => {
              const list = myTasksByCategory[c.value] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={c.value}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: c.color,
                      }}
                    />
                    {c.label} ({list.length})
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {list.map((t) => renderTaskRow(t))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="New task">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            style={inputStyle}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#71717a" }}>Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#71717a" }}>Assign to</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                style={inputStyle}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#71717a" }}>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#71717a" }}>Repeats</span>
              <select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as TaskRecurrence)
                }
                style={inputStyle}
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {recurrence !== "none" && (
            <div style={{ fontSize: 12, color: "#71717a" }}>
              Tip: pick a due date on the first target day (e.g. next Monday) and the task will roll forward automatically when marked completed.
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !title.trim()}
              style={{
                ...primaryButton,
                opacity: !title.trim() || isPending ? 0.6 : 1,
              }}
            >
              Add task
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`All tasks (${tasks.length})`}>
        {tasks.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No tasks yet. Create one above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {CATEGORIES.map((c) => {
              const list = allTasksByCategory[c.value] ?? [];
              return (
                <div key={c.value}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: c.color,
                      }}
                    />
                    {c.label} ({list.length})
                  </div>
                  {list.length === 0 ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#a1a1aa",
                        padding: "8px 0",
                      }}
                    >
                      No tasks in this category.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {list.map((t) => renderTaskRow(t))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
