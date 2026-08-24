"use client";

// Tasks overview: same layout as the completed report — employee tabs across
// the top, the selected employee's *current* (open / in-progress) tasks
// beneath. Clicking a task title expands its details right below the row.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Task, TaskStatus } from "../../lib/tasks/types";
import { CATEGORIES, STATUS_OPTIONS } from "../../lib/tasks/config";
import { updateTaskStatusAction } from "../../lib/tasks/actions";
import { DEFAULT_TIMEZONE } from "../../../../lib/timezone";

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
    timeZone: DEFAULT_TIMEZONE,
  });
}

function categoryMeta(value: string) {
  return (
    CATEGORIES.find((c) => c.value === value) ?? {
      value: "general",
      label: "General",
      color: "#71717a",
    }
  );
}

function personOf(t: Task): string {
  return t.assignee || "Unassigned";
}

// Same URL-linkifying used on the tasks board so descriptions with links
// stay clickable in the expanded view.
function renderTextWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s)>\]"']+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const url = match[0].replace(/[.,;:!?)]+$/, "");
    const afterUrl = match.index + match[0].length;
    parts.push(
      <a key={`u-${match.index}`} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline", wordBreak: "break-all" }}>
        {url}
      </a>
    );
    if (url.length < match[0].length) {
      parts.push(<span key={`t-${match.index}-trail`}>{match[0].slice(url.length)}</span>);
    }
    lastIndex = afterUrl;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}-end`}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

// Due-date ascending, undated tasks last — the natural "what's next" order.
function byDue(a: Task, b: Task): number {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

const STATUS_SECTIONS: {
  value: TaskStatus;
  label: string;
  pillBg: string;
  pillColor: string;
  pillBorder: string;
}[] = [
  { value: "in_progress", label: "In progress", pillBg: "#dbeafe", pillColor: "#1e40af", pillBorder: "#93c5fd" },
  { value: "open", label: "Open", pillBg: "#f4f4f5", pillColor: "#52525b", pillBorder: "#e4e4e7" },
];

export default function TasksOverview({
  initialTasks,
  currentUserEmail,
}: {
  initialTasks: Task[];
  currentUserEmail: string;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isPending, startTransition] = useTransition();

  // Sync with server revalidation (same pattern as TasksBoard).
  const prevRef = useRef(initialTasks);
  useEffect(() => {
    if (prevRef.current !== initialTasks) {
      prevRef.current = initialTasks;
      setTasks(initialTasks);
    }
  }, [initialTasks]);

  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const currentTasks = useMemo(
    () => tasks.filter((t) => t.status !== "completed"),
    [tasks]
  );

  // Employees with current tasks, A→Z, with counts for the tab badges. Tab
  // labels use the part before the @ for readability, falling back to the
  // full email when two people would otherwise collide.
  const employees = useMemo(() => {
    const counts = new Map<string, number>();
    currentTasks.forEach((t) => {
      const p = personOf(t);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    const list = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    const shortNames = new Map<string, string>();
    list.forEach((p) => {
      shortNames.set(p, p.includes("@") ? p.split("@")[0] : p);
    });
    const seen = new Map<string, number>();
    shortNames.forEach((short) => seen.set(short, (seen.get(short) ?? 0) + 1));
    return list.map((p) => ({
      id: p,
      label: (seen.get(shortNames.get(p)!) ?? 0) > 1 ? p : shortNames.get(p)!,
      count: counts.get(p) ?? 0,
    }));
  }, [currentTasks]);

  // status section → (employee → tasks), employees A→Z, tasks by due date.
  const sections = useMemo(() => {
    const filtered =
      selectedTab === "all"
        ? currentTasks
        : currentTasks.filter((t) => personOf(t) === selectedTab);
    return STATUS_SECTIONS.map((section) => {
      const inSection = filtered.filter((t) => t.status === section.value);
      const byPerson = new Map<string, Task[]>();
      inSection.forEach((t) => {
        const list = byPerson.get(personOf(t)) ?? [];
        list.push(t);
        byPerson.set(personOf(t), list);
      });
      return {
        ...section,
        total: inSection.length,
        people: Array.from(byPerson.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([person, list]) => ({ person, list: list.slice().sort(byDue) })),
      };
    });
  }, [currentTasks, selectedTab]);

  function handleStatusChange(task: Task, newStatus: TaskStatus) {
    const prev = task.status;
    setTasks((all) => all.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    startTransition(async () => {
      try {
        await updateTaskStatusAction(task.id, newStatus);
      } catch (err) {
        setTasks((all) => all.map((t) => (t.id === task.id ? { ...t, status: prev } : t)));
        alert(err instanceof Error ? err.message : "Could not update status");
      }
    });
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    background: active ? "#18181b" : "#fff",
    color: active ? "#fff" : "#52525b",
    border: active ? "1px solid #18181b" : "1px solid #e4e4e7",
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  function renderTaskRow(task: Task) {
    const meta = categoryMeta(task.category);
    const overdue = isOverdue(task.dueDate, task.status);
    const isOpen = expandedId === task.id;
    return (
      <div key={task.id} style={{ border: isOpen ? "1.5px solid #18181b" : "1px solid #f4f4f5", borderRadius: 10, background: "#fafafa", display: "flex", flexDirection: "column" }}>
        <button
          type="button"
          onClick={() => setExpandedId(isOpen ? null : task.id)}
          aria-expanded={isOpen}
          style={{ appearance: "none", WebkitAppearance: "none", background: "transparent", border: "none", padding: "8px 12px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", font: "inherit", color: "inherit" }}
        >
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: meta.color, flexShrink: 0 }} title={meta.label} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#18181b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.title}
          </span>
          {task.priority === "high" && (
            <span style={{ padding: "1px 7px", borderRadius: 999, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
              High
            </span>
          )}
          {overdue && (
            <span style={{ padding: "1px 7px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
              Overdue
            </span>
          )}
          {task.recurrence !== "none" && (
            <span style={{ padding: "1px 7px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6", border: "1px solid #ddd6fe", fontSize: 11, fontWeight: 600, flexShrink: 0 }} title={task.recurrence === "weekly" ? "Repeats weekly" : "Repeats monthly"}>
              {"↻"}
            </span>
          )}
          <span style={{ padding: "1px 7px", borderRadius: 999, background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}40`, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 12, color: overdue ? "#991b1b" : "#71717a", fontWeight: overdue ? 600 : 400, flexShrink: 0 }}>
            {formatDate(task.dueDate)}
          </span>
          <span style={{ fontSize: 11, color: "#a1a1aa", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
        </button>
        {isOpen && (
          <div style={{ padding: "0 12px 12px 30px", display: "flex", flexDirection: "column", gap: 10 }}>
            {task.description ? (
              <p style={{ margin: 0, fontSize: 13, color: "#3f3f46", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {renderTextWithLinks(task.description)}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#a1a1aa" }}>No description.</p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "#71717a" }}>
              <span>Assignee: <strong style={{ color: "#18181b", fontWeight: 600 }}>{task.assignee || "Unassigned"}</strong></span>
              {task.createdBy && <span>From: <strong style={{ color: "#18181b", fontWeight: 600 }}>{task.createdBy}</strong></span>}
              <span>Repeats: <strong style={{ color: "#18181b", fontWeight: 600 }}>{task.recurrence === "none" ? "One-off" : task.recurrence}</strong></span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                disabled={isPending}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12, background: "#fff", color: "#18181b", fontFamily: "inherit", outline: "none" }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/admin-panel/tasks" style={{ fontSize: 12, fontWeight: 600, color: "#71717a", textDecoration: "none" }}>
            {"←"} Back to tasks
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1.05, fontWeight: 700, color: "#18181b", letterSpacing: "-0.03em" }}>
            Tasks overview
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#71717a", maxWidth: 620 }}>
            Every current task at a glance. Pick an employee, then click a task to see its details.
          </p>
        </div>
        <Link href="/admin-panel/tasks/completed" style={{ padding: "6px 10px", borderRadius: 8, background: "#fff", color: "#18181b", border: "1px solid #e4e4e7", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }} title="Completed tasks per employee, month by month">
          {"📅"} Employee report
        </Link>
      </div>

      {/* Employee tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setSelectedTab("all")} style={tabStyle(selectedTab === "all")}>
          All employees
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{currentTasks.length}</span>
        </button>
        {employees.map((e) => (
          <button key={e.id} type="button" onClick={() => setSelectedTab(e.id)} style={tabStyle(selectedTab === e.id)} title={e.id}>
            {e.label}
            {e.id === currentUserEmail && <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>(you)</span>}
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{e.count}</span>
          </button>
        ))}
      </div>

      {/* Status sections */}
      {currentTasks.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "#71717a", background: "#fff", borderRadius: 12, border: "1px solid #e4e4e7" }}>
          No current tasks. Everything{"’"}s done {"🎉"}
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.value} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ padding: "2px 10px", borderRadius: 999, background: section.pillBg, color: section.pillColor, border: `1px solid ${section.pillBorder}`, fontSize: 12, fontWeight: 700 }}>
                {section.label}
              </span>
              <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500 }}>
                {section.total} task{section.total !== 1 ? "s" : ""}
              </span>
            </div>
            {section.total === 0 ? (
              <div style={{ fontSize: 13, color: "#a1a1aa" }}>Nothing here right now.</div>
            ) : selectedTab === "all" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {section.people.map(({ person, list }) => (
                  <div key={person}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999, background: "#18181b", color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                        {person.slice(0, 2)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
                        {person === currentUserEmail ? `${person} (you)` : person}
                      </span>
                      <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500 }}>
                        {"\xb7"} {list.length} task{list.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {list.map((t) => renderTaskRow(t))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {section.people.flatMap(({ list }) => list).map((t) => renderTaskRow(t))}
              </div>
            )}
          </section>
        ))
      )}

      {/* Loading toast */}
      {isPending && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#18181b", color: "#fff", padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 600, zIndex: 400, pointerEvents: "none" }}>
          Saving...
        </div>
      )}
    </div>
  );
}
