"use client";

// ---------------------------------------------------------------------------
// SalesActivityGrid — the weekly calls / opps / deals log.
//
// Mirrors the operator's spreadsheet: one row per (week, rep), Mon–Fri columns
// each split into Calls / Opps / Deals, weekly totals on the right plus a
// Leads count. Every count is a live <input>: click, type, Tab/Enter on.
// Totals recompute from local state on each keystroke and each committed cell
// is persisted on blur via a small server action — totals are never stored,
// so they can't drift the way hand-kept spreadsheet totals did.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useTransition } from "react";
import {
  METRIC_LABELS,
  SALES_METRICS,
  WEEK_DAYS,
  type SalesMetric,
  type SalesWeek,
} from "../lib/sales-shared";
import {
  addSalesWeek,
  deleteSalesWeek,
  renameSalesRep,
  setSalesLeads,
  updateSalesDay,
} from "../lib/sales-actions";

type Props = {
  initialWeeks: SalesWeek[];
  // Monday of the current week (agency timezone) — highlighted, and the
  // default for "Add week" when it doesn't exist yet.
  currentWeekStart: string;
};

const CELL_W = 46; // width of each day-count column
const HIGHLIGHT_BG = "#fef3c7"; // amber-100 — current week

const METRIC_COLORS: Record<SalesMetric, string> = {
  calls: "#18181b",
  opps: "#0369a1",
  deals: "#15803d",
};

function cellText(n: number): string {
  return n === 0 ? "" : String(n);
}

function sum(values: number[]): number {
  return values.reduce((t, n) => t + (n || 0), 0);
}

// "W/S 20 Apr" — how the sheet labels a week.
function weekLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Sort newest week first; reps alphabetical within a week.
function sortWeeks(weeks: SalesWeek[]): SalesWeek[] {
  return [...weeks].sort(
    (a, b) =>
      b.weekStart.localeCompare(a.weekStart) || a.rep.localeCompare(b.rep)
  );
}

export default function SalesActivityGrid({
  initialWeeks,
  currentWeekStart,
}: Props) {
  const [weeks, setWeeks] = useState<SalesWeek[]>(() => sortWeeks(initialWeeks));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const savingRef = useRef(0);
  const [savingCount, setSavingCount] = useState(0);

  // "Add week" form state.
  const latestWeek = weeks[0]?.weekStart ?? null;
  const defaultNewWeek = useMemo(() => {
    if (!latestWeek || latestWeek < currentWeekStart) return currentWeekStart;
    const d = new Date(latestWeek + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }, [latestWeek, currentWeekStart]);
  const [newWeekDate, setNewWeekDate] = useState(defaultNewWeek);
  const [newWeekRep, setNewWeekRep] = useState("Nelly");

  // Run a server action in the background, surfacing failures without
  // blocking the optimistic UI.
  function persist(fn: () => Promise<unknown>) {
    savingRef.current += 1;
    setSavingCount(savingRef.current);
    startTransition(async () => {
      try {
        await fn();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        savingRef.current -= 1;
        setSavingCount(savingRef.current);
      }
    });
  }

  // ── Derived totals (recomputed every render from local state) ─────────────
  const totals = useMemo(() => {
    const calls = sum(weeks.map((w) => sum(w.calls)));
    const opps = sum(weeks.map((w) => sum(w.opps)));
    const deals = sum(weeks.map((w) => sum(w.deals)));
    const leads = sum(weeks.map((w) => w.leads));
    return { calls, opps, deals, leads };
  }, [weeks]);

  // ── Local mutations (optimistic) + persistence ────────────────────────────
  function setDay(id: number, metric: SalesMetric, day: number, value: number) {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const days = w[metric].slice();
        days[day] = value;
        return { ...w, [metric]: days };
      })
    );
  }

  function commitDay(id: number, metric: SalesMetric, day: number, value: number) {
    setDay(id, metric, day, value);
    persist(() => updateSalesDay(id, metric, day, value));
  }

  function commitLeads(id: number, value: number) {
    setWeeks((prev) => prev.map((w) => (w.id === id ? { ...w, leads: value } : w)));
    persist(() => setSalesLeads(id, value));
  }

  function commitRep(id: number, raw: string) {
    const rep = raw.trim();
    const current = weeks.find((w) => w.id === id)?.rep;
    if (!rep || rep === current) return;
    setWeeks((prev) => prev.map((w) => (w.id === id ? { ...w, rep } : w)));
    persist(() => renameSalesRep(id, rep));
  }

  function removeWeek(id: number) {
    setWeeks((prev) => prev.filter((w) => w.id !== id));
    persist(() => deleteSalesWeek(id));
  }

  function addWeek() {
    const date = newWeekDate;
    const rep = newWeekRep.trim() || "Nelly";
    persist(async () => {
      const { week, error: addError } = await addSalesWeek(date, rep);
      if (addError) throw new Error(addError);
      if (week) {
        setWeeks((prev) => sortWeeks([...prev, week]));
        // Line the form up for the following week.
        const d = new Date(week.weekStart + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 7);
        setNewWeekDate(d.toISOString().slice(0, 10));
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <SummaryCard label="Calls logged" value={String(totals.calls)} />
        <SummaryCard
          label="Opportunities"
          value={String(totals.opps)}
          color={METRIC_COLORS.opps}
        />
        <SummaryCard
          label="Deals"
          value={String(totals.deals)}
          color={METRIC_COLORS.deals}
        />
        <SummaryCard
          label="Calls → opp rate"
          value={
            totals.calls > 0
              ? `${((totals.opps / totals.calls) * 100).toFixed(1)}%`
              : "—"
          }
        />
      </div>

      {/* Add week + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#52525b", fontWeight: 600 }}>
            Week
          </span>
          <input
            type="date"
            value={newWeekDate}
            onChange={(e) => setNewWeekDate(e.target.value)}
            style={{
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              fontSize: 13,
              background: "#fff",
            }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#52525b", fontWeight: 600 }}>
            Person
          </span>
          <input
            type="text"
            value={newWeekRep}
            onChange={(e) => setNewWeekRep(e.target.value)}
            style={{
              width: 100,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              fontSize: 13,
              background: "#fff",
            }}
          />
        </label>
        <button
          type="button"
          onClick={addWeek}
          disabled={!newWeekDate}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "9px 14px",
            background: "#18181b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Add week
        </button>
        <span
          style={{ fontSize: 12, color: savingCount > 0 ? "#0369a1" : "#a1a1aa" }}
        >
          {savingCount > 0 ? "Saving…" : "All changes saved"}
        </span>
        {error && (
          <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>
            {error}
          </span>
        )}
      </div>

      {/* Grid */}
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e4e4e7",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13,
            minWidth: 190 + CELL_W * 18 + 60,
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={2}
                style={{
                  ...headStyle,
                  textAlign: "left",
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background: "#fafafa",
                  minWidth: 170,
                }}
              >
                Week / person
              </th>
              {WEEK_DAYS.map((d) => (
                <th
                  key={d}
                  colSpan={3}
                  style={{ ...headStyle, borderLeft: "1px solid #e4e4e7" }}
                >
                  {d}
                </th>
              ))}
              <th colSpan={3} style={{ ...headStyle, borderLeft: "1px solid #e4e4e7" }}>
                Total
              </th>
              <th rowSpan={2} style={{ ...headStyle, borderLeft: "1px solid #e4e4e7" }}>
                Leads
              </th>
              <th rowSpan={2} style={{ ...headStyle, width: 30 }} />
            </tr>
            <tr>
              {[...WEEK_DAYS, "total"].map((d) =>
                SALES_METRICS.map((m, i) => (
                  <th
                    key={`${d}-${m}`}
                    title={METRIC_LABELS[m]}
                    style={{
                      ...subHeadStyle,
                      color: METRIC_COLORS[m],
                      borderLeft: i === 0 ? "1px solid #e4e4e7" : undefined,
                    }}
                  >
                    {METRIC_LABELS[m][0]}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 && (
              <tr>
                <td
                  colSpan={21}
                  style={{ padding: 20, color: "#71717a", fontSize: 14 }}
                >
                  No weeks logged yet — add the first one above.
                </td>
              </tr>
            )}
            {weeks.map((week) => (
              <WeekRow
                key={week.id}
                week={week}
                isCurrent={week.weekStart === currentWeekStart}
                onCommitDay={commitDay}
                onDayChange={setDay}
                onCommitLeads={commitLeads}
                onCommitRep={commitRep}
                onRemove={removeWeek}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        C = calls, O = opportunities, D = deals. Weekly totals and the cards
        above recalculate as you type; each cell saves when you leave it.
      </p>
    </div>
  );
}

const headStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
  textAlign: "center",
  borderBottom: "1px solid #e4e4e7",
  background: "#fafafa",
  whiteSpace: "nowrap",
};

const subHeadStyle: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: 11,
  fontWeight: 600,
  textAlign: "center",
  borderBottom: "1px solid #e4e4e7",
  background: "#fafafa",
};

function SummaryCard({
  label,
  value,
  color = "#18181b",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: "14px 16px",
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, color: "#71717a", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color }}>
        {value}
      </div>
    </div>
  );
}

function WeekRow({
  week,
  isCurrent,
  onCommitDay,
  onDayChange,
  onCommitLeads,
  onCommitRep,
  onRemove,
}: {
  week: SalesWeek;
  isCurrent: boolean;
  onCommitDay: (id: number, metric: SalesMetric, day: number, value: number) => void;
  onDayChange: (id: number, metric: SalesMetric, day: number, value: number) => void;
  onCommitLeads: (id: number, value: number) => void;
  onCommitRep: (id: number, raw: string) => void;
  onRemove: (id: number) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td
        style={{
          position: "sticky",
          left: 0,
          zIndex: 1,
          background: isCurrent ? HIGHLIGHT_BG : "#fff",
          borderBottom: "1px solid #f1f1f3",
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div>
            <div style={{ fontWeight: 600 }}>
              W/S {weekLabel(week.weekStart)}
              {isCurrent && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#92400e",
                  }}
                >
                  THIS WEEK
                </span>
              )}
            </div>
            <input
              defaultValue={week.rep}
              onBlur={(e) => onCommitRep(week.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              style={{
                border: "1px solid transparent",
                background: "transparent",
                font: "inherit",
                fontSize: 12,
                color: "#71717a",
                padding: "1px 4px",
                borderRadius: 6,
                width: 110,
              }}
              onFocus={(e) => {
                e.target.style.border = "1px solid #d4d4d8";
                e.target.style.background = "#fff";
              }}
              onBlurCapture={(e) => {
                e.target.style.border = "1px solid transparent";
                e.target.style.background = "transparent";
              }}
            />
          </div>
          <button
            type="button"
            aria-label="Delete week"
            onClick={() => onRemove(week.id)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#c4c4cc",
              fontSize: 14,
              lineHeight: 1,
              padding: 2,
              visibility: hover ? "visible" : "hidden",
            }}
          >
            ×
          </button>
        </div>
      </td>

      {WEEK_DAYS.map((_, day) =>
        SALES_METRICS.map((metric, i) => (
          <CountCell
            key={`${day}-${metric}`}
            value={week[metric][day]}
            color={METRIC_COLORS[metric]}
            leftBorder={i === 0}
            highlight={isCurrent}
            onLive={(v) => onDayChange(week.id, metric, day, v)}
            onCommit={(v) => onCommitDay(week.id, metric, day, v)}
          />
        ))
      )}

      {SALES_METRICS.map((metric, i) => (
        <td
          key={`total-${metric}`}
          style={{
            textAlign: "center",
            padding: "6px 6px",
            borderBottom: "1px solid #f1f1f3",
            borderLeft: i === 0 ? "1px solid #e4e4e7" : undefined,
            fontWeight: 700,
            color: METRIC_COLORS[metric],
            background: "#fafafa",
          }}
        >
          {sum(week[metric])}
        </td>
      ))}

      <CountCell
        value={week.leads}
        color="#18181b"
        leftBorder
        highlight={isCurrent}
        onLive={() => {}}
        onCommit={(v) => onCommitLeads(week.id, v)}
      />

      <td style={{ borderBottom: "1px solid #f1f1f3" }} />
    </tr>
  );
}

// One editable count. Uncontrolled input committing on blur: live keystrokes
// feed the totals via onLive, Escape reverts, Enter commits and moves on.
function CountCell({
  value,
  color,
  leftBorder,
  highlight,
  onLive,
  onCommit,
}: {
  value: number;
  color: string;
  leftBorder?: boolean;
  highlight?: boolean;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const origRef = useRef(value);
  const cancelRef = useRef(false);

  function parse(text: string): number | null {
    const t = text.trim();
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  return (
    <td
      style={{
        padding: 0,
        borderBottom: "1px solid #f1f1f3",
        borderLeft: leftBorder ? "1px solid #e4e4e7" : undefined,
        background: highlight ? HIGHLIGHT_BG : undefined,
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        defaultValue={cellText(value)}
        onFocus={(e) => {
          origRef.current = value;
          cancelRef.current = false;
          e.target.style.border = "1px solid #0ea5e9";
          e.target.style.background = "#fff";
          e.target.style.borderRadius = "6px";
        }}
        onChange={(e) => {
          const n = parse(e.target.value);
          if (n != null) onLive(n);
        }}
        onBlur={(e) => {
          e.target.style.border = "1px solid transparent";
          e.target.style.background = "transparent";
          const orig = origRef.current;
          if (cancelRef.current) {
            e.target.value = cellText(orig);
            onLive(orig);
            return;
          }
          const n = parse(e.target.value);
          if (n == null) {
            e.target.value = cellText(orig);
            onLive(orig);
          } else if (n !== orig) {
            e.target.value = cellText(n);
            onCommit(n);
          } else {
            e.target.value = cellText(orig);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancelRef.current = true;
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={{
          width: CELL_W,
          boxSizing: "border-box",
          border: "1px solid transparent",
          background: "transparent",
          font: "inherit",
          textAlign: "center",
          padding: "6px 4px",
          color,
        }}
      />
    </td>
  );
}
