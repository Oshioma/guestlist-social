"use client";

// ---------------------------------------------------------------------------
// PaymentsTable — admin-only, sortable view of what every client pays.
// Click a column header to sort; a footer sums the monthly recurring revenue
// and the direct-debit portion for the rows in view.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";

export type PaymentRow = {
  id: string;
  name: string;
  price: number | null;
  directDebit: boolean;
  status: string;
};

type SortKey = "name" | "status" | "price" | "method";
type SortDir = "asc" | "desc";

function money(n: number): string {
  return `£${n.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pricedOnly, setPricedOnly] = useState(true);

  const visible = useMemo(() => {
    const filtered = pricedOnly ? rows.filter((r) => r.price != null) : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "method":
          return (Number(a.directDebit) - Number(b.directDebit)) * dir;
        case "price":
        default:
          return ((a.price ?? -1) - (b.price ?? -1)) * dir;
      }
    });
  }, [rows, sortKey, sortDir, pricedOnly]);

  const totalMrr = visible.reduce((t, r) => t + (r.price ?? 0), 0);
  const ddMrr = visible.reduce(
    (t, r) => t + (r.directDebit ? r.price ?? 0 : 0),
    0
  );
  const ddCount = visible.filter((r) => r.directDebit && r.price != null).length;

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible default direction per column.
      setSortDir(key === "name" || key === "status" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) =>
    key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Stat label="Monthly recurring" value={money(totalMrr)} />
          <Stat
            label="On direct debit"
            value={money(ddMrr)}
            hint={`${ddCount} client${ddCount === 1 ? "" : "s"}`}
          />
          <Stat
            label="Invoiced / other"
            value={money(totalMrr - ddMrr)}
          />
        </div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "#52525b",
          }}
        >
          <input
            type="checkbox"
            checked={pricedOnly}
            onChange={(e) => setPricedOnly(e.target.checked)}
          />
          Only clients with a price
        </label>
      </div>

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
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <Th onClick={() => toggleSort("name")}>Client{arrow("name")}</Th>
              <Th onClick={() => toggleSort("status")}>
                Status{arrow("status")}
              </Th>
              <Th onClick={() => toggleSort("method")}>
                Method{arrow("method")}
              </Th>
              <Th onClick={() => toggleSort("price")} align="right">
                Price /mo{arrow("price")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ padding: 20, color: "#a1a1aa", textAlign: "center" }}
                >
                  No clients to show.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      href={`/app/clients/${r.id}/edit`}
                      style={{
                        color: "#18181b",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      {r.name}
                    </Link>
                  </Td>
                  <Td>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#52525b",
                        textTransform: "capitalize",
                      }}
                    >
                      {r.status || "—"}
                    </span>
                  </Td>
                  <Td>
                    {r.price == null ? (
                      <span style={{ color: "#a1a1aa" }}>—</span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.03em",
                          borderRadius: 999,
                          padding: "2px 8px",
                          color: r.directDebit ? "#15803d" : "#a16207",
                          background: r.directDebit ? "#f0fdf4" : "#fefce8",
                          border: `1px solid ${
                            r.directDebit ? "#bbf7d0" : "#fef08a"
                          }`,
                        }}
                      >
                        {r.directDebit ? "Direct debit" : "Invoiced"}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {r.price == null ? (
                      <span style={{ color: "#a1a1aa" }}>—</span>
                    ) : (
                      <span style={{ fontWeight: 700 }}>{money(r.price)}</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "10px 12px",
                    borderTop: "2px solid #e4e4e7",
                    fontWeight: 700,
                    background: "#fafafa",
                  }}
                >
                  Total ({visible.filter((r) => r.price != null).length} paying)
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderTop: "2px solid #e4e4e7",
                    textAlign: "right",
                    fontWeight: 800,
                    background: "#fafafa",
                  }}
                >
                  {money(totalMrr)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 12,
        padding: "10px 14px",
        background: "#fff",
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 12, color: "#71717a" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#18181b" }}>
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
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontSize: 12,
        fontWeight: 700,
        color: "#52525b",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        borderBottom: "1px solid #e4e4e7",
        background: "#f4f4f5",
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "10px 12px",
        borderBottom: "1px solid #f1f1f3",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}
