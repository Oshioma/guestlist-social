"use client";

// ---------------------------------------------------------------------------
// CashflowGrid — the editable monthly forecast.
//
// Every amount is a live <input>, so the whole thing feels like a spreadsheet:
// click a cell, type, Tab/Enter to move on. Nothing here is "saved" in the
// derived sense — section subtotals, Total Costs, Net and the running Balance
// all recompute from local state on each keystroke, and each committed cell is
// persisted on blur via a small server action. That's the whole point: the
// totals can never fall out of step with the line items the way a hand-kept
// spreadsheet does.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useTransition } from "react";
import {
  MONTHS,
  SECTION_ORDER,
  type CashflowKind,
  type CashflowLine,
} from "../lib/cashflow-shared";
import {
  addCashflowLine,
  deleteCashflowLine,
  fillRight,
  renameCashflowLine,
  setOpeningBalance,
  updateCashflowCell,
} from "../lib/cashflow-actions";

type Props = {
  year: number;
  initialLines: CashflowLine[];
  initialOpeningBalance: number;
};

// ── Formatting ──────────────────────────────────────────────────────────────
function money(n: number): string {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (neg ? "-£" : "£") + s;
}

// What a value looks like inside an editable cell: blank for 0 (matches how
// the sheet was kept), otherwise a plain, ungrouped number so it stays easy
// to edit.
function cellText(n: number): string {
  return n === 0 ? "" : String(n);
}

function sumMonths(lines: CashflowLine[], m: number): number {
  return lines.reduce((t, l) => t + (l.amounts[m] || 0), 0);
}

function annual(amounts: number[]): number {
  return amounts.reduce((t, n) => t + (n || 0), 0);
}

// Stable order: known sections first (SECTION_ORDER), any stragglers after.
function orderedSections(lines: CashflowLine[]): string[] {
  const seen = Array.from(new Set(lines.map((l) => l.section)));
  const known = SECTION_ORDER.filter((s) => seen.includes(s));
  const extra = seen.filter((s) => !SECTION_ORDER.includes(s));
  return [...known, ...extra];
}

const COL_W = 78; // width of each month column
const NUM_COLS = 12;

export default function CashflowGrid({
  year,
  initialLines,
  initialOpeningBalance,
}: Props) {
  const [lines, setLines] = useState<CashflowLine[]>(initialLines);
  const [openingBalance, setOpening] = useState<number>(initialOpeningBalance);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const savingRef = useRef(0);
  const [savingCount, setSavingCount] = useState(0);

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

  // ── Derived numbers (recomputed every render from local state) ─────────────
  const {
    sections,
    costLines,
    revenueLines,
    costsByMonth,
    revenueByMonth,
    netByMonth,
    runningBalance,
    costsYear,
    revenueYear,
    netYear,
    yearEndBalance,
    avgNet,
    runwayMonths,
  } = useMemo(() => {
    const sections = orderedSections(lines);
    const costLines = lines.filter((l) => l.kind === "cost");
    const revenueLines = lines.filter((l) => l.kind === "revenue");

    const costsByMonth = MONTHS.map((_, m) => sumMonths(costLines, m));
    const revenueByMonth = MONTHS.map((_, m) => sumMonths(revenueLines, m));
    const netByMonth = MONTHS.map((_, m) => revenueByMonth[m] - costsByMonth[m]);

    const runningBalance: number[] = [];
    let bal = openingBalance;
    for (let m = 0; m < NUM_COLS; m++) {
      bal += netByMonth[m];
      runningBalance.push(bal);
    }

    const costsYear = costsByMonth.reduce((a, b) => a + b, 0);
    const revenueYear = revenueByMonth.reduce((a, b) => a + b, 0);
    const netYear = revenueYear - costsYear;
    const yearEndBalance = openingBalance + netYear;
    const avgNet = netYear / 12;
    const runwayMonths =
      avgNet < 0 && openingBalance > 0 ? openingBalance / -avgNet : null;

    return {
      sections,
      costLines,
      revenueLines,
      costsByMonth,
      revenueByMonth,
      netByMonth,
      runningBalance,
      costsYear,
      revenueYear,
      netYear,
      yearEndBalance,
      avgNet,
      runwayMonths,
    };
  }, [lines, openingBalance]);

  // Visible (non-collapsed) line ids, in render order — used for Enter-to-move.
  const visibleLineIds = useMemo(() => {
    const ids: number[] = [];
    for (const section of sections) {
      if (collapsed.has(section)) continue;
      for (const l of lines) if (l.section === section) ids.push(l.id);
    }
    return ids;
  }, [lines, sections, collapsed]);

  // ── Local mutations (optimistic) + persistence ─────────────────────────────
  function setCell(id: number, m: number, value: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const amounts = l.amounts.slice();
        amounts[m] = value;
        return { ...l, amounts };
      })
    );
  }

  // Persist a committed cell value. Change-detection lives in the row (it
  // knows the pre-edit value), so this always writes what it's given.
  function persistCell(id: number, m: number, value: number) {
    setCell(id, m, value);
    persist(() => updateCashflowCell(id, m, value));
  }

  function doFillRight(id: number, fromMonth: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const amounts = l.amounts.slice();
        for (let i = fromMonth + 1; i < NUM_COLS; i++) amounts[i] = amounts[fromMonth];
        return { ...l, amounts };
      })
    );
    persist(() => fillRight(id, fromMonth));
  }

  function commitLabel(id: number, raw: string) {
    const label = raw.trim();
    if (!label) return;
    const current = lines.find((l) => l.id === id)?.label;
    if (label === current) return;
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, label } : l)));
    persist(() => renameCashflowLine(id, label));
  }

  function addRow(section: string, kind: CashflowKind) {
    persist(async () => {
      const row = await addCashflowLine(year, section, kind);
      setLines((prev) => [...prev, row]);
      // Focus the new label so the operator can name it immediately.
      requestAnimationFrame(() => {
        document.getElementById(`cf-label-${row.id}`)?.focus();
      });
    });
  }

  function removeRow(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    persist(() => deleteCashflowLine(id));
  }

  function commitOpening(raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(value) || value === openingBalance) return;
    setOpening(value);
    persist(() => setOpeningBalance(year, value));
  }

  function toggleSection(section: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function onCellKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    id: number,
    m: number
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      const idx = visibleLineIds.indexOf(id);
      const nextId = visibleLineIds[idx + 1];
      if (nextId != null) {
        document.getElementById(`cf-${nextId}-${m}`)?.focus();
      } else {
        (e.target as HTMLInputElement).blur();
      }
    } else if (e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
    }
  }

  const sectionKindOf = (section: string): CashflowKind =>
    lines.find((l) => l.section === section)?.kind ?? "cost";

  // Cost sections render first, then Total Costs, then revenue sections, then
  // Net + Balance — reads top-to-bottom like a simple P&L.
  const costSections = sections.filter((s) => sectionKindOf(s) === "cost");
  const revenueSections = sections.filter((s) => sectionKindOf(s) === "revenue");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
        }}
      >
        <SummaryCard label={`Total costs ${year}`} value={money(costsYear)} />
        <SummaryCard label={`Revenue ${year}`} value={money(revenueYear)} />
        <SummaryCard
          label="Net for the year"
          value={money(netYear)}
          tone={netYear < 0 ? "bad" : "good"}
        />
        <SummaryCard
          label="Projected year-end balance"
          value={money(yearEndBalance)}
          tone={yearEndBalance < 0 ? "bad" : "good"}
        />
        <SummaryCard
          label="Runway (from opening)"
          value={
            runwayMonths == null
              ? "—"
              : `${runwayMonths.toLocaleString("en-GB", {
                  maximumFractionDigits: 1,
                })} mo`
          }
          tone={runwayMonths != null && runwayMonths < 6 ? "bad" : "neutral"}
          hint={
            avgNet < 0
              ? `Burning ${money(-avgNet)}/mo on average`
              : "Cash-positive on average"
          }
        />
      </div>

      {/* Opening balance + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#52525b", fontWeight: 600 }}>
            Opening bank balance (1 Jan {year})
          </span>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span style={{ color: "#71717a", marginRight: 2 }}>£</span>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={openingBalance === 0 ? "" : String(openingBalance)}
              onBlur={(e) => commitOpening(e.target.value)}
              placeholder="0"
              style={{
                width: 110,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid #d4d4d8",
                fontSize: 14,
                textAlign: "right",
                background: "#fff",
              }}
            />
          </span>
        </label>
        <span style={{ fontSize: 12, color: savingCount > 0 ? "#0369a1" : "#a1a1aa" }}>
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
            minWidth: 220 + COL_W * (NUM_COLS + 1),
          }}
        >
          <thead>
            <tr>
              <Th sticky>Item</Th>
              {MONTHS.map((mo) => (
                <Th key={mo} align="right">
                  {mo}
                </Th>
              ))}
              <Th align="right" strong>
                Total
              </Th>
            </tr>
          </thead>
          <tbody>
            {/* Cost sections */}
            {costSections.map((section) => (
              <SectionBlock
                key={section}
                section={section}
                kind="cost"
                lines={lines.filter((l) => l.section === section)}
                collapsed={collapsed.has(section)}
                onToggle={() => toggleSection(section)}
                onAdd={() => addRow(section, "cost")}
                onCommitCell={persistCell}
                onCellChange={setCell}
                onCommitLabel={commitLabel}
                onRemoveRow={removeRow}
                onFillRight={doFillRight}
                onCellKeyDown={onCellKeyDown}
              />
            ))}

            {/* Total costs */}
            <TotalRow
              label="Total costs"
              monthly={costsByMonth}
              total={costsYear}
              tone="cost"
            />

            {/* Revenue sections */}
            {revenueSections.map((section) => (
              <SectionBlock
                key={section}
                section={section}
                kind="revenue"
                lines={lines.filter((l) => l.section === section)}
                collapsed={collapsed.has(section)}
                onToggle={() => toggleSection(section)}
                onAdd={() => addRow(section, "revenue")}
                onCommitCell={persistCell}
                onCellChange={setCell}
                onCommitLabel={commitLabel}
                onRemoveRow={removeRow}
                onFillRight={doFillRight}
                onCellKeyDown={onCellKeyDown}
              />
            ))}
            {revenueSections.length === 0 && (
              <TotalRow
                label="Revenue"
                monthly={revenueByMonth}
                total={revenueYear}
                tone="revenue"
              />
            )}

            {/* Net + running balance */}
            <TotalRow
              label="Net (revenue − costs)"
              monthly={netByMonth}
              total={netYear}
              tone="net"
              colorSigned
            />
            <TotalRow
              label="Running balance"
              monthly={runningBalance}
              total={yearEndBalance}
              tone="balance"
              colorSigned
            />
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        Tip: click any cell and type. Press Tab or Enter to move on. Hover a cell
        and click <strong>→</strong> to copy that value across the rest of the
        year. Totals, net and running balance update as you go.
      </p>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
  hint?: string;
}) {
  const color =
    tone === "bad" ? "#b91c1c" : tone === "good" ? "#15803d" : "#18181b";
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 12, color: "#71717a" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
  sticky = false,
  strong = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sticky?: boolean;
  strong?: boolean;
}) {
  return (
    <th
      style={{
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 3 : 1,
        top: 0,
        background: "#f4f4f5",
        textAlign: align,
        padding: "8px 10px",
        fontSize: 11,
        fontWeight: strong ? 700 : 600,
        color: "#52525b",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        borderBottom: "1px solid #e4e4e7",
        whiteSpace: "nowrap",
        minWidth: sticky ? 200 : COL_W,
      }}
    >
      {children}
    </th>
  );
}

function StickyLabelCell({
  children,
  background = "#fff",
  bold = false,
}: {
  children: React.ReactNode;
  background?: string;
  bold?: boolean;
}) {
  return (
    <td
      style={{
        position: "sticky",
        left: 0,
        zIndex: 2,
        background,
        padding: "4px 10px",
        borderBottom: "1px solid #f1f1f3",
        fontWeight: bold ? 700 : 500,
        whiteSpace: "nowrap",
        minWidth: 200,
      }}
    >
      {children}
    </td>
  );
}

function SectionBlock({
  section,
  kind,
  lines,
  collapsed,
  onToggle,
  onAdd,
  onCommitCell,
  onCellChange,
  onCommitLabel,
  onRemoveRow,
  onFillRight,
  onCellKeyDown,
}: {
  section: string;
  kind: CashflowKind;
  lines: CashflowLine[];
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onCommitCell: (id: number, m: number, value: number) => void;
  onCellChange: (id: number, m: number, value: number) => void;
  onCommitLabel: (id: number, raw: string) => void;
  onRemoveRow: (id: number) => void;
  onFillRight: (id: number, m: number) => void;
  onCellKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: number,
    m: number
  ) => void;
}) {
  const subtotal = MONTHS.map((_, m) => sumMonths(lines, m));
  const subtotalYear = subtotal.reduce((a, b) => a + b, 0);

  return (
    <>
      {/* Section header / subtotal row */}
      <tr>
        <StickyLabelCell background="#fafafa" bold>
          <button
            type="button"
            onClick={onToggle}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
              fontWeight: 700,
              color: "#18181b",
              padding: 0,
            }}
            aria-expanded={!collapsed}
          >
            <span
              style={{
                display: "inline-block",
                transform: collapsed ? "rotate(-90deg)" : "none",
                transition: "transform .12s",
                color: "#a1a1aa",
              }}
            >
              ▾
            </span>
            {section}
            <span style={{ fontSize: 11, color: "#a1a1aa", fontWeight: 500 }}>
              ({lines.length})
            </span>
          </button>
        </StickyLabelCell>
        {subtotal.map((v, m) => (
          <td
            key={m}
            style={{
              textAlign: "right",
              padding: "4px 10px",
              background: "#fafafa",
              borderBottom: "1px solid #f1f1f3",
              fontWeight: 600,
              color: "#3f3f46",
              whiteSpace: "nowrap",
            }}
          >
            {v === 0 ? "" : money(v)}
          </td>
        ))}
        <td
          style={{
            textAlign: "right",
            padding: "4px 10px",
            background: "#f4f4f5",
            borderBottom: "1px solid #f1f1f3",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {money(subtotalYear)}
        </td>
      </tr>

      {/* Line rows */}
      {!collapsed &&
        lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            onCommitCell={onCommitCell}
            onCellChange={onCellChange}
            onCommitLabel={onCommitLabel}
            onRemoveRow={onRemoveRow}
            onFillRight={onFillRight}
            onCellKeyDown={onCellKeyDown}
          />
        ))}

      {/* Add-item row */}
      {!collapsed && (
        <tr>
          <StickyLabelCell>
            <button
              type="button"
              onClick={onAdd}
              style={{
                border: "none",
                background: "transparent",
                color: "#0369a1",
                cursor: "pointer",
                font: "inherit",
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 0",
              }}
            >
              + Add {kind === "revenue" ? "revenue" : "item"}
            </button>
          </StickyLabelCell>
          <td colSpan={NUM_COLS + 1} style={{ borderBottom: "1px solid #f1f1f3" }} />
        </tr>
      )}
    </>
  );
}

function LineRow({
  line,
  onCommitCell,
  onCellChange,
  onCommitLabel,
  onRemoveRow,
  onFillRight,
  onCellKeyDown,
}: {
  line: CashflowLine;
  onCommitCell: (id: number, m: number, value: number) => void;
  onCellChange: (id: number, m: number, value: number) => void;
  onCommitLabel: (id: number, raw: string) => void;
  onRemoveRow: (id: number) => void;
  onFillRight: (id: number, m: number) => void;
  onCellKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: number,
    m: number
  ) => void;
}) {
  const [hoverRow, setHoverRow] = useState(false);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  // Which month cell (if any) is being edited, plus its live text. Only the
  // focused cell is driven by `draft`; every other cell is driven by the
  // committed number, so fill-right and undo reflect instantly.
  const [editingM, setEditingM] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const origRef = useRef(0);
  const cancelRef = useRef(false);
  const total = annual(line.amounts);

  function startEdit(m: number, v: number) {
    origRef.current = v;
    cancelRef.current = false;
    setEditingM(m);
    setDraft(cellText(v));
  }

  function changeDraft(m: number, text: string) {
    setDraft(text);
    const t = text.trim();
    const n = t === "" ? 0 : Number(t);
    if (Number.isFinite(n)) onCellChange(line.id, m, n); // live totals
  }

  function finishEdit(m: number) {
    if (cancelRef.current) {
      onCellChange(line.id, m, origRef.current); // revert
    } else {
      const t = draft.trim();
      const v = t === "" ? 0 : Number(t);
      if (!Number.isFinite(v)) onCellChange(line.id, m, origRef.current);
      else if (v !== origRef.current) onCommitCell(line.id, m, v);
    }
    setEditingM(null);
  }

  return (
    <tr
      onMouseEnter={() => setHoverRow(true)}
      onMouseLeave={() => setHoverRow(false)}
    >
      <StickyLabelCell>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            id={`cf-label-${line.id}`}
            defaultValue={line.label}
            onBlur={(e) => onCommitLabel(line.id, e.target.value)}
            style={{
              border: "1px solid transparent",
              background: "transparent",
              font: "inherit",
              fontWeight: 500,
              padding: "3px 6px",
              borderRadius: 6,
              width: 150,
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
          <button
            type="button"
            aria-label="Delete row"
            onClick={() => onRemoveRow(line.id)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#c4c4cc",
              fontSize: 14,
              lineHeight: 1,
              padding: 2,
              visibility: hoverRow ? "visible" : "hidden",
            }}
          >
            ×
          </button>
        </span>
      </StickyLabelCell>

      {line.amounts.map((v, m) => (
        <td
          key={m}
          onMouseEnter={() => setHoverCell(m)}
          onMouseLeave={() => setHoverCell(null)}
          style={{
            position: "relative",
            padding: 0,
            borderBottom: "1px solid #f1f1f3",
            background: v < 0 ? "#fef2f2" : undefined,
          }}
        >
          <input
            id={`cf-${line.id}-${m}`}
            type="text"
            inputMode="decimal"
            value={editingM === m ? draft : cellText(v)}
            onFocus={(e) => {
              startEdit(m, v);
              e.target.style.border = "1px solid #0ea5e9";
              e.target.style.background = "#fff";
              e.target.style.borderRadius = "6px";
            }}
            onChange={(e) => changeDraft(m, e.target.value)}
            onBlur={(e) => {
              finishEdit(m);
              e.target.style.border = "1px solid transparent";
              e.target.style.background = "transparent";
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelRef.current = true;
              onCellKeyDown(e, line.id, m);
            }}
            style={{
              width: COL_W,
              boxSizing: "border-box",
              border: "1px solid transparent",
              background: "transparent",
              font: "inherit",
              textAlign: "right",
              padding: "6px 8px",
              color: v < 0 ? "#b91c1c" : "#18181b",
            }}
          />
          {hoverCell === m && m < NUM_COLS - 1 && (
            <button
              type="button"
              title="Fill this value across the rest of the year"
              aria-label="Fill right"
              onMouseDown={(e) => {
                // mousedown (not click) so it fires before the input blurs
                e.preventDefault();
                onFillRight(line.id, m);
              }}
              style={{
                position: "absolute",
                top: 1,
                right: 1,
                width: 16,
                height: 16,
                borderRadius: 4,
                border: "none",
                background: "#0ea5e9",
                color: "#fff",
                fontSize: 11,
                lineHeight: "16px",
                cursor: "pointer",
                padding: 0,
              }}
            >
              →
            </button>
          )}
        </td>
      ))}

      <td
        style={{
          textAlign: "right",
          padding: "6px 10px",
          borderBottom: "1px solid #f1f1f3",
          fontWeight: 600,
          color: "#3f3f46",
          whiteSpace: "nowrap",
          background: "#fafafa",
        }}
      >
        {money(total)}
      </td>
    </tr>
  );
}

function TotalRow({
  label,
  monthly,
  total,
  tone,
  colorSigned = false,
}: {
  label: string;
  monthly: number[];
  total: number;
  tone: "cost" | "revenue" | "net" | "balance";
  colorSigned?: boolean;
}) {
  const bg =
    tone === "cost"
      ? "#f4f4f5"
      : tone === "revenue"
      ? "#f0fdf4"
      : tone === "balance"
      ? "#eff6ff"
      : "#fafafa";

  const cellColor = (v: number) =>
    colorSigned ? (v < 0 ? "#b91c1c" : v > 0 ? "#15803d" : "#71717a") : "#18181b";

  return (
    <tr>
      <StickyLabelCell background={bg} bold>
        {label}
      </StickyLabelCell>
      {monthly.map((v, m) => (
        <td
          key={m}
          style={{
            textAlign: "right",
            padding: "7px 10px",
            background: bg,
            borderTop: "1px solid #e4e4e7",
            borderBottom: "1px solid #e4e4e7",
            fontWeight: 700,
            whiteSpace: "nowrap",
            color: cellColor(v),
          }}
        >
          {money(v)}
        </td>
      ))}
      <td
        style={{
          textAlign: "right",
          padding: "7px 10px",
          background: bg,
          borderTop: "1px solid #e4e4e7",
          borderBottom: "1px solid #e4e4e7",
          fontWeight: 800,
          whiteSpace: "nowrap",
          color: cellColor(total),
        }}
      >
        {money(total)}
      </td>
    </tr>
  );
}
