"use client";

// ---------------------------------------------------------------------------
// SalesMonthlySummary — the at-a-glance month-by-month view on /app/sales.
//
// Rolls the weekly activity grid (calls / opps / deals / leads) and the
// opportunity log (pitched / booked / £) up into one row per calendar month,
// with the change against the previous month. Nothing is stored — it's all
// derived from the same rows the grids edit, so it can't drift. Day counts
// are bucketed by their actual date, so a week that straddles a month end
// splits correctly; weekly leads go to the month the week starts in.
//
// "Split by rep" adds one row per rep under each team total. Only the
// activity columns split — opportunities aren't logged against a rep, so the
// pipeline columns stay team-level.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import type { SalesOpportunity, SalesWeek } from "../lib/sales-shared";

type Props = {
  weeks: SalesWeek[];
  opportunities: SalesOpportunity[];
  // First of the current month (agency timezone), e.g. "2026-10-01".
  currentMonthStart: string;
};

type Activity = {
  calls: number;
  opps: number;
  deals: number;
  leads: number;
};

type MonthRow = Activity & {
  month: string; // "2026-10"
  pitched: number;
  booked: number;
  bookedValue: number;
  pendingValue: number;
  // Per-rep activity for this month, keyed by rep name.
  reps: Map<string, Activity>;
};

const COLLAPSED_MONTHS = 6;
const SPLIT_KEY = "sales-monthly-split-by-rep";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function emptyActivity(): Activity {
  return { calls: 0, opps: 0, deals: 0, leads: 0 };
}

function emptyRow(month: string): MonthRow {
  return {
    month,
    ...emptyActivity(),
    pitched: 0,
    booked: 0,
    bookedValue: 0,
    pendingValue: 0,
    reps: new Map(),
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prevMonth(month: string): string {
  const d = new Date(month + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function pct(num: number, den: number): string {
  return den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
}

export default function SalesMonthlySummary({
  weeks,
  opportunities,
  currentMonthStart,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [splitByRep, setSplitByRep] = useState(true);
  const currentMonth = currentMonthStart.slice(0, 7);

  // Remember the split toggle per viewer. Purely a convenience — the page
  // renders fine (split on) if storage is unavailable.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SPLIT_KEY);
      if (saved !== null) setSplitByRep(saved === "1");
    } catch {
      // storage blocked — keep the default
    }
  }, []);

  function toggleSplit() {
    setSplitByRep((v) => {
      try {
        window.localStorage.setItem(SPLIT_KEY, v ? "0" : "1");
      } catch {
        // storage blocked — the toggle still works for this visit
      }
      return !v;
    });
  }

  // Every month from the earliest logged one up to now, newest first — gaps
  // included, so a quiet month shows as zeros rather than vanishing.
  const { rows, repCount } = useMemo(() => {
    const byMonth = new Map<string, MonthRow>();
    const allReps = new Set<string>();
    const row = (month: string) => {
      let r = byMonth.get(month);
      if (!r) {
        r = emptyRow(month);
        byMonth.set(month, r);
      }
      return r;
    };
    const repRow = (month: string, rep: string) => {
      const r = row(month);
      let a = r.reps.get(rep);
      if (!a) {
        a = emptyActivity();
        r.reps.set(rep, a);
      }
      return a;
    };

    for (const w of weeks) {
      allReps.add(w.rep);
      for (let i = 0; i < 5; i++) {
        const month = addDays(w.weekStart, i).slice(0, 7);
        const calls = w.calls[i] || 0;
        const opps = w.opps[i] || 0;
        const deals = w.deals[i] || 0;
        const r = row(month);
        r.calls += calls;
        r.opps += opps;
        r.deals += deals;
        // Only open a rep row for a month the rep actually logged in, so a
        // week's empty spill-over days don't add a row of zeros.
        if (calls || opps || deals || i === 0) {
          const a = repRow(month, w.rep);
          a.calls += calls;
          a.opps += opps;
          a.deals += deals;
        }
      }
      const startMonth = w.weekStart.slice(0, 7);
      row(startMonth).leads += w.leads || 0;
      repRow(startMonth, w.rep).leads += w.leads || 0;
    }

    for (const o of opportunities) {
      // Skip blank rows someone added but never filled in.
      if (!o.company.trim() && o.amount == null) continue;
      const r = row(o.monthStart.slice(0, 7));
      r.pitched += 1;
      if (o.status === "booked") {
        r.booked += 1;
        r.bookedValue += o.amount ?? 0;
      } else if (o.status === "pending") {
        r.pendingValue += o.amount ?? 0;
      }
    }

    const keys = [...byMonth.keys()].filter((m) => m <= currentMonth).sort();
    const out: MonthRow[] = [];
    if (keys.length > 0) {
      for (let m = currentMonth; m >= keys[0]; m = prevMonth(m)) {
        out.push(byMonth.get(m) ?? emptyRow(m));
      }
    }
    return { rows: out, repCount: allReps.size };
  }, [weeks, opportunities, currentMonth]);

  if (rows.length === 0) return null;

  const visible = showAll ? rows : rows.slice(0, COLLAPSED_MONTHS);
  const maxCalls = Math.max(1, ...visible.map((r) => r.calls));
  // Splitting a single rep just repeats the total, so only offer it for 2+.
  const showRepRows = splitByRep && repCount > 1;

  return (
    <section
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px 10px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
            Monthly breakdown
          </h2>
          <p style={{ fontSize: 12, color: "#71717a", margin: "4px 0 0" }}>
            Activity from the weekly grid, pipeline from the opportunity log.
            Arrows compare with the month before.
            {showRepRows && " Pipeline isn't logged per rep, so it's team-only."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {repCount > 1 && (
            <button
              type="button"
              onClick={toggleSplit}
              aria-pressed={splitByRep}
              style={{
                ...buttonStyle,
                background: splitByRep ? "#18181b" : "#fff",
                color: splitByRep ? "#fff" : "#52525b",
                borderColor: splitByRep ? "#18181b" : "#e4e4e7",
              }}
            >
              Split by rep
            </button>
          )}
          {rows.length > COLLAPSED_MONTHS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              style={buttonStyle}
            >
              {showAll ? "Show recent" : `Show all ${rows.length} months`}
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Month</th>
              <th style={thStyle}>Calls</th>
              <th style={thStyle}>Opps</th>
              <th style={thStyle}>Deals</th>
              <th style={thStyle}>Leads</th>
              <th style={thStyle} title="Opportunities per call">
                Call → Opp
              </th>
              <th style={thStyle} title="Deals per opportunity">
                Opp → Deal
              </th>
              <th style={thStyle}>Pitched</th>
              <th style={thStyle}>Booked</th>
              <th style={thStyle}>Booked £</th>
              <th style={thStyle}>Pending £</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const prev = rows[i + 1] ?? null;
              const isCurrent = r.month === currentMonth;
              const bg = isCurrent ? "#fef3c7" : undefined;
              const reps = showRepRows
                ? [...r.reps.entries()].sort(([a], [b]) => a.localeCompare(b))
                : [];
              return (
                <MonthGroup
                  key={r.month}
                  row={r}
                  prev={prev}
                  isCurrent={isCurrent}
                  background={bg}
                  maxCalls={maxCalls}
                  reps={reps}
                  showTeamLabel={showRepRows}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// One month: the team-total row, then (when split) a row per rep.
function MonthGroup({
  row: r,
  prev,
  isCurrent,
  background,
  maxCalls,
  reps,
  showTeamLabel,
}: {
  row: MonthRow;
  prev: MonthRow | null;
  isCurrent: boolean;
  background: string | undefined;
  maxCalls: number;
  reps: [string, Activity][];
  showTeamLabel: boolean;
}) {
  return (
    <>
      <tr style={{ background }}>
        <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}>
          {monthLabel(r.month)}
          {isCurrent && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                color: "#92400e",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              so far
            </span>
          )}
          {showTeamLabel && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 500,
                color: "#a1a1aa",
              }}
            >
              Team
            </span>
          )}
        </td>
        <td style={tdStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 48,
                height: 6,
                borderRadius: 3,
                background: "#f4f4f5",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${(r.calls / maxCalls) * 100}%`,
                  background: "#18181b",
                }}
              />
            </span>
            <Num value={r.calls} prev={prev?.calls} />
          </div>
        </td>
        <td style={{ ...tdStyle, color: "#0369a1" }}>
          <Num value={r.opps} prev={prev?.opps} />
        </td>
        <td style={{ ...tdStyle, color: "#15803d" }}>
          <Num value={r.deals} prev={prev?.deals} />
        </td>
        <td style={tdStyle}>
          <Num value={r.leads} prev={prev?.leads} />
        </td>
        <td style={tdMuted}>{pct(r.opps, r.calls)}</td>
        <td style={tdMuted}>{pct(r.deals, r.opps)}</td>
        <td style={tdStyle}>
          <Num value={r.pitched} prev={prev?.pitched} />
        </td>
        <td style={tdStyle}>
          <Num value={r.booked} prev={prev?.booked} />
        </td>
        <td style={{ ...tdStyle, fontWeight: 600 }}>
          <Num
            value={r.bookedValue}
            prev={prev?.bookedValue}
            format={(n) => gbp.format(n)}
          />
        </td>
        <td style={tdMuted}>
          {r.pendingValue > 0 ? gbp.format(r.pendingValue) : "—"}
        </td>
      </tr>

      {reps.map(([rep, a]) => {
        // Compare with this rep's own previous month (zero if they didn't log).
        const p = prev ? (prev.reps.get(rep) ?? emptyActivity()) : undefined;
        return (
          <tr key={rep} style={{ background, fontSize: 12 }}>
            <td
              style={{
                ...tdRep,
                textAlign: "left",
                paddingLeft: 28,
                color: "#52525b",
              }}
            >
              {rep}
            </td>
            <td style={tdRep}>
              <Num value={a.calls} prev={p?.calls} />
            </td>
            <td style={{ ...tdRep, color: "#0369a1" }}>
              <Num value={a.opps} prev={p?.opps} />
            </td>
            <td style={{ ...tdRep, color: "#15803d" }}>
              <Num value={a.deals} prev={p?.deals} />
            </td>
            <td style={tdRep}>
              <Num value={a.leads} prev={p?.leads} />
            </td>
            <td style={{ ...tdRep, color: "#71717a" }}>
              {pct(a.opps, a.calls)}
            </td>
            <td style={{ ...tdRep, color: "#71717a" }}>
              {pct(a.deals, a.opps)}
            </td>
            <td style={tdRep} colSpan={4} />
          </tr>
        );
      })}
    </>
  );
}

// A number plus a small ▲/▼ against the previous month. No arrow when there
// is no previous month or nothing changed.
function Num({
  value,
  prev,
  format = (n) => String(n),
}: {
  value: number;
  prev: number | undefined;
  format?: (n: number) => string;
}) {
  const diff = prev === undefined ? 0 : value - prev;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {value === 0 ? <span style={{ color: "#d4d4d8" }}>0</span> : format(value)}
      {diff !== 0 && (
        <span
          title={`${diff > 0 ? "+" : "−"}${format(Math.abs(diff))} vs previous month`}
          style={{
            marginLeft: 4,
            fontSize: 10,
            color: diff > 0 ? "#15803d" : "#b91c1c",
          }}
        >
          {diff > 0 ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  background: "#fff",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "#52525b",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "#71717a",
  textAlign: "right",
  background: "#fafafa",
  borderTop: "1px solid #f1f1f3",
  borderBottom: "1px solid #e4e4e7",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "right",
  borderBottom: "1px solid #f1f1f3",
  whiteSpace: "nowrap",
};

const tdMuted: React.CSSProperties = { ...tdStyle, color: "#71717a" };

const tdRep: React.CSSProperties = {
  ...tdStyle,
  padding: "5px 12px",
  borderBottom: "1px dashed #f1f1f3",
};
