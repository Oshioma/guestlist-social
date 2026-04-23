import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canRunAds } from "@/lib/auth/permissions";
import { mapDbAdToUiAd } from "@/app/admin-panel/lib/mappers";
import { persistImageToStorage } from "@/lib/persist-image";
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
import AdPreviewCard from "@/app/admin-panel/components/AdPreviewCard";
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
    supabase.from("clients").select("id, name, website_url, meta_ad_account_id").eq("id", clientId).single(),
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
  const rawAdById = new Map<string, any>();
  for (const row of adsRows ?? []) {
    rawAdById.set(String(row.id), row);
  }
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

  let adAccountId = (client as any).meta_ad_account_id || process.env.META_AD_ACCOUNT_ID || null;
  if (adAccountId && !adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;
  let adAccountName: string | null = null;
  if (adAccountId) {
    try {
      const token = process.env.META_ACCESS_TOKEN;
      if (token) {
        const res = await fetch(
          `https://graph.facebook.com/v25.0/${adAccountId}?fields=name&access_token=${token}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json();
          adAccountName = data.name ?? null;
        }
      }
    } catch { /* fall through */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link
          href={`/app/clients/${clientId}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#71717a", textDecoration: "none" }}
        >
          &larr; {client.name}
        </Link>
        <span style={{ color: "#d4d4d8" }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b" }}>{campaign.name}</span>
      </div>

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

          const persistedUrl = await persistImageToStorage(data.imageUrl, `ad-creatives/${clientId}`) ?? data.imageUrl;

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
              creative_image_url: persistedUrl,
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
              creative_image_url: persistedUrl,
              creative_headline: data.headline,
              creative_body: data.body,
              creative_cta: data.ctaType,
            });
          }

          return {};
        }

        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#18181b" }}>
                {hasNoAds ? "Add your first ad" : "Add another ad"}
              </h2>
              {adAccountId && (
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: "#eef2ff",
                    border: "1px solid #c7d2fe",
                    color: "#4338ca",
                  }}
                  title={adAccountId}
                >
                  {adAccountName ?? adAccountId}
                </span>
              )}
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#71717a" }}>
              Upload an image, write your copy, and create your ad. It starts paused so you can review first.
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

      {!hasNoAds && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 16px",
            borderRadius: 12,
            background: "#fafafa",
            border: "1px solid #e4e4e7",
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 700, color: "#18181b", fontSize: 13 }}>
            {ads.length} ad{ads.length === 1 ? "" : "s"}
          </span>
          {totalSpend > 0 && <span style={{ color: "#52525b" }}>{formatCurrency(totalSpend)} spent</span>}
          {avgCtr > 0 && <span style={{ color: avgCtr >= 2 ? "#166534" : "#52525b" }}>{avgCtr}% CTR</span>}
          {ads.reduce((s, a) => s + a.conversions, 0) > 0 && (
            <span style={{ color: "#166534", fontWeight: 600 }}>
              {ads.reduce((s, a) => s + a.conversions, 0)} results
            </span>
          )}
          {hasMetaId && (
            <a
              href={`https://www.facebook.com/adsmanager/manage/ads?act=${((client as any).meta_ad_account_id ?? (campaign as any).meta_ad_account_name ?? process.env.META_AD_ACCOUNT_ID ?? "").replace("act_", "")}&selected_campaign_ids=${(campaign as any).meta_id}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#4338ca", textDecoration: "none", fontWeight: 600, marginLeft: "auto" }}
            >
              View in Meta
            </a>
          )}
        </div>
      )}
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

