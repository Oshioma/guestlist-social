import { requireAdmin } from "@/lib/auth/permissions";
import {
  getCashflow,
  getActiveClientRetainers,
  getCashflowYears,
} from "@/app/admin-panel/lib/cashflow-actions";
import CashflowGrid from "@/app/admin-panel/components/CashflowGrid";
import CashflowYearBar from "@/app/admin-panel/components/CashflowYearBar";

export const dynamic = "force-dynamic";

const DEFAULT_YEAR = 2026;

type Props = {
  searchParams: Promise<{ year?: string }>;
};

// Cashflow is owner-level financial data — admins only.
export default async function CashflowPage({ searchParams }: Props) {
  await requireAdmin();

  const { year: yearParam } = await searchParams;
  const parsed = Number(yearParam);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : DEFAULT_YEAR;

  const [{ lines, openingBalance }, clientRetainers, years] = await Promise.all([
    getCashflow(year),
    getActiveClientRetainers(),
    getCashflowYears(),
  ]);

  // Always offer the current year as a chip, even if it has no rows yet.
  const yearChips = Array.from(new Set([...years, year])).sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
          Cashflow forecast
        </h1>
        <p style={{ fontSize: 14, color: "#71717a", margin: "6px 0 0" }}>
          Every figure is editable inline. Totals, net and running bank balance
          recalculate as you type.
        </p>
      </div>

      <CashflowYearBar years={yearChips} currentYear={year} />

      {lines.length === 0 ? (
        <div
          style={{
            border: "1px dashed #d4d4d8",
            borderRadius: 12,
            padding: 24,
            background: "#fafafa",
            color: "#71717a",
            fontSize: 14,
          }}
        >
          {year} has no forecast yet. Use{" "}
          <strong>+ Duplicate year</strong> above to copy another year in, or
          add rows once a year exists.
        </div>
      ) : (
        <CashflowGrid
          key={year}
          year={year}
          initialLines={lines}
          initialOpeningBalance={openingBalance}
          clientRetainersMonthly={clientRetainers}
        />
      )}
    </div>
  );
}
