import { clients, ads } from "../../../lib/data";
import SectionCard from "../../../components/SectionCard";
import AdRow from "../../../components/AdRow";
import EmptyState from "../../../components/EmptyState";

export default async function ClientAdsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = clients.find((c) => c.id === clientId);
  const clientAds = ads.filter((a) => a.clientId === clientId);

  if (!client) {
    return <EmptyState title="Client not found" />;
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
        {client.name} — Ads
      </h2>

      <SectionCard title={`${clientAds.length} campaigns`}>
        {clientAds.length > 0 ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid #e4e4e7",
                gap: 12,
                fontSize: 12,
                color: "#a1a1aa",
                fontWeight: 500,
              }}
            >
              <div style={{ flex: 2 }}>Name</div>
              <div style={{ flex: 1 }}>Platform</div>
              <div style={{ width: 90 }}>Status</div>
              <div style={{ width: 80, textAlign: "right" }}>Spend</div>
              <div style={{ width: 90, textAlign: "right" }}>Impr.</div>
              <div style={{ width: 60, textAlign: "right" }}>Clicks</div>
              <div style={{ width: 60, textAlign: "right" }}>CTR</div>
            </div>
            {clientAds.map((ad) => (
              <AdRow key={ad.id} ad={ad} />
            ))}
          </>
        ) : (
          <EmptyState
            title="No ads running"
            description="Launch a campaign for this client."
          />
        )}
      </SectionCard>
    </div>
  );
}
