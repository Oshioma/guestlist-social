"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Returns the Monday of the week containing the given date, as a Date at 00:00 local.
function getMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDueDate(due: string): string {
  if (!due) return "";
  // Accepts "YYYY-MM-DD" or full ISO timestamp
  return due.slice(0, 10);
}

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

const weekNavButton: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#fff",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  minWidth: 32,
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

  // Week browser state
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const baseMonday = getMonday(new Date());
    baseMonday.setDate(baseMonday.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      return {
        key: toDateKey(d),
        short: WEEKDAY_SHORT[i],
        long: WEEKDAY_NAMES[d.getDay()],
        dayNum: d.getDate(),
        monthShort: d.toLocaleDateString(undefined, { month: "short" }),
        date: d,
      };
    });
  }, [weekOffset]);

  const weekRangeLabel = useMemo(() => {
    const first = weekDays[0].date;
    const last = weekDays[6].date;
    const sameMonth = first.getMonth() === last.getMonth();
    const firstStr = first.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const lastStr = last.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    });
    return `${firstStr} – ${lastStr}`;
  }, [weekDays]);

  const dueCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      const key = normalizeDueDate(t.dueDate);
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  function filterBySelectedDate(list: Task[]): Task[] {
    if (!selectedDate) return list;
    return list.filter((t) => normalizeDueDate(t.dueDate) === selectedDate);
  }

  // New task form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general");
  const [assignee, setAssignee] = useState(currentUserEmail || "");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");

  // When a day is selected in the week browser, pre-fill the new-task form's
  // due date so adding a task for that day is one click away.
  useEffect(() => {
    if (selectedDate) {
      setDueDate(selectedDate);
    }
  }, [selectedDate]);

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

  const myTasksFiltered = useMemo(
    () => filterBySelectedDate(myTasks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myTasks, selectedDate]
  );

  const allTasksFiltered = useMemo(
    () => filterBySelectedDate(tasks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, selectedDate]
  );

  const myTasksByCategory = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    CATEGORIES.forEach((c) => {
      groups[c.value] = myTasksFiltered.filter((t) => t.category === c.value);
    });
    return groups;
  }, [myTasksFiltered]);

  const allTasksByCategory = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    CATEGORIES.forEach((c) => {
      groups[c.value] = allTasksFiltered.filter((t) => t.category === c.value);
    });
    return groups;
  }, [allTasksFiltered]);

  // Open tasks assigned to anyone other than the current user, grouped by
  // assignee (so the operator can see what teammates have on their plate).
  const teamTasksByAssignee = useMemo(() => {
    const open = allTasksFiltered.filter(
      (t) =>
        t.status !== "completed" &&
        t.assignee &&
        t.assignee !== currentUserEmail
    );
    const groups = new Map<string, Task[]>();
    open.forEach((t) => {
      const list = groups.get(t.assignee) ?? [];
      list.push(t);
      groups.set(t.assignee, list);
    });
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [allTasksFiltered, currentUserEmail]);

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

      <SectionCard
        title="Week"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              style={weekNavButton}
              aria-label="Previous week"
            >
              &larr;
            </button>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#52525b",
                minWidth: 140,
                textAlign: "center",
              }}
            >
              {weekRangeLabel}
            </span>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              style={weekNavButton}
              aria-label="Next week"
            >
              &rarr;
            </button>
            <button
              type="button"
              onClick={() => {
                setWeekOffset(0);
                setSelectedDate(null);
              }}
              style={{
                ...weekNavButton,
                color: "#18181b",
                borderColor: "#d4d4d8",
              }}
            >
              Today
            </button>
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                style={{
                  ...weekNavButton,
                  background: "#18181b",
                  color: "#fff",
                  borderColor: "#18181b",
                }}
              >
                Clear
              </button>
            )}
          </div>
        }
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                {weekDays.map((d) => {
                  const isSelected = selectedDate === d.key;
                  const isToday = d.key === toDateKey(new Date());
                  return (
                    <th
                      key={d.key}
                      style={{
                        textAlign: "left",
                        padding: "12px 16px",
                        fontWeight: 600,
                        fontSize: 13,
                        color: isSelected ? "#18181b" : "#71717a",
                        borderBottom: isSelected
                          ? "2px solid #18181b"
                          : "2px solid #e4e4e7",
                        whiteSpace: "nowrap",
                        minWidth: 120,
                        background: isToday ? "#fafafa" : "#fff",
                      }}
                    >
                      {d.short} {d.dayNum} {d.monthShort}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weekDays.map((d) => {
                  const count = dueCountByDate.get(d.key) ?? 0;
                  const isSelected = selectedDate === d.key;
                  const colors =
                    count === 0
                      ? { bg: "#f3f4f6", text: "#9ca3af" }
                      : isSelected
                      ? { bg: "#18181b", text: "#fff" }
                      : { bg: "#dbeafe", text: "#1e40af" };
                  return (
                    <td
                      key={d.key}
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #f4f4f5",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDate(isSelected ? null : d.key)
                        }
                        style={{
                          appearance: "none",
                          WebkitAppearance: "none",
                          width: "100%",
                          padding: "10px 12px",
                          fontSize: 13,
                          fontWeight: 600,
                          border: isSelected
                            ? "1px solid #18181b"
                            : "1px solid #e4e4e7",
                          borderRadius: 8,
                          cursor: "pointer",
                          backgroundColor: colors.bg,
                          color: colors.text,
                          textAlign: "left",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>
                          {count === 0
                            ? "No tasks"
                            : `${count} task${count === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {selectedDate && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "#52525b",
            }}
          >
            Showing tasks due on{" "}
            <strong>
              {new Date(selectedDate).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
            . Click <strong>Clear</strong> to see all tasks again.
          </div>
        )}
      </SectionCard>

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

      <SectionCard
        title={`Team tasks (${teamTasksByAssignee.reduce(
          (sum, [, list]) => sum + list.length,
          0
        )})`}
      >
        {teamTasksByAssignee.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No open tasks assigned to anyone else.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {teamTasksByAssignee.map(([assigneeEmail, list]) => (
              <div key={assigneeEmail}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#52525b",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: "#18181b",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {assigneeEmail.slice(0, 2)}
                  </span>
                  <span>{assigneeEmail}</span>
                  <span style={{ color: "#a1a1aa", fontWeight: 500 }}>
                    · {list.length} open
                  </span>
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
            ))}
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
