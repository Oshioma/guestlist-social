import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canRunAds } from "@/lib/auth/permissions";
import { mapDbAdToUiAd } from "@/app/admin-panel/lib/mappers";
import { generateSuggestionsFromLearnings } from "@/app/admin-panel/lib/learning-suggestions";

import SectionCard from "@/app/admin-panel/components/SectionCard";
import StatCard from "@/app/admin-panel/components/StatCard";
import AdRow from "@/app/admin-panel/components/AdRow";
import AdQuickActions from "@/app/admin-panel/components/AdQuickActions";
import InlineBudgetEdit from "@/app/admin-panel/components/InlineBudgetEdit";
import EmptyState from "@/app/admin-panel/components/EmptyState";
import CreateActionFromSuggestionButton from "@/app/admin-panel/components/CreateActionFromSuggestionButton";
import { formatCurrency } from "@/app/admin-panel/lib/utils";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: Props) {
  const { clientId, campaignId } = await params;
  const supabase = await createClient();
  const adsAllowed = await canRunAds();

  // The legacy `actions` table used to power a "Generated actions" section
  // here, but that surface has been replaced by the per-ad audit trail
  // (/app/clients/[clientId]/ads/[adId]) which reads ad_actions directly.
  const [
    { data: client, error: clientError },
    { data: campaign, error: campaignError },
    { data: adsRows, error: adsError },
    { data: learningRows, error: learningsError },
  ] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", clientId).single(),
    supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("client_id", clientId)
      .single(),
    supabase
      .from("ads")
      .select("*")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
    supabase
      .from("learnings")
      .select("*")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ]);

  if (
    clientError ||
    !client ||
    campaignError ||
    !campaign
  ) {
    notFound();
  }

  const ads = (adsRows ?? []).map(mapDbAdToUiAd);

  const winners = ads.filter((ad) => ad.status === "active" && ad.ctr >= 2.5);
  const paused = ads.filter((ad) => ad.status === "paused");
  const drafts = ads.filter((ad) => ad.status === "draft");
  const ended = ads.filter((ad) => ad.status === "ended");

  const totalSpend = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const totalImpressions = ads.reduce((sum, ad) => sum + ad.impressions, 0);
  const totalClicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);
  const avgCtr =
    totalImpressions > 0
      ? Number(((totalClicks / totalImpressions) * 100).toFixed(1))
      : 0;

  const campaignStatus =
    campaign.status === "draft" ||
    campaign.status === "testing" ||
    campaign.status === "live" ||
    campaign.status === "paused" ||
    campaign.status === "completed"
      ? campaign.status
      : "testing";

  const statusStyle =
    campaignStatus === "live"
      ? { background: "#dcfce7", color: "#166534" }
      : campaignStatus === "paused"
        ? { background: "#fef2f2", color: "#b91c1c" }
        : campaignStatus === "completed"
          ? { background: "#e4e4e7", color: "#3f3f46" }
          : campaignStatus === "draft"
            ? { background: "#f4f4f5", color: "#52525b" }
            : { background: "#fef3c7", color: "#92400e" };

  let learningSuggestions: Awaited<ReturnType<typeof generateSuggestionsFromLearnings>> = [];
  try {
    learningSuggestions = await generateSuggestionsFromLearnings(clientId, campaignId);
  } catch {
    // learnings table may not exist — degrade gracefully
  }

  const hasMetaId = !!(campaign as any).meta_id;
  const hasMetaAdsetId = !!(campaign as any).meta_adset_id;
  const isNewlyCreated = hasMetaId && ads.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {isNewlyCreated && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
            border: "1px solid #bbf7d0",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#166534" }}>
            Campaign created in Meta
          </div>
          <div style={{ fontSize: 14, color: "#15803d", lineHeight: 1.5 }}>
            <strong>{campaign.name}</strong> is set up in your Meta ad account
            with a {campaign.budget ? `£${Number(campaign.budget).toFixed(0)}/day` : ""} budget.
            It&rsquo;s currently <strong>{campaignStatus === "testing" || campaignStatus === "paused" ? "paused" : campaignStatus}</strong> and
            won&rsquo;t spend until you add an ad and activate it.
          </div>
          <div style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>
            Next step: add an ad with creative (image + copy) so Meta has something to show people.
          </div>
          {adsAllowed && (
            <Link
              href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/new`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "flex-start",
                padding: "10px 18px",
                borderRadius: 10,
                background: "#166534",
                color: "#fff",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Add your first ad
            </Link>
          )}
        </div>
      )}

      {!isNewlyCreated && hasMetaId && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#f0fdf4",
            border: "1px solid #dcfce7",
            fontSize: 12,
            color: "#166534",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          Connected to Meta · {ads.length} ad{ads.length === 1 ? "" : "s"} · {campaignStatus}
        </div>
      )}

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

        <div
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 18,
            padding: 22,
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
              <h1
                style={{
                  margin: 0,
                  fontSize: 30,
                  lineHeight: 1.05,
                  fontWeight: 700,
                  color: "#18181b",
                  letterSpacing: "-0.03em",
                }}
              >
                {campaign.name}
              </h1>

              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 14,
                  color: "#71717a",
                  maxWidth: 760,
                }}
              >
                {campaign.objective ?? "No objective"} ·{" "}
                {campaign.audience ?? "No audience set"}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  ...statusStyle,
                }}
              >
                {campaignStatus}
              </span>

              {adsAllowed && (
                <>
                  <Link
                    href={`/app/clients/${clientId}/campaigns/${campaignId}/edit`}
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
                    Edit campaign
                  </Link>

                  <Link
                    href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/new`}
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
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        <div>
          <StatCard
            stat={{
              label: "Budget",
              value: formatCurrency(Number(campaign.budget ?? 0)),
            }}
          />
          <div style={{ marginTop: 6, paddingLeft: 2 }}>
            <InlineBudgetEdit
              campaignId={Number(campaignId)}
              currentBudget={Number(campaign.budget ?? 0)}
              hasMetaAdsetId={!!(campaign as any).meta_adset_id}
            />
          </div>
        </div>
        <StatCard
          stat={{
            label: "Spend",
            value: formatCurrency(totalSpend),
          }}
        />
        <StatCard
          stat={{
            label: "Ads",
            value: String(ads.length),
            change: `${winners.length} winners`,
            trend: winners.length > 0 ? "up" : "flat",
          }}
        />
        <StatCard
          stat={{
            label: "CTR",
            value: avgCtr > 0 ? `${avgCtr}%` : "—",
            change: `${totalClicks} clicks`,
            trend: avgCtr >= 2.5 ? "up" : avgCtr > 0 ? "flat" : "down",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 20,
        }}
      >
        <SectionCard title="Campaign summary">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 14,
                padding: 14,
                background: "#fafafa",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                Audience
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                {campaign.audience ?? "No audience set"}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 14,
                padding: 14,
                background: "#fafafa",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                Objective
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
                {campaign.objective ?? "No objective set"}
              </p>
            </div>

            {campaign.notes ? (
              <div
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 14,
                  padding: 14,
                  background: "#fafafa",
                }}
              >
                <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>
                  Notes
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "#52525b",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {campaign.notes}
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Signals">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={signalBoxStyle}>
              <div style={signalLabelStyle}>Winners</div>
              <div style={signalValueStyle}>{winners.length}</div>
            </div>
            <div style={signalBoxStyle}>
              <div style={signalLabelStyle}>Testing</div>
              <div style={signalValueStyle}>{drafts.length}</div>
            </div>
            <div style={signalBoxStyle}>
              <div style={signalLabelStyle}>Paused</div>
              <div style={signalValueStyle}>{paused.length}</div>
            </div>
            <div style={signalBoxStyle}>
              <div style={signalLabelStyle}>Ended</div>
              <div style={signalValueStyle}>{ended.length}</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <SectionCard title={`Learnings (${(learningRows ?? []).length})`}>
          {(learningRows ?? []).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(learningRows ?? []).map((learning) => (
                <div key={learning.id} style={cardStyle}>
                  <div style={cardTitleStyle}>
                    {learning.problem || "Untitled learning"}
                  </div>

                  {learning.change_made ? (
                    <div style={cardTextStyle}>
                      <strong style={{ color: "#18181b" }}>Change:</strong>{" "}
                      {learning.change_made}
                    </div>
                  ) : null}

                  {learning.result ? (
                    <div style={cardTextStyle}>
                      <strong style={{ color: "#18181b" }}>Result:</strong>{" "}
                      {learning.result}
                    </div>
                  ) : null}

                  {learning.outcome ? (
                    <div style={cardMutedStyle}>
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
              description="Completed actions can be turned into campaign learnings."
            />
          )}
        </SectionCard>

        <SectionCard
          title={`Suggestions from past learnings (${learningSuggestions.length})`}
        >
          {learningSuggestions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {learningSuggestions.map((suggestion, index) => {
                return (
                  <div
                    key={`${suggestion.title}-${index}`}
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 14,
                      padding: 14,
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#18181b",
                        }}
                      >
                        {suggestion.title}
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          padding: "4px 8px",
                          borderRadius: 999,
                          background:
                            suggestion.priority === "high"
                              ? "#fee2e2"
                              : suggestion.priority === "medium"
                                ? "#fef3c7"
                                : "#e0f2fe",
                          color:
                            suggestion.priority === "high"
                              ? "#991b1b"
                              : suggestion.priority === "medium"
                                ? "#92400e"
                                : "#075985",
                          textTransform: "capitalize",
                          fontWeight: 600,
                        }}
                      >
                        {suggestion.priority}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#71717a",
                        marginBottom: 12,
                      }}
                    >
                      {suggestion.description}
                    </div>

                    <CreateActionFromSuggestionButton
                      clientId={clientId}
                      campaignId={campaignId}
                      title={suggestion.title}
                      description={suggestion.description}
                      priority={suggestion.priority}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No learning-based suggestions yet"
              description="As more learnings are saved, the system will start recommending proven fixes."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={`Ads in this campaign (${ads.length})`}
        action={
          <Link
            href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/new`}
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
            Add ad
          </Link>
        }
      >
        {ads.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {ads.map((ad) => (
              <div key={ad.id}>
                <AdRow ad={ad} canEdit={adsAllowed} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 8,
                    marginBottom: 12,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <AdQuickActions
                    adId={Number(ad.id)}
                    adName={ad.name}
                    currentStatus={ad.status}
                    hasMetaId={!!ad.metaId}
                    hasAdsetMetaId={!!ad.adsetMetaId}
                    hasCreative={!!ad.creativeImageUrl}
                  />
                  <Link
                    href={`/app/clients/${clientId}/campaigns/${campaignId}/ads/${ad.id}/edit`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "7px 11px",
                      borderRadius: 9,
                      border: "1px solid #e4e4e7",
                      background: "#fff",
                      color: "#18181b",
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Edit ad
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No ads in this campaign yet"
            description="Create the first ad to start tracking results inside this campaign."
          />
        )}
      </SectionCard>
    </div>
  );
}

const signalBoxStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const signalLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#71717a",
};

const signalValueStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#18181b",
  marginBottom: 6,
};

const cardTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#52525b",
  marginBottom: 6,
};

const cardMutedStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#71717a",
};

const subheadStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 14,
  fontWeight: 600,
  color: "#18181b",
};
