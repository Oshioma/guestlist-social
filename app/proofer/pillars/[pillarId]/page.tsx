import { cookies } from "next/headers";
import {
  getProoferData,
  getProoferPillarPosts,
} from "../../../admin-panel/lib/queries";
import EmptyState from "../../../admin-panel/components/EmptyState";
import ProoferNav from "../../ProoferNav";
import PillarOrganiser from "./PillarOrganiser";

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
  const lastClient = cookieStore.get(COOKIE_NAME)?.value ?? "";

  try {
    let clientId = sp.client ?? "";
    if (!clientId && lastClient) clientId = lastClient;
    if (!clientId) {
      const { clients } = await getProoferData();
      clientId = clients[0]?.id ?? "";
    }

    // Pass clientId so pillars come back (getProoferData returns none without a
    // selected client). Its posts are this month's — used to work out which
    // days are still empty for the "add to a day" picker.
    const { clients, pillars, posts: monthPosts } = await getProoferData(
      clientId,
      month
    );
    const allPillarPosts = await getProoferPillarPosts(clientId);
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
        />
        <main style={mainStyle}>
          <div style={centerStyle}>
            {pillar ? (
              <PillarOrganiser
                clientId={clientId}
                pillar={{ id: pillar.id, name: pillar.name, color: pillar.color }}
                month={month}
                posts={pillarPosts}
                monthPosts={monthPosts.map((p) => ({
                  postDate: p.postDate,
                  platform: p.platform,
                }))}
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
        <ProoferNav clients={[]} clientId="" month={month} pillars={[]} posts={[]} />
        <main style={mainStyle}>
          <div style={centerStyle}>
            <EmptyState title="Unable to load pillar" description={message} />
          </div>
        </main>
      </>
    );
  }
}
