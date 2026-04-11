"use client";

import { clients, ads } from "../../../lib/data";
import SectionCard from "../../../components/SectionCard";
import AdRow from "../../../components/AdRow";
import AdFilterBar, {
  useAdFilter,
  getAdCounts,
} from "../../../components/AdFilterBar";
import EmptyState from "../../../components/EmptyState";
import { use } from "react";

export default function ClientAdsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const client = clients.find((c) => c.id === clientId);
  const clientAds = ads.filter((a) => a.clientId === clientId);
  const { filter, setFilter, filtered } = useAdFilter(clientAds);
  const counts = getAdCounts(clientAds);

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
            <AdFilterBar
              current={filter}
              onChange={setFilter}
              counts={counts}
            />
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
              <div style={{ width: 160 }} />
            </div>
            {filtered.map((ad) => (
              <AdRow key={ad.id} ad={ad} />
            ))}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: "24px 0",
                  textAlign: "center",
                  color: "#a1a1aa",
                  fontSize: 14,
                }}
              >
                No ads match this filter.
              </div>
            )}
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
