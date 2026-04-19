import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canRunAds } from "@/lib/auth/permissions";
import { mapDbAdToUiAd } from "@/app/admin-panel/lib/mappers";
import { revalidatePath } from "next/cache";
import { createMetaAd } from "@/lib/meta-ad-create";
import { getCreativeSourcesForClient } from "@/lib/creative-sources";
import MetaAdForm from "@/app/admin-panel/components/MetaAdForm";
import DeleteCampaignButton from "@/app/admin-panel/components/DeleteCampaignButton";
import { generateSuggestionsFromLearnings } from "@/app/admin-panel/lib/learning-suggestions";
import { deleteCampaignNoRedirect } from "@/app/admin-panel/lib/campaign-actions";

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
  try {
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
    supabase.from("clients").select("id, name, website_url").eq("id", clientId).single(),
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
  let creativeSources: Awaited<ReturnType<typeof getCreativeSourcesForClient>> = [];
  try {
    creativeSources = await getCreativeSourcesForClient(clientId);
  } catch { /* degrade gracefully */ }

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
  const hasNoAds = ads.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {adsAllowed && (() => {
        async function inlineMetaAction(data: {
          name: string;
          imageUrl: string;
          headline: string;
          body: string;
          ctaType: string;
          destinationUrl: string;
        }): Promise<{ error?: string }> {
          "use server";
          const adsetMetaId = (campaign as any).meta_adset_id as string | null;

          if (adsetMetaId) {
            const result = await createMetaAd({
              adsetMetaId,
              name: data.name,
              imageUrl: data.imageUrl,
              headline: data.headline,
              body: data.body,
              ctaType: data.ctaType,
              destinationUrl: data.destinationUrl,
            });
            if (!result.ok) {
              return { error: `Meta ${result.step}: ${result.error}` };
            }
            const supabaseInner = await createClient();
            await supabaseInner.from("ads").insert({
              client_id: clientId,
              campaign_id: campaignId,
              meta_id: result.adId,
              name: data.name,
              status: "testing",
              creative_image_url: data.imageUrl,
              creative_headline: data.headline,
              creative_body: data.body,
              creative_cta: data.ctaType,
            });
          } else {
            const supabaseInner = await createClient();
            await supabaseInner.from("ads").insert({
              client_id: clientId,
              campaign_id: campaignId,
              name: data.name,
              status: "testing",
              creative_image_url: data.imageUrl,
              creative_headline: data.headline,
              creative_body: data.body,
              creative_cta: data.ctaType,
            });
          }

          return {};
        }

        return (
          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#18181b" }}>
              {hasNoAds ? "Add your first ad" : "Add another ad"}
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#71717a" }}>
              Upload an image, write your copy, and create your ad.{hasMetaAdsetId ? " It will be pushed to Meta (starts paused)." : " Meta not connected yet — ad saved locally."}
            </p>
            <MetaAdForm
              campaignName={campaign.name}
              clientId={clientId}
              clientWebsite={(client as any).website_url ?? ""}
              objective={(campaign as any).objective ?? "engagement"}
              existingCreatives={creativeSources}
              onSubmit={inlineMetaAction}
            />
          </div>
        );
      })()}

      {!hasNoAds && hasMetaId && (
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

              {hasMetaId && (
                <a
                  href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${(campaign as any).meta_ad_account_name?.replace("act_", "") ?? ""}&campaign_ids=${(campaign as any).meta_id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e4e4e7",
                    background: "#fff",
                    color: "#1e40af",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  View in Ads Manager
                </a>
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
                All ads &amp; actions
              </Link>

              <DeleteCampaignButton
                campaignId={campaignId}
                campaignName={campaign.name}
                redirectTo={`/app/clients/${clientId}`}
                onDelete={async () => {
                  "use server";
                  await deleteCampaignNoRedirect(campaignId, clientId);
                }}
              />

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("CampaignDetailPage error:", message, err);
    const { clientId: cid } = await params;
    return (
      <div style={{ padding: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#18181b" }}>
          Something went wrong loading this campaign
        </h2>
        <p style={{ fontSize: 13, color: "#991b1b", margin: "8px 0", background: "#fef2f2", padding: "8px 12px", borderRadius: 8, border: "1px solid #fecaca" }}>
          {message}
        </p>
        <Link
          href={`/app/clients/${cid}`}
          style={{ fontSize: 14, color: "#4338ca", textDecoration: "underline" }}
        >
          Back to client
        </Link>
      </div>
    );
  }
}

