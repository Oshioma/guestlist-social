"use client";

// Completed-tasks report: employee tabs across the top, and the selected
// employee's finished work laid out month by month beneath (newest first).
// The "All" tab shows every employee's work, grouped per person inside each
// month. Data comes from the task_completions log via
// getCompletedTasksReportData().

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TaskCompletion } from "@/features/tasks";
import { CATEGORIES } from "../../lib/tasks/config";
import { DEFAULT_TIMEZONE, zonedDateKey } from "../../../../lib/timezone";

// Month (YYYY-MM) a completion falls in, in the agency display zone — so a
// task finished late on the 31st counts in the right month for the team,
// not the server's.
function monthKey(iso: string): string {
  const dayKey = zonedDateKey(iso, DEFAULT_TIMEZONE);
  return dayKey ? dayKey.slice(0, 7) : "";
}

function monthLabel(key: string): string {
  const d = new Date(key + "-01T00:00:00Z");
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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

function personOf(c: TaskCompletion): string {
  return c.assignee || c.completedBy || "Unassigned";
}

export default function CompletedReport({
  completions,
  currentUserEmail,
}: {
  completions: TaskCompletion[];
  currentUserEmail: string;
}) {
  const [selectedTab, setSelectedTab] = useState<string>("all");

  // Employees with work logged, A→Z, with totals for the tab badges. Tab
  // labels use the part before the @ for readability, falling back to the
  // full email when two people would otherwise collide.
  const employees = useMemo(() => {
    const counts = new Map<string, number>();
    completions.forEach((c) => {
      const p = personOf(c);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    const list = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    const shortNames = new Map<string, string>();
    list.forEach((p) => {
      const short = p.includes("@") ? p.split("@")[0] : p;
      shortNames.set(p, short);
    });
    const seen = new Map<string, number>();
    shortNames.forEach((short) => seen.set(short, (seen.get(short) ?? 0) + 1));
    return list.map((p) => ({
      id: p,
      label: (seen.get(shortNames.get(p)!) ?? 0) > 1 ? p : shortNames.get(p)!,
      count: counts.get(p) ?? 0,
    }));
  }, [completions]);

  const thisMonthKey = useMemo(() => monthKey(new Date().toISOString()), []);

  // month → (employee → completions), months newest first, employees A→Z.
  const months = useMemo(() => {
    const filtered =
      selectedTab === "all"
        ? completions
        : completions.filter((c) => personOf(c) === selectedTab);
    const byMonth = new Map<string, Map<string, TaskCompletion[]>>();
    filtered.forEach((c) => {
      const mk = monthKey(c.completedAt);
      if (!mk) return;
      const people = byMonth.get(mk) ?? new Map<string, TaskCompletion[]>();
      const list = people.get(personOf(c)) ?? [];
      list.push(c);
      people.set(personOf(c), list);
      byMonth.set(mk, people);
    });
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([mk, people]) => ({
        monthKey: mk,
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
  }, [completions, selectedTab]);

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

  function renderTaskRow(c: TaskCompletion) {
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
            Completed tasks
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#71717a", maxWidth: 620 }}>
            Pick an employee to see what they{"’"}ve finished, month by month. Recurring tasks are counted every time they{"’"}re completed.
          </p>
        </div>
        <Link href="/admin-panel/tasks/overview" style={{ padding: "6px 10px", borderRadius: 8, background: "#fff", color: "#18181b", border: "1px solid #e4e4e7", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }} title="All current tasks per employee">
          {"👥"} Overview
        </Link>
      </div>

      {/* Employee tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setSelectedTab("all")} style={tabStyle(selectedTab === "all")}>
          All employees
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{completions.length}</span>
        </button>
        {employees.map((e) => (
          <button key={e.id} type="button" onClick={() => setSelectedTab(e.id)} style={tabStyle(selectedTab === e.id)} title={e.id}>
            {e.label}
            {e.id === currentUserEmail && <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>(you)</span>}
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{e.count}</span>
          </button>
        ))}
      </div>

      {/* Months */}
      {months.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "#71717a", background: "#fff", borderRadius: 12, border: "1px solid #e4e4e7" }}>
          No completed tasks yet. Once tasks are marked completed they{"’"}ll show up here, month by month.
        </div>
      ) : (
        months.map(({ monthKey: mk, total, people }) => (
          <section key={mk} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#18181b" }}>{monthLabel(mk)}</h2>
              {mk === thisMonthKey && (
                <span style={{ padding: "1px 8px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", fontSize: 11, fontWeight: 700 }}>
                  This month
                </span>
              )}
              <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500 }}>
                {total} task{total !== 1 ? "s" : ""} completed
              </span>
            </div>

            {selectedTab === "all" ? (
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
                      {list.map((c) => renderTaskRow(c))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {people.flatMap(({ list }) => list).map((c) => renderTaskRow(c))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
