import { mapDbAdToUiAd, mapDbClientToUiClient } from "../../../lib/mappers";
import { supabase } from "../../../lib/supabase";
import SectionCard from "../../../components/SectionCard";
import AdRow from "../../../components/AdRow";
import EmptyState from "../../../components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClientAdsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [clientRes, adsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("ads").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);
  const client = mapDbClientToUiClient(clientRes.data, ads.length);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>
        {client.name} — Ads
      </h2>

      <SectionCard title={`${ads.length} campaigns`}>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ads.map((ad) => (
              <AdRow key={ad.id} ad={ad} />
            ))}
          </div>
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
