"use client";

import { useState } from "react";

export type SalaryRow = {
  label: string;
  // Crew pay for the month.
  salary: number;
  // Rooms cost billed under the same name (0 if none).
  room: number;
  // salary + room — this person's total cost for the month.
  amount: number;
};

export type FinanceThisMonthStats = {
  // e.g. "August 2026" — the month these figures describe.
  monthLabel: string;
  revenue: number;
  costs: number;
  // Sum of the Crew section for the month — "staff salaries coming up".
  salaries: number;
  // Per-person crew amounts for the expandable breakdown.
  salaryRows: SalaryRow[];
};

// GBP formatting, mirrored from the cashflow grid so the numbers read the same
// on the dashboard as they do on the forecast page.
function money(n: number): string {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (neg ? "-£" : "£") + s;
}

export default function FinanceThisMonthCard({
  stats,
}: {
  stats: FinanceThisMonthStats;
}) {
  const [open, setOpen] = useState(false);
  const net = stats.revenue - stats.costs;
  const hasBreakdown = stats.salaryRows.length > 0;

  const hasRooms = stats.salaryRows.some((r) => r.room > 0);
  const figures: Array<{
    label: string;
    value: number;
    color?: string;
    note?: string;
  }> = [
    { label: "Monthly revenue", value: stats.revenue, color: "#166534" },
    { label: "Total monthly costs", value: stats.costs },
    {
      label: "Net",
      value: net,
      color: net >= 0 ? "#166534" : "#b91c1c",
    },
    {
      label: "Staff salaries coming up",
      value: stats.salaries,
      color: "#b45309",
      note: hasRooms ? "incl. room costs" : undefined,
    },
  ];

  return (
    <div
      style={{
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #e4e4e7",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 18px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>
            Finance
          </div>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>
            {stats.monthLabel}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            // Cluster the figures together rather than stretching them across
            // the whole card (which left big gaps between the numbers). They
            // wrap onto a second row on a narrow card instead of clipping.
            gap: "16px 44px",
          }}
        >
          {figures.map((f) => (
            <div key={f.label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#71717a", marginBottom: 6 }}>
                {f.label}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: f.color ?? "#18181b",
                  letterSpacing: "-0.02em",
                }}
              >
                {money(f.value)}
              </div>
              {f.note && (
                <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
                  {f.note}
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          {hasBreakdown ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#7c3aed",
                fontSize: 13,
                fontWeight: 600,
              }}
              aria-expanded={open}
            >
              {open ? "Hide salary breakdown ▴" : "View salary breakdown ▾"}
            </button>
          ) : null}
        </div>
      </div>

      {open && hasBreakdown && (
        <div style={{ borderTop: "1px solid #f4f4f5" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ color: "#71717a", textAlign: "left" }}>
                <th style={{ padding: "8px 18px", fontWeight: 600 }}>Person</th>
                <th
                  style={{
                    padding: "8px 18px",
                    fontWeight: 600,
                    textAlign: "right",
                  }}
                >
                  This month
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.salaryRows.map((row) => (
                <tr
                  key={row.label}
                  style={{ borderTop: "1px solid #f4f4f5" }}
                >
                  <td style={{ padding: "8px 18px", color: "#18181b" }}>
                    <span>{row.label}</span>
                    {row.room > 0 && (
                      <span style={{ color: "#a1a1aa", marginLeft: 8, fontSize: 12 }}>
                        {money(row.salary)} salary + {money(row.room)} room
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "8px 18px",
                      textAlign: "right",
                      color: "#18181b",
                    }}
                  >
                    {money(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
