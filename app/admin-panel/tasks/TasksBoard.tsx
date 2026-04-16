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

  const canSeeNotifications = TASKS_CONFIG.allowNotifications;
  const isViewer = currentUserRole === "viewer";

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
              disabled={isPending || isViewer}
              style={{ ...inputStyle, width: 140 }}
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
              {isViewer ? "View" : "Edit"}
            </button>

            {!isViewer && (
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

        {TASKS_CONFIG.allowSubtasks && task.subtasks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#52525b",
              }}
            >
              Subtasks ({task.subtasks.length})
            </div>
            {task.subtasks.map((subtask) => (
              <TaskCard key={subtask.id} task={subtask} level={1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function TaskEditorSheet({ task }: { task: Task }) {
    const [draft, setDraft] = useState({
      title: task.title,
      description: task.description,
      category: task.category,
      assignee: task.assignee,
      dueDate: task.dueDate,
      startDate: task.startDate,
      recurrence: task.recurrence,
      recurrenceInterval: task.recurrenceInterval ?? 1,
      priority: task.priority,
    });

    const [comment, setComment] = useState("");
    const [subtaskTitle, setSubtaskTitle] = useState("");

    const isReadOnly = isViewer;

    function handleSave() {
      if (!draft.title.trim()) return;

      startTransition(async () => {
        try {
          await updateTaskAction({
            id: task.id,
            title: draft.title,
            description: draft.description,
            category: draft.category,
            assignee: draft.assignee,
            dueDate: draft.dueDate,
            startDate: draft.startDate,
            recurrence: TASKS_CONFIG.allowRecurrence ? draft.recurrence : "none",
            recurrenceInterval:
              TASKS_CONFIG.allowRecurrence && draft.recurrence !== "none"
                ? draft.recurrenceInterval
                : null,
            priority: TASKS_CONFIG.allowPriority ? draft.priority : "medium",
            permissionsScope: TASKS_CONFIG.allowPermissionsScope ? "team" : "team",
          });
        } catch (err) {
          alert(err instanceof Error ? err.message : "Could not update task");
        }
      });
    }

    function handleAddSubtask() {
      if (!subtaskTitle.trim()) return;

      startTransition(async () => {
        try {
          await addTaskAction({
            title: subtaskTitle,
            description: "",
            category: draft.category,
            assignee: draft.assignee,
            dueDate: draft.dueDate,
            startDate: draft.startDate,
            recurrence: "none",
            recurrenceInterval: null,
            priority: "medium",
            parentTaskId: task.id,
            permissionsScope: "team",
          });

          setSubtaskTitle("");
        } catch (err) {
          alert(err instanceof Error ? err.message : "Could not add subtask");
        }
      });
    }

    function handleAddComment() {
      if (!comment.trim()) return;

      startTransition(async () => {
        try {
          await addTaskCommentAction({
            taskId: task.id,
            body: comment,
          });
          setComment("");
        } catch (err) {
          alert(err instanceof Error ? err.message : "Could not add comment");
        }
      });
    }

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(24,24,27,0.36)",
          zIndex: 50,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            width: "min(720px, 100%)",
            height: "100%",
            background: "#fff",
            borderLeft: "1px solid #e4e4e7",
            overflowY: "auto",
            padding: 20,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#18181b",
                }}
              >
                {isReadOnly ? "Task details" : "Edit task"}
              </h2>
              <div style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
                {isReadOnly
                  ? "You have read-only access to this task."
                  : "Same core engine. App-specific behavior comes from config now."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTaskId(null)}
              style={secondaryButton}
            >
              Close
            </button>
          </div>

          <SectionCard title="Details">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Task title"
                style={inputStyle}
                disabled={isReadOnly}
              />

              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Description"
                style={{
                  ...inputStyle,
                  minHeight: 96,
                  resize: "vertical",
                  background: isReadOnly ? "#fafafa" : "#fff",
                }}
                disabled={isReadOnly}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                }}
              >
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as TaskCategory,
                    })
                  }
                  style={inputStyle}
                  disabled={isReadOnly}
                >
                  {TASKS_CONFIG.categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <select
                  value={draft.assignee}
                  onChange={(e) =>
                    setDraft({ ...draft, assignee: e.target.value })
                  }
                  style={inputStyle}
                  disabled={isReadOnly}
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) =>
                    setDraft({ ...draft, startDate: e.target.value })
                  }
                  style={inputStyle}
                  disabled={isReadOnly}
                />

                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) =>
                    setDraft({ ...draft, dueDate: e.target.value })
                  }
                  style={inputStyle}
                  disabled={isReadOnly}
                />

                {TASKS_CONFIG.allowPriority && (
                  <select
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        priority: e.target.value as TaskPriority,
                      })
                    }
                    style={inputStyle}
                    disabled={isReadOnly}
                  >
                    {TASKS_CONFIG.priorities.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}

                {TASKS_CONFIG.allowRecurrence && (
                  <select
                    value={draft.recurrence}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        recurrence: e.target.value as TaskRecurrence,
                      })
                    }
                    style={inputStyle}
                    disabled={isReadOnly}
                  >
                    {TASKS_CONFIG.recurrences.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}

                {TASKS_CONFIG.allowRecurrence && draft.recurrence !== "none" && (
                  <input
                    type="number"
                    min={1}
                    value={draft.recurrenceInterval}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        recurrenceInterval: Number(e.target.value || 1),
                      })
                    }
                    style={inputStyle}
                    placeholder="Interval"
                    disabled={isReadOnly}
                  />
                )}
              </div>

              {!isReadOnly && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending}
                    style={primaryButton}
                  >
                    Save changes
                  </button>

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
                    Delete task
                  </button>
                </div>
              )}
            </div>
          </SectionCard>

          {TASKS_CONFIG.allowSubtasks && (
            <SectionCard title={`Subtasks (${task.subtasks.length})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {!isReadOnly && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      placeholder="Add subtask"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={handleAddSubtask}
                      disabled={isPending || !subtaskTitle.trim()}
                      style={primaryButton}
                    >
                      Add
                    </button>
                  </div>
                )}

                {task.subtasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#71717a" }}>
                    No subtasks yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {task.subtasks.map((subtask) => (
                      <TaskCard key={subtask.id} task={subtask} level={0} />
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {TASKS_CONFIG.allowComments && (
            <SectionCard title={`Comments (${task.comments?.length ?? 0})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {canComment && !isReadOnly ? (
                  <>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add comment"
                      style={{
                        ...inputStyle,
                        minHeight: 90,
                        resize: "vertical",
                      }}
                    />

                    <div>
                      <button
                        type="button"
                        onClick={handleAddComment}
                        disabled={isPending || !comment.trim()}
                        style={primaryButton}
                      >
                        Add comment
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "#71717a" }}>
                    You have view-only access, so comments are disabled.
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(task.comments ?? []).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        border: "1px solid #e4e4e7",
                        borderRadius: 12,
                        padding: 12,
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#18181b",
                          marginBottom: 6,
                        }}
                      >
                        {c.createdBy}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#52525b",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {c.body}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          <SectionCard title={`Activity (${task.activity?.length ?? 0})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(task.activity ?? []).map((a) => (
                <div
                  key={a.id}
                  style={{
                    borderBottom: "1px solid #f4f4f5",
                    paddingBottom: 8,
                    fontSize: 13,
                    color: "#52525b",
                  }}
                >
                  <strong style={{ color: "#18181b" }}>{a.actor}</strong> —{" "}
                  {a.action.replaceAll("_", " ")}
                  {a.fieldName ? ` (${a.fieldName})` : ""}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
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
            Shared task engine with config-driven categories, labels, route
            refresh behavior, and role-aware UI.
          </p>
        </div>

        {canSeeNotifications && (
          <SectionCard title={`Notifications (${notifications.length})`}>
            {notifications.length === 0 ? (
              <div style={{ fontSize: 13, color: "#71717a" }}>
                No unread notifications.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {notifications.slice(0, 6).map((note) => (
                  <div
                    key={note.id}
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#18181b",
                        marginBottom: 4,
                      }}
                    >
                      {note.title}
                    </div>
                    {note.body && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#52525b",
                          marginBottom: 8,
                        }}
                      >
                        {note.body}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleMarkNotificationRead(note.id)}
                      style={secondaryButton}
                    >
                      Mark read
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>

      <SectionCard title="Filters">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <input
            value={filters.q ?? ""}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search tasks"
            style={inputStyle}
          />

          <select
            value={filters.status ?? "all"}
            onChange={(e) =>
              setFilters({
                ...filters,
                status: e.target.value as TaskStatus | "all",
              })
            }
            style={inputStyle}
          >
            <option value="all">All statuses</option>
            {TASKS_CONFIG.statuses.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filters.category ?? "all"}
            onChange={(e) =>
              setFilters({
                ...filters,
                category: e.target.value as TaskCategory | "all",
              })
            }
            style={inputStyle}
          >
            <option value="all">All categories</option>
            {TASKS_CONFIG.categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={filters.assignee ?? "all"}
            onChange={(e) =>
              setFilters({
                ...filters,
                assignee: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="all">All assignees</option>
            {assigneeOptions.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>

          {TASKS_CONFIG.allowPriority && (
            <select
              value={filters.priority ?? "all"}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  priority: e.target.value as TaskPriority | "all",
                })
              }
              style={inputStyle}
            >
              <option value="all">All priorities</option>
              {TASKS_CONFIG.priorities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={filters.due ?? "all"}
            onChange={(e) =>
              setFilters({
                ...filters,
                due: e.target.value as TaskFilters["due"],
              })
            }
            style={inputStyle}
          >
            <option value="all">All due dates</option>
            <option value="today">Due today</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Upcoming</option>
            <option value="none">No due date</option>
          </select>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#52525b",
              padding: "10px 0",
            }}
          >
            <input
              type="checkbox"
              checked={filters.showCompleted ?? true}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  showCompleted: e.target.checked,
                })
              }
            />
            Show completed
          </label>
        </div>
      </SectionCard>

      <SectionCard title="New task">
        {canCreateTasks ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={newTask.title}
              onChange={(e) =>
                setNewTask((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Task title"
              style={inputStyle}
            />

            <textarea
              value={newTask.description}
              onChange={(e) =>
                setNewTask((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Description"
              style={{
                ...inputStyle,
                minHeight: 90,
                resize: "vertical",
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <select
                value={newTask.category}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    category: e.target.value as TaskCategory,
                  }))
                }
                style={inputStyle}
              >
                {TASKS_CONFIG.categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              <select
                value={newTask.assignee}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, assignee: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={newTask.startDate}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, startDate: e.target.value }))
                }
                style={inputStyle}
              />

              <input
                type="date"
                value={newTask.dueDate}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, dueDate: e.target.value }))
                }
                style={inputStyle}
              />

              {TASKS_CONFIG.allowPriority && (
                <select
                  value={newTask.priority}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      priority: e.target.value as TaskPriority,
                    }))
                  }
                  style={inputStyle}
                >
                  {TASKS_CONFIG.priorities.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}

              {TASKS_CONFIG.allowRecurrence && (
                <select
                  value={newTask.recurrence}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      recurrence: e.target.value as TaskRecurrence,
                    }))
                  }
                  style={inputStyle}
                >
                  {TASKS_CONFIG.recurrences.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}

              {TASKS_CONFIG.allowRecurrence && newTask.recurrence !== "none" && (
                <input
                  type="number"
                  min={1}
                  value={newTask.recurrenceInterval}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      recurrenceInterval: Number(e.target.value || 1),
                    }))
                  }
                  style={inputStyle}
                  placeholder="Repeat every"
                />
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => handleCreateTask(null)}
                disabled={isPending || !newTask.title.trim()}
                style={{
                  ...primaryButton,
                  opacity: isPending || !newTask.title.trim() ? 0.6 : 1,
                }}
              >
                Add task
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            You have view-only access.
          </div>
        )}
      </SectionCard>

      <SectionCard title={`My tasks (${myTasks.length})`}>
        {myTasks.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No tasks assigned to you.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {myTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Team tasks (${teamTasks.length})`}>
        {teamTasks.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No team tasks in this filter view.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {teamTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`All tasks (${filteredTasks.length})`}>
        {filteredTasks.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No tasks match these filters.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </SectionCard>

      {selectedTask && <TaskEditorSheet task={task} />}
    </div>
  );
}
