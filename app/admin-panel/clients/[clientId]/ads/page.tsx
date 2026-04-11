import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import { formatCurrency } from "@/app/admin-panel/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientAdsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const [clientRes, adsRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("ads")
      .select("*, campaigns(id, name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" />;
  }

  const client = clientRes.data;
  const ads = adsRes.data ?? [];

  const totalSpend = ads.reduce((sum, ad) => sum + Number(ad.spend ?? 0), 0);
  const totalImpressions = ads.reduce(
    (sum, ad) => sum + Number(ad.impressions ?? 0),
    0
  );
  const totalClicks = ads.reduce(
    (sum, ad) => sum + Number(ad.clicks ?? 0),
    0
  );
  const overallCtr =
    totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(2)
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link
          href={`/app/clients/${clientId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          &larr; Back to {client.name}
        </Link>

        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {client.name} — Ads ({ads.length})
        </h2>
        <p style={{ fontSize: 14, color: "#71717a", margin: "6px 0 0" }}>
          All ads across all campaigns for this client.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 16,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, color: "#71717a" }}>Total Ads</div>
          <div
            style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#18181b" }}
          >
            {ads.length}
          </div>
        </div>
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 16,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, color: "#71717a" }}>Total Spend</div>
          <div
            style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#18181b" }}
          >
            {formatCurrency(totalSpend)}
          </div>
        </div>
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 16,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, color: "#71717a" }}>Impressions</div>
          <div
            style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#18181b" }}
          >
            {totalImpressions.toLocaleString()}
          </div>
        </div>
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: 16,
            padding: 16,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, color: "#71717a" }}>CTR</div>
          <div
            style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#18181b" }}
          >
            {overallCtr ? `${overallCtr}%` : "—"}
          </div>
        </div>
      </div>

      <SectionCard title={`All ads (${ads.length})`}>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ads.map((ad) => {
              const impressions = Number(ad.impressions ?? 0);
              const clicks = Number(ad.clicks ?? 0);
              const ctr =
                impressions > 0
                  ? ((clicks / impressions) * 100).toFixed(2)
                  : null;

              const campaignName =
                (ad.campaigns as any)?.name ?? "No campaign";

              return (
                <div
                  key={ad.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 16,
                    padding: 16,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#18181b",
                          }}
                        >
                          {ad.name}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "#f4f4f5",
                            color: "#52525b",
                            fontSize: 11,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        >
                          {ad.status ?? "testing"}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 12,
                          color: "#a1a1aa",
                        }}
                      >
                        Campaign: {campaignName}
                      </p>
                      {ad.audience ? (
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 12,
                            color: "#a1a1aa",
                          }}
                        >
                          Audience: {ad.audience}
                        </p>
                      ) : null}
                      {ad.creative_hook ? (
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 12,
                            color: "#a1a1aa",
                          }}
                        >
                          Hook: {ad.creative_hook}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid #f4f4f5",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#71717a" }}>Spend</div>
                      <div
                        style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                      >
                        {formatCurrency(Number(ad.spend ?? 0))}
                      </div>
                    </div>
                    <div
                      style={{
                        border: "1px solid #f4f4f5",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#71717a" }}>
                        Impressions
                      </div>
                      <div
                        style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                      >
                        {impressions.toLocaleString()}
                      </div>
                    </div>
                    <div
                      style={{
                        border: "1px solid #f4f4f5",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#71717a" }}>Clicks</div>
                      <div
                        style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                      >
                        {clicks.toLocaleString()}
                      </div>
                    </div>
                    <div
                      style={{
                        border: "1px solid #f4f4f5",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#71717a" }}>CTR</div>
                      <div
                        style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                      >
                        {ctr ? `${ctr}%` : "—"}
                      </div>
                    </div>
                    <div
                      style={{
                        border: "1px solid #f4f4f5",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#71717a" }}>
                        Conversions
                      </div>
                      <div
                        style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                      >
                        {Number(ad.conversions ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No ads yet"
            description="Ads will appear here once campaigns are synced or created."
          />
        )}
      </SectionCard>
    </div>
  );
}
