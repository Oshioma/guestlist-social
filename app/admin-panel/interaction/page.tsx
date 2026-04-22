import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canRunAds } from "@/lib/auth/permissions";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import InteractionClientSwitcher from "@/app/admin-panel/components/InteractionClientSwitcher";
import ScoreAndGenerateButton from "@/app/admin-panel/components/ScoreAndGenerateButton";
import PreviewDecisionsButton from "@/app/admin-panel/components/PreviewDecisionsButton";
import GenerateDecisionsButton from "@/app/admin-panel/components/GenerateDecisionsButton";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ clientId?: string }>;
};

type ClientRow = {
  id: number | string;
  name: string | null;
  status: string | null;
};

function isActiveClientStatus(status: string | null | undefined) {
  return status === "growing" || status === "active";
}

function toClientOption(client: ClientRow) {
  return {
    id: String(client.id),
    name: String(client.name ?? "Untitled client"),
    status: String(client.status ?? ""),
  };
}

export default async function InteractionPage({ searchParams }: Props) {
  await canRunAds();

  const supabase = await createClient();
  const { clientId: requestedClientId } = await searchParams;

  const { data: clientsData, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, status")
    .eq("archived", false)
    .order("name", { ascending: true });

  if (clientsError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EmptyState
          title="Unable to load clients"
          description={clientsError.message}
        />
      </div>
    );
  }

  const allClients = (clientsData ?? []).map(toClientOption);
  if (allClients.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EmptyState
          title="No clients yet"
          description="Create a client first, then use Interaction to run the engine per client."
        />
      </div>
    );
  }

  const activeClients = allClients.filter((client) =>
    isActiveClientStatus(client.status)
  );
  const selectableClients =
    activeClients.length > 0 ? activeClients : allClients;

  const requestedId = typeof requestedClientId === "string" ? requestedClientId : "";
  const selectedClient =
    selectableClients.find((client) => client.id === requestedId) ??
    selectableClients[0];
  const selectedClientId = selectedClient.id;

  const [{ count: adCount = 0 }, { count: pendingDecisions = 0 }, { count: pendingQueue = 0 }] =
    await Promise.all([
      supabase
        .from("ads")
        .select("id", { count: "exact", head: true })
        .eq("client_id", selectedClientId),
      supabase
        .from("ad_decisions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", selectedClientId)
        .eq("status", "pending"),
      supabase
        .from("meta_execution_queue")
        .select("id", { count: "exact", head: true })
        .eq("client_id", selectedClientId)
        .eq("status", "pending"),
    ]);

  const stats = [
    { label: "ADS IN SCOPE", value: String(adCount) },
    { label: "PENDING DECISIONS", value: String(pendingDecisions) },
    { label: "QUEUE WAITING APPROVAL", value: String(pendingQueue) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      <section
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          border: "1px solid #d4d4d8",
          borderRadius: 18,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                color: "#18181b",
                letterSpacing: "-0.02em",
              }}
            >
              INTERACTION
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#52525b", maxWidth: 620 }}>
              Switch clients and run your interaction workflow from one place.
            </p>
          </div>

          <div style={{ minWidth: 320, flex: "1 1 340px", maxWidth: 420 }}>
            <InteractionClientSwitcher
              clients={selectableClients.map((client) => ({
                id: client.id,
                name: client.name,
              }))}
              selectedClientId={selectedClientId}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 14,
                padding: "14px 14px",
                background: "#fff",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#71717a",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#18181b",
                  letterSpacing: "-0.02em",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #d4d4d8",
            borderRadius: 16,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 800,
              color: "#18181b",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Interaction Scan
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
            Score this client&apos;s ads and generate fresh actions.
          </p>
          <ScoreAndGenerateButton clientId={selectedClientId} />
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #d4d4d8",
            borderRadius: 16,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 800,
              color: "#18181b",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Decision Run
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
            Preview then save engine decisions for this client.
          </p>
          <PreviewDecisionsButton clientId={selectedClientId} />
          <GenerateDecisionsButton clientId={selectedClientId} />
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #d4d4d8",
          borderRadius: 16,
          padding: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              color: "#18181b",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Open Full Client Workspace
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
            Jump into ads, creatives, reports, and reviews for this client.
          </p>
        </div>
        <Link
          href={`/app/clients/${selectedClientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e4e4e7",
            background: "#fff",
            color: "#18181b",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Open client
        </Link>
      </section>
    </div>
  );
}
