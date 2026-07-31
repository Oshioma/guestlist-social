import { requireAdmin } from "@/lib/auth/permissions";
import {
  getCashflow,
  getActiveClientRetainers,
  getCashflowYears,
} from "@/app/admin-panel/lib/cashflow-actions";
import { createClient } from "@/lib/supabase/server";
import { getDisplayTimezone } from "@/lib/app-settings";
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

  const [{ lines, openingBalance, retainerOverrides }, clientRetainers, years] =
    await Promise.all([
      getCashflow(year),
      getActiveClientRetainers(),
      getCashflowYears(),
    ]);

  // Always offer the current year as a chip, even if it has no rows yet.
  const yearChips = Array.from(new Set([...years, year])).sort((a, b) => a - b);

  // Highlight the current month's column, but only when viewing this year.
  // Compute "now" in the agency's display timezone so the highlight doesn't
  // slip a month around midnight for a server running in UTC.
  const tz = await getDisplayTimezone(await createClient());
  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const curYear = Number(nowParts.find((p) => p.type === "year")?.value);
  const curMonth = Number(nowParts.find((p) => p.type === "month")?.value) - 1;
  const highlightMonth = year === curYear ? curMonth : null;

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

      <CashflowGrid
        key={year}
        year={year}
        initialLines={lines}
        initialOpeningBalance={openingBalance}
        clientRetainersMonthly={clientRetainers}
        initialRetainerOverrides={retainerOverrides}
        highlightMonth={highlightMonth}
      />
    </div>
  );
}
