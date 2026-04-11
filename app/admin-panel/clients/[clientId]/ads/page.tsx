import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import SectionCard from "@/app/admin-panel/components/SectionCard";
import { formatCurrency } from "@/app/admin-panel/lib/utils";
import {
  getAppPerformanceStatus,
  getPerformanceScore,
  explainPerformanceStatus,
} from "@/app/admin-panel/lib/performance-truth";
import type { AppPerformanceStatus } from "@/app/admin-panel/lib/performance-truth";
import { getActionSuggestion } from "@/app/admin-panel/lib/action-engine";
import ScoreAndGenerateButton from "@/app/admin-panel/components/ScoreAndGenerateButton";

export const dynamic = "force-dynamic";

const perfColors: Record<string, { bg: string; text: string }> = {
  winner: { bg: "#dcfce7", text: "#166534" },
  losing: { bg: "#fee2e2", text: "#991b1b" },
  testing: { bg: "#fef3c7", text: "#92400e" },
  paused: { bg: "#f4f4f5", text: "#71717a" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fee2e2", text: "#991b1b" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#f4f4f5", text: "#71717a" },
};

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
  const rawAds = adsRes.data ?? [];

  // Score every ad
  const ads = rawAds.map((ad) => {
    const impressions = Number(ad.impressions ?? 0);
    const clicks = Number(ad.clicks ?? 0);
    const spend = Number(ad.spend ?? 0);
    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const cpc = clicks > 0 ? Number((spend / clicks).toFixed(4)) : 0;

    const forScoring = {
      status: ad.status,
      meta_status: ad.meta_status,
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      conversions: Number(ad.conversions ?? 0),
      cost_per_result: Number(ad.cost_per_result ?? 0),
    };

    return {
      ...ad,
      _spend: spend,
      _impressions: impressions,
      _clicks: clicks,
      _ctr: ctr,
      _cpc: cpc,
      _conversions: Number(ad.conversions ?? 0),
      _perfStatus: getAppPerformanceStatus(forScoring),
      _perfScore: getPerformanceScore(forScoring),
      _perfReason: explainPerformanceStatus(forScoring),
      _campaignName: (ad.campaigns as any)?.name ?? "No campaign",
      _suggestion: getActionSuggestion({
        performance_status: getAppPerformanceStatus(forScoring),
        performance_reason: explainPerformanceStatus(forScoring),
      }),
    };
  });

  const totalSpend = ads.reduce((sum, ad) => sum + ad._spend, 0);
  const totalImpressions = ads.reduce((sum, ad) => sum + ad._impressions, 0);
  const totalClicks = ads.reduce((sum, ad) => sum + ad._clicks, 0);
  const overallCtr =
    totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(2)
      : null;

  const winners = ads.filter((a) => a._perfStatus === "winner").length;
  const losing = ads.filter((a) => a._perfStatus === "losing").length;

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
          Performance scored automatically. Each ad is rated by CTR, CPC, conversions, and spend.
        </p>
        <div style={{ marginTop: 12 }}>
          <ScoreAndGenerateButton clientId={clientId} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        {[
          { label: "Total Ads", value: String(ads.length) },
          { label: "Winners", value: String(winners), color: "#166534" },
          { label: "Losing", value: String(losing), color: "#991b1b" },
          { label: "Total Spend", value: formatCurrency(totalSpend) },
          { label: "Impressions", value: totalImpressions.toLocaleString() },
          { label: "CTR", value: overallCtr ? `${overallCtr}%` : "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 16,
              padding: 16,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 12, color: "#71717a" }}>{stat.label}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: 700,
                color: stat.color ?? "#18181b",
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <SectionCard title={`All ads (${ads.length})`}>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ads.map((ad) => {
              const colors = perfColors[ad._perfStatus] ?? perfColors.testing;

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
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: colors.bg,
                            color: colors.text,
                            textTransform: "capitalize",
                          }}
                        >
                          {ad._perfStatus}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color:
                              ad._perfScore >= 3
                                ? "#166534"
                                : ad._perfScore <= -2
                                ? "#991b1b"
                                : "#71717a",
                          }}
                        >
                          {ad._perfScore > 0 ? `+${ad._perfScore}` : ad._perfScore}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 12,
                          color: "#71717a",
                        }}
                      >
                        {ad._perfReason}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 12,
                          color: "#a1a1aa",
                        }}
                      >
                        Campaign: {ad._campaignName}
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

                      {ad._suggestion && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginTop: 6,
                            padding: "6px 10px",
                            borderRadius: 8,
                            background: "#fafafa",
                            border: "1px solid #f4f4f5",
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: "#991b1b", fontWeight: 500 }}>
                            {ad._suggestion.problem}
                          </span>
                          <span style={{ color: "#18181b" }}>
                            {ad._suggestion.action}
                          </span>
                          <span
                            style={{
                              padding: "1px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              background:
                                priorityColors[ad._suggestion.priority]?.bg ??
                                "#f4f4f5",
                              color:
                                priorityColors[ad._suggestion.priority]?.text ??
                                "#71717a",
                              textTransform: "uppercase",
                            }}
                          >
                            {ad._suggestion.priority}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    {[
                      { label: "Spend", value: formatCurrency(ad._spend) },
                      { label: "Impressions", value: ad._impressions.toLocaleString() },
                      { label: "Clicks", value: ad._clicks.toLocaleString() },
                      { label: "CTR", value: ad._ctr > 0 ? `${ad._ctr}%` : "—" },
                      { label: "CPC", value: ad._cpc > 0 ? formatCurrency(ad._cpc) : "—" },
                      { label: "Conversions", value: String(ad._conversions) },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        style={{
                          border: "1px solid #f4f4f5",
                          borderRadius: 12,
                          padding: 10,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#71717a" }}>
                          {stat.label}
                        </div>
                        <div
                          style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}
                        >
                          {stat.value}
                        </div>
                      </div>
                    ))}
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
