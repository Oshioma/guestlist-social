import Link from "next/link";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbCreativeToUiCreative,
  mapDbReportToUiReport,
  mapDbSuggestionToUiSuggestion,
} from "../../lib/mappers";
import { supabase } from "../../lib/supabase";
import StatusPill from "../../components/StatusPill";
import SectionCard from "../../components/SectionCard";
import AdRow from "../../components/AdRow";
import CreativeCard from "../../components/CreativeCard";
import EmptyState from "../../components/EmptyState";
import StatCard from "../../components/StatCard";
import SuggestionCard from "../../components/SuggestionCard";
import { formatCurrency } from "../../lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [clientRes, adsRes, creativesRes, reportsRes, suggestionsRes] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).single(),
      supabase.from("ads").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("creatives").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("reports").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
    ]);

  if (clientRes.error || !clientRes.data) {
    return <EmptyState title="Client not found" description="This client does not exist or has been removed." />;
  }

  const ads = (adsRes.data ?? []).map(mapDbAdToUiAd);
  const client = mapDbClientToUiClient(clientRes.data, ads.length);
  const creatives = (creativesRes.data ?? []).map(mapDbCreativeToUiCreative);
  const reports = (reportsRes.data ?? []).map((r) => mapDbReportToUiReport(r, client.name));
  const suggestions = (suggestionsRes.data ?? []).map(mapDbSuggestionToUiSuggestion);

  const winnerAds = ads.filter((a) => a.status === "active" && a.ctr >= 2.5);
  const losingAds = ads.filter((a) => a.status === "ended");
  const testingAds = ads.filter((a) => a.status === "draft");

  const stats = [
    { label: "Total Ads", value: String(ads.length) },
    { label: "Winners", value: String(winnerAds.length), trend: winnerAds.length > 0 ? "up" as const : undefined },
    { label: "Testing", value: String(testingAds.length) },
    { label: "Creatives", value: String(creatives.length) },
  ];

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{client.name}</h2>
          <StatusPill status={client.status} />
        </div>
        <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
          {client.platform} · {formatCurrency(client.monthlyBudget)}/mo
        </p>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #e4e4e7", paddingBottom: 12 }}>
        {subNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "9px 14px", fontSize: 14, fontWeight: 500, textDecoration: "none",
              color: item.active ? "#18181b" : "#52525b",
              background: item.active ? "#f4f4f5" : "transparent",
              border: item.active ? "1px solid #e4e4e7" : "1px solid transparent",
              borderRadius: 999,
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {stats.map((s) => <StatCard key={s.label} stat={s} />)}
      </div>

      {/* Priorities + Suggestions */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <SectionCard title="Top priorities">
          {ads.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {winnerAds.length > 0 && (
                <div style={{ border: "1px solid #e4e4e7", borderRadius: 16, padding: 14, background: "#fafafa" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>What to scale</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {winnerAds.length} winning ad{winnerAds.length === 1 ? "" : "s"} ready for more budget.
                  </p>
                </div>
              )}
              {losingAds.length > 0 && (
                <div style={{ border: "1px solid #e4e4e7", borderRadius: 16, padding: 14, background: "#fafafa" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>What to fix</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {losingAds.length} underperforming ad{losingAds.length === 1 ? "" : "s"} likely need pausing or new creative.
                  </p>
                </div>
              )}
              {testingAds.length > 0 && (
                <div style={{ border: "1px solid #e4e4e7", borderRadius: 16, padding: 14, background: "#fafafa" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>What is still learning</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {testingAds.length} ad{testingAds.length === 1 ? "" : "s"} still in testing.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="No ads yet" description="Launch a campaign to start learning what works for this client." />
          )}
        </SectionCard>

        <SectionCard title="Suggestions">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.length > 0 ? (
              suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} />)
            ) : (
              <EmptyState title="No suggestions yet" />
            )}
          </div>
        </SectionCard>
      </div>

      {/* Ads */}
      <SectionCard title={`Ads (${ads.length})`}>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ads.slice(0, 4).map((ad) => <AdRow key={ad.id} ad={ad} />)}
            {ads.length > 4 && (
              <Link href={`/app/clients/${clientId}/ads`} style={{ fontSize: 14, fontWeight: 500, color: "#18181b", textDecoration: "none", marginTop: 12 }}>
                View all {ads.length} ads
              </Link>
            )}
          </div>
        ) : (
          <EmptyState title="No ads yet" description="Launch a campaign to get started." />
        )}
      </SectionCard>

      {/* Creatives */}
      <SectionCard title={`Creatives (${creatives.length})`}>
        {creatives.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {creatives.slice(0, 6).map((cr) => <CreativeCard key={cr.id} creative={cr} />)}
          </div>
        ) : (
          <EmptyState title="No creatives" description="Upload assets to get started." />
        )}
      </SectionCard>

      {/* Reports */}
      <SectionCard title={`Reports (${reports.length})`}>
        {reports.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reports.slice(0, 3).map((report) => (
              <div key={report.id} style={{ border: "1px solid #e4e4e7", borderRadius: 16, padding: 14, background: "#fff" }}>
                <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>{report.title}</p>
                <p style={{ margin: 0, fontSize: 14, color: "#71717a" }}>{report.period}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No reports yet" description="Reports will appear here once reporting is added for this client." />
        )}
      </SectionCard>
    </div>
  );
}
