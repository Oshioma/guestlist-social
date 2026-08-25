"use client";

// ---------------------------------------------------------------------------
// SalesTaskCalendar — the sales tasks as a month calendar.
//
// Mirrors Capsule's own calendar view: a Mon–Sun month grid with each task on
// its due date, a side panel showing the selected day's tasks (today by
// default), and ‹ › / Today navigation. Every task the grid shows was loaded
// with the page (Capsule open tasks + pipeline follow-ups), so month
// navigation and day selection are instant — no refetching.
//
// Overdue and undated tasks don't vanish off the grid: chips above the
// calendar show their counts and select them into the side panel.
// ---------------------------------------------------------------------------

import { useMemo, useState, useTransition } from "react";
import { completeCapsuleTaskAction } from "../lib/capsule-actions";

export type TaskItem = {
  key: string;
  source: "capsule" | "pipeline";
  dueOn: string | null; // YYYY-MM-DD
  dueTime: string | null;
  who: string; // contact / company
  what: string; // task description
  extra: string; // category, opportunity, amount…
  href: string | null;
  // Capsule task id — enables the tick-off checkbox. Null for pipeline rows.
  capsuleId: number | null;
  phone: string | null;
};

type Props = {
  items: TaskItem[];
  todayKey: string; // YYYY-MM-DD in the agency timezone
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CELL_TASKS = 3;
// Overdue older than this many days is hidden behind a toggle — the chip and
// panel stay about tasks that are realistically still getting chased.
const OVERDUE_WINDOW_DAYS = 31;

function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The month laid out as whole Mon–Sun weeks (leading/trailing days included).
function monthWeeks(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0));
  const cur = new Date(Date.UTC(y, m - 1, 1));
  cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  while (cur <= lastDay) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function dayHeading(dayKey: string): string {
  return new Date(dayKey + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// What a task reads as inside a tight grid cell: Capsule tasks lead with the
// task text ("call for Har…"), pipeline follow-ups with the company.
function cellLabel(item: TaskItem): string {
  return item.source === "capsule" ? item.what || item.who : item.who;
}

export default function SalesTaskCalendar({ items, todayKey }: Props) {
  // Local copy so completing a task removes it optimistically.
  const [localItems, setLocalItems] = useState(items);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [month, setMonth] = useState(monthOf(todayKey));
  // A day key, or the two off-grid buckets.
  const [selected, setSelected] = useState<string>(todayKey);

  // Tick a Capsule task off: drop it from the calendar immediately, restore
  // it if Capsule rejects the write.
  function completeTask(item: TaskItem) {
    if (item.capsuleId == null) return;
    const taskId = item.capsuleId;
    setLocalItems((prev) => prev.filter((i) => i.key !== item.key));
    startTransition(async () => {
      try {
        const { error } = await completeCapsuleTaskAction(taskId);
        if (error) throw new Error(error);
        setCompleteError(null);
      } catch (e) {
        setLocalItems((prev) => [...prev, item]);
        setCompleteError(
          e instanceof Error ? e.message : "Couldn't complete the task."
        );
      }
    });
  }
  // The account carries a huge backlog of ancient open tasks; only overdue
  // from the last month counts by default, the rest sits behind a toggle.
  const [showOldOverdue, setShowOldOverdue] = useState(false);

  const overdueCutoff = useMemo(() => {
    const d = new Date(todayKey + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - OVERDUE_WINDOW_DAYS);
    return d.toISOString().slice(0, 10);
  }, [todayKey]);

  const { byDay, overdue, oldOverdue, undated } = useMemo(() => {
    const byDay = new Map<string, TaskItem[]>();
    const overdue: TaskItem[] = [];
    const oldOverdue: TaskItem[] = [];
    const undated: TaskItem[] = [];
    for (const item of localItems) {
      if (!item.dueOn) {
        undated.push(item);
        continue;
      }
      const list = byDay.get(item.dueOn) ?? [];
      list.push(item);
      byDay.set(item.dueOn, list);
      if (item.dueOn < todayKey) {
        (item.dueOn >= overdueCutoff ? overdue : oldOverdue).push(item);
      }
    }
    return { byDay, overdue, oldOverdue, undated };
  }, [localItems, todayKey, overdueCutoff]);

  const weeks = useMemo(() => monthWeeks(month), [month]);

  const panelItems =
    selected === "overdue"
      ? showOldOverdue
        ? [...oldOverdue, ...overdue]
        : overdue
      : selected === "undated"
        ? undated
        : (byDay.get(selected) ?? []);
  const panelTitle =
    selected === "overdue"
      ? `Overdue (${showOldOverdue ? overdue.length + oldOverdue.length : overdue.length})`
      : selected === "undated"
        ? `No due date (${undated.length})`
        : dayHeading(selected);

  function selectDay(dayKey: string) {
    setSelected(dayKey);
    if (monthOf(dayKey) !== month) setMonth(monthOf(dayKey));
  }

  const navBtn: React.CSSProperties = {
    border: "1px solid #d4d4d8",
    borderRadius: 8,
    background: "#fff",
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "#3f3f46",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Month nav + off-grid chips */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button type="button" style={navBtn} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          ‹
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, minWidth: 150, textAlign: "center" }}>
          {monthLabel(month)}
        </div>
        <button type="button" style={navBtn} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          ›
        </button>
        <button type="button" style={navBtn} onClick={() => selectDay(todayKey)}>
          Today
        </button>
        <div style={{ flex: 1 }} />
        {(overdue.length > 0 || oldOverdue.length > 0) && (
          <button
            type="button"
            onClick={() => setSelected("overdue")}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              color: selected === "overdue" ? "#fff" : "#991b1b",
              background: selected === "overdue" ? "#991b1b" : "#fef2f2",
            }}
          >
            {overdue.length > 0 ? `${overdue.length} overdue` : "overdue history"}
          </button>
        )}
        {undated.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected("undated")}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              color: selected === "undated" ? "#fff" : "#52525b",
              background: selected === "undated" ? "#52525b" : "#f4f4f5",
            }}
          >
            {undated.length} undated
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Month grid */}
        <div
          style={{
            flex: "1 1 620px",
            minWidth: 0,
            overflowX: "auto",
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ minWidth: 640 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                borderBottom: "1px solid #e4e4e7",
                background: "#fafafa",
              }}
            >
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#52525b",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div
                key={wi}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  borderBottom: wi < weeks.length - 1 ? "1px solid #f1f1f3" : undefined,
                }}
              >
                {week.map((dayKey) => {
                  const inMonth = monthOf(dayKey) === month;
                  const dayTasks = byDay.get(dayKey) ?? [];
                  const isToday = dayKey === todayKey;
                  const isSelected = dayKey === selected;
                  return (
                    <div
                      key={dayKey}
                      onClick={() => selectDay(dayKey)}
                      style={{
                        minHeight: 96,
                        padding: "6px 8px",
                        cursor: "pointer",
                        borderRight: "1px solid #f1f1f3",
                        background: isSelected
                          ? "#eef2ff"
                          : isToday
                            ? "#fffbeb"
                            : inMonth
                              ? "#fff"
                              : "#fafafa",
                        boxShadow: isSelected ? "inset 0 0 0 2px #6366f1" : undefined,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: isToday ? 800 : 600,
                          color: inMonth ? (isToday ? "#92400e" : "#3f3f46") : "#c4c4cc",
                          marginBottom: 4,
                        }}
                      >
                        {Number(dayKey.slice(8, 10))}
                      </div>
                      {dayTasks.slice(0, MAX_CELL_TASKS).map((t) => (
                        <div
                          key={t.key}
                          title={`${t.what} — ${t.who}`}
                          style={{
                            fontSize: 11,
                            lineHeight: 1.5,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color:
                              dayKey < todayKey
                                ? "#b91c1c"
                                : t.source === "capsule"
                                  ? "#3730a3"
                                  : "#52525b",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: 5,
                              height: 5,
                              borderRadius: 999,
                              marginRight: 5,
                              verticalAlign: "middle",
                              background:
                                t.source === "capsule" ? "#818cf8" : "#a1a1aa",
                            }}
                          />
                          {cellLabel(t)}
                        </div>
                      ))}
                      {dayTasks.length > MAX_CELL_TASKS && (
                        <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>
                          {dayTasks.length - MAX_CELL_TASKS} more
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Selected-day panel */}
        <div
          style={{
            flex: "0 1 300px",
            minWidth: 260,
            border: "1px solid #e4e4e7",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #e4e4e7",
              background: "#fafafa",
              fontSize: 15,
              fontWeight: 700,
              color: selected === "overdue" ? "#991b1b" : "#18181b",
            }}
          >
            {panelTitle}
          </div>
          {selected === "overdue" && oldOverdue.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOldOverdue((v) => !v)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                borderBottom: "1px solid #f4f4f5",
                background: "#fff",
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "#71717a",
                cursor: "pointer",
              }}
            >
              {showOldOverdue
                ? `Hide the ${oldOverdue.length} older than a month`
                : `${oldOverdue.length} older than a month hidden — show`}
            </button>
          )}
          {completeError && (
            <div
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid #fecaca",
                background: "#fef2f2",
                fontSize: 12,
                fontWeight: 600,
                color: "#991b1b",
              }}
            >
              {completeError}
            </div>
          )}
          {panelItems.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 13, color: "#a1a1aa" }}>
              {selected === "overdue" && oldOverdue.length > 0
                ? "Nothing overdue from the last month."
                : "No tasks."}
            </div>
          ) : (
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {panelItems.map((t) => (
                <div
                  key={t.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 16px",
                    borderBottom: "1px solid #f4f4f5",
                  }}
                >
                  {t.capsuleId != null && (
                    <button
                      type="button"
                      title="Mark done in Capsule"
                      aria-label="Mark done in Capsule"
                      onClick={() => completeTask(t)}
                      style={{
                        flexShrink: 0,
                        width: 18,
                        height: 18,
                        marginTop: 1,
                        borderRadius: 999,
                        border: "2px solid #a5b4fc",
                        background: "#fff",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#818cf8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
                    {t.what}
                    {t.dueTime && (
                      <span style={{ color: "#71717a", fontWeight: 500 }}> · {t.dueTime}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    <span style={{ color: "#71717a" }}>for </span>
                    {t.href ? (
                      <a
                        href={t.href}
                        target={t.source === "capsule" ? "_blank" : undefined}
                        rel={t.source === "capsule" ? "noopener" : undefined}
                        style={{ color: "#4338ca", fontWeight: 600, textDecoration: "none" }}
                      >
                        {t.who}
                      </a>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{t.who}</span>
                    )}
                    {t.phone && (
                      <>
                        <span style={{ color: "#a1a1aa" }}> · </span>
                        <a
                          href={`tel:${t.phone.replace(/[^+\d]/g, "")}`}
                          style={{
                            color: "#0369a1",
                            fontWeight: 600,
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.phone}
                        </a>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    {(selected === "overdue" || selected === "undated") && t.dueOn && (
                      <span style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
                        {dayHeading(t.dueOn)}
                      </span>
                    )}
                    {t.extra && (
                      <span style={{ fontSize: 11, color: "#a1a1aa" }}>{t.extra}</span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        padding: "1px 7px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        color: t.source === "capsule" ? "#3730a3" : "#52525b",
                        background: t.source === "capsule" ? "#eef2ff" : "#f4f4f5",
                      }}
                    >
                      {t.source === "capsule" ? "CAPSULE" : "PIPELINE"}
                    </span>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
