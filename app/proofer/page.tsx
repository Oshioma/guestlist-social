import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
  getProoferOccupiedDates,
} from "../admin-panel/lib/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDisplayTimezone } from "@/lib/app-settings";
import ProoferBoard from "../admin-panel/proofer/ProoferBoard";
import EmptyState from "../admin-panel/components/EmptyState";
import ProoferNav from "./ProoferNav";
import { getMyTeams } from "./navData";
import { getProoferBase } from "./base";

export const dynamic = "force-dynamic";

// Shared with /app/proofer so the "last client" memory follows the user across
// both surfaces.
const COOKIE_NAME = "proofer_last_client";

function getNextSixMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    months.push({ value, label });
  }
  return months;
}

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = {
  maxWidth: 1160,
  margin: "0 auto",
  width: "100%",
};

export default async function ProoferStandalonePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const months = getNextSixMonths();
  const defaultMonth = months[0]?.value ?? "";
  const selectedMonth = sp.month ?? defaultMonth;

  const cookieStore = await cookies();
  const lastClient = cookieStore.get(COOKIE_NAME)?.value ?? "";
  const { base, parentOrigin } = await getProoferBase();
  const myTeams = await getMyTeams();

  try {
    let selectedClientId = sp.client ?? "";
    if (!selectedClientId && lastClient) {
      selectedClientId = lastClient;
    }
    if (!selectedClientId) {
      const { clients } = await getProoferData();
      selectedClientId = clients[0]?.id ?? "";
    }

    const data = await getProoferData(
      selectedClientId || undefined,
      selectedClientId ? selectedMonth : undefined
    );

    let displayTimezone = "Etc/GMT";
    try {
      displayTimezone = await getDisplayTimezone(createAdminClient());
    } catch (err) {
      console.error("Display timezone load error:", err);
    }

    // All-time pillar posts power the nav's pillar hover popups (the board's
    // own data stays month-scoped).
    const pillarPosts = selectedClientId
      ? await getProoferPillarPosts(selectedClientId)
      : [];
    const occupiedDates = selectedClientId
      ? await getProoferOccupiedDates(selectedClientId)
      : [];

    return (
      <>
        <ProoferNav
          clients={data.clients}
          clientId={selectedClientId}
          month={selectedMonth}
          pillars={data.pillars}
          posts={pillarPosts}
          teams={myTeams}
          occupiedDates={occupiedDates}
          base={base}
          parentOrigin={parentOrigin}
        />
        <main style={mainStyle}>
          <div style={centerStyle}>
            <ProoferBoard
              // Remount when client/month change (driven from the top nav) so
              // the board's internal state re-seeds cleanly from fresh data.
              key={`${selectedClientId}:${selectedMonth}`}
              clients={data.clients}
              months={months}
              initialClientId={selectedClientId}
              initialMonth={selectedMonth}
              initialPosts={data.posts}
              initialPillars={data.pillars}
              initialIdeas={data.ideas}
              initialPostIdeas={data.postIdeas}
              timeZone={displayTimezone}
              basePath={base || "/"}
              publishPath={`${parentOrigin}/app/proofer/publish`}
              standalone
            />
          </div>
        </main>
      </>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <>
        <ProoferNav clients={[]} clientId="" month={selectedMonth} pillars={[]} posts={[]} teams={myTeams} base={base} parentOrigin={parentOrigin} />
        <main style={mainStyle}>
          <div style={centerStyle}>
            <EmptyState title="Unable to load proofer" description={message} />
          </div>
        </main>
      </>
    );
  }
}
