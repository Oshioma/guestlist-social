import { getDashboardData } from "../lib/queries";
import { canRunAds } from "@/lib/auth/permissions";
import ClientCard from "../components/ClientCard";
import EmptyState from "../components/EmptyState";
import TopPriorities from "../components/TopPriorities";
import WhatsWorkingNow from "../components/WhatsWorkingNow";
import DecisionAccuracy from "../components/DecisionAccuracy";
import TokenExpiryBanner from "../components/TokenExpiryBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const adsAllowed = await canRunAds();
  try {
    const { clients, ads } = await getDashboardData();

    const winningAds = ads.filter((ad) => ad.status === "active" && ad.ctr >= 2.5);
    const activeClients = clients.filter((c) => c.status === "active");
    const spendTotal = ads.reduce((sum, ad) => sum + ad.spend, 0);
    const avgCtr = ads.length > 0
      ? (ads.reduce((sum, ad) => sum + ad.ctr, 0) / ads.length).toFixed(1)
      : "0";

    const stats = [
      { label: "Clients", value: String(activeClients.length), sub: `${clients.length} total` },
      { label: "Total spend", value: `£${spendTotal.toFixed(0)}`, sub: `${ads.length} ads` },
      { label: "Winners", value: String(winningAds.length), sub: `${avgCtr}% avg CTR`, highlight: winningAds.length > 0 },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#18181b", letterSpacing: "-0.02em" }}>
            Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#71717a" }}>
            Overview across all clients
          </p>
        </div>

        <TokenExpiryBanner />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "16px 18px",
                borderRadius: 14,
                background: "#fff",
                border: "1px solid #e4e4e7",
              }}
            >
              <div style={{ fontSize: 12, color: "#71717a", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.highlight ? "#166534" : "#18181b", letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <WhatsWorkingNow />
          <DecisionAccuracy />
        </div>

        <TopPriorities />

        <div>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#18181b" }}>
            Active clients ({activeClients.length})
          </h2>
          {activeClients.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {activeClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active clients"
              description="Set a client to active to see them here."
            />
          )}
        </div>

        {clients.filter((c) => c.status !== "active").length > 0 && (
          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#71717a" }}>
              Other clients ({clients.filter((c) => c.status !== "active").length})
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
                opacity: 0.7,
              }}
            >
              {clients.filter((c) => c.status !== "active").map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Dashboard page error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return (
      <EmptyState
        title="Dashboard failed to load"
        description={message}
      />
    );
  }
}
