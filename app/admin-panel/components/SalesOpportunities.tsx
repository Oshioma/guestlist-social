"use client";

// ---------------------------------------------------------------------------
// SalesOpportunities — the per-company pipeline log.
//
// Mirrors the sheet the sales calls were tracked in: rows grouped by month,
// each with the day, company, quoted amount, where it landed (pending /
// booked / not booked), an optional follow-up date and notes. Everything is
// editable inline and saves on blur (or on change for pickers); month and
// year totals recompute from local state so they can't drift.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useTransition } from "react";
import {
  OPP_STATUS_LABELS,
  type OppStatus,
  type SalesOpportunity,
} from "../lib/sales-shared";
import {
  addSalesOpportunity,
  deleteSalesOpportunity,
  updateSalesOpportunity,
  type SalesOpportunityPatch,
} from "../lib/sales-actions";

type Props = {
  initialOpps: SalesOpportunity[];
  // First of the current month (agency timezone) — the default bucket for
  // newly added opportunities.
  currentMonthStart: string;
};

const STATUS_STYLES: Record<OppStatus, { color: string; bg: string }> = {
  pending: { color: "#52525b", bg: "#f4f4f5" },
  booked: { color: "#15803d", bg: "#f0fdf4" },
  not_booked: { color: "#b91c1c", bg: "#fef2f2" },
};

function money(n: number): string {
  return "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function monthLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function sumWhere(
  opps: SalesOpportunity[],
  status: OppStatus | null
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const o of opps) {
    if (status != null && o.status !== status) continue;
    count += 1;
    total += o.amount ?? 0;
  }
  return { total, count };
}

export default function SalesOpportunities({
  initialOpps,
  currentMonthStart,
}: Props) {
  const [opps, setOpps] = useState<SalesOpportunity[]>(initialOpps);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const savingRef = useRef(0);
  const [savingCount, setSavingCount] = useState(0);
  const [newMonth, setNewMonth] = useState(currentMonthStart.slice(0, 7));

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

  // Months newest first; rows keep their sheet order within a month.
  const months = useMemo(() => {
    const byMonth = new Map<string, SalesOpportunity[]>();
    for (const o of opps) {
      const list = byMonth.get(o.monthStart) ?? [];
      list.push(o);
      byMonth.set(o.monthStart, list);
    }
    for (const list of byMonth.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    return Array.from(byMonth.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [opps]);

  const booked = sumWhere(opps, "booked");
  const lost = sumWhere(opps, "not_booked");
  const pending = sumWhere(opps, "pending");
  const decided = booked.count + lost.count;

  // ── Mutations (optimistic) + persistence ──────────────────────────────────
  function patchRow(id: number, patch: SalesOpportunityPatch) {
    setOpps((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              ...(patch.company !== undefined ? { company: patch.company } : {}),
              ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
              ...(patch.status !== undefined ? { status: patch.status } : {}),
              ...(patch.oppDate !== undefined ? { oppDate: patch.oppDate } : {}),
              ...(patch.followUp !== undefined ? { followUp: patch.followUp } : {}),
              ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            }
          : o
      )
    );
    persist(() => updateSalesOpportunity(id, patch));
  }

  function addRow(monthStart: string) {
    persist(async () => {
      const row = await addSalesOpportunity(monthStart);
      setOpps((prev) => [...prev, row]);
      requestAnimationFrame(() => {
        document.getElementById(`opp-company-${row.id}`)?.focus();
      });
    });
  }

  function removeRow(id: number) {
    setOpps((prev) => prev.filter((o) => o.id !== id));
    persist(() => deleteSalesOpportunity(id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <SummaryCard
          label={`Booked (${booked.count})`}
          value={money(booked.total)}
          color="#15803d"
        />
        <SummaryCard
          label={`Not booked (${lost.count})`}
          value={money(lost.total)}
          color="#b91c1c"
        />
        <SummaryCard
          label={`Pending (${pending.count})`}
          value={money(pending.total)}
        />
        <SummaryCard
          label="Win rate (decided)"
          value={decided > 0 ? `${((booked.count / decided) * 100).toFixed(0)}%` : "—"}
        />
      </div>

      {/* Add + status */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#52525b", fontWeight: 600 }}>
            Month
          </span>
          <input
            type="month"
            value={newMonth}
            onChange={(e) => setNewMonth(e.target.value)}
            style={{
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
          onClick={() => newMonth && addRow(newMonth + "-01")}
          disabled={!newMonth}
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
          + Add opportunity
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

      {months.length === 0 && (
        <div
          style={{
            border: "1px dashed #d4d4d8",
            borderRadius: 12,
            padding: 20,
            background: "#fafafa",
            fontSize: 14,
            color: "#52525b",
          }}
        >
          No opportunities logged yet — pick a month above and add the first one.
        </div>
      )}

      {months.map(([monthStart, rows]) => (
        <MonthBlock
          key={monthStart}
          monthStart={monthStart}
          rows={rows}
          onPatch={patchRow}
          onAdd={() => addRow(monthStart)}
          onRemove={removeRow}
        />
      ))}
    </div>
  );
}

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

function MonthBlock({
  monthStart,
  rows,
  onPatch,
  onAdd,
  onRemove,
}: {
  monthStart: string;
  rows: SalesOpportunity[];
  onPatch: (id: number, patch: SalesOpportunityPatch) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  const booked = sumWhere(rows, "booked");
  const lost = sumWhere(rows, "not_booked");
  const pending = sumWhere(rows, "pending");

  return (
    <div
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
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 16px",
          background: "#fafafa",
          borderBottom: "1px solid #e4e4e7",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {monthLabel(monthStart)}
          <span
            style={{ marginLeft: 10, fontSize: 12, fontWeight: 500, color: "#71717a" }}
          >
            {rows.length} pitched · booked {money(booked.total)} · not booked{" "}
            {money(lost.total)} · pending {money(pending.total)}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          style={{
            border: "1px solid #d4d4d8",
            borderRadius: 8,
            padding: "5px 10px",
            background: "#fff",
            fontSize: 12,
            fontWeight: 600,
            color: "#3f3f46",
            cursor: "pointer",
          }}
        >
          + Add
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13,
            width: "100%",
            minWidth: 760,
          }}
        >
          <thead>
            <tr>
              <Th width={110}>Date</Th>
              <Th>Company</Th>
              <Th width={90} align="right">
                Amount
              </Th>
              <Th width={120}>Status</Th>
              <Th width={110}>Follow-up</Th>
              <Th>Notes</Th>
              <Th width={30}>{""}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <OppRow key={o.id} opp={o} onPatch={onPatch} onRemove={onRemove} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  width,
  align = "left",
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "7px 10px",
        fontSize: 11,
        fontWeight: 700,
        color: "#71717a",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        textAlign: align,
        borderBottom: "1px solid #f1f1f3",
        width,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #f1f1f3",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid transparent",
  background: "transparent",
  font: "inherit",
  padding: "5px 6px",
  borderRadius: 6,
  width: "100%",
  boxSizing: "border-box",
};

function focusStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.border = "1px solid #0ea5e9";
  e.target.style.background = "#fff";
}

function blurStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.border = "1px solid transparent";
  e.target.style.background = "transparent";
}

function OppRow({
  opp,
  onPatch,
  onRemove,
}: {
  opp: SalesOpportunity;
  onPatch: (id: number, patch: SalesOpportunityPatch) => void;
  onRemove: (id: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const statusStyle = STATUS_STYLES[opp.status];

  function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td style={cellStyle}>
        <input
          type="date"
          defaultValue={opp.oppDate ?? ""}
          onBlur={(e) => {
            blurStyle(e);
            const v = e.target.value || null;
            if (v !== opp.oppDate) onPatch(opp.id, { oppDate: v });
          }}
          onFocus={focusStyle}
          style={{ ...inputStyle, color: opp.oppDate ? "#18181b" : "#a1a1aa" }}
        />
      </td>
      <td style={cellStyle}>
        <input
          id={`opp-company-${opp.id}`}
          type="text"
          defaultValue={opp.company}
          placeholder="Company"
          onBlur={(e) => {
            blurStyle(e);
            const v = e.target.value.trim();
            if (v !== opp.company) onPatch(opp.id, { company: v });
          }}
          onFocus={focusStyle}
          onKeyDown={blurOnEnter}
          style={{ ...inputStyle, fontWeight: 500, minWidth: 160 }}
        />
      </td>
      <td style={cellStyle}>
        <input
          type="text"
          inputMode="decimal"
          defaultValue={opp.amount == null ? "" : String(opp.amount)}
          placeholder="—"
          onBlur={(e) => {
            blurStyle(e);
            const t = e.target.value.trim();
            const v = t === "" ? null : Number(t);
            if (v != null && !Number.isFinite(v)) {
              e.target.value = opp.amount == null ? "" : String(opp.amount);
              return;
            }
            if (v !== opp.amount) onPatch(opp.id, { amount: v });
          }}
          onFocus={focusStyle}
          onKeyDown={blurOnEnter}
          style={{ ...inputStyle, textAlign: "right" }}
        />
      </td>
      <td style={cellStyle}>
        <select
          value={opp.status}
          onChange={(e) =>
            onPatch(opp.id, { status: e.target.value as OppStatus })
          }
          style={{
            border: "1px solid transparent",
            borderRadius: 999,
            padding: "5px 8px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            color: statusStyle.color,
            background: statusStyle.bg,
            width: "100%",
          }}
        >
          {(Object.keys(OPP_STATUS_LABELS) as OppStatus[]).map((s) => (
            <option key={s} value={s}>
              {OPP_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={cellStyle}>
        <input
          type="date"
          defaultValue={opp.followUp ?? ""}
          onBlur={(e) => {
            blurStyle(e);
            const v = e.target.value || null;
            if (v !== opp.followUp) onPatch(opp.id, { followUp: v });
          }}
          onFocus={focusStyle}
          style={{ ...inputStyle, color: opp.followUp ? "#18181b" : "#a1a1aa" }}
        />
      </td>
      <td style={cellStyle}>
        <input
          type="text"
          defaultValue={opp.notes}
          placeholder="Notes"
          onBlur={(e) => {
            blurStyle(e);
            const v = e.target.value;
            if (v !== opp.notes) onPatch(opp.id, { notes: v });
          }}
          onFocus={focusStyle}
          onKeyDown={blurOnEnter}
          style={{ ...inputStyle, minWidth: 140, color: "#52525b" }}
        />
      </td>
      <td style={{ ...cellStyle, textAlign: "center" }}>
        <button
          type="button"
          aria-label="Delete opportunity"
          onClick={() => onRemove(opp.id)}
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
      </td>
    </tr>
  );
}
