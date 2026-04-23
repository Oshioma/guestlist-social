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

  const subNav = [
    { label: "Overview", href: `/app/clients/${clientId}`, active: true },
    { label: "Ads", href: `/app/clients/${clientId}/ads` },
    { label: "Creatives", href: `/app/clients/${clientId}/creatives` },
    { label: "Reports", href: `/app/clients/${clientId}/reports` },
    { label: "Reviews", href: `/app/clients/${clientId}/reviews` },
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 20,
        }}
      >
        <SectionCard title="Top priorities">
          {ads.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

              {liveCampaigns.length > 0 && (
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
                    Campaign momentum
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                    {liveCampaigns.length} live or testing campaign
                    {liveCampaigns.length === 1 ? "" : "s"} currently driving
                    activity.
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.length > 0 ? (
              suggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} />
              ))
            ) : (
              <EmptyState title="No suggestions yet" />
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={`Unassigned Meta campaigns (${unassignedCampaigns.length})`}
      >
        <UnassignedCampaigns
          campaigns={unassignedCampaigns.map((c) => ({
            id: c.id,
            name: c.name,
            objective: c.objective,
            status: c.status,
            meta_status: c.meta_status,
            meta_id: c.meta_id,
            meta_ad_account_name: c.meta_ad_account_name,
            budget: c.budget,
            created_at: c.created_at,
          }))}
          currentClientId={clientId}
          currentClientName={client.name}
          assignableClients={assignableClients.map((c) => ({
            id: c.id,
            name: c.name,
          }))}
        />
      </SectionCard>

      <SectionCard title={`Learnings (${learningRows.length})`}>
        {learningRows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {learningRows.map((learning: any) => (
              <div
                key={learning.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#18181b",
                    marginBottom: 6,
                  }}
                >
                  {learning.problem || "Untitled learning"}
                </div>
                {learning.change_made ? (
                  <div style={{ fontSize: 13, color: "#52525b", marginBottom: 4 }}>
                    <strong style={{ color: "#18181b" }}>Change:</strong>{" "}
                    {learning.change_made}
                  </div>
                ) : null}
                {learning.result ? (
                  <div style={{ fontSize: 13, color: "#52525b", marginBottom: 4 }}>
                    <strong style={{ color: "#18181b" }}>Result:</strong>{" "}
                    {learning.result}
                  </div>
                ) : null}
                {learning.outcome ? (
                  <div style={{ fontSize: 13, color: "#71717a" }}>
                    <strong style={{ color: "#18181b" }}>Outcome:</strong>{" "}
                    {learning.outcome}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No learnings yet"
            description="Completed actions can be turned into learnings from the campaign page."
          />
        )}
      </SectionCard>

      <SectionCard title={`Campaigns (${rawCampaigns.length})`}>
        {rawCampaigns.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rawCampaigns.map((campaign) => {
              const campaignAdsRaw = rawAds.filter(
                (ad) => ad.campaign_id === campaign.id
              );

              const campaignSpend = campaignAdsRaw.reduce(
                (sum, ad) => sum + Number(ad.spend ?? 0),
                0
              );

              const campaignClicks = campaignAdsRaw.reduce(
                (sum, ad) => sum + Number(ad.clicks ?? 0),
                0
              );

              const campaignImpressions = campaignAdsRaw.reduce(
                (sum, ad) => sum + Number(ad.impressions ?? 0),
                0
              );

              const campaignCtr =
                campaignImpressions > 0
                  ? ((campaignClicks / campaignImpressions) * 100).toFixed(1)
                  : null;

              const campaignWinners = campaignAdsRaw.filter(
                (ad) => String(ad.status) === "winner"
              ).length;

              const campaignConversions = campaignAdsRaw.reduce(
                (sum, ad) => sum + Number(ad.conversions ?? 0),
                0
              );
              const campaignCostPerResult =
                campaignConversions > 0
                  ? (campaignSpend / campaignConversions)
                  : 0;

              return (
                <div
                  key={campaign.id}
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
                      <p
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 600,
                          color: "#18181b",
                        }}
                      >
                        {campaign.name}
                      </p>
                      <div
                        style={{
                          margin: "6px 0 0",
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          flexWrap: "wrap",
                          fontSize: 12,
                          color: "#71717a",
                        }}
                      >
                        <span>{campaign.objective ?? "No objective"}</span>
                        {campaign.audience && (
                          <>
                            <span style={{ color: "#d4d4d8" }}>·</span>
                            <span>{campaign.audience}</span>
                          </>
                        )}
                        {campaign.meta_id && (
                          <>
                            <span style={{ color: "#d4d4d8" }}>·</span>
                            <span style={{ color: "#166534" }}>Meta connected</span>
                          </>
                        )}
                        {campaign.created_at && (
                          <>
                            <span style={{ color: "#d4d4d8" }}>·</span>
                            <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 10px",
                          borderRadius: 999,
                          background:
                            campaign.status === "live" ? "#dcfce7" :
                            campaign.status === "paused" ? "#fee2e2" :
                            "#f4f4f5",
                          color:
                            campaign.status === "live" ? "#166534" :
                            campaign.status === "paused" ? "#991b1b" :
                            "#52525b",
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {campaign.status ?? "draft"}
                      </div>
                      {campaignWinners > 0 && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "#dcfce7",
                            color: "#166534",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {campaignWinners} winner{campaignWinners === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const adsWithCreative = campaignAdsRaw.filter(
                      (ad) => ad.creative_image_url || ad.creative_headline || ad.creative_body
                    ).slice(0, 3);
                    if (adsWithCreative.length === 0) return null;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                        {adsWithCreative.map((ad, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              gap: 14,
                              alignItems: "flex-start",
                              padding: 10,
                              borderRadius: 12,
                              border: "1px solid #f4f4f5",
                              background: "#fafafa",
                            }}
                          >
                            {ad.creative_image_url && (
                              <img
                                src={ad.creative_image_url as string}
                                alt=""
                                loading="lazy"
                                style={{
                                  width: 180,
                                  height: 180,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                  border: "1px solid #e4e4e7",
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b", marginBottom: 4 }}>
                                {(ad.creative_headline as string) || ad.name}
                              </div>
                              {ad.creative_body && (
                                <div style={{ fontSize: 13, color: "#52525b", lineHeight: 1.5 }}>
                                  {(ad.creative_body as string).slice(0, 200)}
                                </div>
                              )}
                              {ad.creative_cta && (
                                <div style={{ marginTop: 8 }}>
                                  <span style={{ padding: "4px 10px", borderRadius: 6, background: "#e4e4e7", color: "#18181b", fontSize: 11, fontWeight: 600 }}>
                                    {(ad.creative_cta as string).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                  </span>
                                </div>
                              )}
                              <div style={{ marginTop: 6, display: "flex", gap: 10, fontSize: 11, color: "#a1a1aa" }}>
                                <span>{ad.status ?? "testing"}</span>
                                {Number(ad.spend ?? 0) > 0 && <span>£{Number(ad.spend).toFixed(0)} spent</span>}
                                {Number(ad.ctr ?? 0) > 0 && <span>{Number(ad.ctr).toFixed(1)}% CTR</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                        {campaignAdsRaw.length > 3 && (
                          <div style={{ fontSize: 12, color: "#71717a" }}>
                            +{campaignAdsRaw.length - 3} more ad{campaignAdsRaw.length - 3 === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <div style={miniStatStyle}>
                      <div style={{ fontSize: 11, color: "#71717a" }}>Spend</div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                        {formatCurrency(campaignSpend)}
                      </div>
                    </div>
                    <div style={miniStatStyle}>
                      <div style={{ fontSize: 11, color: "#71717a" }}>Impressions</div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                        {campaignImpressions.toLocaleString()}
                      </div>
                    </div>
                    <div style={miniStatStyle}>
                      <div style={{ fontSize: 11, color: "#71717a" }}>CTR</div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600, color: Number(campaignCtr ?? 0) >= 2 ? "#166534" : "#18181b" }}>
                        {campaignCtr ? `${campaignCtr}%` : "—"}
                      </div>
                    </div>
                    <div style={miniStatStyle}>
                      <div style={{ fontSize: 11, color: "#71717a" }}>Results</div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600, color: campaignConversions > 0 ? "#166534" : "#18181b" }}>
                        {campaignConversions || "—"}
                      </div>
                    </div>
                    <div style={miniStatStyle}>
                      <div style={{ fontSize: 11, color: "#71717a" }}>Cost/Result</div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                        {campaignCostPerResult > 0 ? formatCurrency(campaignCostPerResult) : "—"}
                      </div>
                    </div>
                    <div style={miniStatStyle}>
                      <div style={{ fontSize: 11, color: "#71717a" }}>Budget</div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                        {formatCurrency(Number(campaign.budget ?? 0))}/day
                      </div>
                    </div>
                  </div>

                  {campaignAdsRaw.length > 0 && (
                    <div
                      style={{
                        marginTop: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#71717a",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Ads
                      </p>
                      {campaignAdsRaw.map((ad) => (
                        <div
                          key={ad.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            border: "1px solid #f4f4f5",
                            borderRadius: 10,
                            background: "#fafafa",
                            fontSize: 13,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 500, color: "#18181b" }}>
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
                          {adsAllowed && (
                            <Link
                              href={`/app/clients/${clientId}/campaigns/${campaign.id}/ads/${ad.id}/edit`}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                border: "1px solid #e4e4e7",
                                background: "#fff",
                                color: "#18181b",
                                textDecoration: "none",
                                fontSize: 12,
                                fontWeight: 500,
                              }}
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: 14,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "#71717a",
                      }}
                    >
                      {campaignAdsRaw.length > 0
                        ? `This campaign currently contains ${campaignAdsRaw.length} ad${
                            campaignAdsRaw.length === 1 ? "" : "s"
                          }.`
                        : "No ads added to this campaign yet."}
                    </p>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={`/app/clients/${clientId}/campaigns/${campaign.id}`}
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
                        Open campaign
                      </Link>

                      {adsAllowed && (
                        <>
                          <Link
                            href={`/app/clients/${clientId}/campaigns/${campaign.id}/edit`}
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
                            Edit campaign
                          </Link>

                          <Link
                            href={`/app/clients/${clientId}/campaigns/${campaign.id}/ads/new`}
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
                            Add ad
                          </Link>

                          <DeleteCampaignButton
                            campaignId={String(campaign.id)}
                            campaignName={campaign.name ?? "Untitled"}
                            onDelete={async () => {
                              "use server";
                              await deleteCampaignNoRedirect(String(campaign.id), clientId);
                            }}
                          />

                          {campaign.meta_id && (
                            <a
                              href={`https://www.facebook.com/adsmanager/manage/ads?act=${((clientRes.data as any).meta_ad_account_id ?? campaign.meta_ad_account_name ?? process.env.META_AD_ACCOUNT_ID ?? "").replace("act_", "")}&selected_campaign_ids=${campaign.meta_id}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid #c7d2fe",
                                background: "#eef2ff",
                                color: "#4338ca",
                                textDecoration: "none",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              View in Meta
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No campaigns yet"
            description="Create the first campaign to structure ad testing properly."
          />
        )}
      </SectionCard>

      <SectionCard title={`Ads (${ads.length})`}>
        <div style={{ marginBottom: 12 }}>
          <ScoreAndGenerateButton clientId={clientId} />
        </div>
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ads.slice(0, 8).map((ad) => (
              <AdRow key={ad.id} ad={ad} canEdit={adsAllowed} />
            ))}
            {ads.length > 8 && (
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
                View all {ads.length} ads
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

      <SectionCard title={`Creatives (${creatives.length})`}>
        {creatives.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {creatives.slice(0, 6).map((cr) => (
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

      <SectionCard
        title={`Reports (${reports.length})`}
        action={
          <GenerateReportsButton
            action={async () => {
              "use server";
              await generateClientReport(clientId);
            }}
            label="Generate report"
          />
        }
      >
        {reports.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reports.slice(0, 3).map((report) => (
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
            description='Click "Generate report" to create a report from real data.'
          />
        )}
      </SectionCard>
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
