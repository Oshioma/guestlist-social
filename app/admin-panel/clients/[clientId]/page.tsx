import Link from "next/link";
import { clients, ads, creatives } from "../../lib/data";
import { formatCurrency } from "../../lib/utils";
import StatusPill from "../../components/StatusPill";
import SectionCard from "../../components/SectionCard";
import AdRow from "../../components/AdRow";
import CreativeCard from "../../components/CreativeCard";
import EmptyState from "../../components/EmptyState";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = clients.find((c) => c.id === clientId);

  if (!client) {
    return <EmptyState title="Client not found" />;
  }

  const clientAds = ads.filter((a) => a.clientId === clientId);
  const clientCreatives = creatives.filter((c) => c.clientId === clientId);

  const subNav = [
    { label: "Overview", href: `/app/clients/${clientId}` },
    { label: "Ads", href: `/app/clients/${clientId}/ads` },
    { label: "Creatives", href: `/app/clients/${clientId}/creatives` },
    { label: "Reports", href: `/app/clients/${clientId}/reports` },
  ];

  return (
    <div>
      {/* Client header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {client.name}
        </h2>
        <StatusPill status={client.status} />
      </div>
      <p style={{ fontSize: 14, color: "#71717a", margin: "0 0 20px" }}>
        {client.platform} · {formatCurrency(client.monthlyBudget)}/mo
      </p>

      {/* Sub-nav */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          borderBottom: "1px solid #e4e4e7",
          paddingBottom: 0,
        }}
      >
        {subNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "8px 14px",
              fontSize: 14,
              textDecoration: "none",
              color: "#52525b",
              borderBottom: "2px solid transparent",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Ads summary */}
        <SectionCard title={`Ads (${clientAds.length})`}>
          {clientAds.length > 0 ? (
            clientAds.map((ad) => <AdRow key={ad.id} ad={ad} />)
          ) : (
            <EmptyState title="No ads yet" description="Launch a campaign to get started." />
          )}
        </SectionCard>

        {/* Creatives summary */}
        <SectionCard title={`Creatives (${clientCreatives.length})`}>
          {clientCreatives.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              {clientCreatives.map((cr) => (
                <CreativeCard key={cr.id} creative={cr} />
              ))}
            </div>
          ) : (
            <EmptyState title="No creatives" description="Upload assets to get started." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
