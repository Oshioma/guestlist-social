import Link from "next/link";
import { clients, ads, creatives, suggestions, reports } from "../../lib/data";
import { formatCurrency } from "../../lib/utils";
import StatusPill from "../../components/StatusPill";
import SectionCard from "../../components/SectionCard";
import AdRow from "../../components/AdRow";
import CreativeCard from "../../components/CreativeCard";
import EmptyState from "../../components/EmptyState";
import StatCard from "../../components/StatCard";
import SuggestionCard from "../../components/SuggestionCard";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = clients.find((c) => c.id === clientId);

  if (!client) {
    return (
      <EmptyState
        title="Client not found"
        description="This client does not exist or has been removed."
      />
    );
  }

  const clientAds = ads.filter((a) => a.clientId === clientId);
  const clientCreatives = creatives.filter((c) => c.clientId === clientId);
  const clientReports = reports.filter((r) => r.clientId === clientId);
  const clientSuggestions = suggestions;

  const winnerAds = clientAds.filter((ad) => ad.ctr >= 2.5 && ad.status === "active");
  const losingAds = clientAds.filter((ad) => ad.ctr < 2.5 && ad.ctr > 0 && ad.status === "active");
  const testingAds = clientAds.filter((ad) => ad.status === "draft" || ad.impressions < 1000);

  const subNav = [
    { label: "Overview", href: `/app/clients/${clientId}`, active: true },
    { label: "Ads", href: `/app/clients/${clientId}/ads` },
    { label: "Creatives", href: `/app/clients/${clientId}/creatives` },
    { label: "Reports", href: `/app/clients/${clientId}/reports` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {client.name}
          </h2>
          <StatusPill status={client.status} />
        </div>
        <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
          {client.platform} · {formatCurrency(client.monthlyBudget)}/mo
        </p>
      </div>

      {/* Sub-nav */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          borderBottom: "1px solid #e4e4e7",
          paddingBottom: 12,
        }}
      >
        {subNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "9px 14px",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              color: item.active ? "#18181b" : "#52525b",
              background: item.active ? "#f4f4f5" : "transparent",
              border: item.active
                ? "1px solid #e4e4e7"
                : "1px solid transparent",
              borderRadius: 999,
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Key stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        <StatCard
          stat={{ label: "Total Ads", value: String(clientAds.length) }}
        />
        <StatCard
          stat={{ label: "Winners", value: String(winnerAds.length), trend: "up" }}
        />
        <StatCard
          stat={{ label: "Testing", value: String(testingAds.length) }}
        />
        <StatCard
          stat={{ label: "Creatives", value: String(clientCreatives.length) }}
        />
      </div>

      {/* Priorities + Suggestions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 20,
        }}
      >
        <SectionCard title="Top priorities">
          {clientAds.length > 0 ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              {winnerAds.length > 0 && (
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 16,
                    padding: 14,
                    background: "#fafafa",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    What to scale
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {winnerAds.length} winning ad
                    {winnerAds.length === 1 ? "" : "s"} ready for more budget.
                  </p>
                </div>
              )}
              {losingAds.length > 0 && (
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 16,
                    padding: 14,
                    background: "#fafafa",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    What to fix
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {losingAds.length} underperforming ad
                    {losingAds.length === 1 ? "" : "s"} likely need pausing or
                    new creative.
                  </p>
                </div>
              )}
              {testingAds.length > 0 && (
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 16,
                    padding: 14,
                    background: "#fafafa",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    What is still learning
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {testingAds.length} ad{testingAds.length === 1 ? "" : "s"}{" "}
                    still in testing.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No ads yet"
              description="Launch a campaign to start learning what works for this client."
            />
          )}
        </SectionCard>

        <SectionCard title="Suggestions">
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {clientSuggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Ads */}
      <SectionCard title={`Ads (${clientAds.length})`}>
        {clientAds.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {clientAds.slice(0, 4).map((ad) => (
              <AdRow key={ad.id} ad={ad} />
            ))}
            {clientAds.length > 4 && (
              <Link
                href={`/app/clients/${clientId}/ads`}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#18181b",
                  textDecoration: "none",
                  marginTop: 12,
                }}
              >
                View all {clientAds.length} ads
              </Link>
            )}
          </div>
        ) : (
          <EmptyState
            title="No ads yet"
            description="Launch a campaign to get started."
          />
        )}
      </SectionCard>

      {/* Creatives */}
      <SectionCard title={`Creatives (${clientCreatives.length})`}>
        {clientCreatives.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {clientCreatives.slice(0, 6).map((cr) => (
              <CreativeCard key={cr.id} creative={cr} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No creatives"
            description="Upload assets to get started."
          />
        )}
      </SectionCard>

      {/* Reports */}
      <SectionCard title={`Reports (${clientReports.length})`}>
        {clientReports.length > 0 ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {clientReports.slice(0, 3).map((report) => (
              <div
                key={report.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 16,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  {report.title}
                </p>
                <p style={{ margin: 0, fontSize: 14, color: "#71717a" }}>
                  {report.period}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No reports yet"
            description="Reports will appear here once reporting is added for this client."
          />
        )}
      </SectionCard>
    </div>
  );
}
