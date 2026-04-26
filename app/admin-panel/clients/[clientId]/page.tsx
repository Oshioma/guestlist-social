import Link from "next/link";
import {
  mapDbAdToUiAd,
  mapDbClientToUiClient,
  mapDbCreativeToUiCreative,
  mapDbReportToUiReport,
  mapDbSuggestionToUiSuggestion,
} from "../../lib/mappers";
import { createClient } from "../../../../lib/supabase/server";
import { canRunAds } from "@/lib/auth/permissions";
import StatusPill from "../../components/StatusPill";
import SectionCard from "../../components/SectionCard";
import AdRow from "../../components/AdRow";
import CreativeCard from "../../components/CreativeCard";
import EmptyState from "../../components/EmptyState";
import StatCard from "../../components/StatCard";
import SuggestionCard from "../../components/SuggestionCard";
import { formatCurrency } from "../../lib/utils";
import DeleteClientButton from "../../components/DeleteClientButton";
import DeleteCampaignButton from "../../components/DeleteCampaignButton";
import { deleteCampaignNoRedirect } from "../../lib/campaign-actions";
import ScoreAndGenerateButton from "../../components/ScoreAndGenerateButton";
import GenerateReportsButton from "../../components/GenerateReportsButton";
import { generateClientReport } from "../../lib/report-actions";
import UnassignedCampaigns from "../../components/UnassignedCampaigns";
import ClientDetailTabs from "../../components/ClientDetailTabs";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  try {
  const { clientId } = await params;
  const supabase = await createClient();
  const adsAllowed = await canRunAds();

  const [
    clientRes,
    adsRes,
    creativesRes,
    reportsRes,
    suggestionsRes,
    campaignsRes,
    unassignedCampaignsRes,
    clientsForAssignmentRes,
    learningsRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase
      .from("ads")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("creatives")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reports")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("suggestions")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("*")
      .is("client_id", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("clients")
      .select("id, name")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("learnings")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    return (
      <EmptyState
        title="Client not found"
        description="This client does not exist or has been removed."
      />
    );
  }

  const rawAds = adsRes.data ?? [];
  const rawCampaigns = campaignsRes.data ?? [];
  const unassignedCampaigns = unassignedCampaignsRes.data ?? [];
  const assignableClients = clientsForAssignmentRes.data ?? [];

  const ads = rawAds.map(mapDbAdToUiAd);
  const client = mapDbClientToUiClient(clientRes.data, ads.length);
  const creatives = (creativesRes.data ?? []).map(mapDbCreativeToUiCreative);
  const reports = (reportsRes.data ?? []).map((r) =>
    mapDbReportToUiReport(r, client.name)
  );
  const suggestions = (suggestionsRes.data ?? []).map(
    mapDbSuggestionToUiSuggestion
  );

  // Learnings table may not exist in some environments — tolerate errors silently
  const learningRows: any[] = learningsRes.error ? [] : (learningsRes.data ?? []);

  const winnerAds = ads.filter((a) => a.status === "active" && a.ctr >= 2.5);
  const losingAds = ads.filter((a) => a.status === "ended");
  const testingAds = ads.filter((a) => a.status === "draft");

  const totalCampaignBudget = rawCampaigns.reduce(
    (sum, campaign) => sum + Number(campaign.budget ?? 0),
    0
  );

  const liveCampaigns = rawCampaigns.filter((campaign) =>
    ["live", "testing"].includes(String(campaign.status ?? ""))
  );

  const stats = [
    { label: "Campaigns", value: String(rawCampaigns.length) },
    {
      label: "Total Ads",
      value: String(ads.length),
    },
    {
      label: "Winners",
      value: String(winnerAds.length),
      trend: winnerAds.length > 0 ? ("up" as const) : undefined,
    },
    {
      label: "Budget",
      value: formatCurrency(totalCampaignBudget),
    },
  ];



  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

          <Link
            href={`/app/clients/${clientId}/edit`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: 10,
              background: "#18181b",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Edit client
          </Link>

          {adsAllowed && (
            <Link
              href={`/app/clients/${clientId}/campaigns/new`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: 10,
                background: "#18181b",
                color: "#fff",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              New campaign
            </Link>
          )}

          <Link
            href={`/app/clients/${clientId}/ads`}
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
            }}
          >
            Ads &amp; actions
          </Link>

          <DeleteClientButton clientId={clientId} />
        </div>

        <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
          {client.platform} · {formatCurrency(client.monthlyBudget)}/mo
        </p>
        <p style={{ fontSize: 12, color: "#a1a1aa", margin: "6px 0 0" }}>
          You can edit: name, platform, budget, status, website, and notes.
        </p>
      </div>



      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>


      <ClientDetailTabs tabs={[
        {
          id: "campaigns",
          label: "Campaigns",
          count: rawCampaigns.length,
          content: (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {rawCampaigns.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {rawCampaigns.map((campaign) => {
                    const campaignAdsRaw = rawAds.filter((ad) => ad.campaign_id === campaign.id);
                    const campaignSpend = campaignAdsRaw.reduce((sum, ad) => sum + Number(ad.spend ?? 0), 0);
                    const campaignImpressions = campaignAdsRaw.reduce((sum, ad) => sum + Number(ad.impressions ?? 0), 0);
                    const campaignClicks = campaignAdsRaw.reduce((sum, ad) => sum + Number(ad.clicks ?? 0), 0);
                    const campaignCtr = campaignImpressions > 0 ? ((campaignClicks / campaignImpressions) * 100).toFixed(1) : null;
                    const campaignConversions = campaignAdsRaw.reduce((sum, ad) => sum + Number(ad.conversions ?? 0), 0);
                    const campaignCostPerResult = campaignConversions > 0 ? (campaignSpend / campaignConversions) : 0;

                    return (
                      <div key={campaign.id} style={{ border: "1px solid #e4e4e7", borderRadius: 16, padding: 16, background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#18181b" }}>{campaign.name}</p>
                            <div style={{ margin: "6px 0 0", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "#71717a" }}>
                              <span>{campaign.objective ?? "No objective"}</span>
                              {campaign.meta_id && (<><span style={{ color: "#d4d4d8" }}>·</span><span style={{ color: "#166534" }}>Meta connected</span></>)}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <Link href={`/app/clients/${clientId}/campaigns/${campaign.id}`} style={{ padding: "6px 10px", borderRadius: 8, background: "#18181b", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>Open</Link>
                            {adsAllowed && <Link href={`/app/clients/${clientId}/campaigns/${campaign.id}/ads/new`} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e4e4e7", background: "#fff", color: "#18181b", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>Add ad</Link>}
                            {campaign.meta_id && (
                              <a href={`https://www.facebook.com/adsmanager/manage/ads?act=${((clientRes.data as any).meta_ad_account_id ?? campaign.meta_ad_account_name ?? process.env.META_AD_ACCOUNT_ID ?? "").replace("act_", "")}&selected_campaign_ids=${campaign.meta_id}`} target="_blank" rel="noreferrer" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>Meta</a>
                            )}
                            <DeleteCampaignButton campaignId={String(campaign.id)} campaignName={campaign.name ?? "Untitled"} onDelete={async () => { "use server"; await deleteCampaignNoRedirect(String(campaign.id), clientId); }} />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 12 }}>
                          {[
                            { label: "Spend", value: formatCurrency(campaignSpend) },
                            { label: "CTR", value: campaignCtr ? `${campaignCtr}%` : "—" },
                            { label: "Results", value: campaignConversions > 0 ? String(campaignConversions) : "—" },
                            { label: "Cost/Result", value: campaignCostPerResult > 0 ? formatCurrency(campaignCostPerResult) : "—" },
                            { label: "Ads", value: String(campaignAdsRaw.length) },
                          ].map((s) => (
                            <div key={s.label} style={{ border: "1px solid #f4f4f5", borderRadius: 10, padding: "8px 10px", background: "#fafafa" }}>
                              <div style={{ fontSize: 11, color: "#71717a" }}>{s.label}</div>
                              <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600 }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No campaigns yet" description="Create the first campaign to structure ad testing properly." />
              )}
            </div>
          ),
        },
        {
          id: "ads",
          label: "Ads",
          count: ads.length,
          content: (
            <div>
              <div style={{ marginBottom: 12 }}>
                <ScoreAndGenerateButton clientId={clientId} />
              </div>
              {ads.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {ads.map((ad) => (
                    <AdRow key={ad.id} ad={ad} canEdit={adsAllowed} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No ads yet" description="Launch a campaign to get started." />
              )}
            </div>
          ),
        },
        {
          id: "learnings",
          label: "Learnings",
          count: learningRows.length,
          content: learningRows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {learningRows.map((learning: any) => (
                <div key={learning.id} style={{ border: "1px solid #e4e4e7", borderRadius: 14, padding: 14, background: "#fff" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b", marginBottom: 6 }}>{learning.problem || "Untitled learning"}</div>
                  {learning.change_made && <div style={{ fontSize: 13, color: "#52525b", marginBottom: 4 }}><strong style={{ color: "#18181b" }}>Change:</strong> {learning.change_made}</div>}
                  {learning.result && <div style={{ fontSize: 13, color: "#52525b", marginBottom: 4 }}><strong style={{ color: "#18181b" }}>Result:</strong> {learning.result}</div>}
                  {learning.outcome && <div style={{ fontSize: 13, color: "#71717a" }}><strong style={{ color: "#18181b" }}>Outcome:</strong> {learning.outcome}</div>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No learnings yet" description="Completed actions can be turned into learnings from the campaign page." />
          ),
        },
        {
          id: "creatives",
          label: "Creatives",
          count: creatives.length,
          content: creatives.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {creatives.map((cr) => (
                <CreativeCard key={cr.id} creative={cr} />
              ))}
            </div>
          ) : (
            <EmptyState title="No creatives" description="Upload assets to get started." />
          ),
        },
        {
          id: "suggestions",
          label: "Suggestions",
          count: suggestions.length,
          content: suggestions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {suggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} />
              ))}
            </div>
          ) : (
            <EmptyState title="No suggestions yet" />
          ),
        },
      ]} />
    </div>
  );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ClientDetailPage error:", message, err);
    return (
      <div style={{ padding: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#18181b" }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 13, color: "#991b1b", margin: "8px 0", background: "#fef2f2", padding: "8px 12px", borderRadius: 8, border: "1px solid #fecaca" }}>
          {message}
        </p>
      </div>
    );
  }
}

const miniStatStyle: React.CSSProperties = {
  border: "1px solid #f4f4f5",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};
