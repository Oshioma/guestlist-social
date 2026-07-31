import { requireAdmin } from "@/lib/auth/permissions";
import { getCashflow } from "@/app/admin-panel/lib/cashflow-actions";
import CashflowGrid from "@/app/admin-panel/components/CashflowGrid";

export const dynamic = "force-dynamic";

// Cashflow is owner-level financial data — admins only.
export default async function CashflowPage() {
  await requireAdmin();

  const year = 2026;
  const { lines, openingBalance } = await getCashflow(year);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
          Cashflow forecast
        </h1>
        <p style={{ fontSize: 14, color: "#71717a", margin: "6px 0 0" }}>
          {year} — every figure is editable inline. Totals, net and running bank
          balance recalculate as you type.
        </p>
      </div>

      <CashflowGrid
        year={year}
        initialLines={lines}
        initialOpeningBalance={openingBalance}
      />
    </div>
  );
}
