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
  createStandardYear,
  deleteCashflowLine,
  fillRight,
  renameCashflowLine,
  setOpeningBalance,
  setRetainerOverride,
  updateCashflowCell,
} from "../lib/cashflow-actions";

type Props = {
  year: number;
  initialLines: CashflowLine[];
  initialOpeningBalance: number;
  // Live monthly run-rate from active clients' retainers — the default value
  // for any month the operator hasn't pinned. Rendered as an editable row
  // inside Revenue and folded into every revenue total.
  clientRetainersMonthly: number;
  // Per-month overrides [Jan … Dec]; null = use the live client total.
  initialRetainerOverrides: (number | null)[];
  // Column to highlight (current month), or null when not viewing this year.
  highlightMonth: number | null;
};

// Pastel highlight for the current month's column.
const HIGHLIGHT_BG = "#fef3c7"; // amber-100
function withHighlight(
  m: number,
  highlightMonth: number | null,
  base?: string
): string | undefined {
  return m === highlightMonth ? HIGHLIGHT_BG : base;
}

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
  clientRetainersMonthly,
  initialRetainerOverrides,
  highlightMonth,
}: Props) {
  const [lines, setLines] = useState<CashflowLine[]>(initialLines);
  const [openingBalance, setOpening] = useState<number>(initialOpeningBalance);
  const [overrides, setOverrides] =
    useState<(number | null)[]>(initialRetainerOverrides);
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
    retainersByMonth,
  } = useMemo(() => {
    const sections = orderedSections(lines);
    const costLines = lines.filter((l) => l.kind === "cost");
    const revenueLines = lines.filter((l) => l.kind === "revenue");

    // Effective retainer per month: a pinned override, else the live client
    // total. Unedited months keep following the live figure; edited months
    // hold whatever was billed.
    const retainersByMonth = MONTHS.map((_, m) =>
      overrides[m] != null ? (overrides[m] as number) : clientRetainersMonthly
    );

    const costsByMonth = MONTHS.map((_, m) => sumMonths(costLines, m));
    // Revenue = editable revenue lines + the client-retainers row.
    const revenueByMonth = MONTHS.map(
      (_, m) => sumMonths(revenueLines, m) + retainersByMonth[m]
    );
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
      retainersByMonth,
    };
  }, [lines, openingBalance, clientRetainersMonthly, overrides]);

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

  // Add a brand-new section by creating its first row. Sections are derived
  // from the lines, so a row with a fresh section name creates the section.
  function addSection(name: string, kind: CashflowKind) {
    const section = name.trim();
    if (!section) return;
    persist(async () => {
      const row = await addCashflowLine(year, section, kind);
      setLines((prev) => [...prev, row]);
      requestAnimationFrame(() => {
        document.getElementById(`cf-label-${row.id}`)?.focus();
      });
    });
  }

  // Empty-year quick start: seed the standard section skeleton.
  function seedStandard() {
    persist(async () => {
      const rows = await createStandardYear(year);
      if (rows.length > 0) setLines((prev) => [...prev, ...rows]);
    });
  }

  function commitOpening(raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(value) || value === openingBalance) return;
    setOpening(value);
    persist(() => setOpeningBalance(year, value));
  }

  // Pin (a number) or clear (empty → revert to the live client total) the
  // retainer amount for a single month.
  function commitRetainer(m: number, raw: string) {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next != null && !Number.isFinite(next)) return;
    if (next === overrides[m]) return;
    setOverrides((prev) => {
      const a = prev.slice();
      a[m] = next;
      return a;
    });
    persist(() => setRetainerOverride(year, m, next));
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

      {/* Empty-year quick start */}
      {lines.length === 0 && (
        <div
          style={{
            border: "1px dashed #d4d4d8",
            borderRadius: 12,
            padding: 20,
            background: "#fafafa",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, color: "#52525b" }}>
            <strong>{year}</strong> is empty. Start with the standard sections
            (Overheads, Software, Crew, Rooms, Revenue), or add your own below —
            or use <strong>+ Duplicate year</strong> to copy another year in.
          </div>
          <button
            type="button"
            onClick={seedStandard}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              background: "#18181b",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Create standard sections
          </button>
        </div>
      )}

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
              {MONTHS.map((mo, m) => (
                <Th key={mo} align="right" highlight={m === highlightMonth}>
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
                highlightMonth={highlightMonth}
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
              highlightMonth={highlightMonth}
            />

            {/* Revenue sections. The client-retainers row attaches to the
                first revenue section so it appears exactly once. */}
            {revenueSections.map((section, i) => (
              <SectionBlock
                key={section}
                section={section}
                kind="revenue"
                lines={lines.filter((l) => l.section === section)}
                collapsed={collapsed.has(section)}
                highlightMonth={highlightMonth}
                onToggle={() => toggleSection(section)}
                onAdd={() => addRow(section, "revenue")}
                onCommitCell={persistCell}
                onCellChange={setCell}
                onCommitLabel={commitLabel}
                onRemoveRow={removeRow}
                onFillRight={doFillRight}
                onCellKeyDown={onCellKeyDown}
                autoRow={
                  i === 0 &&
                  (clientRetainersMonthly > 0 ||
                    overrides.some((v) => v != null))
                    ? {
                        label: "Client retainers",
                        monthly: retainersByMonth,
                        hint: "defaults to live client total; type to pin a month, clear to revert",
                        editable: {
                          overrides,
                          liveDefault: clientRetainersMonthly,
                          onCommit: commitRetainer,
                        },
                      }
                    : undefined
                }
              />
            ))}
            {revenueSections.length === 0 && (
              <TotalRow
                label="Revenue"
                monthly={revenueByMonth}
                total={revenueYear}
                tone="revenue"
                highlightMonth={highlightMonth}
              />
            )}

            {/* Net + running balance */}
            <TotalRow
              label="Net (revenue − costs)"
              monthly={netByMonth}
              total={netYear}
              tone="net"
              colorSigned
              highlightMonth={highlightMonth}
            />
            <TotalRow
              label="Running balance"
              monthly={runningBalance}
              total={yearEndBalance}
              tone="balance"
              colorSigned
              highlightMonth={highlightMonth}
            />
          </tbody>
        </table>
      </div>

      <AddSectionControl onAdd={addSection} />

      <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        Tip: click any cell and type. Press Tab or Enter to move on. Hover a cell
        and click <strong>→</strong> to copy that value across the rest of the
        year. The <strong>Client retainers</strong> row follows your live client
        total by default — type into a month to pin what was actually billed,
        or clear it to revert. This month&apos;s column is shaded.
      </p>
    </div>
  );
}

// Add a new section (cost or revenue) by naming it — creates the section with
// a first blank row.
function AddSectionControl({
  onAdd,
}: {
  onAdd: (name: string, kind: CashflowKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CashflowKind>("cost");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          alignSelf: "flex-start",
          border: "1px dashed #c4c4cc",
          borderRadius: 10,
          padding: "8px 14px",
          background: "#fff",
          color: "#52525b",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Add section
      </button>
    );
  }

  function submit() {
    if (!name.trim()) return;
    onAdd(name, kind);
    setName("");
    setKind("cost");
    setOpen(false);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        padding: 10,
        background: "#fff",
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Section name (e.g. Marketing)"
        style={{
          width: 240,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #d4d4d8",
          fontSize: 14,
        }}
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as CashflowKind)}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #d4d4d8",
          fontSize: 14,
          background: "#fff",
        }}
      >
        <option value="cost">Cost</option>
        <option value="revenue">Revenue</option>
      </select>
      <button
        type="button"
        onClick={submit}
        style={{
          border: "none",
          borderRadius: 8,
          padding: "8px 14px",
          background: "#18181b",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        style={{
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          padding: "8px 12px",
          background: "#fff",
          color: "#52525b",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
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
  highlight = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sticky?: boolean;
  strong?: boolean;
  highlight?: boolean;
}) {
  return (
    <th
      title={highlight ? "This month" : undefined}
      style={{
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 3 : 1,
        top: 0,
        background: highlight ? HIGHLIGHT_BG : "#f4f4f5",
        textAlign: align,
        padding: "8px 10px",
        fontSize: 11,
        fontWeight: highlight || strong ? 700 : 600,
        color: highlight ? "#92400e" : "#52525b",
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

type AutoRowConfig = {
  label: string;
  monthly: number[]; // effective values (for subtotal + display)
  hint?: string;
  // When present, the row is editable per month: `overrides[m]` is the pinned
  // value (or null = live), `liveDefault` is what an unpinned month shows, and
  // `onCommit` persists a typed value (empty string clears the override).
  editable?: {
    overrides: (number | null)[];
    liveDefault: number;
    onCommit: (m: number, raw: string) => void;
  };
};

function SectionBlock({
  section,
  kind,
  lines,
  collapsed,
  highlightMonth,
  onToggle,
  onAdd,
  onCommitCell,
  onCellChange,
  onCommitLabel,
  onRemoveRow,
  onFillRight,
  onCellKeyDown,
  autoRow,
}: {
  section: string;
  kind: CashflowKind;
  lines: CashflowLine[];
  collapsed: boolean;
  highlightMonth: number | null;
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
  // Optional computed row (e.g. client retainers) that lives in this section:
  // counted in the subtotal. Read-only unless `editable` is provided.
  autoRow?: AutoRowConfig;
}) {
  const subtotal = MONTHS.map(
    (_, m) => sumMonths(lines, m) + (autoRow?.monthly[m] ?? 0)
  );
  const subtotalYear = subtotal.reduce((a, b) => a + b, 0);
  const rowCount = lines.length + (autoRow ? 1 : 0);

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
              ({rowCount})
            </span>
          </button>
        </StickyLabelCell>
        {subtotal.map((v, m) => (
          <td
            key={m}
            style={{
              textAlign: "right",
              padding: "4px 10px",
              background: withHighlight(m, highlightMonth, "#fafafa"),
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

      {/* Computed row (client retainers) — editable per month when configured */}
      {!collapsed && autoRow && (
        <AutoRow autoRow={autoRow} highlightMonth={highlightMonth} />
      )}

      {/* Line rows */}
      {!collapsed &&
        lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            highlightMonth={highlightMonth}
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

// A read-only, computed line inside a section (e.g. client retainers). Looks
// like a line row but shows plain figures with an "auto" badge — no inputs,
// no fill-right, no delete.
function AutoRow({
  autoRow,
  highlightMonth,
}: {
  autoRow: AutoRowConfig;
  highlightMonth: number | null;
}) {
  const total = autoRow.monthly.reduce((a, b) => a + (b || 0), 0);
  const editable = autoRow.editable;
  const [editingM, setEditingM] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const origRef = useRef("");
  const cancelRef = useRef(false);

  function startEdit(m: number) {
    const ov = editable?.overrides[m];
    origRef.current =
      ov != null
        ? String(ov)
        : editable && editable.liveDefault !== 0
        ? String(editable.liveDefault)
        : "";
    cancelRef.current = false;
    setEditingM(m);
    setDraft(origRef.current);
  }

  function finishEdit(m: number) {
    if (!cancelRef.current && draft !== origRef.current) {
      editable?.onCommit(m, draft);
    }
    setEditingM(null);
  }

  return (
    <tr>
      <StickyLabelCell>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 500, color: "#3f3f46" }}>
            {autoRow.label}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: "#0369a1",
              background: "#e0f2fe",
              borderRadius: 999,
              padding: "1px 7px",
            }}
            title={autoRow.hint}
          >
            Auto
          </span>
        </span>
      </StickyLabelCell>
      {autoRow.monthly.map((v, m) => {
        const pinned = editable?.overrides[m] != null;
        const hl = withHighlight(m, highlightMonth);
        if (!editable) {
          return (
            <td
              key={m}
              style={{
                textAlign: "right",
                padding: "6px 8px",
                borderBottom: "1px solid #f1f1f3",
                background: hl,
                color: "#0369a1",
                fontStyle: "italic",
                whiteSpace: "nowrap",
              }}
            >
              {v === 0 ? "" : money(v)}
            </td>
          );
        }
        return (
          <td
            key={m}
            title={pinned ? "Pinned — clear to revert to live total" : "Auto (live client total) — type to pin"}
            style={{
              padding: 0,
              borderBottom: "1px solid #f1f1f3",
              background: hl,
            }}
          >
            <input
              type="text"
              inputMode="decimal"
              value={editingM === m ? draft : v === 0 ? "" : String(v)}
              onFocus={(e) => {
                startEdit(m);
                e.target.style.border = "1px solid #0ea5e9";
                e.target.style.background = "#fff";
                e.target.style.borderRadius = "6px";
              }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => {
                finishEdit(m);
                e.target.style.border = "1px solid transparent";
                e.target.style.background = "transparent";
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
                width: COL_W,
                boxSizing: "border-box",
                border: "1px solid transparent",
                background: "transparent",
                font: "inherit",
                textAlign: "right",
                padding: "6px 8px",
                color: "#0369a1",
                fontStyle: pinned ? "normal" : "italic",
                fontWeight: pinned ? 600 : 400,
              }}
            />
          </td>
        );
      })}
      <td
        style={{
          textAlign: "right",
          padding: "6px 10px",
          borderBottom: "1px solid #f1f1f3",
          fontWeight: 600,
          color: "#0369a1",
          whiteSpace: "nowrap",
          background: "#fafafa",
        }}
      >
        {money(total)}
      </td>
    </tr>
  );
}

function LineRow({
  line,
  highlightMonth,
  onCommitCell,
  onCellChange,
  onCommitLabel,
  onRemoveRow,
  onFillRight,
  onCellKeyDown,
}: {
  line: CashflowLine;
  highlightMonth: number | null;
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
            background: v < 0 ? "#fef2f2" : withHighlight(m, highlightMonth),
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
  highlightMonth,
}: {
  label: string;
  monthly: number[];
  total: number;
  tone: "cost" | "revenue" | "net" | "balance";
  colorSigned?: boolean;
  highlightMonth: number | null;
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
            background: withHighlight(m, highlightMonth, bg),
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
