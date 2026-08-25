import { createClient } from "@/lib/supabase/server";
import { getDisplayTimezone } from "@/lib/app-settings";
import { getSalesWeeks } from "@/app/admin-panel/lib/sales-actions";
import SalesActivityGrid from "@/app/admin-panel/components/SalesActivityGrid";

export const dynamic = "force-dynamic";

// Weekly activity tab — the calls / opps / deals grid, one row per (week, rep).
export default async function SalesPage() {
  // Membership is enforced by the sales layout (and RLS underneath).
  const weeks = await getSalesWeeks();

  // Today's Monday in the agency's display timezone, so "this week" doesn't
  // slip a day around midnight for a server running in UTC.
  const tz = await getDisplayTimezone(await createClient());
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const today = new Date(todayKey + "T00:00:00Z");
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const currentWeekStart = today.toISOString().slice(0, 10);

  return (
    <SalesActivityGrid initialWeeks={weeks} currentWeekStart={currentWeekStart} />
  );
}
