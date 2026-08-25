import { createClient } from "@/lib/supabase/server";
import { getDisplayTimezone } from "@/lib/app-settings";
import { isCapsuleConfigured } from "@/lib/capsule";
import { getSalesOpportunities } from "@/app/admin-panel/lib/sales-actions";
import { syncCapsuleOpportunities } from "@/app/admin-panel/lib/capsule-actions";
import SalesOpportunities from "@/app/admin-panel/components/SalesOpportunities";

export const dynamic = "force-dynamic";

// Opportunities tab — the per-company pipeline log, grouped by month.
export default async function SalesOpportunitiesPage() {
  // Membership is enforced by the sales layout (and RLS underneath).

  // Before loading the rows, sync with Capsule: link unlinked rows to
  // existing Capsule opportunities, and flip pending linked rows to
  // booked / not booked when Capsule says won / lost. Read-only on Capsule
  // (nothing is created there) and fail-soft.
  try {
    await syncCapsuleOpportunities();
  } catch (e) {
    console.warn("[sales] capsule sync skipped:", e);
  }

  const opportunities = await getSalesOpportunities();

  // The current month in the agency's display timezone — the default bucket
  // for newly added opportunities.
  const tz = await getDisplayTimezone(await createClient());
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentMonthStart = todayKey.slice(0, 7) + "-01";

  return (
    <SalesOpportunities
      initialOpps={opportunities}
      currentMonthStart={currentMonthStart}
      todayKey={todayKey}
      capsuleConfigured={isCapsuleConfigured()}
      capsuleSite={process.env.CAPSULE_SITE ?? null}
    />
  );
}
