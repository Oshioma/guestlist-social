import PillarManager from "../../admin-panel/components/PillarManager";
import EmptyState from "../../admin-panel/components/EmptyState";
import ProoferNav from "../ProoferNav";
import { resolveNavData } from "../navData";

export const dynamic = "force-dynamic";

const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 24 };
const centerStyle: React.CSSProperties = { maxWidth: 900, margin: "0 auto", width: "100%" };

export default async function ProoferPillarsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const { clientId, month, clients, pillars, posts, base, parentOrigin } =
    await resolveNavData(sp.client, sp.month);

  return (
    <>
      <ProoferNav
        clients={clients}
        clientId={clientId}
        month={month}
        pillars={pillars}
        posts={posts}
        base={base}
        parentOrigin={parentOrigin}
      />
      <main style={mainStyle}>
        <div style={centerStyle}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
            Content pillars
          </h1>
          <p style={{ fontSize: 13, color: "#71717a", margin: "0 0 18px" }}>
            Add, rename, recolour or archive the pillars for{" "}
            {clients.find((c) => c.id === clientId)?.name ?? "this client"}.
          </p>
          {clientId ? (
            <PillarManager clientId={clientId} pillars={pillars} />
          ) : (
            <EmptyState title="No client selected" description="Pick a client in the top nav." />
          )}
        </div>
      </main>
    </>
  );
}
