"use client";

// Weekly completed-tasks report: one section per week (newest first), grouped
// by employee inside each week, so it reads as "what did each person finish
// this week". Data comes from the task_completions log via
// getCompletedTasksReportData().

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaskCompletion } from "@/features/tasks";
import { CATEGORIES } from "../../lib/tasks/config";
import { DEFAULT_TIMEZONE, zonedDateKey } from "../../../../lib/timezone";

// Monday (YYYY-MM-DD) of the week a completion falls in, in the agency
// display zone — so a task finished late Sunday night counts in the right
// week for the team, not the server's.
function weekStartKey(iso: string): string {
  const dayKey = zonedDateKey(iso, DEFAULT_TIMEZONE);
  if (!dayKey) return "";
  const d = new Date(dayKey + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

function weekRangeLabel(weekKey: string): string {
  const start = new Date(weekKey + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startStr = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
    timeZone: "UTC",
  });
  const endStr = end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startStr} – ${endStr}`;
}

function completedDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

export default function CompletedWeeklyReport({
  completions,
  currentUserEmail,
}: {
  completions: TaskCompletion[];
  currentUserEmail: string;
}) {
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");

  const employees = useMemo(() => {
    const set = new Set<string>();
    completions.forEach((c) => set.add(c.assignee || c.completedBy || "Unassigned"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [completions]);

  const thisWeekKey = useMemo(() => weekStartKey(new Date().toISOString()), []);

  // week key → employee → completions, weeks newest first, employees A→Z.
  const weeks = useMemo(() => {
    const filtered = completions.filter((c) => {
      if (employeeFilter === "all") return true;
      return (c.assignee || c.completedBy || "Unassigned") === employeeFilter;
    });
    const byWeek = new Map<string, Map<string, TaskCompletion[]>>();
    filtered.forEach((c) => {
      const wk = weekStartKey(c.completedAt);
      if (!wk) return;
      const person = c.assignee || c.completedBy || "Unassigned";
      const people = byWeek.get(wk) ?? new Map<string, TaskCompletion[]>();
      const list = people.get(person) ?? [];
      list.push(c);
      people.set(person, list);
      byWeek.set(wk, people);
    });
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekKey, people]) => ({
        weekKey,
        total: Array.from(people.values()).reduce((s, l) => s + l.length, 0),
        people: Array.from(people.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([person, list]) => ({
            person,
            list: list
              .slice()
              .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
          })),
      }));
  }, [completions, employeeFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/admin-panel/tasks" style={{ fontSize: 12, fontWeight: 600, color: "#71717a", textDecoration: "none" }}>
            {"←"} Back to tasks
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1.05, fontWeight: 700, color: "#18181b", letterSpacing: "-0.03em" }}>
            Completed tasks by week
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#71717a", maxWidth: 620 }}>
            What each employee finished, week by week. Recurring tasks are counted every time they{"’"}re completed.
          </p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>Employee</span>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13, background: "#fff", color: "#18181b", fontFamily: "inherit", outline: "none" }}
          >
            <option value="all">All employees</option>
            {employees.map((u) => (
              <option key={u} value={u}>
                {u === currentUserEmail ? `${u} (you)` : u}
              </option>
            ))}
          </select>
        </label>
      </div>

      {weeks.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "#71717a", background: "#fff", borderRadius: 12, border: "1px solid #e4e4e7" }}>
          No completed tasks yet. Once tasks are marked completed they{"’"}ll show up here, grouped by week.
        </div>
      ) : (
        weeks.map(({ weekKey, total, people }) => {
          const isThisWeek = weekKey === thisWeekKey;
          return (
            <section key={weekKey} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#18181b" }}>
                  {weekRangeLabel(weekKey)}
                </h2>
                {isThisWeek && (
                  <span style={{ padding: "1px 8px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", fontSize: 11, fontWeight: 700 }}>
                    This week
                  </span>
                )}
                <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500 }}>
                  {total} task{total !== 1 ? "s" : ""} completed
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {people.map(({ person, list }) => (
                  <div key={person}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999, background: "#18181b", color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                        {person.slice(0, 2)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
                        {person === currentUserEmail ? `${person} (you)` : person}
                      </span>
                      <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500 }}>
                        {"\xb7"} {list.length} completed
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {list.map((c) => {
                        const meta = categoryMeta(c.category);
                        return (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #f4f4f5", borderRadius: 10, padding: "8px 12px", background: "#fafafa" }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: meta.color, flexShrink: 0 }} title={meta.label} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#18181b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.title}
                            </span>
                            {c.recurrence !== "none" && (
                              <span style={{ padding: "1px 7px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6", border: "1px solid #ddd6fe", fontSize: 11, fontWeight: 600, flexShrink: 0 }} title={c.recurrence === "weekly" ? "Repeats weekly" : "Repeats monthly"}>
                                {"↻"} {c.recurrence}
                              </span>
                            )}
                            <span style={{ padding: "1px 7px", borderRadius: 999, background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}40`, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                              {meta.label}
                            </span>
                            <span style={{ fontSize: 12, color: "#71717a", flexShrink: 0 }}>
                              {completedDayLabel(c.completedAt)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
