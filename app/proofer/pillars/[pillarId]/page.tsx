import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
  getProoferOccupiedDates,
} from "../../../admin-panel/lib/queries";
import EmptyState from "../../../admin-panel/components/EmptyState";
import ProoferNav from "../../ProoferNav";
import { getMyTeams, getShowClients, getLastProoferClientId } from "../../navData";
import { isSuperAdmin } from "@/lib/auth/permissions";
import PillarOrganiser from "./PillarOrganiser";
import { getProoferBase } from "../../base";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "proofer_last_client";

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = {
  maxWidth: 1160,
  margin: "0 auto",
  width: "100%",
};

export default async function PillarOrganisePage({
  params,
  searchParams,
}: {
  params: Promise<{ pillarId: string }>;
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const { pillarId } = await params;
  const sp = await searchParams;
  const month = sp.month ?? currentMonthValue();

  const cookieStore = await cookies();
  // Durable per-user preference first, cookie only as a fast fallback.
  const lastClient =
    (await getLastProoferClientId()) || cookieStore.get(COOKIE_NAME)?.value || "";
  const { base, parentOrigin } = await getProoferBase();
  const myTeams = await getMyTeams();
  const superAdmin = await isSuperAdmin();
  const showClients = await getShowClients();

  try {
    let clientId = sp.client ?? "";
    if (!clientId && lastClient) clientId = lastClient;
    if (!clientId) {
      const { clients } = await getProoferData();
      clientId = clients[0]?.id ?? "";
    }

    // Pass clientId so pillars come back (getProoferData returns none without a
    // selected client).
    const { clients, pillars } = await getProoferData(clientId, month);
    const allPillarPosts = await getProoferPillarPosts(clientId);
    // All-time dates already taken — the "add to a day" picker greys these out.
    const occupiedDates = await getProoferOccupiedDates(clientId);
    const pillar = pillars.find((p) => p.id === pillarId) ?? null;
    const pillarPosts = allPillarPosts.filter((p) => p.pillarId === pillarId);

    return (
      <>
        <ProoferNav
          clients={clients}
          clientId={clientId}
          month={month}
          pillars={pillars}
          posts={allPillarPosts}
          teams={myTeams}
          occupiedDates={occupiedDates}
          isSuperAdmin={superAdmin}
          showClients={showClients}
          base={base}
          parentOrigin={parentOrigin}
        />
        <main style={mainStyle}>
          <div style={centerStyle}>
            {pillar ? (
              <PillarOrganiser
                clientId={clientId}
                pillar={{ id: pillar.id, name: pillar.name, color: pillar.color }}
                month={month}
                posts={pillarPosts}
                occupiedDates={occupiedDates}
                base={base}
              />
            ) : (
              <EmptyState
                title="Pillar not found"
                description="This content pillar no longer exists for this client."
              />
            )}
          </div>
        </main>
      </>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <>
        <ProoferNav clients={[]} clientId="" month={month} pillars={[]} posts={[]} teams={myTeams} isSuperAdmin={superAdmin} showClients={showClients} base={base} parentOrigin={parentOrigin} />
        <main style={mainStyle}>
          <div style={centerStyle}>
            <EmptyState title="Unable to load pillar" description={message} />
          </div>
        </main>
      </>
    );
  }
}
